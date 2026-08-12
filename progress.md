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

## Battle map stone and foliage pass (2026-08-12)

- Kept the preview on the canonical `/api/battle/map-preview` map and switched the map harness to `MapRenderer({lowQuality: false})`, matching the battle renderer's visual path instead of maintaining a second low-quality preview.
- Solid stone collision rectangles are expanded into fixed map-tile stone blocks before rendering. Adjacent blocks remain separate, equal-sized meshes/batch instances, so they can form continuous walls without stretching one stone into a long slab.
- Stone props cast real directional shadows onto the grass; the old dark contact-shadow decal is not added to stone blocks. The procedural bush support volume now uses the foliage instance palette without multiplying a second green tint, avoiding the dark oval/fake-shadow artifact.
- Added regression coverage for fixed stone cells, adjacent wall spacing, low-quality stone batches, grass shadow reception, foliage shadow flags, and the battle-path harness contract.
- Verified with the live harness: 2400x2400 canonical map, seed `20260810`, 1942 collision walls, 8 spawners, no console/page errors. Screenshot: `frontend/output/playwright/map-battle-path-final/shot-0.png`.
- Verification: targeted map/bush/rendering tests 143/143, changed-file ESLint, and `npm run build` pass. Full frontend suite is 284 passing, 3 skipped, and 1 unrelated pre-existing Blender hero export contract failure (`runtime hero export preserves authored Actions without NLA rebinding`).

## Fixed beacon platform rotation (2026-08-12)

- Stopped rotating the complete beacon group, keeping the pedestal, tower, and platform facing fixed.
- Preserved the independent rotation and pulse animation of the glowing core at the top.
- Added a regression assertion that the beacon group rotation remains unchanged while the core rotation advances.
- Verified the focused test, changed-file ESLint, and production build. Browser QA measured platform rotation staying at `0` while the core advanced, with no console/page errors. Screenshot: `frontend/output/playwright/beacon-fixed-platform.png`.

## Natural map visual pass (2026-08-12)

- Kept decorative map colliders at their authored cell size; only water remains merged. Adjacent crates no longer become one stretched brown slab.
- Replaced generic decorative boxes with layered procedural visuals for crates, fences, barrels, trees, dead trees, shipwrecks, cacti, crystals, and the altar. Faceted stone props now use their authored vertex-color facets with a muted PBR material.
- Added a subtle repeated grass texture to the ground and island terrain, soft radial contact shadows for every solid prop, and a low-opacity undergrowth bed beneath bush tiles so objects visually sit in the terrain instead of floating over a flat green plane.
- Added regression coverage for fixed-size decorative props, textured grass, and soft stone grounding. Focused rendering/map tests pass 133/133, changed-file ESLint passes, and Vite production build passes.
- Browser verification: canonical map `2400x2400`, seed `20260810`, 1942 walls, 258 bushes, 332 render objects, no console/page errors. Screenshot: `frontend/output/playwright/map-natural-pass-3/shot-0.png`.

## Single frontend rendering path (2026-08-12)

- Removed the `lowQuality` concept and all alternate visual branches from the battle scene, map, bushes, heroes, monsters, projectiles, and combat effects. The renderer now always uses the same antialiased high-precision scene, PBR lighting, fog, and shadows.
- Removed software-WebGL quality selection, runtime quality switching, lightweight instanced prop batches, and their obsolete tests. Map props and fixed-size stone cells now use the same `MapRenderer` path in battle and in the map harness.
- Updated the harness contract and regression coverage for one shared visual path. Targeted rendering tests pass 136/136; the full frontend suite passes 277 with 3 skipped; Vite production build passes.
- Browser verification at `http://localhost/test/map-environment-harness.html`: canonical 2400x2400 map, seed `20260810`, 1942 walls, 258 bushes, 321 render objects, no console/page errors. Screenshot: `frontend/output/playwright/map-single-path/shot-0.png`.

## Water collision preservation (2026-08-12)

- Root cause: compact battle snapshots omit `map.walls`; if that snapshot reached `NetworkSimulation` without the existing `GameClient` preservation guard, the local collision index became empty and water was predicted as walkable.
- `NetworkSimulation.ingest` now preserves the last full wall list for compact snapshots with matching map dimensions while still accepting non-empty authoritative wall updates.
- Added regression coverage proving a player stops at a water boundary after a full map is followed by a compact snapshot.
- Verified: network simulation tests 30/30, geometry/map Go tests pass, changed-file ESLint passes, Vite production build passes, and the browser map harness shows blue water on the canonical 2400x2400 map (seed `20260810`) with no console/page errors.
- Full frontend suite is 273 passing, 1 failing, 4 skipped due the pre-existing dirty-worktree crate footprint assertion in `frontend/test/rendering-architecture.test.js`.

## Local bush transparency radius (2026-08-12)

- Narrowed the hero concealment fade to a local tile neighborhood: the hero tile stays at `0.58`, the adjacent tile fades only slightly, and distant tiles return to full opacity by `96` map units.
- Kept the canopy square-tiled and removed the circular support silhouette by using a plane under each tile and a box for the support volume; foliage alpha uses a cubic response so the hero reads as inside the grass instead of simply underneath it.
- Added regression coverage for the local tile fade, square support geometry, and cubic alpha response. The canonical battle harness was verified with `ThreeBattleRenderer`: hero at `800, 440` inside bush, map ready, 332 render objects, and no page/console errors.
- Verification: full frontend suite `278` passed, `4` skipped; `npm run build` passed. Screenshot: `frontend/output/playwright/battle-harness-grass-small-radius-inside.png`.

## Solid moon mist collision pass (2026-08-12)

- Reproduced a pass-through case for the authored `moon_mist` objects: both client prediction and server geometry explicitly classified this visible object as non-blocking.
- Kept ordinary `bush` and legacy `half` foliage walkable, but made `moon_mist` solid in both `NetworkSimulation` and server `IsBlockingWall`, so the two sides stay consistent.
- Updated the old client test that encoded movement through moon mist and added client/server regressions proving moon mist stops the player while ordinary grass remains walkable.
- Verified: frontend collision + map harness tests 33/33, server geometry/map tests pass, changed-file ESLint passes, and Vite production build passes.
- Full frontend suite is 278 passing, 1 failing, 4 skipped due the pre-existing dirty-worktree `bush support volume reads as grass instead of a dark fake shadow` assertion in `frontend/test/rendering-architecture.test.js`.
- Direct browser render of the canonical map (2400x2400, seed `20260810`, 1942 walls, 258 bushes, 332 objects) is clean with no page/console errors. The required virtual-time Playwright shim still reports an unrelated `TypeError: Cannot read properties of undefined (reading '0')`; the same page renders cleanly under normal browser timing.
- `npm run lint` still reports two pre-existing indentation errors in `frontend/src/components/BattleGame/rendering/combat/AimRenderer.js` (lines 44–45); this change introduces no new lint errors.
## Mossy root-cluster obstacle pass (2026-08-12)

- Replaced the old flat brown `shipwreck` boxes/planks with a single procedural natural visual: low-poly fallen roots, faceted cut ends, a mossy root bed, and several moss clumps.
- Kept the canonical map data, authored one-cell footprint, fixed-size adjacent placement, and blocking collision semantics unchanged; neighboring cells can still read as one continuous barrier.
- Added deterministic visual variation per authored cell so repeated root clusters do not form a copied stamp while retaining the same volume and shadow treatment.
- Added regression coverage for `root-log`, `root-end`, and `moss-clump` roles, removed `shipwreck-plank` expectations, and verified stone-wall tests remain green.
- Browser verification at `http://localhost/test/map-environment-harness.html`: canonical `2400x2400` map, seed `20260810`, `1942` walls, `332` render objects, no console/page errors under normal timing. Screenshot: `frontend/output/playwright/natural-root-cluster-olive/page.png`.
- Focused rendering/map harness tests and Vite build pass. The required virtual-time Playwright client still hits the existing unrelated `TypeError: Cannot read properties of undefined (reading '0')`; normal browser timing renders cleanly.

## Taller tree silhouettes (2026-08-12)

- Raised both live `tree` and dry `dead_tree` visuals to authored height `3.0`, above the `2.15` stone-wall height; collision footprints and blocking behavior are unchanged.
- Added a regression test comparing both tree bounding boxes against the shared faceted wall silhouette.
- Verification: focused tree/root tests `2/2`, map harness tests `2/2`, changed-file ESLint, and Vite build pass. Normal browser timing is clean; screenshot: `frontend/output/playwright/taller-trees-normal/page.png`.
- The required virtual-time Playwright shim still reports the known unrelated `TypeError: Cannot read properties of undefined (reading '0')`; it still exposes the correct canonical map state.

## Layered bush occlusion pass (2026-08-12)

- Split the procedural bush into a dense rear canopy and a sparse camera-facing foreground fringe. The rear canopy renders before heroes; the foreground uses five edge blades per fixed 40×40 tile and renders after heroes, so only the lower silhouette is softly occluded.
- Reduced alpha overdraw from a cubic response to a `1.65` exponent for the main field; the foreground keeps a softer `1.25` response. This keeps the hero tile readable without making two surrounding rows look like a large transparent clearing.
- Tightened the fade band from 24–96 to 24–72 map units: the hero tile is at `0.58`, the immediate neighbor is slightly lighter, and the next tile is fully dense.
- Added regression coverage for foreground layer structure, render order, shader profiles, and the tightened tile radius. Browser verification uses the canonical `ThreeBattleRenderer` harness with hero at `800, 440`, 332 objects, and no page/console errors. Screenshot: `frontend/output/playwright/battle-harness-grass-tight-radius.png`.
- Added deterministic depth/position jitter to the five foreground blades per tile so the camera-facing fringe reads as a broken natural edge instead of a horizontal strip.
- Verification: full frontend suite `284` passed, `4` skipped; `npm run build` passed. Final screenshot: `output/playwright/battle-harness-grass-final.png`.

## Per-cluster bush fade and foreground depth fix (2026-08-12)

- Kept the authored 40x40 tile grid for field construction, but moved crown and foreground visibility to individual leaf-cluster positions. The local pocket now fades within 8-26 map units instead of making a whole tile translucent.
- Corrected the camera-facing fringe depth: the isometric battle camera is on the +Z side, so foreground leaves are placed beyond the tile's near edge and can occlude the hero's lower silhouette.
- Added regressions for short local cluster fade, instance visibility coordinates, and foreground depth ordering. Canonical harness verified at 820, 460 inside a bush with no page/console errors; screenshot: `output/playwright/battle-harness-grass-foreground-center.png`.
- Verification: full frontend suite `286` passed, `4` skipped; `npm run build` passed.

## Frontend/backend collision synchronization (2026-08-12)

- Found the movement desync: the backend sweeps long movement in small steps, while the frontend resolved a whole movement delta in one pass. If that delta landed inside a wall, the frontend could choose the far-side exit and visually pass through an obstacle that the server rejected.
- Made frontend prediction use the same swept-step collision algorithm as the backend. The map harness `WASD` controls now call this shared battle resolver instead of directly teleporting the hero by one tile.
- Added an authoritative `blocking` flag to every serialized map wall. The frontend collision index consumes this server flag, with a legacy type fallback for older snapshots; map coordinates and collision rectangles remain the same `minX/minY/maxX/maxY` values used for rendering.
- Fixed invisible collision gaps in procedural `dead_tree` and `altar_three_moons` visuals by adding/enlarging their ground footprints to cover the authored collision tile. Added regression coverage for all canonical blocking prop types.
- Verification: frontend network + map harness tests `35/35`, focused prop footprint tests `6/6`, server handler/room/geometry tests pass, changed-file ESLint passes, and Vite build passes.
- Browser QA: normal timing has no page/console errors; the collision probe stopped at `x=1306` before the `destructible` wall at `minX=1320` with radius `14`. Screenshot: `frontend/output/playwright/collision-sync-normal/blocked-movement.png`.
- The required virtual-time Playwright client still reports the known unrelated `TypeError: Cannot read properties of undefined (reading '0')`; it nevertheless exposes the correct canonical map state (`2400x2400`, seed `20260810`, 1942 walls, 332 objects).

## Natural obstacle and bridge pass (2026-08-12)

- Replaced the remaining orange/brown `crates` visuals with fixed-cell low-poly log piles: three stacked logs, cut ends, moss clumps, and a mossy bed. The backend type and blocking rectangle remain unchanged.
- Added a low-profile grounding bed beneath solid map props so stone, wood, trees, and landmarks transition into the grass instead of appearing pasted onto it.
- Replaced the two flat brown central approach slabs with paired faceted stone stepping bridges and small moss patches, matching the existing wall language while keeping their route and placement.
- Added regression coverage for log-pile roles, grounding beds, and the two stone bridge groups. Focused rendering tests, changed-file ESLint, and normal browser harness QA pass; screenshot: `frontend/output/playwright/bridge-normal/page.png`.

## Map audit and natural surface pass (2026-08-12)

- Audited the canonical `/api/battle/map-preview`: seed `20260810`, `2400×2400`, tile `40`, `1942` walls, and `8` spawners. The main water contour is connected and remains authoritative blocking terrain.
- Added one deterministic meadow layer to the shared ground texture: `44` low-contrast irregular patches plus the existing `520` grass blades. This removes the flat green-sheet look without creating a second quality variant or changing collision/layout.
- Added subtle deterministic stone color variation while preserving the shared faceted geometry, fixed cell footprint, and contiguous wall behavior. Trees, logs, roots, bridges, and grounding beds remain on the same authored cells.
- Rechecked map topology: `0` blocking-flag mismatches, `0` water flags missing, and `0` non-water spawner overlaps.
- Updated the stale wall rendering assertion to cover the grounding-bed layer explicitly. Full frontend suite: `293` passed, `4` skipped; backend map/handler tests pass; build, changed-file ESLint, and `git diff --check` pass.
- Normal browser QA is clean with no console/page errors. Screenshot: `output/playwright/map-environment/desktop.png`. The required virtual-time client still reports the known external shim error `Cannot read properties of undefined (reading '0')`, while exposing the correct canonical map state.

## Brawl-like combat audit and confirmed-hit feedback (2026-08-12)

- Compared the current battle loop with the official Brawl Stars principles: limited ammo/reload, readable hit confirmation, distinct Super/Gadget cooldowns, cover/destructible terrain, and mode-driven objectives. References are recorded in `tasks/combat-brawl-stars-plan.md`.
- Baseline found that our authoritative `combatEvents`, prediction/reconciliation, ammo, Super/Gadget, status effects, map cover and hero kits already exist, but ordinary confirmed hits had no shared damage number, contact burst or camera punch.
- Added an idempotent `combatEvents` presentation layer. It resolves the target from the authoritative player/monster snapshot, retries when a compact snapshot temporarily omits the target, shows a readable damage number plus low-poly impact burst, and adds a bounded camera punch without changing server damage/hitboxes/cooldowns.
- Added targeted frontend tests for repeated snapshots, missing target retry, feedback lifecycle, authoritative target position and camera shake. Full frontend suite: `297` passed, `4` skipped. Vite build, changed-file ESLint and `git diff --check` pass.
- Real browser combat smoke received confirmed backend hits (`39` and `65` damage), rendered the feedback on screen, and finished with no console/page errors. Screenshot: `output/playwright/combat-feedback/combat-feedback-925476571.png`.
- Backend `go test ./model/game ./model/gamemap ./handler` remains red in pre-existing dirty-worktree legacy hero/game tests (Shelly/Colt/Barley/Titan/Spark assumptions); this combat presentation change did not modify backend files or combat resolution.
