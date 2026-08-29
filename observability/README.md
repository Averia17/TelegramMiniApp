# Battle observability

The battle service exposes Prometheus metrics at `http://battle:8000/metrics`.
The root compose file includes Prometheus on `localhost:9090` and Grafana on
`localhost:3000` when the observability services are enabled.

## Local startup

```powershell
docker compose up -d battle prometheus grafana
```

Open Grafana at `http://localhost:3000`. The dashboard is provisioned as
`Battle / Battle Runtime`; the Prometheus datasource is configured automatically.

## Signals

- `battle_tick_gap_seconds`: authoritative simulation cadence; inspect p95/p99.
- `battle_state_update_seconds`, `battle_snapshot_prepare_seconds` and
  `battle_state_queue_seconds`: server-side tick budget split by phase.
- `battle_state_queue_drops_total`: latest-only snapshots replaced before the
  WebSocket writer could send them.
- `battle_state_bytes_total`: state bandwidth pressure.
- `battle_websocket_active`, `battle_websocket_disconnects_total` and
  `battle_websocket_rate_limited_total`: connection health.
- `battle_websocket_write_seconds`, `battle_websocket_slow_writes_total`,
  `battle_websocket_write_errors_total` and `battle_websocket_write_bytes_total`:
  outbound transport latency, saturation and payload pressure.
- `battle_http_request_duration_seconds` and `battle_http_requests_total`: RED
  metrics for the HTTP surface.
- `app_build_info{version,commit}` identifies the running release. The
  `app_release_deployments_total{version,commit}` counter is used by the
  Grafana dashboard as a release annotation trigger.
- The release tag is also written to `/release.json` and the News record after
  the smoke check, so the profile, Grafana marker, and user-facing update all
  refer to the same immutable manifest.

## Runbook

### Battle tick gap

Query `histogram_quantile(0.95, sum by (le) (rate(battle_tick_gap_seconds_bucket[5m])))`.
If it exceeds 25ms, inspect `battle_state_update_seconds` and
`battle_snapshot_prepare_seconds` before changing client interpolation.

### Snapshot queue drops

Drops mean the server is producing snapshots faster than the WebSocket writer
can deliver them. Check snapshot bytes, active WebSockets, network write errors,
and browser `network.snapshot_interval` / `network.snapshot_age` metrics.

### WebSocket write latency

Query `histogram_quantile(0.95, sum by (le) (rate(battle_websocket_write_seconds_bucket[5m])))`.
If it exceeds 20ms, inspect `battle_websocket_slow_writes_total`, write errors,
queue drops and payload bytes before increasing client interpolation delay.

### HTTP errors

Break down `battle_http_requests_total` by the bounded `route` and `status`
labels. Do not add user IDs, room IDs, URLs, or error messages as metric labels.

### WebSocket churn

Compare connection and disconnect rates with `battle_websocket_active`. Then
inspect client page errors and server write deadlines; never log auth tokens.
