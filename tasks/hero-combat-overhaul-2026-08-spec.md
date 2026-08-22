# Spec: Hero Combat Overhaul — Balance, Counterplay, Readability

## Objective

Make the eight active heroes feel like deliberate choices rather than a power
ladder. Every hero keeps a distinct role, but each kit must expose a strength,
a weakness, a visible win condition, and an opponent response. The authoritative
Go simulation remains the source of combat truth; React/Three.js presents the
same contracts without inventing damage or status.

Success means that a player can answer these questions during a fight without
opening a wiki: What does this hero want? What is the dangerous window? What can
I dodge, interrupt, outrange, or punish? Why did that hit deal that damage?

## Assumptions

1. The current eight-hero roster and Basic/Super/Gadget slots remain.
2. Solo and team battle rules stay compatible; balance values are shared unless
   a mode-specific rule already exists.
3. Three basic-ammo charges and three gadget charges remain for this iteration.
4. Existing GLB clips are reused; new authored animation is optional and not a
   prerequisite for the first balance slice.
5. We will tune from repeatable combat scenarios, not from a single subjective
   duel or copied values from another game.

## Design references

- [Brawl Stars Gadgets](https://support.supercell.com/brawl-stars/en/articles/gadgets-4.html):
  tactical abilities have limited charges and strength-shaped cooldowns.
- [Brawl Stars Star Powers](https://ingame.support.supercell.com/brawl-stars/en/articles/star-powers-3.html):
  optional passives can change a playstyle without adding another active button.
- [Brawl Stars June 2026 release notes](https://supercell.com/en/games/brawlstars/blog/release-notes/release-notes-june-2026/):
  live balance work repeatedly trades damage, health, reload, charge rate, area,
  and cooldown to move power between a hero's strengths and counterplay windows.
- [Riot: Clarity in League](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/):
  VFX hierarchy should match gameplay impact, hitboxes should match effects, and
  visual/audio noise should not bury the important event.
- [Riot: Champion Counterplay](https://www.leagueoflegends.com/en-us/news/dev/quick-gameplay-thoughts-may-14/):
  high-impact effects deserve a response window; strengths should be paired with
  weaknesses rather than becoming hard counters with no agency.

## Tech stack and commands

- Go battle simulation in `battle/`.
- React 18 + Vite + Three.js client in `frontend/`.
- Node built-in test runner: `cd frontend; npm test`.
- Go tests: `cd battle; go test ./model/game ./model/room ./handler`.
- Catalog validation: `python tools/validate_hero_catalog.py`.
- Frontend build: `cd frontend; npm run build`.
- Browser QA: `node tools/qa/<focused-script>.cjs` through
  `tools/qa/playwright-runner.cjs`.

## Project structure

- `battle/model/game/`: hero stats, ability kits, damage and status resolution.
- `battle/model/room/room_snapshot.go`: authoritative player snapshot fields.
- `frontend/src/components/BattleGame/heroesConfig.js`: fallback combat config
  and ability presentation contract.
- `frontend/src/components/BattleGame/statusEffects.js`: compact readable state
  markers for local and visible players.
- `frontend/src/components/BattleGame/rendering/`: world-space aim, telegraph,
  impact, and hero feedback.
- `docs/hero-catalog.json`: synchronized catalog and fingerprint contract.
- `tasks/hero-combat-overhaul-2026-08-plan.md`: implementation plan.

## Code style

Keep balance math as small pure functions where possible and keep resolution
authoritative:

```go
func basicBurstBudget(hero Hero) int {
    hits := max(1, hero.Attack.ProjectileCount)
    return hero.AttackDamage * hits * hero.MaxAmmo
}
```

The actual server kit remains explicit and state-based. Frontend helpers should
normalize malformed snapshot values, use event-driven updates, and never infer a
new hit or status effect from presentation-only data.

## Testing strategy

- Unit tests for balance budgets, cooldowns, charges, stack payoff, and explicit
  counterplay state.
- Go state tests for each changed kit: damage, target set, timing, and status.
- Frontend contract tests for labels, stacks, readiness, and visual semantics.
- Browser QA for at least one ranged, one melee, and one ground-zone hero at
  desktop and mobile viewports; assert no console/page errors.
- Catalog validator and `git diff --check` are release gates.

## Boundaries

- Always: keep Go authoritative, preserve canonical hero names, add a regression
  test for every behavior change, and synchronize catalog/fingerprints.
- Ask first: new dependencies, new persistent data, new game mode, or replacing
  the GLB animation set.
- Never: hide damage in an undocumented multiplier, add client-only combat power,
  copy another game's numbers verbatim, or remove failing tests to make balance
  appear green.

## Success criteria

- No active hero has an undocumented global damage multiplier or hidden AoE.
- A full basic-ammo trade does not delete the lowest-health hero before a response
  window unless the attacker has landed a clearly telegraphed payoff.
- Every Super/Gadget has a visible cast/active/impact state and a readable HUD
  explanation of its trigger and counterplay.
- The combat matrix can be regenerated from server values and highlights outliers
  instead of relying on memory.
- Catalog validation, focused Go tests, full frontend tests, build, and focused
  browser QA are green.

## Open questions

- After telemetry exists, should Super charge be based on damage dealt, a fixed
  cooldown, or a hybrid per role?
- Should support healing count as a separate score category in battle results?
- Do we want a player-facing practice room for deterministic balance scenarios?
