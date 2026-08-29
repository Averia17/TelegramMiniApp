# News service contract

The release pipeline publishes an immutable release manifest first. The
`news` service turns the successful deployment event into a user-facing
announcement without coupling the frontend build to deployment.

## Public endpoint

`GET /api/news?limit=20&cursor=<opaque-cursor>`

Each item contains `id`, `tag`, `title`, `body`, and `published_at`. The
response is `{ "items": [], "nextCursor": null, "hasMore": false }`.

## Internal release event

`POST /internal/news/releases` is callable only from the deploy network and
requires `X-Deployment-Token`. The deployer sends `tag`, `commit`, `title`, and
`body`. The service enforces a unique constraint on `tag`, making retries
idempotent. The endpoint is intentionally not routed by Nginx.

The service owns its own PostgreSQL database, named volume, and migration job.
`news` is a first-class selective deployment unit: a News-only change rebuilds
and recreates only `news` (plus its migration job), while the gateway route is
kept stable.
