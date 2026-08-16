# Implementation Plan: Health Boost Crates

## Overview

Add a Brawl-Stars-inspired green health boost that grants 5% of a hero's
original max health, can drop from monsters, and is guaranteed to drop from a
new destructible 500-HP health crate.

## Architecture Decisions

- Keep the existing lunar crate and lunar rewards unchanged; use separate
  `health_crate` and `health_boost` prop types.
- Apply the bonus authoritatively on the backend by increasing both `MaxLives`
  and current `Lives` by 5% of the hero's stored base max health.
- Reuse the existing props protocol and renderer, adding a crate health bar and
  a distinct green boost visual rather than adding a new network channel.
- Use a 20% monster drop chance and six guaranteed health crates per match as
  initial balance defaults.

## Task List

### Phase 1: Backend contract and state

- [x] Add base-health tracking and the stacked 5% health boost operation.
- [x] Add health crate/boost prop types, 500 HP crate damage, guaranteed crate
  drop, and 20% monster drop chance.
- [x] Make projectiles and melee attacks damage health crates.

### Phase 2: Frontend visuals

- [x] Render the destructible crate with Brawl-Stars-inspired wood, metal cap,
  HP bar, and damage state.
- [x] Render the dropped boost as a floating green plus with glow and motes.
- [x] Verify collection and max-health changes through the authoritative state.

### Checkpoint: Complete

- [x] Backend focused tests pass.
- [x] Frontend tests and build pass.
- [x] Browser QA shows the crate, health bar, dropped green boost, and no
  console/page errors.

## Open Questions

- Drop chance and crate count are intentionally exposed as constants so balance
  can be tuned after the first playtest.
