# Battle architecture

## Current refactor boundary

The battle simulation remains authoritative and behavior-compatible with the
existing solo mode. Extension points are explicit and additive:

- `GameConfig` and `NewGameState` compose a match from dependencies.
- `MapProvider` owns map loading and collision source construction.
- `HeroCatalog` owns hero lookup and random selection.
- `MatchRules` owns mode-specific team assignment, win conditions, and timeout
  scoring. The simulation loop does not switch on a concrete mode.
- `MatchRulesRegistry` is the additive mode factory. A new mode registers its
  policy factory during bootstrap instead of modifying `NewMatchRules`.
- `MapProviderRegistry` is the additive map factory. Room profiles validate
  names against registered providers, while `MapProvider` injection still
  supports isolated fixtures and custom room dependencies.
- `CombatRegistry` owns hero-to-kit registration for basic attacks and supers;
  dispatchers no longer duplicate the hero switch.
- `MatchProfile` centralizes mode, map, and player-limit selection. Matchmaking
  only reuses rooms with a compatible profile; legacy clients default to
  `deathmatch / battle-royale / 8`.
- `Room.stepSimulation` isolates authoritative state advancement and snapshot
  preparation from the transport loop. This is the seam for future room
  runtimes without duplicating combat logic.
- `transport_lifecycle.go` owns connection replacement, reconnect grace state,
  stale unregister protection, and slow-client broadcast eviction.
- `teamBattleUi.js` normalizes team HUD and result semantics. It is opt-in for
  team mode, so solo result placement and stats remain unchanged.
- `room_joined` now exposes `mapId` and `mapRevision` alongside mode/map
  selection, giving the client an explicit room contract before the first
  state snapshot arrives.
- `battleMode.js` is the frontend mode boundary used by prediction and carries
  the authoritative map identity/revision in `BattleContext`.

Go does not use class inheritance. The equivalent extension mechanism here is
interface-based composition: a new mode implements `MatchRules`, a new map is
served by a `MapProvider`, and a balance/version set is supplied as a
`HeroCatalog`.

## Compatibility rules

- `InitGameState`, `GetHeroByName`, and `RandomHero` remain available for old
  callers and tests.
- Existing WebSocket snapshot fields remain unchanged in this increment.
- Solo mode defaults are unchanged; team awareness is enabled only by the
  authoritative team mode.
- Existing uncommitted work in the repository is treated as baseline and is
  not reverted by this refactor.

## Next seams

The next increment should extract connection registration/broadcast lifecycle
from the scheduler. This keeps a future team queue from changing the
authoritative simulation loop or WebSocket pump.
