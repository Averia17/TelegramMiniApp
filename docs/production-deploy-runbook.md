# Production deploy runbook

## One release

From the reviewed checkout:

```powershell
python deploy/release.py --dry-run
python deploy/release.py
```

The second command first deploys the candidate tag and creates `deploy commit:
vX.Y.Z` plus an annotated tag only after local Compose succeeds. If it fails,
Git remains at the previous commit and the script attempts to rebuild that
commit from a temporary worktree. `--push` publishes the tag for the remote
GitHub workflow instead of starting local Compose. `RELEASE_MAJOR` and `RELEASE_MINOR` come
from the ignored `deploy/release.env`; patch is calculated automatically.
The first release is `v0.0.1`. Review the dry-run carefully when the checkout
contains unrelated dirty work.

The tag workflow builds only changed application units. Every manifest still
contains all service image digests, so an unchanged service keeps its exact
previous image. A frontend change also refreshes nginx because the current
runtime uses a shared `frontend-dist` volume.

## Production host prerequisites

- The host has a clean Git checkout of this repository and Docker Compose v2.
- Production uses the complete, independent `.env.prod`; staging uses the same
  hardened compose file with its own complete, independent `.env.staging`.
  Neither file inherits values from `.env`. Both files exist only on their
  respective host and contain a random `DEPLOY_ADMIN_TOKEN`, Grafana admin
  password and the corresponding `CLOUDFLARE_TUNNEL_TOKEN`.
- The host can pull private GHCR images using its Docker credential helper.
- GitHub environment `production` requires an approval and has secrets
  `PROD_HOST`, `PROD_PORT` (optional, defaults to 22), `PROD_USER`,
  `PROD_SSH_KEY`, `PROD_KNOWN_HOSTS`, and `PROD_DEPLOY_DIR`. `PROD_KNOWN_HOSTS`
  is a reviewed pinned host-key entry; the workflow refuses to use dynamic
  `ssh-keyscan` trust.

## Drain and rollback behavior

The deployer asks the battle instance to enter maintenance, broadcasts a
maintenance notice to connected clients, blocks new joins/matchmaking, and
waits up to `DRAIN_TIMEOUT_SECONDS` for active matches to finish. On timeout
it aborts without replacing containers. Health failure triggers restoration of
the previous manifest and image references.

After the drain, the deployer creates verified PostgreSQL custom-format dumps
for the account, shop, and News databases under the release directory, then
runs one-shot migrations. Every migration holds a PostgreSQL advisory lock in
addition to the host deployment lock. A failed health or release-metadata
smoke check restores the previous image manifest, waits for restored units to
become ready, verifies the old `/release.json` tag, and resumes battle traffic.

The deployer uses `up --force-recreate --no-build --no-deps` only for the
manifest's `recreate_units`. It never runs `down -v`, volume removal, or
global image pruning. Database migrations are one-shot `bot-migrate`,
`shop-migrate`, and `news-migrate` jobs and must follow expand/contract
compatibility rules so an application-image rollback never requires destructive
schema rollback. The deployer never deletes database, Redis, Kafka, party,
Prometheus, Grafana, or frontend volumes.

On a successful smoke check, the deployer resumes battle traffic and publishes
an idempotent release article through the internal News endpoint. The frontend
News tab reads only the public `GET /api/news` route. If News is temporarily
unavailable, the healthy runtime is kept online and `release.json` records
`news_status=pending` for an operator retry.

Retry a pending News publication without rebuilding or restarting services:

```bash
DEPLOY_ENV_FILE=/path/to/.env.prod bash deploy/retry_release_news.sh
```

Tag pushes pass through the protected `staging` environment first. Production
is not started unless staging deploy, drain, migrations, readiness and smoke
checks succeed. Configure `STAGING_HOST`, `STAGING_PORT` (optional),
`STAGING_USER`, `STAGING_SSH_KEY`, `STAGING_KNOWN_HOSTS` and
`STAGING_DEPLOY_DIR` in the GitHub `staging` environment.

Manual rollback on the host:

```bash
bash deploy/production_deploy.sh v0.0.1 .release/releases/v0.0.1/manifest.json
```

Do not delete `.release/releases/*` or tagged images until the retention and
restore drill checkpoint has passed.

Grafana and Prometheus bind only to `127.0.0.1` on the production host. Access
Grafana through an SSH tunnel, for example `ssh -L 3000:127.0.0.1:3000
user@host`; do not publish these ports on a public interface.
