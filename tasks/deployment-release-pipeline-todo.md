# Deployment/release pipeline checklist

## Phase 0 — scope and baseline

- [ ] Подтвердить GitHub Actions/GHCR, production host, domain/TLS и смысл nginx/SSH credentials.
- [ ] Разобрать текущие 87 dirty-файлов или явно принять их единым `v0.0.1` scope.
- [ ] Зафиксировать текущие volumes, compose project name и backup destination.
- [ ] Найти passing combat release/rollback reference и сохранить release evidence.

## Phase 1 — release metadata

- [x] Добавить `deploy/release.env.example` и ignored `deploy/release.env`.
- [x] Реализовать безопасный release entrypoint `deploy/release.py`: preflight, secret scan, `git add .`, summary, commit, annotated tag, optional push.
- [x] Добавить SemVer increment tests: first `v0.0.1`, patch increment, major/minor series change, duplicate tag rejection.
- [x] Генерировать полный immutable `release-manifest.json` с tag, SHA и config hash.

## Checkpoint A

- [x] Локальный dry-run не меняет дерево.
- [x] Detector покрыт тестами: service-only, frontend dependency, observability dependency, dev/prod compose filtering.
- [x] Ошибки secret scan/dirty-scope не создают commit/tag.
- [ ] Первый approved run создаёт ровно один commit `deploy commit: v0.0.1` и один immutable tag.

## Phase 2 — CI quality and artifact supply chain

- [x] Добавить PR CI: frontend lint/test/build и Go/Python deployment tests.
- [x] Добавить pure change detector для selective build/recreate units и full-reconcile marker.
- [x] Подключить detector к release manifest и deploy script; неизменённые service images/containers не трогать.
- [x] Добавить secret scan, `govulncheck`, npm/Python dependency audit и pinned action versions.
- [x] Перевести Docker builds на immutable SHA/tag images и GHCR digests.
- [ ] Build frontend в CI и включить dist в versioned nginx image.
- [x] Добавить production deploy через protected `production` environment и staging gate перед ним.

## Phase 3 — drain and readiness

- [x] Разделить liveness `/health` и readiness `/ready`.
- [x] Добавить battle, party и account maintenance gates и internal admin auth.
- [x] Заблокировать новые matchmaking и WS joins на battle-сервисе.
- [x] Добавить `active_matches` и deployment status endpoint.
- [x] Добавить frontend maintenance banner and maintenance WebSocket event.
- [x] Добавить timeout behavior: ordinary deploy aborts, no silent force close.

## Phase 4 — migrations and production deploy

- [x] Вынести Alembic из startup command bot/shop в one-shot migration jobs.
- [x] Добавить DB advisory lock, backup/checksum smoke и expand/contract policy.
- [x] Реализовать idempotent `deploy-prod` по manifest и host deploy lock.
- [x] Проверить, что deploy не содержит `down -v`, `volume prune` или broad image prune.
- [x] Deploy exact digests, readiness, `/release.json` and critical News smoke.
- [x] Оставлять предыдущий manifest/images до retention checkpoint.

## Checkpoint B

- [ ] Staging drain дожидается завершения текущего боя.
- [ ] Migration failure оставляет старый runtime работоспособным.
- [ ] Volumes и данные сохраняются после recreate.
- [ ] Rollback на предыдущий manifest проходит smoke.

## Phase 5 — frontend version and news

- [x] Передавать `APP_VERSION` из release manifest.
- [x] Показать tag/SHA внизу профиля и покрыть frontend contract test.
- [x] Создать news service, отдельную DB/volume/migration и exact nginx route.
- [x] Добавить idempotent release news endpoint по unique tag.
- [x] Показать release item в News tab после успешного deploy.
- [x] Добавить безопасный retry публикации News без пересборки сервисов.

## Phase 6 — container hardening and observability

- [x] Убрать hardcoded production credentials из bot/shop Compose.
- [x] Pin all image versions/digests and remove public monitoring ports.
- [x] Add cap drop, no-new-privileges, read-only FS/tmpfs, resource limits.
- [x] Закрыть admin/metrics/Grafana/Kafka UI от public nginx; настроить SSH tunnel/management auth.
- [x] Добавить `app_build_info`, release marker и Grafana annotation.
- [ ] Расширить Prometheus scrape и service/host dashboards.

## Final checkpoint

- [x] Production deploy, image rollback, backup checksum и drain timeout behavior задокументированы.
- [x] Runbook содержит команды, thresholds и communication behavior.
- [ ] No secrets in Git/history/image layers/logs.
- [x] User-facing profile version, maintenance message, Grafana marker и News tag привязаны к одному release tag.
