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
- **Status:** accepted; damage/objective/neutral path implemented, control/support
  instrumentation pending T11.

## D-004 — Gadget policy

- **Decision:** Gadget имеет ограниченный запас из 3 charges, charge тратится
  только при принятом cast, rejected cast charge не тратит. В team respawn
  оставшиеся charges сохраняются; временные armed/status flags сбрасываются.
- **Reason:** смерть не должна обнулять долгосрочное решение по ресурсам, но не
  должна переносить активную защиту/комбо в новую жизнь.
- **Metric:** accepted/rejected casts, charges spent, value per charge и
  `gadgetPreservedOnRespawn`.
- **Status:** accepted for Phase 1; per-hero cooldown tuning pending T11.

## D-005 — HP economy

- **Decision:** Phase-1 HP pickup — только зелёный `health_boost` cube. Он
  увеличивает только `MaxLives` на 5% с cap в 5 stacks; текущие `Lives` при
  подборе не лечатся. Legacy health crates и `potion-red` не входят в новый
  profile.
- **Reason:** игроку нужен один визуально и механически понятный HP resource,
  без скрытой мгновенной хилки и конкурирующих типов лечения.
- **Metric:** pickup count, max-HP stacks, current-HP delta on pickup,
  uncontested route time и comeback rate.
- **Status:** contract accepted; runtime legacy removal, expiry/cap, ownership
  and safe-drop slices are implemented. Active-budget and contest telemetry
  remain T6 follow-up.

## D-006 — bat camps

- **Decision:** bats — ограниченный contestable neutral camp, а не бесконечная
  ферма. Camp имеет patrol, notice, wind-up, strike, leash и deterministic
  respawn; reward — максимум один зелёный cube за camp cycle.
- **Reason:** игрок должен выбирать между риском PvE и давлением на противника.
- **Metric:** camp contest rate, time-to-reward, failed contest deaths,
  leash count и cube ownership.
- **Status:** accepted; first runtime slice implemented (patrol, wind-up,
  leash/return, deterministic respawn and one guaranteed cube per cycle);
  snapshot telegraph and safe-drop validation are implemented; notice-state
  and contest metrics remain T6 follow-up.

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
- **Metric:** profile revision in snapshot, report и test fixture; old profile
  remains loadable for rollback.
- **Status:** accepted.

## Нерешённые A/B-вопросы

1. T11 сравнит charge formula без diminishing return и с diminishing return на
   повторный урон по одной цели; победитель определяется `superConversionRate`
   и fairness между ролями.
2. T11 сравнит per-hero Gadget cooldown против текущего переходного значения
   6500 ms; ограничение — одинаковое `valuePerCharge`, а не одинаковый cooldown.
3. T15 выберет точные acceptance thresholds для 100/60/30% accuracy после
   первого deterministic baseline, чтобы не выдать произвольные числа за
   баланс.
