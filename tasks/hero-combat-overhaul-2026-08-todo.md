# Todo: Hero Combat Overhaul — Balance and Readability

> Архивный checklist раннего среза. Канонический исполняемый статус и
> acceptance gates находятся в `tasks/combat-audit-2026-08-todo.md`; значения
> берутся из `docs/combat-profile.json`. Не трактовать незакрытые пункты ниже
> как отдельные незавершённые задачи: их покрытие перенесено в T11–T17,
> automated gate и внешние human/release gates.

## Phase 0 — contract and measurement

- [x] Synchronize Go, frontend fallback, and hero catalog balance values.
- [x] Add pure combat matrix and budget report.
- [x] Add regression tests for missing rows and outlier ratios.

## Checkpoint A

- [x] Catalog validator passes.
- [x] Focused Go and frontend hero contract tests pass.

## Phase 1 — first vertical slices

- [x] Rebalance Kaze's cadence/finisher tradeoff.
- [x] Raise Katty's floor through readable paint payoff rather than hidden burst.
- [x] Expose Katty paint stacks in authoritative snapshots.
- [x] Render a distinct third-stack telegraph and status marker.

## Checkpoint B

- [ ] Kaze leaves a punish window after entry.
- [ ] Katty's setup and payoff are visible in a real browser frame.

## Phase 2 — remaining kits

- [x] Add world-space payoff markers for Mandy Focus and Fairy Mina marks.
- [x] Add world-space Wukong rage tiers before the Vortex payoff.
- [x] Add a world-space Brock beam-ready marker before the piercing shot.
- [x] Track Persephone Lumi flowers authoritatively and clear them on burst.
- [x] Publish Needle root as a distinct readable bind state.
- [x] Prevent Mandy Focus and Gadget bonuses from multiplying past a 2.0x basic-hit budget.
- [ ] Needle/Mandy/Fairy Mina balance and counterplay pass.
- [ ] Brock Zeus/Wukong Mico balance and counterplay pass.
- [ ] Persephone Lumi ground-control pass.

## Phase 3 — VFX/HUD hierarchy

- [x] Publish an authoritative `cast → telegraph → active → impact` phase on combat effects.
- [x] Render Lumi's active garden and seedburst payoff as separate visual families.
- [ ] Standardize cast → active → impact/status for all 24 abilities.
- [ ] Add role-appropriate status/target affordances.
- [ ] Verify mobile readability and reduced-motion/reduced-flash behavior.

## Phase 4 — scenarios and telemetry

- [ ] Add deterministic close, long-range, splash, control, support, and ammo-cycle scenarios.
- [ ] Record balance matrix deltas after playtest.
- [ ] Make final tuning pass only after scenario evidence.

## Final verification

- [ ] `cd battle; go test ./...`
- [ ] `cd frontend; npm test`
- [ ] `cd frontend; npm run build`
- [ ] `python tools/validate_hero_catalog.py`
- [x] focused browser QA and process cleanup
- [x] `git diff --check`
