# Security best-practices report

## Executive summary

The primary account-takeover and economy-cheat paths have been closed. Production identity now comes only from server-verified Telegram `initData`; authenticated endpoints and the battle socket derive identity from a signed server token. Direct client control over currency, task rewards, payments, leaderboard scores, combat cooldown timestamps, and arbitrary WebSocket message volume has been removed or bounded.

## Critical findings

### SEC-001 — Client-controlled player identity (fixed)

- Severity: Critical
- Location: `frontend/src/utils/auth.js`, `account/routes/auth.py`, `battle/handler/auth.go`
- Impact: A client could previously impersonate any Telegram user and receive rewards or play under their leaderboard identity.
- Fix: Production sessions now require Telegram HMAC validation. The resulting user ID is signed into a short-lived access token and recovered server-side.
- False-positive notes: Production must set `APP_ENV=production`, `BOT_TOKEN`, and a random `APP_AUTH_SECRET`.

### SEC-002 — Direct economy and payment manipulation (fixed)

- Severity: Critical
- Location: `account/routes/economy.py`, `account/routes/payments.py`, `shop/routes/products.py`, `nginx/prod.conf`
- Impact: Direct HTTP requests could select another user or invoke payment/refund operations.
- Fix: Browser operations use `/me`; shop derives identity from the access token; payment/refund requires a service signature and is not exposed by Nginx.

### SEC-003 — Client-reported rewards and balances (fixed by disabling unsafe endpoints)

- Severity: Critical
- Location: `account/routes/users.py`
- Impact: A client could submit arbitrary `clicks` or `reward` values.
- Fix: Both client-reported mutation paths return HTTP 410 until an authoritative server-side implementation exists.

## High findings

### SEC-004 — Combat cooldown timestamp forgery (fixed)

- Severity: High
- Location: `battle/model/game/game.go`
- Impact: A modified client could send future timestamps to bypass shooting or ability cooldowns.
- Fix: Combat actions use server time; client timestamps remain only for non-authoritative acknowledgement/prediction.

### SEC-005 — Public leaderboard score writer (fixed)

- Severity: High
- Location: `leaderboard/handler/handler.go`
- Impact: Any HTTP client could submit arbitrary score, win, and game totals.
- Fix: The HTTP mutation route is no longer registered. Scores are updated only from battle-result events.

### SEC-006 — WebSocket cross-site and resource abuse (fixed)

- Severity: High
- Location: `battle/handler/messages.go`, `battle/main.go`
- Impact: Cross-site clients or message floods could consume goroutines, memory, and game-loop time.
- Fix: Production Origin validation, authentication timeout, 16 KiB message limit, 120 messages/second connection limit, bounded names/config values, write deadlines, and HTTP server limits were added.

## Remaining medium risks

### SEC-007 — Internal Kafka trust

- Severity: Medium
- Location: `docker-compose.yml`, `battle/provider/kafka.go`, `account/consumers.py`, `leaderboard/provider/kafka.go`
- Risk: A compromised container on the application network could publish forged battle results because Kafka uses plaintext internal listeners without producer authentication.
- Recommendation: Before production, isolate Kafka from unrelated workloads and enable SASL credentials or mTLS/ACLs for battle producers and reward consumers.

### SEC-008 — Rate limiting is per battle process

- Severity: Medium
- Location: `battle/handler/messages.go`
- Risk: Per-connection limits prevent a single socket flood, but an attacker can distribute traffic across many connections or replicas.
- Recommendation: Add connection/IP limits at Nginx or the deployment edge and metrics/alerts for rejected sockets and message-rate violations.

### SEC-009 — Task and click features need authoritative designs

- Severity: Medium
- Location: `account/routes/users.py`
- Risk: The insecure implementations are disabled, so these features currently cannot award currency.
- Recommendation: Re-enable only after tasks are verified against server-side rules and click rewards use server-side rate/state validation with atomic database updates.

## Validation performed

- Python modules compile successfully.
- Frontend production build succeeds.
- Go battle service builds successfully.
- Battle handler, game, player, and room tests pass.
- Two independent browser clients were verified with IDs `900000001` and `900000002`.
- Cross-user economy access returns 403.
- Public payment access returns 404.
- A development identity is rejected when `APP_ENV=production`.

## Gateway follow-up

### SEC-010 — Public service surface was too broad (fixed)

- Severity: High
- Location: `nginx/dev.conf`, `nginx/prod.conf`, `docker-compose.yml`
- Impact: Prefix-based proxying exposed every current and future backend route to a browser. The development frontend was also reachable on host port 5173, bypassing the gateway.
- Fix: Nginx now acts as a deny-by-default BFF. Each browser route and HTTP method is explicitly allowlisted; unknown API paths return 404 and wrong methods return 405. Only Nginx publishes a host port, while the frontend and services use the internal Docker network.
- Defense in depth: Backend authentication and server-authoritative battle results remain mandatory. Nginx is not treated as the only authorization layer.

### SEC-011 — Battle admission is not coupled to energy spending

- Severity: Medium
- Location: `account/routes/economy.py`, `battle/handler/messages.go`
- Risk: `/economy/me/battle` spends energy, but an authenticated client can connect directly to the allowed battle WebSocket without first obtaining a one-time admission ticket.
- Recommendation: Make the start endpoint issue a short-lived, one-time battle ticket after spending energy, and require the battle service to atomically consume it before matchmaking. Store ticket nonces in shared Redis so the check works across replicas.

Additional validation:

- Direct battle-result and leaderboard-score POST requests return 404 at the BFF.
- Wrong HTTP methods on allowlisted routes return 405.
- Only Nginx port 80 is published; host port 5173 is unreachable.
