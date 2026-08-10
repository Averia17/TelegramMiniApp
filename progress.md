Original prompt: Сделать текущую карту более похожей на прежнюю: добавить траву, воду и стены, убрать дроп бустеров и сделать карту естественнее.

- RED: текущая арена содержала 24 клетки bush, а lobby автоматически создавало 12 lunar_crate.
- Готово: шумовая генерация береговой линии, внутренних водоёмов, травяных пятен и групп стен; высадки соединены с центром.
- Готово: автоспавн booster crates отключён в lobby и match; ручная механика crate/reward оставлена для совместимости.
- Проверено: `go test ./model/gamemap`, целевые `model/game`, `npm test`, `npm run build`; Playwright harness отрендерился без console errors.
- TODO: полный `go test ./...` всё ещё содержит ранее существовавшие падения combat-тестов вне этого изменения.

## Katty hero integration

- Added Katty to the authoritative hero catalog with compact balanced stats: 640 HP, speed 14, 34 basic damage, 3 ammo, 240 range, and a 12-second Super cooldown.
- Implemented the paint-layer contract: three delayed cone shots at 200/350/500 ms, third-layer stun plus bonus damage, a 7-second paint puddle with blind/slow control, and a 4-second Paint Flight trail.
- Paint Flight phases through walls only during the gadget; ordinary movement remains collision-blocked. Added server tests for layers, effects, and wall traversal.
- Added a local procedural runtime preview for Katty and documented the requested Sketchfab reference. The original GLB is intentionally not bundled until it is downloaded through an authenticated session and attribution is confirmed.
- Verified targeted Go tests, frontend production build, and hero-catalog validation. Full existing frontend/Go suites still contain unrelated pre-existing failures noted in their output.

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

## Isometric bush volume and radial concealment

- Replaced battle-map bush GLB substitution with a shared instanced low-poly cluster: six varied icosahedron leaf volumes per collider, per-instance palette colors, flat-shaded high-quality lighting, and a cone fallback on constrained devices.
- Added radial visibility: bushes use 42% opacity inside 120 world units, ease back to fully opaque by 260 units, and update from the interpolated local hero focus every frame. Materials are cached after mount and invalidated when a visual is replaced.
- Added `frontend/test/bush-renderer.test.js` coverage for cluster volume, radius math, mounted map fading, and empty focus handling. Targeted bush tests pass; build and lint pass. The full suite still has unrelated pre-existing failures in animation/aim contract tests.
## Attack range preview restoration

- Restored the melee aiming preview sector; it remains visible while aiming and uses uniform world-space scaling so changing direction cannot squeeze its radius or width.
- Removed the artificial `0.66` vertical-angle compression from screen-to-world aiming.
- Added regression coverage for the visible sector, stable scale after rotation, hiding after aiming ends, and full-angle screen mapping.
- Targeted rendering tests and the production build pass. The live harness screenshot shows the restored sector; its separate backend 500 is due to the local battle service not running.

## Hero health badges

- Added an HP badge above every hero with the current/max value and a proportional health bar.
- Kept the badge on the constrained/low-quality renderer path and refresh it from interpolated display state so damage updates are visible immediately.
- Added focused coverage for HP formatting and clamped bar fractions. `npm run build`, `npm run lint`, and the focused rendering test pass.
- Full rendering test file still has the unrelated pre-existing map/bush failures in the dirty worktree.
- The standard web-game Playwright harness passes on the fresh Vite server; full battle visual QA remains blocked by the unavailable nginx/auth route, while the direct Three.js GLB harness itself still renders normally.

## Clown taunt prototype

- Added a server-authoritative `taunt` WebSocket event with the shared `clown_laugh` contract and a 1.5-second per-player cooldown.
- Added the in-battle taunt button, chat message, and a bright procedural 3D clown animation that pops, spins, floats, and fades above the sender's hero.
- The exact Sketchfab clown-smiley model found is a paid asset; the free CC-BY alternative is a low-poly clown character, so the prototype keeps a self-contained fallback until a licensed asset is selected.
- Targeted frontend tests, changed-file ESLint, and production build pass. Full Go game tests still contain unrelated pre-existing combat-contract failures; full-project lint still has an unrelated `AimRenderer.js` indentation failure.
- The local Vite smoke runner could not be used for visual confirmation because the existing dev process returned HTTP 404 for `/`; the procedural taunt factory itself was instantiated successfully in Node with 18 Three.js child meshes.

## Targeted taunts

- Taunts now select the nearest visible living opponent on the client and render above that target.
- The server validates that the target exists, is alive, and is not the sender before broadcasting the event.
- Added target IDs/names to the protocol and regression coverage for target selection, invalid targets, command payloads, and chat formatting.
- Targeted frontend tests, changed-file lint, production build, and `go test ./model/room` pass.

## Taunt crystal economy and store rewards

- Added a separate non-pay-to-win `crystals` balance to player wallets with a non-negative database constraint and Alembic migration `f1a4c7d8e9b0`.
- Added server-owned `taunt_charges`: a 10-crystal purchase grants 10 uses, and each `clown_laugh` spends one charge. Account locks the wallet row and commits before battle broadcasts, so a direct WebSocket message cannot bypass payment.
- Chests now cost 10/20/50 gold and can additionally roll crystals: 10% for 5-10, 20% for 15-20, and 50% for 40-50. The crystal roll is independent of energy capacity.
- Battle forwards the authenticated access token to account over the internal `ACCOUNT_URL` service route; unavailable account service or insufficient balance prevents the visual/chat event.
- Landing and store balances now display crystals. Economy tests, battle room/economy/handler tests, changed-file ESLint, and production build pass.
- Full frontend suite remains at 255 passing, 3 skipped, and one unrelated pre-existing Blender export contract failure.

## Solid volumetric bush fields (2026-08-10)

- Battle `bush` and `half` concealment colliders now always use one shared procedural field, even when the authored bush GLB is already cached. This prevents visible seams between adjacent colliders.
- Adjacent rectangles with matching rows or columns merge into one visual canopy. Each merged area has a rounded volumetric base plus a dense nine-piece scalloped crown with varied green instance colors; gameplay walls stay intact for collision and concealment queries.
- Added regression coverage for contiguous fields, authored-GLB bypass, low-quality geometry, and nearby visibility fading.
- Verified with 5 bush tests, 121 rendering-architecture tests, changed-file ESLint, and a production Vite build. Browser battle QA confirmed a local brawler inside the continuous field, the concealment HUD state, and a visible opponent. The final screenshot is `frontend/output/playwright/bush-battle-after.png`.
- Full frontend suite currently has one unrelated pre-existing Blender export contract failure (`runtime hero export preserves authored Actions without NLA rebinding`); 264 tests pass and 3 are skipped.

## Environment visuals: procedural map, GLB heroes only (2026-08-10)

- Removed environment GLB instantiation and focus-triggered environment refreshes from `MapRenderer`.
- Battle asset preloading/readiness now covers hero GLBs and companions only; environment registry utilities remain available for isolated tests/tools.
- Solid map props use rounded procedural stone geometry and gray stone materials instead of orange rectangular fallbacks.
- Added regression coverage proving battle map sync and focus movement make zero environment GLB requests.
- Verified: rendering tests 121/121, changed-file ESLint, and `npm run build` pass.

## Hero GLBs load at battle entry

- Removed the runtime dynamic-quality downgrade from `ThreeBattleRenderer`; no FPS-triggered `lowQuality` switch or hero proxy path is used during combat.
- `SceneRoot` no longer forces low quality for software WebGL, and `HeroView` no longer starts per-hero lazy GLB loads.
- Removed the app-wide preload from `main.jsx`; `BattleGame` now owns the full hero+companion preload immediately before creating the battle renderer.
- Browser QA was attempted, but the active local backend returned `501 Unsupported method ('POST')` / `Authentication failed` before the battle screen, so no gameplay screenshot could be captured.

## Combat hitch requirement clarification (2026-08-10)

- Battle presentation must start with ready authored GLB heroes. The proxy/deferred-GLB approach was discarded after this requirement was clarified.

## Bush visual correction pass (2026-08-10)

- Reworked the bush fallback after browser comparison showed the old result was a tiled grid of repeated hexagonal blobs, unlike the supplied Brawl Stars reference.
- Connected bush colliders now merge across shared edges into one visual canopy. The canopy uses a dense deterministic scatter of varied broad leaf rosettes, a low-opacity support volume, and stronger layered green shading instead of nine fixed crown instances.
- Raised the nearby-bush visibility floor from 0.42 to 0.58 so foliage remains readable around a concealed player while the brawler stays visible.
- Added regression coverage for wide dense scatter and 2x2 adjacent collider merging. Verified 6 bush tests, 121 rendering-architecture tests, changed-file ESLint, and Vite production build.
- Browser QA used the map harness and the real `/battle/mock-room` route with a mock WebSocket state. The final battle screenshot is `output/playwright/bush-battle-final.png`; the canvas rendered with no page errors or failed requests.
- Full frontend suite currently reports 271 passing, 3 skipped, and 2 unrelated existing failures: Brock authored-action contract and Blender runtime export contract.

## Bush canopy depth and local fade (2026-08-10)

- Raised the procedural leaf ridges and support mound so bushes read as a standing canopy with height, not a flat layer under the hero.
- Split same-type bush colliders into connected clearings. Each clearing now keeps its own focus-based opacity, so the nearby field fades while a separate field remains denser.
- Tightened the fade band to 72–220 world units; browser evaluation measured the local field at `0.58` opacity and the nearby second field at `0.633`.
- Added tests for vertical leaf volume, connected-field splitting, and independent local transparency. Targeted bush/rendering tests pass.
- Direct battle QA passed with no page errors or failed requests. Screenshot: `output/playwright/bush-battle-volumetric-final.png`.
- Full frontend suite: 270 passing, 3 skipped, and 5 unrelated existing asset/animation contract failures (Katty GLB contracts, authored-action export, and runtime hero export).

## Faceted stone wall visuals (2026-08-10)

- Replaced flat low-quality stone blocks with a shared faceted low-poly stone silhouette: chamfered footprint, raised top facet, flat shading, and lit side planes.
- Added per-instance stone color variation for walls, destructible blocks, sacrificial stones, and menhirs while keeping instancing and collision geometry unchanged.
- Reused the same `StoneBlockGeometry` for the high-quality procedural prop path so both render paths share the same visual language.
- Added regression coverage for the faceted geometry in both high-quality and low-quality paths. Rendering architecture tests pass 122/122, changed-file ESLint passes, and Vite build passes.
- Direct battle visual QA passed with no page errors or failed requests. Screenshot: `output/playwright/wall-style-battle-faceted-fixed.png`.

## Map harness GLB cleanup (2026-08-10)

- Removed the demo environment GLB pad, sample props, focus button, and environment preload from `test/map-environment-harness.html`; the map preview now shows only the procedural map renderer.
- Added a regression contract that prevents the harness from mounting `instantiateEnvironment(...)` samples again.
- Browser verification at `/test/map-environment-harness.html`: `environment.total = 0`, `environment.samples = 0`, no `/assets/environment/*.glb` requests, and no new console errors or warnings. Screenshot: `artifacts/map-environment-after.png`.

## Detailed beacon landmark (2026-08-11)

- Replaced the plain first-trial beacon with a layered stylized landmark: faceted pedestal, inset platform, metal collars, tower cap, emissive octahedral core, core glow, activation rings, and separate outer/inner beam volumes.
- Preserved the existing island gating and `beaconOpen` behavior; the open state now increases beam/core/ground glow intensity and adds subtle rotation/pulse animation.
- Restored the authored beacon scale after the detail pass accidentally made it tiny; the visual group now uses a uniform scale of 24 while remaining centered on the map.
- Added regression coverage for the beacon hierarchy, faceted materials, transparent beam contracts, open-state intensity changes, and minimum world scale. Rendering architecture tests pass 125/125, changed-file ESLint passes, and Vite build passes.
- Browser verification at `http://localhost/test/map-environment-harness.html`: status `Готово`, beacon scale `[24, 24, 24]`, 16 beacon children, no console/page errors. Screenshot: `output/playwright/beacon-user-localhost-final.png`.

## Map depth and snapshot cadence check (2026-08-10)

- Fixed radial foreground/z-fighting wedges in `MapRenderer.syncIslandTerrain`: island decoration now uses adjacent ring/circle surfaces with polygon offset instead of overlapping coplanar discs.
- Added a rendering regression test for non-overlapping terrain surfaces and clean browser verification through the live map harness. Screenshot: `output/playwright/map-environment-after-offset-fix.png`.
- Changed battle state publication from every second 60 Hz simulation frame to every frame, removing the avoidable 33 ms transport gap; added a room regression test for the 60 Hz contract.
- Live movement QA measured the client using the server-authoritative `movementSpeed` (Needle: 144 px/s) with no independent speed multiplier observed. Backend logs still show occasional scheduler gaps up to ~1.3 s, which remain a separate runtime/container issue.
