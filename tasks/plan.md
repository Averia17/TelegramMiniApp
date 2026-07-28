# Implementation Plan: Hero Event Animations

## Overview

Separate authored one-shot hero animations into per-event Blender/GLB assets and
make the battle renderer trigger them from game event pulses.

## Architecture Decisions

- Keep one `AnimationMixer` per instantiated hero.
- Load event GLBs as clip libraries; discard their duplicate scenes after extracting clips.
- Use canonical event names and per-hero URLs from the asset manifest.
- Remove procedural attack/spawn posing when an authored event clip is available.
- Generate per-event files deterministically from each hero's source `.blend`.

## Task List

### Phase 1: Contract

- [x] Add failing tests for per-event asset URLs and pulse-driven playback.
- [x] Extend the manifest and registry with cached event clip loading.

### Phase 2: Mandy vertical slice

- [x] Add Blender splitting/export tooling.
- [x] Produce Mandy `attack` and `spawn` `.blend`/`.glb` assets.
- [x] Play Mandy events through the existing hero mixer and return to locomotion.

### Checkpoint: Mandy

- [x] Focused tests pass.
- [x] Mandy event GLBs validate.
- [x] Frontend production build succeeds.

### Phase 3: All heroes

- [x] Generate event assets for all available heroes.
- [x] Validate expected clip count/name and compatible track bindings.
- [x] Update harness coverage for attack and spawn.

### Checkpoint: Complete

- [x] Full frontend tests pass; lint remains blocked by pre-existing unrelated violations.
- [x] Production build succeeds.
- [x] Browser harness renders event animations without console errors.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Bone names differ | High | Validate every event track against the base scene |
| Duplicate event scene costs memory | Medium | Cache clips, dispose the event scene immediately |
| Existing working-tree edits overlap | High | Make narrow patches and never restore user files |
| Blender version changes action API | Medium | Support both legacy f-curves and layered actions |

## Open Questions

None. The user approved separate `.blend` and `.glb` files per event.
