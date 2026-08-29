#!/usr/bin/env bash
set -Eeuo pipefail

# Retry the user-facing release article without rebuilding or restarting any
# service. This is safe to run after a transient News outage.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
RELEASE_ROOT="${RELEASE_ROOT:-$ROOT/.release}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT/.env.prod}"
COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"
COMPOSE=(docker compose --env-file "$RELEASE_ROOT/compose.env" -f "$COMPOSE_FILE")

manifest="${1:-$RELEASE_ROOT/current/manifest.json}"
[[ -f "$manifest" ]] || { echo "manifest not found: $manifest" >&2; exit 2; }
[[ -f "$RELEASE_ROOT/compose.env" ]] || { echo "compose env not found: $RELEASE_ROOT/compose.env" >&2; exit 2; }
[[ -f "$DEPLOY_ENV_FILE" ]] || { echo "deployment env not found: $DEPLOY_ENV_FILE" >&2; exit 2; }

ADMIN_TOKEN="${DEPLOY_ADMIN_TOKEN:-}"
if [[ -z "$ADMIN_TOKEN" ]]; then
  ADMIN_TOKEN="$(sed -n 's/^DEPLOY_ADMIN_TOKEN=//p' "$DEPLOY_ENV_FILE" | head -n 1)"
fi
[[ -n "$ADMIN_TOKEN" ]] || { echo "DEPLOY_ADMIN_TOKEN is required" >&2; exit 2; }

read -r TAG COMMIT < <(python - "$manifest" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], encoding="utf-8"))
print(payload["tag"], payload["commit"])
PY
)
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "invalid release tag" >&2; exit 2; }

payload="$(python - "$TAG" "$COMMIT" <<'PY'
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

"${COMPOSE[@]}" exec -T nginx wget -qO- --timeout=5 \
  --header="X-Deployment-Token: $ADMIN_TOKEN" \
  --header="Content-Type: application/json" \
  --post-data="$payload" \
  "http://news:8000/internal/news/releases" >/dev/null

python - "$RELEASE_ROOT/current/release.json" <<'PY'
import json
import sys

path = sys.argv[1]
payload = json.load(open(path, encoding="utf-8"))
payload["news_status"] = "published"
open(path, "w", encoding="utf-8").write(json.dumps(payload, indent=2) + "\n")
PY

echo "published News release $TAG"
