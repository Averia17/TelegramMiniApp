#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy one immutable manifest on the production host. This script deliberately
# never calls `down -v`, `volume rm`, or `image prune --all`.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
RELEASE_ROOT="${RELEASE_ROOT:-$ROOT/.release}"
DEPLOY_COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT/.env.prod}"
DEPLOY_COMPOSE_PROFILE="${DEPLOY_COMPOSE_PROFILE:-cloudflare}"
COMPOSE=(docker compose --profile "$DEPLOY_COMPOSE_PROFILE" --env-file "$RELEASE_ROOT/compose.env" -f "$DEPLOY_COMPOSE_FILE")

usage() {
  echo "Usage: $0 <tag> <manifest.json> [--eta-minutes <minutes>]" >&2
  exit 2
}

[[ $# -ge 2 ]] || usage
TAG="$1"
MANIFEST="$2"
shift 2
ESTIMATED_MINUTES="${DEPLOY_ESTIMATED_MINUTES:-5}"
while (( $# > 0 )); do
  case "$1" in
    --eta-minutes)
      [[ $# -ge 2 ]] || usage
      ESTIMATED_MINUTES="$2"
      shift 2
      ;;
    --eta-minutes=*)
      ESTIMATED_MINUTES="${1#*=}"
      shift
      ;;
    *)
      usage
      ;;
  esac
done
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "invalid release tag" >&2; exit 2; }
[[ -f "$MANIFEST" ]] || { echo "manifest not found: $MANIFEST" >&2; exit 2; }
[[ "$ESTIMATED_MINUTES" =~ ^[1-9][0-9]*$ ]] || {
  echo "--eta-minutes must be a positive integer" >&2
  exit 2
}

mkdir -p "$RELEASE_ROOT/releases" "$RELEASE_ROOT/current"
exec 9>"$RELEASE_ROOT/deploy.lock"
flock -n 9 || { echo "another production deployment is running" >&2; exit 3; }

python - "$MANIFEST" "$TAG" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
if manifest.get("tag") != sys.argv[2]:
    raise SystemExit("manifest tag does not match deployment tag")
if manifest.get("schema_version") != 1:
    raise SystemExit("unsupported release manifest schema")
PY

PREVIOUS_MANIFEST="$RELEASE_ROOT/current/manifest.json"
TARGET_DIR="$RELEASE_ROOT/releases/$TAG"
mkdir -p "$TARGET_DIR"
cp "$MANIFEST" "$TARGET_DIR/manifest.json"

python -m deploy.compose_env --manifest "$MANIFEST" --output "$RELEASE_ROOT/compose.images.env"
if [[ ! -f "$DEPLOY_ENV_FILE" ]]; then
  echo "missing $DEPLOY_ENV_FILE; deployment is refused" >&2
  exit 4
fi
cp "$DEPLOY_ENV_FILE" "$RELEASE_ROOT/compose.env"
cat "$RELEASE_ROOT/compose.images.env" >> "$RELEASE_ROOT/compose.env"
chmod 600 "$RELEASE_ROOT/compose.env"

ADMIN_TOKEN="${DEPLOY_ADMIN_TOKEN:-}"
if [[ -z "$ADMIN_TOKEN" ]]; then
  ADMIN_TOKEN="$(sed -n 's/^DEPLOY_ADMIN_TOKEN=//p' "$DEPLOY_ENV_FILE" | head -n 1)"
fi
[[ -n "$ADMIN_TOKEN" ]] || { echo "DEPLOY_ADMIN_TOKEN is required" >&2; exit 4; }

RELEASE_COMMIT="$(python - "$MANIFEST" <<'PY'
import json
import sys
print(json.load(open(sys.argv[1], encoding="utf-8"))["commit"])
PY
)"

DEPLOYMENT_MESSAGE="Деплой начинается. Бои приостановлены. Ориентировочно завершится через ~${ESTIMATED_MINUTES} мин."
DEPLOYMENT_PAYLOAD="$(python - "$TAG" "$DEPLOYMENT_MESSAGE" <<'PY'
import json
import sys

print(json.dumps({"tag": sys.argv[1], "message": sys.argv[2]}, ensure_ascii=False))
PY
)"

mapfile -t COMPOSE_SERVICES < <("${COMPOSE[@]}" config --services)
has_service() {
  printf '%s\n' "${COMPOSE_SERVICES[@]}" | grep -Fxq "$1"
}

request_service() {
  local service="$1" method="$2" path="$3" data="${4:-}" port="${5:-8000}"
  local common=(wget -qO- --timeout=5 \
    --header="X-Deployment-Token: $ADMIN_TOKEN" \
    --header="Content-Type: application/json")
  if [[ "$method" == "POST" ]]; then
    "${COMPOSE[@]}" exec -T nginx "${common[@]}" --post-data="$data" "http://$service:$port$path"
  else
    "${COMPOSE[@]}" exec -T nginx "${common[@]}" "http://$service:$port$path"
  fi
}

request_battle() { request_service battle "$@"; }
request_news() { request_service news "$@"; }
request_account() { request_service account "$@"; }
request_party() {
  local method="$1" path="$2" data="${3:-}"
  request_service party "$method" "$path" "$data" 8002
}

"${COMPOSE[@]}" config --quiet
docker info >/dev/null
for database in db shop-db news-db; do
  has_service "$database" && "${COMPOSE[@]}" up -d --no-build --no-recreate "$database"
done

wait_for_drain() {
  local service port container
  DRAINED_SERVICES=()
  while IFS=: read -r service port; do
    container="$("${COMPOSE[@]}" ps -q "$service" 2>/dev/null || true)"
    [[ -n "$container" ]] || continue
    case "$service" in
      account) request_account POST "/internal/deployment/drain" >/dev/null ;;
      party) request_party POST "/internal/deployment/drain" >/dev/null ;;
      battle) request_battle POST "/admin/deployment/drain" "$DEPLOYMENT_PAYLOAD" >/dev/null ;;
    esac
    DRAINED_SERVICES+=("$service")
  done <<'SERVICES'
account:8000
party:8002
battle:8000
SERVICES

  local battle_container
  battle_container="$("${COMPOSE[@]}" ps -q battle 2>/dev/null || true)"
  if [[ -z "$battle_container" ]]; then
    echo "no existing battle container; treating this as the initial deployment"
    return 0
  fi
  DRAINED=1
  local deadline=$((SECONDS + ${DRAIN_TIMEOUT_SECONDS:-300}))
  while (( SECONDS < deadline )); do
    local status
    status="$(request_battle GET "/admin/deployment/status")"
    if python - "$status" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
raise SystemExit(0 if payload.get("active_matches", 0) == 0 and payload.get("match_queue", 0) == 0 else 1)
PY
    then
      return 0
    fi
    sleep 2
  done
  echo "battle drain timeout; deployment is refused" >&2
  return 1
}

mapfile -t RECREATE_UNITS < <(python - "$MANIFEST" <<'PY'
import json
import sys

for unit in json.load(open(sys.argv[1], encoding="utf-8")).get("recreate_units", []):
    print(unit)
PY
)

backup_database() {
  local service="$1" filename="$2" backup_dir="$TARGET_DIR/backups"
  mkdir -p "$backup_dir"
  echo "creating backup for $service"
  "${COMPOSE[@]}" exec -T "$service" sh -c 'pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$backup_dir/$filename"
  [[ -s "$backup_dir/$filename" ]] || { echo "empty database backup: $service" >&2; return 1; }
  sha256sum "$backup_dir/$filename" > "$backup_dir/$filename.sha256"
}

backup_databases() {
  backup_database db app.dump
  backup_database shop-db shop.dump
  backup_database news-db news.dump
}

wait_ready() {
  local unit="$1" container status
  container="$("${COMPOSE[@]}" ps -aq "$unit")"
  [[ -n "$container" ]] || { echo "no container for $unit" >&2; return 1; }
  local deadline=$((SECONDS + ${SERVICE_TIMEOUT_SECONDS:-180}))
  while (( SECONDS < deadline )); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
    if [[ "$status" == "healthy" || ( "$unit" == "frontend" && "$status" == "exited" && "$(docker inspect -f '{{.State.ExitCode}}' "$container")" == "0" ) || ( "$status" == "running" && ( "$unit" == "nginx" || "$unit" == "prometheus" || "$unit" == "grafana" || "$unit" == "kafka-ui" || "$unit" == "cloudflared" ) ) ]]; then
      return 0
    fi
    [[ "$status" == "unhealthy" || "$status" == "dead" ]] && break
    sleep 2
  done
  echo "$unit did not become ready" >&2
  "${COMPOSE[@]}" logs --tail=100 "$unit" >&2 || true
  return 1
}

deploy_units() {
  local unit
  for unit in "${RECREATE_UNITS[@]}"; do
    has_service "$unit" || continue
    "${COMPOSE[@]}" pull "$unit"
  done
  for unit in "${RECREATE_UNITS[@]}"; do
    has_service "$unit" || continue
    "${COMPOSE[@]}" up -d --no-build --no-deps --force-recreate "$unit"
    wait_ready "$unit"
  done
}

ensure_tunnel() {
  if has_service cloudflared; then
    "${COMPOSE[@]}" up -d --no-build --no-deps cloudflared
    wait_ready cloudflared
  fi
}

run_migrations() {
  local unit
  for unit in "${RECREATE_UNITS[@]}"; do
    case "$unit" in
      bot)
        has_service bot-migrate || continue
        "${COMPOSE[@]}" pull bot-migrate
        "${COMPOSE[@]}" run --rm --no-deps bot-migrate
        ;;
      shop)
        has_service shop-migrate || continue
        "${COMPOSE[@]}" pull shop-migrate
        "${COMPOSE[@]}" run --rm --no-deps shop-migrate
        ;;
      news)
        has_service news-migrate || continue
        "${COMPOSE[@]}" pull news-migrate
        "${COMPOSE[@]}" run --rm --no-deps news-migrate
        ;;
    esac
  done
}

publish_release_news() {
  local payload
  payload="$(python - "$TAG" "$RELEASE_COMMIT" <<'PY'
import json
import sys
print(json.dumps({
    "tag": sys.argv[1],
    "commit": sys.argv[2],
    "title": f"Новое обновление {sys.argv[1]}",
    "body": "Арена обновлена. Спасибо, что играете!",
}, ensure_ascii=False))
PY
)"
  request_news POST "/internal/news/releases" "$payload" >/dev/null
}

rollback() {
  set +e
  if [[ -f "$PREVIOUS_MANIFEST" ]]; then
    echo "release failed; restoring previous manifest" >&2
    python -m deploy.compose_env --manifest "$PREVIOUS_MANIFEST" --output "$RELEASE_ROOT/rollback.images.env"
    cp "$DEPLOY_ENV_FILE" "$RELEASE_ROOT/compose.env"
    cat "$RELEASE_ROOT/rollback.images.env" >> "$RELEASE_ROOT/compose.env"
    chmod 600 "$RELEASE_ROOT/compose.env"
    mapfile -t rollback_units < <(python - "$MANIFEST" <<'PY'
import json
import sys
for unit in json.load(open(sys.argv[1], encoding="utf-8")).get("recreate_units", []):
    print(unit)
PY
    )
    local unit
    for unit in "${rollback_units[@]}"; do
      if has_service "$unit"; then
        "${COMPOSE[@]}" pull "$unit" && "${COMPOSE[@]}" up -d --no-build --no-deps --force-recreate "$unit"
        wait_ready "$unit" || echo "rollback readiness failed for $unit" >&2
      fi
    done
    cp "$PREVIOUS_MANIFEST" "$RELEASE_ROOT/current/manifest.json"
    python - "$PREVIOUS_MANIFEST" "$RELEASE_ROOT/current/release.json" <<'PY'
import json
import sys
from datetime import datetime, timezone

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
payload = {"tag": manifest["tag"], "commit": manifest["commit"], "deployed_at": datetime.now(timezone.utc).isoformat()}
open(sys.argv[2], "w", encoding="utf-8").write(json.dumps(payload, indent=2) + "\n")
PY
    restored_tag="$(python - "$PREVIOUS_MANIFEST" <<'PY'
import json
import sys
print(json.load(open(sys.argv[1], encoding="utf-8"))["tag"])
PY
    )"
    if has_service nginx; then
      installed_tag="$("${COMPOSE[@]}" exec -T nginx wget -qO- --timeout=5 http://127.0.0.1/release.json 2>/dev/null | python -c 'import json, sys; print(json.load(sys.stdin)["tag"])' 2>/dev/null)"
      [[ "$installed_tag" == "$restored_tag" ]] || echo "rollback release metadata mismatch: $installed_tag (expected $restored_tag)" >&2
    fi
  fi
  resume_drained_services
}

resume_drained_services() {
  local service
  for service in "${DRAINED_SERVICES[@]}"; do
    case "$service" in
      account) request_account POST "/internal/deployment/resume" >/dev/null ;;
      party) request_party POST "/internal/deployment/resume" >/dev/null ;;
      battle) request_battle POST "/admin/deployment/resume" >/dev/null ;;
    esac
  done
  DRAINED=0
  DRAINED_SERVICES=()
}

DRAINED=0
DRAINED_SERVICES=()
trap 'rc=$?; rollback; exit $rc' ERR
wait_for_drain
backup_databases
run_migrations
deploy_units
ensure_tunnel

cp "$TARGET_DIR/manifest.json" "$RELEASE_ROOT/current/manifest.json"
python - "$TARGET_DIR/manifest.json" "$RELEASE_ROOT/current/release.json" <<'PY'
import json
import sys
from datetime import datetime, timezone

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
payload = {"tag": manifest["tag"], "commit": manifest["commit"], "deployed_at": datetime.now(timezone.utc).isoformat()}
open(sys.argv[2], "w", encoding="utf-8").write(json.dumps(payload, indent=2) + "\n")
PY

smoke_check() {
  request_news GET "/ready" >/dev/null
  local installed_tag
  installed_tag="$("${COMPOSE[@]}" exec -T nginx wget -qO- --timeout=5 http://127.0.0.1/release.json | python -c 'import json, sys; print(json.load(sys.stdin)["tag"])')"
  [[ "$installed_tag" == "$TAG" ]] || { echo "release metadata smoke check failed: $installed_tag" >&2; return 1; }
}

smoke_check

# Remove only dangling layers. Named database/Kafka/Redis volumes are never
# addressed by this command, and tagged release images remain rollbackable.
docker image prune -f
resume_drained_services
NEWS_STATUS=published
if ! publish_release_news; then
  NEWS_STATUS=pending
  echo "release deployed, but News publication is pending" >&2
fi
python - "$RELEASE_ROOT/current/release.json" "$NEWS_STATUS" <<'PY'
import json
import sys

path, news_status = sys.argv[1:]
payload = json.load(open(path, encoding="utf-8"))
payload["news_status"] = news_status
open(path, "w", encoding="utf-8").write(json.dumps(payload, indent=2) + "\n")
PY
echo "deployed $TAG"
