# Implementation Plan: Witcher-inspired team battle map

## Overview

Rework the canonical 3v3 team arena into a dark, war-worn northern medieval settlement inspired by the mood of Velen and Novigrad: timber-framed houses, thatched roofs, a forge/inn/market rhythm, mossy stone, old bridges, muddy paths, and restrained warm fire accents. The map remains an original in-game composition and keeps the authoritative Go collision model shared by live battle and the Three.js preview.

## Architecture decisions

- Keep `GenerateTeamBattle` as the single source of team geometry and preserve diagonal symmetry, three bridges, six objectives, spawn pockets, and collision fairness.
- Keep the existing procedural environment renderer for this iteration. It is already the runtime contract for map props and avoids loading a large third-party environment bundle into the Telegram WebView.
- Introduce small renderer-native archetype variations for the village landmarks rather than recoloring one generic house.
- Use Quaternius Medieval Village Pack/MegaKit only as a CC0 reference/source candidate for a later GLB import; do not copy Witcher game files or screenshots into the product.

## Task list

### Phase 1: Art direction and renderer slice

- [x] Replace the bright generic city palette with a desaturated bog-green / soot-gray / aged-timber palette.
- [x] Add readable landmark silhouettes: market stalls, forge embers, gatehouse, tower, ruined cottages, and roadside shrines.
- [x] Give the team map a dedicated dusk fog/lighting treatment while leaving solo map visuals intact.

### Phase 2: Team map composition

- [x] Recompose the authored city districts around the river crossings and diagonal combat lane.
- [x] Preserve mirrored features, open door cells, base courtyard access, bridge-only river crossing, and tight city object colliders.
- [x] Add a small number of passable ambient landmarks (lanterns, signboards, mud paths) without changing authoritative collision.
- [x] Finish the vegetation pass with a muted moss palette that follows team atmosphere and rebuilds correctly on mode changes.

### Checkpoint: Map contract

- [x] Backend map tests pass, including symmetry, spawns, bridges, city colliders, and pathability.
- [x] Existing frontend rendering contracts remain green.

### Phase 3: Browser verification

- [x] Run the canonical map harness in team mode and inspect desktop + mobile screenshots.
- [x] Run the team battle browser QA smoke and confirm no console/page errors.
- [x] Run frontend build/lint and `git diff --check`.

## Acceptance criteria

- The team map visibly reads as a dark northern medieval settlement rather than a generic bright abandoned-city arena.
- Existing buildings have distinct silhouettes and grounded collision footprints.
- Both teams retain equivalent routes and cover; no spawn, bridge, objective, or city doorway is blocked by the visual rework.
- The change stays compatible with the Telegram WebView performance budget and the current map preview harness.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Visual city pieces obscure a playable lane | High | Keep colliders in Go, use tight feature footprints, and run existing pathability tests. |
| Dark palette reduces gameplay readability | Medium | Keep local/team accents and warm fire/lantern highlights; verify at full-frame and mobile sizes. |
| Third-party environment GLBs increase download cost | Medium | Defer GLB import; use renderer-native geometry until asset budget and pipeline are explicit. |
