# Working agreement

- Before starting implementation, check whether the request is sufficiently clear.
- If an important requirement, expected behavior, scope, or acceptance criterion is ambiguous, ask concise clarifying questions first and wait for the user's answers.
- Do not modify files, run project commands, or make other implementation changes while waiting for those answers.
- If the task is clear enough to proceed safely, make reasonable assumptions, state them briefly, and continue without unnecessary questions.

# Testing guidance

- Run tests for large tasks, substantial changes, or when explicitly requested; do not run the test suite after every small code change.

# Browser process hygiene

- Keep browser automation limited to the shortest flow needed for verification.
- Every named Playwright CLI session must be closed with `playwright-cli --session <name> close` immediately after the check, including when the check fails. Do not probe saved sessions after closing them. Reserve `kill-all` for a confirmed stale/zombie daemon so unrelated browser work is not interrupted.
- Do not leave a Playwright browser open between tasks. Before finishing browser work on Windows, verify that no task-owned `chrome-headless-shell.exe` or `chrome.exe` process with a Playwright temporary profile is still running. Never terminate the user's ordinary Chrome processes.
- Repository browser QA must use `tools/qa/playwright-runner.cjs`; do not call `chromium.launch()` directly from new scripts.

# Deployment agreement

- Production ingress is Cloudflare Tunnel. Do not add ngrok back to Compose or
  open application service ports on the host.
- For local deployment without any tunnel, SSH or public ingress, run from the
  repository root:

  ```powershell
  docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
  ```

  The app is then available locally at `http://127.0.0.1:8081`. Do not use the
  `cloudflare` profile in this mode.
- The production-like stack binds Nginx only to `127.0.0.1:8081`. A local
  temporary public URL can be started from the repository root with:

  ```powershell
  docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
  cloudflared tunnel --url http://localhost:8081
  ```

- A stable hostname requires a Cloudflare Named Tunnel token in the ignored
  `.env.prod` as `CLOUDFLARE_TUNNEL_TOKEN`; start it with:

  ```powershell
  docker compose --profile cloudflare --env-file .env.prod -f docker-compose.prod.yml up -d --build
  ```

- Quick Tunnel hostnames are temporary and cannot be selected or guaranteed.
  Keep `FRONTEND_URL` and `ALLOWED_ORIGINS` equal to the current public
  hostname used by Telegram.
- Local release flow: optionally review `python deploy/release.py --dry-run`,
  then run `python deploy/release.py`. That one command creates the commit/tag,
  loads only the independent `.env.prod` for Compose interpolation, and deploys
  locally without a tunnel. Use `python deploy/release.py --push` only
  for the remote GitHub staging/production workflow. Never delete named
  database, Redis, Kafka, party, frontend, Prometheus or Grafana volumes.
- SSH deployment is intentionally not part of the local flow yet. Do not put
  `.env`, `.env.prod`, `.env.staging`, tunnel tokens or database credentials in
  Git, commits, image layers or logs.
- `.env` is local-development-only. `.env.prod` is a complete production-only
  environment and must not inherit values from `.env`; `.env.staging` follows
  the same rule for staging. Keep the files duplicated and rotate production
  database credentials only together with an explicit database migration.
