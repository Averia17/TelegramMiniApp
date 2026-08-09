Original prompt: Сделать текущую карту более похожей на прежнюю: добавить траву, воду и стены, убрать дроп бустеров и сделать карту естественнее.

- RED: текущая арена содержала 24 клетки bush, а lobby автоматически создавало 12 lunar_crate.
- Готово: шумовая генерация береговой линии, внутренних водоёмов, травяных пятен и групп стен; высадки соединены с центром.
- Готово: автоспавн booster crates отключён в lobby и match; ручная механика crate/reward оставлена для совместимости.
- Проверено: `go test ./model/gamemap`, целевые `model/game`, `npm test`, `npm run build`; Playwright harness отрендерился без console errors.
- TODO: полный `go test ./...` всё ещё содержит ранее существовавшие падения combat-тестов вне этого изменения.

## Final phase HP drain

- Added a separate 60-second beacon/final phase to the match clock (total match duration is now 3:30).
- Sudden-death damage now starts with 2+ alive players, including the reported 3-player endgame.
- A lethal island tick protects the strongest current fighter from being killed by that tick, preventing an all-dead draw and leaving one survivor.
- Focused `go test ./model/game` coverage passes for duration, 3-player damage, and one-survivor resolution.

## Storm overlay smoothing

- Replaced per-radius `RingGeometry` recreation with one mutable ring geometry.
- Client-side storm radius now eases toward the latest server snapshot, removing stepped shrinking.
- Storm overlay uses an unobstructed render layer so the tint stays continuous across map props.
- Added frontend regression coverage for interpolation, geometry reuse, and overlay depth behavior.
- `npm test` and `npm run build` pass. `npm run lint` remains blocked by pre-existing indentation errors in `frontend/src/components/BattleGame/battleMessages.js`.

## Battle message bubbles

- Fixed empty battle-message bubbles caused by server events without JSX text branches (`room_joined`, `match_found`, `error`, `you_died`, and `island_phase`).
- Added `frontend/src/components/BattleGame/battleMessages.js` as the single message formatter; unknown/hidden events now render no DOM bubble.
- Added regression coverage in `frontend/test/battle-messages.test.js`.
- Verified with `npm test`, `npm run build`, `npm run lint`, and a mocked browser lobby: 7 rendered messages, 0 blank messages.

## Island phase visuals

- Added phase progress utilities for hunt, challenge, collapse, and beacon.
- Phase HUD now shows phase number, timer, progress, phase rail, challenge event, storm warning, and beacon holder progress.
- Added subtle arena atmosphere overlays with distinct green, violet, crimson, and amber phase moods.
- Added reduced-motion handling for phase pulses and storm warning animation.

## Storm plane correction

- Removed the per-frame Y rotation from the horizontal storm ring so the full oval stays level and continuous.
- Storm shrinking now changes only the radius, with a regression assertion preventing the overlay from tilting again.

## Combat performance iteration

- Added bounded local performance telemetry with p50/p95/p99 samples for snapshot age/interval/size, prediction reconciliation error, simulation, map sync, renderer state sync, and render frames.
- Exposed metrics through development `render_game_to_text` / `window.getBattleMetrics` and added `tools/qa/battle-performance-browser-qa.cjs` for random-hero browser runs with movement and attack.
- Large repeated bush fields (64+ authored bush colliders) now use one instanced fallback field instead of one environment GLB clone per collider; small fields keep authored GLB visuals.
- Browser verification: random Wukong Mico run had 2702 map walls but 251 map objects, 59 draw calls, render p95 9.5 ms, prediction reconciliation p95 5.2 px, and zero console/page errors. Screenshot: `output/playwright/battle-performance/battle-907729878.png`.
- Frontend verification: 212 tests passed, 3 skipped; lint and build passed. `go test ./model/game` still has pre-existing combat-contract failures listed earlier in this file.

## Prediction/reconciliation iteration

- Reworked local movement reconciliation around the protocol's `ack` timestamp: authoritative snapshot position is now the base, confirmed move commands are discarded, and every unacknowledged movement command is replayed to the current client simulation time.
- Replaced `Date.now()` position-history matching with a monotonic client prediction clock synchronized to the server timestamp domain. Older or duplicate snapshots are ignored so they cannot rewind the interpolation buffer.
- Separated simulation truth from presentation: the replayed prediction is authoritative internally, while the old-vs-new delta is a decaying render-only offset. This keeps the exact frame in which a snapshot arrives visually continuous while still converging to the server.
- Remote entities continue to render from the server snapshot jitter buffer; the local hero renders at the present predicted time. The render loop now samples `getDisplayState()` on every RAF instead of turning the 30 Hz snapshot cadence into a 30 Hz visual cadence.
- Added regression coverage for unacknowledged input replay, same-frame visual continuity, out-of-order snapshots, and collision-safe replay.
- Stabilized server-time interpolation by retaining recent clock-sync samples and selecting the lowest-RTT estimate; delayed main-thread delivery no longer directly becomes clock skew. Added a regression test for a delayed sample.
- Verification: all 215 frontend tests pass (3 skipped), lint passes, production build passes, and browser QA completed random Fairy Mina, Wukong Mico, and Mandy battles with no console/page errors. The final Mandy run recorded `simulation.ingest` p95 0.2 ms, `simulation.display` p95 0.2 ms, reconciliation error p95 0.05 px, visual reconciliation offset p95 12.6 px, and render p95 37.8 ms with 4 players/6 projectiles under the software-WebGL QA runner.

## Presentation-path and browser-lag iteration

- Moved full renderer synchronization behind a new authoritative-snapshot path. Between snapshots, `setDisplayState()` now updates only existing hero/projectile/monster transforms; it does not recreate entities, rebuild labels, or rerun full entity lifecycle sync.
- Compact map wrappers are no longer rescanned as a new map on every snapshot: map geometry is refreshed only when dimensions or the stable wall-list identity changes. The minimap obstacle field is one canvas instead of thousands of moving HUD DOM nodes.
- On constrained devices, expensive live GLB/environment upgrades are skipped after the complete fallback scene is visible; the fallback remains the active low-quality runtime path.
- Added `renderer.scene_update`, `renderer.gpu`, `renderer.frame_interval`, `renderer.setDisplayState`, `game.loop`, per-entity display metrics, React UI commit metrics, long-task summaries, and optional CDP CPU profiling to the browser QA harness.
- Latest random-hero browser run (Wukong Mico) had no console/page errors. `game.loop` p95 was 5.8 ms, renderer frame p95 5.0 ms, display-path p95 was below 0.1 ms, and the WebGL render path stayed below 8 ms at p99.
- The remaining headless Chromium runner issue is outside the game callback: RAF interval p50 was 85.4 ms / p95 111 ms while the full callback was only ~3 ms, with 57 long tasks (p95 109 ms). This points to the runner's software-WebGL/browser scheduling rather than prediction, snapshot interpolation, React commits, or renderer CPU work. It still needs validation in a visible hardware-accelerated Chrome session before calling the battle fully smooth.

## Software-WebGL rendering iteration

- Chrome tracing showed the expensive work was `GPUTask`/compositor `Commit`, not the prediction loop: one heavy random battle reached 529 draw calls and 185k triangles after high-quality assets had already upgraded.
- Software renderers are now detected from `WEBGL_debug_renderer_info` before hero/environment upgrades. Constrained scenes use no live GLB upgrades, no fog/tone mapping, a basic-material hero fallback, fewer decorative label/shadow layers, and a reduced internal pixel ratio while keeping the CSS canvas and world coordinates unchanged.
- If a hardware device falls back dynamically after sustained slow frames, already-loaded hero GLBs and environment replacements are discarded and rebuilt from the lightweight fallback scene. Async GLB upgrades are also discarded if quality changes while they are loading.
- Added regression coverage for software renderer detection, quality fallback disposal, simple-material selection, and null-safe low-quality labels.
- Latest random Kaze browser run: 77 draw calls, 66.7k triangles, 7 shader programs, `game.loop` p95 2.6 ms, renderer frame p95 2.2 ms, and zero long tasks/page/console errors. The software-WebGL runner reached about 38 FPS with a p95 RAF interval of 30.7 ms; this is substantially smoother, but visible hardware-accelerated Chrome still remains the production acceptance check.

## Adaptive snapshot presentation iteration

- Replaced the fixed 100 ms remote interpolation delay with an adaptive jitter buffer. Stable ~30 Hz snapshots converge to about 50.5 ms; the buffer expands from the observed P90 snapshot interval when delivery becomes bursty, while explicit test consumers can still request a fixed delay.
- Added `network.interpolation_delay` telemetry and regression coverage for stable-channel latency reduction and deterministic fixed-delay consumers.
- After restarting the frontend dev bundle, a random Wukong Mico battle recorded P90 snapshot interval 34 ms, interpolation delay 50.5 ms, snapshot age p95 50.5 ms, 39 FPS, render p95 2.2 ms, game-loop p95 2.9 ms, zero long tasks, and no console/page errors.
- Final verification: 223 frontend tests passed (3 skipped), lint passed, production build passed, and `go test ./handler` passed. The full Go suite still contains the pre-existing combat-contract failures documented earlier; room, handler, service, integration, and the changed transport path pass.

## Snapshot cadence and constrained VFX iteration

- The battle loop was already simulating at 60 Hz but only serialized a state on every second tick. State broadcasts now use the existing 60 Hz simulation cadence; the client adaptive buffer has a 33 ms floor and still expands from observed jitter.
- Low-quality map walls/props are grouped into a handful of instanced batches without contact shadows; constrained combat effects collapse to single low-segment rings and projectiles use simple spheres without shadows or burst fragments. High-quality visuals remain unchanged.
- Random Kaze battle after the change: `stateHz:60`, 33 ms adaptive interpolation delay, 52 draw calls, 12 map objects, renderer p95 1.5 ms, game-loop p95 2.1 ms, reconciliation error p95 0.13 px, 0 long tasks and no console/page errors. The headless software-WebGL runner still shows compositor scheduling around 25-30 ms per frame, so visible hardware Chrome remains the final acceptance environment.
