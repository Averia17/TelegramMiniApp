Application build on https://github.com/Latand/MedSyncWebApp
### First project initialization
1. Copy .env.dist to .env file, update BOT_TOKEN to your bot token from @botfather

## Telegram authentication

The browser does not choose or store the player identity. When opened as a
Telegram Mini App, it sends `Telegram.WebApp.initData` to the account service.
The account service verifies Telegram's HMAC signature with `BOT_TOKEN`, reads
the Telegram user ID from the verified payload, and returns a 15-minute access
token. The same `APP_AUTH_SECRET` must be available to the account and battle
services.

`APP_ENV` is the only mode switch. With `APP_ENV=development`, ordinary browser
clients receive separate local identities; use `?devUser=900000001` and
`?devUser=900000002` for deterministic multiplayer clients. With
`APP_ENV=production`, development identities are rejected and only verified
Telegram `initData` can create a session.

## Public API gateway

Nginx is the browser-facing BFF and the only service that publishes a host
port. Frontend, account, shop, battle, leaderboard, databases, Redis, and Kafka
are reachable only inside the Docker network.

The gateway uses a deny-by-default contract: every public path and HTTP method
is explicitly listed in `nginx/dev.conf` and `nginx/prod.conf`. Unknown API
routes return 404 and wrong methods return 405. In particular, clients cannot
call payment/refund APIs or submit battle and leaderboard results over HTTP.
Battle results are produced by the authoritative battle server and delivered
internally through Kafka.

When adding a browser API, add the smallest exact route to both Nginx configs
and keep authentication and object-level authorization in the owning service.
Do not expose a whole service prefix.
2. Copy frontend/.env.dist to frontend/.env file, update VITE_BACKEND_URL=http://localhost

### Up project
```bash
docker compose up
docker compose exec bot python -m alembic upgrade head
```

### Future architecture
<img src="architecture.png" width="500" alt="System Architecture Diagram">
