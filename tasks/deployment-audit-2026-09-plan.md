# Deployment audit and hardening plan — 2026-09

## Scope

Improve the existing release/deployment path without changing the application
runtime behavior or touching unrelated dirty-worktree changes.

## Audit findings

1. `.github/workflows/ci.yml` contains a stray `PY` after the Python dependency
   audit command. The heredoc terminator is in the wrong step, so the CI shell
   receives an unexpected command.
2. CI does not validate the deployment shell scripts or the repository's root
   Compose dependency wiring.
3. `production_deploy.sh` validates only the manifest tag and schema. It does
   not verify the manifest's production configuration hash or enforce immutable
   image references before changing the runtime.
4. PostgreSQL backups are checked only for non-zero size; a corrupt custom-format
   dump could be accepted before migrations run.
5. Remote staging/production jobs checked out a tag without verifying that it
   resolved to the commit used to build the manifest.
6. Rerunning a tag workflow could overwrite its published manifest with
   `gh release upload --clobber`, changing image digests for an existing tag.
7. A hand-written manifest could list a built unit without scheduling its
   container for recreation, silently leaving the old image active.

## Architecture decisions

- Keep manifest validation in reusable Python deployment tooling and invoke it
  before the production script creates release state or drains traffic.
- Require every application image in a release manifest to use an immutable
  `@sha256:<64 hex>` reference. Stateful base images remain Compose-owned and
  are not part of the application image manifest.
- Keep the current drain/rollback flow and make backup verification additive;
  no volumes or broad image cleanup commands are introduced.
- Add CI checks for deployment scripts and root Compose wiring so these
  contracts fail before a release reaches staging.
- Treat the tag, checked-out commit, and published manifest as one immutable
  release identity; fail closed on mismatch or attempted manifest replacement.
- Require every built unit to be recreated and require the complete stateless
  unit set for a full reconcile.

## Ordered implementation slices

### Slice 1 — CI gate repair

- [x] Remove the stray heredoc marker.
- [x] Add shell syntax validation and root Compose startup tests to CI.
- [x] Add regression tests for the workflow contract.

### Slice 2 — Manifest integrity gate

- [x] Add shared validation for schema, required metadata, immutable app image
  references, and production configuration hash.
- [x] Validate the manifest before deployment state is copied or traffic is drained.
- [x] Cover valid and invalid manifests with unit tests.

### Slice 3 — Backup integrity gate

- [x] Run `pg_restore --list` against each custom-format dump inside its PostgreSQL
  container after creation.
- [x] Fail before migrations when the dump cannot be read.
- [x] Extend deployment safety tests.

## Verification

- Focused deployment unit tests after every slice.
- `bash -n` for every deployment shell script.
- Go deployment-handler tests where the deployment contract is affected.
- Full deployment-tooling test discovery and root Compose tests before handoff.

## Out of scope

- Automatic production rollout or rollback execution.
- Cloudflare/SSH changes.
- Rewriting the local release flow or changing application services.
- Modifying unrelated existing worktree changes.
