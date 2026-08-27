# Combat overhaul decision log — 2026-08

Этот файл фиксирует решения Phase 0. Если решение меняется, добавляется новая
строка с причиной и метрикой; старые значения не переписываются молча.

## D-001 — authoritative source

- **Decision:** Go battle simulation остаётся единственным источником
  gameplay truth. `docs/combat-profile.json` — единственный редактируемый
  источник balance contract; Go/JS views только генерируются.
- **Reason:** сейчас balance-числа дублируются между Go, catalog и frontend,
  поэтому tuning легко расходится.
- **Metric:** profile fingerprint и generated-view check должны быть зелёными
  перед каждым balance change.
- **Status:** accepted.

## D-002 — mode contract

- **Decision:** solo deathmatch и team deathmatch используют один combat
  contract, но разные win/respawn rules. Friendly fire в team выключен;
  town hall и team respawn остаются mode-specific.
- **Reason:** общий skill language не должен означать одинаковую цель боя.
- **Metric:** каждый scenario report публикует solo и team результаты отдельно.
- **Status:** accepted.

## D-003 — Super resource

- **Decision:** Super starts at 0, charges from effective combat contribution,
  is capped at 100, does not charge from time or spawn-protected hits, and
  resets on death/respawn. Control/support contribution остаётся отдельным
  измеряемым extension point до T11, без скрытого timer fallback.
- **Reason:** Super должен быть payoff за решение в бою, а не вторым cooldown.
- **Metric:** `chargePerEngagement`, `superReadyRate`, `superConversionRate` и
  доля заряда от effective damage/control/support.
- **Status:** accepted; damage/objective/neutral/control/support paths are
  authoritative and exported as match-local contribution counters.

## D-004 — Gadget policy

- **Decision:** Gadget имеет ограниченный запас из 3 charges, charge тратится
  только при принятом cast, rejected cast charge не тратит. В team respawn
  оставшиеся charges сохраняются; временные armed/status flags сбрасываются.
- **Reason:** смерть не должна обнулять долгосрочное решение по ресурсам, но не
  должна переносить активную защиту/комбо в новую жизнь.
- **Metric:** accepted/rejected casts, charges spent, value per charge и
  `gadgetPreservedOnRespawn`.
- **Status:** accepted for Phase 1; per-hero cooldown values are now sourced
  from the generated profile and covered by the ability-budget/cadence gates.

## D-005 — HP economy

- **Decision:** Phase-1 HP pickup — только зелёный `health_boost` cube. Он
  увеличивает только `MaxLives` на 5% с cap в 5 stacks; текущие `Lives` при
  подборе не лечатся. Legacy health crates и `potion-red` не входят в новый
  profile.
- **Reason:** игроку нужен один визуально и механически понятный HP resource,
  без скрытой мгновенной хилки и конкурирующих типов лечения.
- **Metric:** pickup count, max-HP stacks, current-HP delta on pickup,
  uncontested route time и comeback rate.
- **Status:** contract accepted; runtime legacy removal, expiry/cap, ownership,
  safe-drop slices, active-budget and contest telemetry are implemented.

## D-006 — bat camps

- **Decision:** bats — ограниченный contestable neutral camp, а не бесконечная
  ферма. Camp имеет patrol, notice, wind-up, strike, leash и deterministic
  respawn; reward — максимум один зелёный cube за camp cycle.
- **Reason:** игрок должен выбирать между риском PvE и давлением на противника.
- **Metric:** camp contest rate, time-to-reward, failed contest deaths,
  leash count и cube ownership.
- **Status:** accepted; patrol, wind-up, leash/return, deterministic respawn,
  one guaranteed cube per cycle, snapshot telegraph, safe-drop validation,
  notice-state and contest metrics are implemented.

## D-007 — skill centrality gate

- **Decision:** Basic создаёт давление/setup/resource, а skill конвертирует
  преимущество через damage, control, escape, shield, mark, zone или objective
  swing. Герой не проходит slice, если basic-only сценарий выигрывается той же
  raw DPS без skill decision.
- **Reason:** основная драка должна строиться вокруг решений и readable skill
  windows, а не вокруг ожидания базовой атаки.
- **Metric:** basic-only kill rate, skill-assisted kill rate, meaningful casts,
  miss/cancel/reject causes и opponent response window.
- **Status:** accepted; per-hero thresholds are T11/T16 deliverables.

## D-008 — scope guard and rollback

- **Decision:** до завершения Kaze/Katty slices не добавляем новые кнопки,
  progression perks, modes, elite bats, team-wide HP rewards и leaderboard
  rewards за support. Каждый эксперимент получает отдельный profile revision.
- **Reason:** иначе telemetry не покажет, какая система изменила исход боя.
- **Metric:** profile revision in snapshot, report и test fixture; approved
  previous profile/build remains loadable for rollback without gameplay code
  changes.
- **Status:** accepted; the current candidate is not release-eligible until
  such a clean approved artifact exists.

## D-009 — Support basic threat ceiling

- **Decision:** Fairy Mina's full-ammo theoretical basic burst is capped at
  360 (40 damage per star, three stars, three ammo) so her sustain, shield,
  peel and mark conversion remain the primary sources of role power.
- **Reason:** The audit found a 495 full-ammo burst, higher than every other
  hero, which contradicted the support contract's low solo-burst tradeoff.
- **Metric:** `basicBurst <= 360` for Support and Super/peel/support metrics
  remain covered by the skill-centrality and role scenario packs.
- **Status:** accepted in profile revision `2026-08-27-cadence-window`.

## D-010 — Empty-ammo ranged reposition

- **Decision:** дальнобойный бот без патронов, находящийся внутри своей
  предпочитаемой дистанции, получает отрицательный radial approach и создаёт
  пространство до перезарядки; чистый strafe/orbit в этом состоянии запрещён.
- **Reason:** боковое движение без возможности выстрелить выглядит как
  бесцельное бегание рядом с игроком и не даёт боту ни урона, ни безопасной
  перезарядки.
- **Metric:** `TestBotWithNoAmmoRepositionsInsteadOfOrbitingInAttackRange`;
  движение должно иметь положительную проекцию от цели, а deterministic
  counter-role и roster bot suites должны оставаться зелёными.
- **Status:** accepted; реализовано в `botEngageTarget` для profile revision
  `2026-08-27-cadence-window`.

## D-011 — Legacy power pickup quarantine

- **Decision:** authoritative combat core и bot planner не принимают legacy
  `power` prop как gameplay resource. Если stale prop приходит из старого
  snapshot/map fixture, он деактивируется без heal, MaxHP, speed, damage
  multiplier или `PowerCores` mutation.
- **Reason:** старый prop объединял несколько источников силы и нарушал
  контракт единого зелёного HP cube, а оставшийся bot target path мог увести
  бота к несуществующей цели.
- **Metric:** legacy pickup regression tests; zero production `power` target
  selection; current health economy remains `health_boost` MaxHP-only.
- **Status:** accepted; backend guard, bot allowlist и regression tests зелёные.

## D-011 — Player-facing reload ceiling

- **Decision:** reload dead time ограничен 60% полного combat cycle для всех
  активных героев; перезарядка остаётся ресурсным решением, но не должна
  превращать бой в длительное ожидание.
- **Reason:** после удаления скрытых глобальных множителей attack cadence
  улучшился, но старые per-hero reload значения всё ещё оставляли 57–68%
  цикла без возможности стрелять.
- **Metric:** `CombatBalanceRow.ReloadDeadTimeFraction <= 0.60` для каждого
  героя; contract/profile/catalog и regression report должны совпадать.
- **Status:** accepted in profile revision `2026-08-27-cadence-window`.

## D-012 — Generated profile owns health-boost runtime policy

- **Decision:** `healthBoost` is the single authoritative contract for the
  normal fraction, team fraction, per-player stack cap, active pickup budget
  and TTL. Backend runtime variables and bot utility gates are initialized
  from the generated Go view; `Player.ApplyHealthBoost` receives the cap from
  the authoritative caller instead of embedding a second gameplay limit.
- **Reason:** the earlier implementation had matching values in the JSON
  profile, `game_types.go`, the player model and several bot branches. A
  future balance edit could therefore update the visible contract while
  leaving collection, team rewards or AI decisions on stale numbers.
- **Alternatives considered:** keep package-local constants and add only a
  consistency test; rejected because the test would detect drift after it was
  introduced but would not make the runtime consume the changed profile.
- **Metric:** generated artifact check, profile validator and runtime parity
  test must agree on `fraction`, `teamFraction`, `maxStacks`,
  `maxActivePickups`, `ttlMs` and `healsCurrentLives=false`.
- **Status:** accepted in profile revision `2026-08-27-cadence-window`; all
  local tests and validators pass after the migration.

## D-013 — Generated profile owns ability and AI defaults

- **Decision:** Super charge bounds/start charge, Gadget capacity/spawn
  charges and the shared AI health/advantage/pickup thresholds are loaded by
  the authoritative runtime from the generated combat profile. Hero creation,
  respawn, readiness checks, charge conversion and bot decisions must consume
  those values rather than duplicate package-level literals.
- **Reason:** the audit found that these values were declared in the profile
  but several runtime paths still carried matching hardcoded defaults. That
  made a profile-only tuning change incomplete and could desynchronise human
  behavior, bot behavior and replay evidence.
- **Alternatives considered:** keep literals and only compare them in tests;
  rejected because parity tests detect drift after the fact but do not make
  the runtime follow the versioned contract.
- **Metric:** generated/runtime parity test covers Super, Gadget and AI
  defaults; no gameplay path may reintroduce a second source for these shared
  thresholds. Profile revision `2026-08-27-cadence-window` remains the
  evidence key.
- **Status:** accepted; local Go/Python regression and profile validators pass
  after the migration.

## D-014 — Isolated solo/team damage parity

- **Decision:** в одинаковом изолированном 1v1 сценарии без objectives,
  props и союзников solo и team mode обязаны давать одинаковый
  `basicDamage` для каждого активного героя. Mode-specific differences
  допускаются только там, где их явно задаёт team objective/role contract.
- **Reason:** одного положительного damage signal недостаточно для fairness:
  team rules, friendly-fire gates или ordering могли незаметно менять
  базовый combat outcome даже при зелёном smoke-тесте.
- **Metric:** `TestScenarioPackRosterSoloAndTeamOutcomeMatrixIsReplayable`
  сравнивает solo/team `basicDamage` по всему roster и повторяет матрицу 20
  раз с deterministic report/state behavior.
- **Status:** accepted; parity regression проходит в profile revision
  `2026-08-27-cadence-window`.

## Нерешённые A/B-вопросы

1. T11 сравнит charge formula без diminishing return и с diminishing return на
   повторный урон по одной цели; победитель определяется `superConversionRate`
   и fairness между ролями.
2. T11 сравнит per-hero Gadget cooldown против текущего переходного значения
   6500 ms; ограничение — одинаковое `valuePerCharge`, а не одинаковый cooldown.
3. T15 выберет точные acceptance thresholds для 100/60/30% accuracy после
   первого deterministic baseline, чтобы не выдать произвольные числа за
   баланс.
