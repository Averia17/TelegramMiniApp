# Implementation Plan: Hero Combat Overhaul — Balance and Skill Readability

> Historical planning draft. The executable status, current values and
> evidence ledger are maintained in `tasks/combat-audit-2026-08-plan.md` and
> `tasks/combat-audit-2026-08-todo.md`; baseline numbers in this draft are not
> runtime source-of-truth.

## Overview

The existing combat-feel pass solved duplicated hit feedback. This iteration
solves the next problem: kit power is not expressed on a common scale and several
payoffs are difficult to see or punish. Work proceeds from a measurable balance
contract to two high-contrast vertical slices, then to the remaining roster and
VFX hierarchy.

## Current baseline and diagnosis

The active roster has eight heroes. Current server values show the main parity
risk: Kaze combines 16 movement speed, 220 ms attack cadence, 850 ms reload, a
three-hit 1.75x finisher, a 160-damage dash, and stealth; Katty has 42 direct
damage, 220 range, and relies on enemies remaining in small paint zones. Mandy
also has a server/frontend/catalog drift: Go uses 105 attack damage while the
catalog still says 90. The catalog validator currently reports stale fingerprints,
the Mandy drift, and a Katty attack-config mismatch.

The plan treats this drift as a correctness issue before further tuning. A number
that differs between server, fallback UI, and catalog is not balanceable.

## Architecture decisions

1. Keep `battle/model/game` authoritative. The client may show prediction and
   feedback but cannot calculate combat outcomes.
2. Add a pure combat-matrix/budget helper in Go and a matching catalog-facing
   report, instead of hiding balance logic inside individual kits.
3. Tune power by moving it between direct damage, cadence, range, control,
   sustain, mobility, and safety. Do not buff every weak-feeling hero with raw
   damage.
4. Give high-impact effects a cast telegraph and a clear active/impact effect.
   Use the existing effect pipeline and authored clips; do not add a second
   renderer or duplicate map data.
5. Make each increment independently buildable and testable.

## Role matrix to enforce

| Hero | Primary fantasy | Paid-for strength | Deliberate weakness | First pass |
|---|---|---|---|---|
| Needle | long-range controller | lane denial and split projectile | low immediate burst, punishable setup | expose split direction and root timing |
| Mandy | focus fighter | stillness payoff and lane wave | short reach unless prepared | keep focus, clarify wind-up and payoff |
| Fairy Mina | support marksman | ally sustain plus mark detonation | low solo durability, requires aim | show ally/enemy result separately |
| Brock Zeus | sharpshooter | range and predictable splash | slow reload, weak at close range | standardize impact/telegraphs |
| Kaze | assassin | mobility and combo execution | lower sustained safety after entry | reduce cadence/finisher outlier |
| Wukong Mico | tank | health, rage, close control | slow attack cycle, must enter danger | make rage-to-vortex value visible |
| Persephone Lumi | controller | anchors and root garden | melee commitment, setup dependence | show one flower/one garden clearly |
| Katty | paint controller | layered space denial and paint payoff | low range and fragile direct trade | raise floor through stack readability, not burst |

## Task list

### Phase 0: Contract and measurement

#### Task 0.1: Synchronize the balance sources

**Acceptance criteria:** Go heroes, Go attack configs, fallback frontend config,
and `docs/hero-catalog.json` agree; validator passes.

**Verification:** `python tools/validate_hero_catalog.py`; focused Go/frontend
hero contract tests.

**Files likely touched:** `battle/model/game/heroes.go`,
`battle/model/game/attack_config.go`, `frontend/src/components/BattleGame/heroesConfig.js`,
`docs/hero-catalog.json`.

#### Task 0.2: Add a combat matrix and budget report

**Acceptance criteria:** report every hero's direct full-ammo burst, sustained
cadence, range, projectile count, control/sustain/mobility flags, and outlier
ratio; tests reject malformed or missing active-hero rows.

**Verification:** `cd battle; go test ./model/game -run 'CombatMatrix|BalanceBudget'`.

**Files likely touched:** `battle/model/game/combat_balance.go`,
`battle/model/game/combat_balance_test.go`.

### Checkpoint A

- Catalog validator passes.
- Matrix output makes the power gap explicit before numbers are changed.
- Existing Go hero tests and frontend suite remain green.

### Phase 1: First vertical slices — parity and readable payoff

#### Task 1.1: Kaze versus Katty parity slice

**Acceptance criteria:** Kaze's basic cycle cannot combine the old 220 ms cadence
and 1.75x finisher; the resulting burst remains threatening but leaves a punish
window. Katty's direct floor and paint-stack payoff are competitive over a full
ammo cycle without adding invisible damage.

**Verification:** state-based Go tests for three-hit Kaze timing and Katty three-
layer payoff; update balance matrix and focused combat QA.

**Files likely touched:** `battle/model/game/heroes.go`,
`battle/model/game/new_hero_kits.go`, `battle/model/game/*balance*test.go`,
`docs/hero-catalog.json`.

#### Task 1.2: Make paint state legible

**Acceptance criteria:** visible Katty targets expose 0–2 paint stacks and the
third-stack payoff is represented by a distinct target telegraph; the player HUD
shows their own active paint setup without inventing a timer.

**Verification:** room snapshot contract test, frontend status helper tests, and
browser screenshot with a mocked/real paint event.

**Files likely touched:** `battle/model/game/protocol.go`,
`battle/model/room/room_snapshot.go`, `frontend/src/components/BattleGame/statusEffects.js`,
`frontend/src/components/BattleGame/rendering/combat/EffectRenderer.js`.

### Checkpoint B

- Kaze no longer wins by default through cadence alone.
- Katty's strength is visible before the payoff lands.
- Basic/Super/Gadget can be distinguished without reading the long description.

### Phase 2: Kit-by-kit redesign pass

#### Task 2.1: Re-audit and tune Needle, Mandy, and Fairy Mina

Keep direct projectile rules explicit. Verify root/focus/mark interactions, and
make support value visible in both solo and team mode.

#### Task 2.2: Re-audit and tune Brock Zeus and Wukong Mico

Normalize long-range splash and tank control budgets. Ensure the damage shown by a
telegraph matches the authoritative impact and that armor never hides a secondary
explosion.

#### Task 2.3: Re-audit and tune Persephone Lumi

Keep one flower anchor and one garden as the controller's readable objects. Test
that detonation consumes the expected objects exactly once.

**Verification for Phase 2:** per-hero Go tests, catalog validator, frontend
contract tests, and one browser QA script per changed visual family.

### Phase 3: VFX and HUD hierarchy

1. Standardize each ability as `cast/telegraph → active object → impact/status`.
2. Give Super a higher attention tier than Basic and Gadget, but keep screen noise
   bounded by duration and area.
3. Add target-facing state for mark, root, paint, shield, and ready follow-up.
4. Add reduced-flash/reduced-shake safe behavior if the new effects exceed the
   mobile readability budget.

### Phase 4: Playtest matrix and telemetry

Add deterministic scenarios for: close duel, long-lane trade, two-target splash,
control-zone entry, support rescue, and full basic-ammo cycle. Record time to
first meaningful hit, damage dealt, damage avoided by control, and ability value.
Only then make the final 5–10% tuning changes.

### Final checkpoint

- `cd battle; go test ./...`
- `cd frontend; npm test`
- `cd frontend; npm run build`
- `python tools/validate_hero_catalog.py`
- focused browser QA with closed task-owned browser processes
- `git diff --check`

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Existing local edits overlap source files | High | Preserve unrelated edits; inspect diff before every patch |
| Rebalancing one stat breaks a role | High | Use matrix plus scenario tests; move power between dimensions |
| Snapshot size grows from per-target state | Medium | Add compact fields and measure payload bytes |
| VFX becomes louder than the gameplay | Medium | Use impact tiers and clarity hierarchy from Riot's guidance |
| Go/frontend/catalog drift returns | High | Make validator part of every checkpoint |

## Open questions

- Should final balance target a 45–55% win-rate band per role once match data is
  available, or use a wider band for high-skill assassins/controllers?
- Should paint stacks be shown to all players or only to the affected target and
  Katty's owner?
