# Battle architecture refactor plan

## Objective

Prepare the current solo battle for a future team mode and separate map while
preserving authoritative combat, current hero behavior, WebSocket compatibility,
and client prediction safety.

## Completed increment

- Added `GameConfig`/`NewGameState` composition entry point.
- Added injectable `MapProvider` and `HeroCatalog` seams.
- Encapsulated mode decisions behind `MatchRules` implementations.
- Added a frontend `BattleContext` mode boundary for prediction.
- Centralized compact map/wall preservation and collision semantics in the
  frontend map contract.
- Added an injectable `CombatRegistry` for hero kit dispatch.

## Next increments

1. Extract room connection registration/broadcast lifecycle from the scheduler.
2. Add team-aware result/view helpers on the frontend without changing solo UX. (completed)

## Verification

- Focused Go architecture tests pass.
- Focused frontend mode/prediction tests pass.
- Full-suite failures remain explicitly reported as pre-existing baseline failures
  until their own tasks are approved.
