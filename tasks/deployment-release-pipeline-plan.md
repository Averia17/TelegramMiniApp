# План: release/deploy pipeline для dev и production

## Цель

Сделать воспроизводимый и откатываемый production-деплой Telegram Mini App:

- выпускать релиз из текущего дерева через commit `deploy commit: vX.Y.Z`;
- создавать immutable SemVer tag (`v0.0.1`, `v0.0.2`, ...), начиная с `v0.0.1`;
- собирать и проверять образы в CI, а на production доставлять именно эти
  образы, а не собирать код из рабочего дерева сервера;
- перед остановкой сервисов включать maintenance/drain, запрещать новые бои и
  дождаться завершения текущих;
- применять миграции отдельно от старта приложений;
- не удалять базы, Redis/Kafka/party volumes и иметь проверяемый rollback;
- показывать текущую версию в профиле, а позднее публиковать релиз в News;
- ставить release markers в Grafana/Prometheus для сравнения до/после релиза.

## Что установлено по репозиторию

- Remote — GitHub, но workflow’ов CI пока нет.
- Релизных тегов нет; следующий релиз должен стать `v0.0.1`.
- Production запускается через `docker-compose.prod.yml`, Nginx публикует только
  `127.0.0.1:8081`, а публичный вход выполняется через Cloudflare Tunnel.
- У сервисов есть `/health`; у battle есть `/metrics`, readiness/drain-контракта
  нет.
- Battle rooms и matchmaking queue находятся в памяти процесса. Принудительный
  restart во время боя потеряет runtime-состояние, поэтому drain является
  обязательным, а timeout drain должен блокировать обычный deploy.
- `bot` и `shop` запускают Alembic migration в command контейнера приложения;
  миграции нужно вынести в отдельный одноразовый job.
- Production Compose уже использует `expose` для внутренних сервисов, но
  monitoring/UI и публичный доступ нужно разделить жёстче.
- Рабочее дерево сейчас содержит примерно 87 изменённых/новых файлов, включая
  combat-код, бинарные GLB/Blend и compose-конфигурацию. Автоматический
  `git add .` сейчас объединит это всё в один релиз и должен быть отдельным
  осознанным checkpoint.

## Архитектурные решения

1. **Две стадии вместо попытки прочитать локальное дерево из CI.**
   Локальная release-команда делает preflight, `git add .`, commit и tag, затем
   push. GitHub Actions запускается по tag и деплоит его. GitHub Actions не
   может увидеть незакоммиченные файлы на рабочем компьютере.
2. **Tag — идентификатор артефакта.** `vX.Y.Z` immutable и связан с commit,
   image digests, migration revision и manifest. На production нельзя деплоить
   `latest` или пересобирать произвольный checkout.
3. **Patch вычисляется автоматически в выбранной серии.** В локальном
   `.release.env` задаются `RELEASE_MAJOR` и `RELEASE_MINOR`; script находит
   максимальный существующий patch и увеличивает его. При смене major/minor
   пользователь меняет env и patch снова начинается с `1`.
4. **Сначала graceful drain, потом короткое окно недоступности.** Новые
   matchmaking/party-start/join блокируются, существующие WebSocket-бои
   продолжаются до завершения. При превышении timeout обычный deploy падает,
   а не роняет игроков молча.
5. **Миграции expand/contract.** Сначала добавляются обратно совместимые поля и
   таблицы, затем приложение переключается на них, и только отдельным cleanup
   релизом удаляется старое. Rollback приложения не должен требовать опасного
   автоматического downgrade базы.
6. **Volumes — stateful boundary.** В deploy-командах запрещены `down -v`,
   `volume prune` и удаление volume по маске. Старые контейнеры/образы можно
   чистить только после smoke/rollback-retention checkpoint.
7. **Служебный доступ отделён от пользовательского.** Grafana, Prometheus,
   Kafka UI, admin/drain и `/metrics` не должны попадать в публичный nginx.
   Для них — внутренний Docker network, SSH tunnel и/или отдельный защищённый
   management ingress. HTTP Basic Auth не заменяет SSH-ключи на уровне ОС.

## Целевой release flow

```text
working tree
  -> release preflight + secret scan
  -> git add .
  -> deploy commit: v0.0.N
  -> annotated immutable tag
  -> push commit + tag
  -> CI quality/security gates
  -> build/push images by SHA and tag
  -> staging deploy + smoke
  -> production approval
  -> acquire deploy lock
  -> announce maintenance + drain
  -> wait active battles = 0
  -> backup databases
  -> run one-shot migrations
  -> pull exact image digests
  -> recreate app containers (never volumes)
  -> readiness + smoke + release marker
  -> publish News item
  -> monitor window
  -> retain rollback artifacts
```

## Selective service deployment

Production deploy не должен пересоздавать весь Compose project при изменении
одного микросервиса. Release manifest хранит для каждого deployment unit
последний image digest и список affected units для текущего diff.

| Unit | Источники | Что пересобирается | Что пересоздаётся |
|---|---|---|---|
| `account` | `account/**`, production compose override | account | account |
| `battle` | `battle/**`, production compose override | battle | battle |
| `bot` | `bot/**`, production compose override | bot | bot |
| `shop` | `shop/**`, production compose override | shop | shop |
| `leaderboard` | `leaderboard/**`, production compose override | leaderboard | leaderboard |
| `party` | `party/**`, production compose override | party | party |
| `news` | `news/**`, production compose override | news | news |
| `frontend` | `frontend/**` | frontend | frontend + nginx (до перехода на immutable nginx static image) |
| `nginx` | `nginx/**` | nginx | nginx |
| `observability` | `observability/**` | — | prometheus → grafana |

Изменения только в `docs/`, `tasks/` и неиспользуемых tooling-файлах не должны
перезапускать runtime. Изменение root `docker-compose.prod.yml` помечается как
`full_reconcile`: контейнеры сверяются с новым конфигом, но образы берутся из
manifest и не пересобираются автоматически. Dev compose не влияет на production
selection.

Для каждого unit deploy script использует `docker compose up -d --no-deps
<changed-services>` либо эквивалентный reconcile, поэтому неизменённые сервисы,
их контейнеры и образы остаются нетронутыми. Если меняется dependency/config,
affected set расширяется явно по dependency graph. Stateful `db`, Redis, Kafka и
их volumes не являются build units и никогда не удаляются selective deploy’ом.

Версия релиза не является причиной пересборки frontend: она публикуется как
runtime `release.json`/`/api/system/status`, который nginx читает из metadata
volume. Поэтому backend-only release обновляет version banner без recreate
frontend image.

## Versioning и frontend

### Release metadata

Добавить шаблон `deploy/release.env.example` и локальный ignored-файл
`deploy/release.env`, например:

```dotenv
RELEASE_MAJOR=0
RELEASE_MINOR=0
DRAIN_TIMEOUT_SECONDS=600
```

Script должен:

- валидировать SemVer и запретить overwrite существующего tag;
- взять `max(vRELEASE_MAJOR.RELEASE_MINOR.*) + 1`;
- на первом запуске создать `v0.0.1`;
- выполнить `git add .` только после secret scan и показать staged summary;
- создать commit `deploy commit: v0.0.1`;
- создать annotated tag с commit SHA и release metadata;
- отправить commit/tag без force push.

Секреты (`.env`, `.env.prod`, SSH key, registry token) никогда не должны
проходить через этот commit. Перед staging нужен deny-list и secret scanner для
`.env*`, private keys, bearer tokens и connection strings. Для текущего dirty
дерева нужен явный `RELEASE_CONFIRM_DIRTY_SCOPE=...` или ручное подтверждение.

### Frontend version

В build передавать `VITE_APP_VERSION`, а во все backend-контейнеры —
`APP_VERSION`, `GIT_SHA`, `BUILD_TIME`, `APP_ENV`. Значение должно приходить из
tag/manifest, а не из `package.json`, который может отставать.

Добавить небольшой безопасный модуль `frontend/src/config/buildInfo.js` и UI в
нижней части профиля:

- показывать `v0.0.1` и короткий SHA;
- показывать `dev` при локальной разработке;
- рендерить значение как обычный текст, не HTML;
- покрыть контрактным тестом и проверить mobile/Telegram WebView.

Для runtime-проверки backend и deploy script должны иметь internal/public
read-only `/version` или `/api/system/status`, возвращающий только version,
commit, environment и maintenance state — без env dump и секретов.

## Graceful drain и maintenance

### Контракт

Добавить в battle:

- liveness `/health` — процесс жив, не зависит от drain;
- readiness `/ready` — зависимости готовы и `accepting_new_sessions=true`;
- internal `POST /admin/deployment/drain`;
- internal `GET /admin/deployment/status` с `draining`, queue length, active
  rooms/matches, active WebSockets и deadline.

В party/account есть эквивалентные internal gate’ы для запрета создания нового
party battle и списания battle energy во время maintenance. Admin routes
доступны только через внутреннюю сеть/`docker exec` и требуют deploy-admin
token; через публичный nginx они не проксируются.

### Поведение

1. Deploy script получает lock, чтобы два deploy не drain’или production
   одновременно.
2. Устанавливается maintenance state с текстом «Скоро обновление» и tag.
3. Nginx/system-status начинает отдавать состояние, frontend показывает баннер.
4. Battle прекращает принимать `find_match`, `join`, party-start и новые WS
   сессии, но не рвёт уже начатые game rooms.
5. Battle отправляет подключённым клиентам `maintenance` и публичный lobby
   status показывает сообщение с tag.
6. Script polling’ом ждёт `active_game_rooms == 0` и `match_queue == 0`.
7. Если deadline истёк, deploy завершается ошибкой и drain снимается. Принудительный
   close существующих WS — отдельная аварийная команда с ручным подтверждением,
   компенсацией игрокам и отдельным incident log.

`active_rooms` недостаточно: сейчас он включает lifecycle комнат, а пустые или
reconnect-grace комнаты могут жить дольше боя. Нужны отдельные gauges:
`battle_active_matches`, `battle_match_queue`, `battle_websocket_active`,
`deployment_draining`.

## CI/CD pipeline

### Local release command

Сделать `deploy/release.ps1` и, при необходимости, shell-эквивалент:

1. проверить branch, remote, отсутствие незапушенных конфликтующих commits и
   корректность `.release.env`;
2. запустить release/combat preflight из существующего
   `tasks/combat-rollout-runbook-2026-08.md`;
3. проверить Compose config, tests, secret scan и diff summary;
4. вычислить tag;
5. выполнить требуемый `git add .`, показать список и размер staged файлов;
6. commit `deploy commit: <tag>` и annotated tag;
7. push commit и tag;
8. сохранить локальный `release-manifest.json` как evidence.

Для первого запуска после текущих 87 dirty-файлов нужен отдельный review
checkpoint: либо принять весь текущий scope как `v0.0.1`, либо сначала разбить
его на функциональные commits. Pipeline не должен молча выбирать за владельца.

### GitHub Actions

Добавить минимум:

- `ci.yml` на PR/push: frontend lint, tests, build; Go tests для battle,
  leaderboard, party; Python tests; compose config; catalog/combat validators;
  `govulncheck`, `npm audit`/dependency audit, secret scan;
- `release.yml` на `v*` tags: checkout exact tag, build images, push в GHCR,
  получить digest каждого образа, сформировать signed/immutable manifest;
- staging job: deploy exact manifest, migrations на staging, smoke/e2e;
- production job: GitHub Environment approval, concurrency group
  `production-deploy`, SSH deploy и post-deploy monitoring;
- manual `rollback.yml`: выбрать только один из известных manifests, не branch
  и не `latest`.

Production secrets хранить в GitHub Environment/secret manager. CI test
credentials должны быть отдельными от production. SSH — отдельный deploy user,
key-only login, restricted command/known_hosts, no root login и без передачи
секретов в command line.

## Production deploy script

На сервере сделать идемпотентный `deploy/deploy-prod.sh`/`.ps1`, который принимает
только tag/manifest:

1. проверить SHA/подпись manifest и свободное место;
2. проверить, что project name — `prod`, а volumes совпадают с allowlist;
3. взять host lock;
4. включить drain;
5. выполнить `pg_dump` для основной и shop базы, checksum и encrypted/off-host
   copy; проверить, что backup читается;
6. запустить migration jobs (`restart: "no"`) и дождаться успешного exit;
7. `docker compose pull` exact images;
8. пересоздать только stateless/app containers;
9. дождаться readiness, проверить `/version`, nginx, Telegram auth, party,
   matchmaking и WebSocket smoke;
10. записать deployment marker в Grafana и release manifest;
11. держать предыдущие images/manifest до окончания retention window;
12. только после monitor window безопасно удалить старые app images по точному
    allowlist. Никогда не выполнять `docker compose down -v`.

Frontend лучше собирать в CI и включать `dist` в immutable nginx image. Это
убирает текущую зависимость production от writable `frontend-dist` volume и
отдельного build-контейнера на сервере.

## Database и News service

### Existing migrations

- Убрать `alembic upgrade head` из startup command `bot`/`shop`.
- Добавить отдельные compose migration jobs с DB healthcheck, advisory lock,
  timeout и явным log/artifact.
- Применять migration до запуска нового application image, но только после
  backup.
- Добавить migration smoke и backward-compatibility test.

### News service

Создать `news/` как отдельный сервис с собственной БД и volume:

- таблица `release_news`: numeric id, unique `tag`, title/body, published_at
  и commit SHA;
- `GET /news` — публичный read-only endpoint с pagination и bounded limit;
- internal idempotent `POST /internal/news/releases` — только из deploy network,
  создаёт запись после успешного smoke;
- exact nginx route `/api/news`, без проксирования всего prefix;
- migration job и backup policy для news DB;
- frontend News tab читает endpoint, безопасно экранирует text/markdown и
  показывает «Обновление <tag>».

Запись в News post-deploy и idempotent: повторный запуск pipeline не создаёт
дубли по одному tag. Если News недоступен, основной deploy не откатывает уже
здоровый runtime и помечает `release.json` как `news_status=pending`.

## Container и network security

Обязательные изменения:

- удалить hardcoded production DB passwords из
  `bot/docker-compose.prod.yml:44` и `shop/docker-compose.prod.yml:56`; брать их
  только из secret store/env с fail-closed проверкой;
- зафиксировать все image versions/digests, включая Cloudflare Tunnel/Kafka UI;
- в production публиковать только nginx; Prometheus/Grafana/Kafka UI — без
  `ports`, через internal network и SSH tunnel или protected management ingress;
- для каждого app service оставить `expose`, не `ports`;
- `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `init: true`,
  `pids_limit`, CPU/memory limits и `read_only: true` там, где runtime совместим;
- добавить non-root users в Go/Python/Node runtime images, writable только
  необходимые data volumes и `/tmp` tmpfs;
- не монтировать Docker socket в application containers;
- продвинуть nginx к реальному TLS/домену через Cloudflare Named Tunnel;
  Quick Tunnel использовать только для локальной проверки;
- добавить CSP, `nosniff`, frame-ancestors/clickjacking policy, strict referrer
  policy, rate limit на auth и WebSocket handshake;
- для nginx credentials использовать Basic Auth только на management paths.
  Если имелись в виду SSH credentials, это решается не nginx, а OS: отдельный
  user, SSH keys, `PasswordAuthentication no`, allowlist/bastion и audit logs.

До rollout нужно отдельно решить судьбу текущих default credentials и
перегенерировать их в production; смена env после инициализации Postgres не
меняет пароль существующего пользователя автоматически.

## Grafana/Prometheus release markers

Добавить в каждый HTTP/WebSocket сервис минимальный build metric:

```text
app_build_info{service="battle",environment="production",version="v0.0.1",git_sha="..."} 1
```

Labels только из bounded release metadata, без user/room/request IDs. Для
deployment event использовать Grafana annotation с tag, SHA, migration revision,
deploy status и ссылкой на manifest. Token хранить как secret, Grafana наружу не
публиковать.

Dashboard должен получить:

- переменные `environment`, `service`, `release_version`, `baseline_version`;
- вертикальные release annotations;
- до/после панели для error rate, p95/p99, request rate, active WS, active
  matches, queue, tick gap, snapshot drops, DB pool и business metrics;
- пороги rollback: error rate > 2x baseline, p95 > 50% baseline, новые client
  errors, data integrity или security issue;
- ссылку на runbook и manifest на каждом marker.

Сейчас Prometheus скрапит только battle. На первом этапе расширить его на
остальные `/metrics` и добавить container/host metrics в internal network;
не проксировать `/metrics` через public API.

## Rollback

До deploy сохранить:

- предыдущий passing manifest и image digests;
- current/previous tag и commit SHA;
- compose config checksum;
- DB migration revision;
- backup checksum/location;
- combat profile/fingerprint и existing rollout evidence.

Автоматический rollback запускается при failed readiness/smoke или красных
порогах мониторинга:

1. оставить maintenance включённым;
2. не выполнять `git revert` и не менять рабочее дерево сервера;
3. выбрать previous manifest;
4. вернуть application images и nginx, не удаляя volumes;
5. проверить readiness/version/smoke и записать rollback marker;
6. миграцию откатывать автоматически только если это заранее доказанный
   backward-safe шаг. Для destructive schema change — restore/операторский
   runbook, а не blind downgrade.

Rollback drill обязателен на staging до первого production deploy. Current combat
runbook прямо отмечает, что approved historical rollback ref пока отсутствует;
первый production release должен сначала создать такой passing manifest.

## Definition of Done

- Release `v0.0.1` воспроизводимо создаёт commit/tag и manifest.
- CI блокирует релиз при failing quality/security gate.
- Production принимает только exact image digests из manifest.
- Drain запрещает новые бои, показывает maintenance banner и ждёт zero active
  matches; timeout не роняет текущие комнаты автоматически.
- DB migrations идут отдельным job после verified backup.
- Ни один volume не удаляется при обычном deploy/rollback.
- `/version` и профиль показывают один и тот же tag.
- Grafana показывает release annotation и baseline comparison.
- Rollback на предыдущий manifest проверен на staging.
- News endpoint idempotently создаёт release entry после успешного deploy.
- SSH/management access закрыт от public internet, secrets не попадают в Git,
  logs, image layers или pipeline output.

## Открытые решения перед реализацией

1. Подтвердить GitHub Actions как CI provider и GHCR как registry.
2. Уточнить, что означает «к SSH подключению nginx креды»: Basic Auth на
   management paths или отдельные SSH credentials/политика доступа к серверу.
3. Подключить Cloudflare Named Tunnel token и hostname; Quick Tunnel не считать
   постоянным production ingress.
4. Задать допустимый drain timeout и policy компенсации при emergency force.
5. Решить, принимаем ли весь текущий dirty scope в `v0.0.1` или делим его до
   запуска release-команды.
6. Определить off-host encrypted backup destination и retention (например,
   7/30 дней) отдельно от Docker host.
