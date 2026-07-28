# Hero Event Animations

## Task 1: Event asset contract

- [x] Test manifest entries for `attack` and `spawn`.
- [x] Test cached loading and clip extraction.
- Verify: `cd frontend && node --test test/rendering-architecture.test.js`

## Task 2: Runtime event playback

- [x] Feed separately loaded clips into the hero controller.
- [x] Trigger once per pulse and return to locomotion after completion.
- Verify: focused controller tests and production build.

## Task 3: Blender asset pipeline

- [x] Generate one-source-action `.blend` and `.glb` files.
- [x] Validate clip names and bindings.
- Verify: Blender validation command for every hero.

## Task 4: Runtime QA

- [x] Exercise attack and spawn in the GLB harness.
- [x] Check browser console and visual state.
- Verify: Playwright QA plus full frontend tests/lint/build.

## Task 5: Complete per-state asset split

- [x] Export all nine animation states for all eight heroes.
- [x] Add missing authored AimSuper, Victory, and Defeat Actions for Shadow.
- [x] Strip duplicate render geometry from animation-only GLBs.
- [x] Validate all 72 GLBs and exercise all 72 hero/state combinations in a browser.
