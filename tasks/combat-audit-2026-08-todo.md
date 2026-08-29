# Чек-лист глобальной переработки боя

> В начале файла находится фазовый summary. Исполняемым источником являются
> task cards T0–T17 ниже; summary-чекбоксы не должны расходиться с их статусами.

## Канонический порядок выполнения

```text
T0 decisions
  ↓
T14a schema/validator → T14b generated views/fingerprint → T1 protocol/profile
  ↓                         ↓
T12 map topology       T2 resources ─┬─ T3 mobile feedback
                                     ├─ T11 ability budget
                                     ├─ T15 scenario runner
                                     └─ T16 hero contracts
                                             ↓
                               T4 Kaze ─┬─ T5 Katty
                                         ↓
                                   T6 cube/bats → T7 remaining roster
                                                        ↓
                                             T8 AI ─── T9 role/pacing
                                                        ↓
                                             T13 playtest → T17 regression
                                                        ↓
                                                   T10 rollout
```

T3, T11, T12, T15 и T16 можно выполнять параллельно после необходимого
контракта. T4 и T5 можно выполнять параллельно только после T2/T3/T11/T15/T16;
общий schema/protocol не меняется внутри hero slice.

## Phase 0 — decisions, schema и baseline

- [x] T0: зафиксировать default profile, solo/team contract и scope guard.
- [x] T14a: описать CombatProfile schema и validator.
- [x] T14b: построить generated Go/JS views и fingerprint report.
- [x] Починить canonical master asset Brock Zeus, stale fingerprint и текущие
      frontend failures.
- [x] Прогнать baseline tests и снять baseline topology report; balance
      before/after и pacing comparison остаются отдельными gates.

Текущий automated baseline на 2026-08-27: uncached `go test ./... -count=1`
проходит; frontend — 600 тестов, 596 pass, 0 fail, 4 skipped. Повторно
проходят `validate_hero_catalog.py`, `validate_combat_profile.py`,
`validate_hero_combat_contracts.py`, generated-view check, ESLint, production
build и `git diff --check`. После balance revision
`2026-08-27-skill-cooldown-source` browser captures input/cancel и bat
patrol→notice→windup→despawn также зелёные.

## Phase 1 — общий combat contract

- [x] T1: versioned CombatProfile, snapshot/event schema и compatibility fields.
- [x] T2: Super/resource lifecycle, Gadget policy и death/respawn rules.
- [x] T3: mobile input, cast cancel/reject и минимальный hit feedback.
      Reject/replay dedupe, touch activation, melee/ranged feedback и
      telegraph/impact smoke закрыты; directional/point/self/targeted input
      contract, свежий aim в ability command и отдельный cancel UX закрыты.
      Backend miss-event lifecycle для delayed/directional Super закрыт
      `ability_missed`/`ability_resolved` с тем же commandId и wire-contract;
      dedicated mobile browser capture input/cancel без console/page errors
      теперь также закрыт: `output/playwright/ability-input-cancel/report.json`.
      Cancel дополнительно связывается с исходным `targetClientId`, удаляет
      только его delayed resolution и не создаёт поздний ложный miss-event;
      старые клиенты без target сохраняют owner-scoped fallback.
- [x] T11: ability power budget, sustain policy и kit counterplay contracts.
      Нормализованный power-budget matrix и per-kit role/counter descriptions
      закрыты; contract validator требует cast/telegraph/impact/resource/miss/
      interrupt/recovery/counterplay для всех 24 Basic/Super/Gadget.
- [x] T15: deterministic scenario runner, input log и state hash; runner,
      time-injected execution, Super/respawn/cube/bat pack, replayable 3v3
      team-bot matrix и roster-wide cadence/power regression report готовы.
      Roster-wide solo/team basic outcome и AI role/mode matrix теперь проходят
      по 20 повторов; authoritative team objective/player ordering и bot basic
      accuracy (одна успешная basic-команда, включая multi-hit) зафиксированы.
      Изолированный 1v1 parity gate дополнительно требует одинаковый
      `basicDamage` solo/team для всех 8 героев, чтобы mode rules не создавали
      скрытый balance drift.
      Contract benchmark matrix исполняет все 16 документированных matchup-карт
      в solo и team и проверяет basic impact обеих сторон; отдельный
      blocked-route scenario 20 раз подтверждает waypoint path и stuck replan
      telemetry. Добавлен отдельный 3×3 team mirror для полного roster: обе
      стороны проходят зеркальный damage round, все 3 lane участвуют, а отчёт
      стабилен на 20 replay cycles.
      Полный historical outcome diff и человеческие role reports остаются
      отдельными gates.
- [x] Consolidated automated evidence зафиксирован в
      `tasks/combat-automated-gate-2026-08.md`; generated runtime parity
      покрывает health-boost, Super/Gadget и AI defaults.
- [ ] T15 historical outcome diff и role reports: нужен approved старый
      release/ref с валидным catalog/profile fingerprint и human role evidence;
      Stage 3 report теперь также требует numeric before/after/delta по
      TTK/full-ammo/reload/skill/bot/resource/duration/win-rate; найденные
      `HEAD`/`ba17770` корректно отклонены release preflight.
- [x] T16: hero contract cards для всех 8 активных героев.

## Phase 2 — первые вертикальные срезы

- [x] T4: Kaze — entry, execution, reset и punish window. Server/catalog/HUD,
      combo/reset/punish tests, accuracy tiers и browser slice закрыты.
- [x] T5: Katty — paint setup, zone/flight readability и direct-trade floor.
      Zone/flight phase tests, HUD/VFX contract и browser slice закрыты.
- [x] Для обоих slices закрыть deterministic solo/team outcome report;
      общий roster outcome matrix теперь зелёный и покрывает оба режима, а в
      contract cards зафиксировано по 2 benchmark matchup-сценария для каждого
      из 8 героев.
- [ ] Human clarity check для обоих slices; нужен scripted playtest с
      участниками, screen evidence и signed answers.

## Phase 3 — карта и единая HP-экономика

- [x] T12: topology report, spawn safety, LOS, camps и resource routes.
      Dynamic route report, safety gates и team-lane p50/p90 arrival deltas
      для bat/health_boost реализованы; solo map намеренно не имеет authored
      neutral camps/resources и использует only killer-owned dynamic drops,
      поэтому solo seed fairness проверяется spawn/centre reachability, а не
      несуществующим camp route.
- [x] T6: удалить health crates/potion-red/legacy power pickup/auto-team HP
      reward; stale `power` props are discarded without heal, MaxHP or damage
      multiplier mutation.
- [x] T6: оставить зелёный cube, который меняет только MaxHP, с cap/TTL/ownership.
      MaxHP-only, cap, TTL и hero/team ownership реализованы; safe-position,
      no-benefit consumption guard и bounded active-budget реализованы.
- [x] T6: сделать bats camps с patrol, telegraph, leash, contest и reward.
      Patrol, wind-up/strike, leash/return, deterministic respawn и reward
      cycle реализованы; bot-side contest signal/telemetry теперь добавлены,
      notice-state теперь фиксирует цель на 350 ms и передаётся в snapshot;
      world-level lifecycle telemetry (notice/cancel/windup/strike/reward/
      respawn) теперь собирается в replay и bounded metrics; role-level bot
      response и reward ownership/claim-denial/claim outcome также
      экспортируются; bounded claimant timeline добавлен в scenario report.
      Здоровый flank-бот теперь явно выбирает видимый bat через `farm_bat`,
      а emergency-ветка не перехватывает обычный farm до team policy.

## Phase 4 — полный roster

- [x] T7: Needle/Lumi/Mina — control, setup, support и team value.
- [x] T7: Mandy/Brock/Mico — fighter, sharpshooter и tank counterplay.
- [x] Для каждого героя пройти автоматический power budget, contract
      benchmark coverage и solo/team replay, не меняя общий protocol/schema.
      Power budget и по 2 документированных benchmark matchup-сценария
      обязательны через contract validator; counter-role, skill-centrality,
      cadence, skill conversion, roster-wide outcome matrix и 20x replay
      закрыты.
- [ ] Empirical matchup/team acceptance и historical before/after; текущие
      deterministic reports не заменяют живой win-rate/role evidence.

## Phase 5 — AI, metrics и понимание игрока

- [x] T8: perception → utility decision → intent → steering, team roles и
      situation matrix. Deterministic solo/team time smoke, role benchmark,
      contest/focus/peel/respawn tests и bounded action telemetry проходят.
- [x] T9: role contribution, skill centrality и pacing telemetry. Match result
      разделяет basic/skill damage и basic-only/skill-assisted kills и содержит
      healing/shield/prevented damage/assist/control/bat-cube contest/escape
      counters плюс first-contact/combat/travel/respawn pacing. Всё match-local.
      Отдельные deterministic tests подтверждают классификацию и для basic-only,
      и для skill-assisted kill.
- [ ] T13: scripted human playtest с пятью clarity-вопросами. Script готов в
      `tasks/playtest/combat-clarity-script-2026-08.md`; нужны участники,
      screen evidence и signed answers. Формат и acceptance теперь заранее
      проверяются `tools/validate_combat_playtest.py`, но самих ответов пока
      нет.
- [x] Визуальный polish выполнять сквозным gate каждого slice, а не только
      после AI; automated effect-phase, hit-feedback, hero and bat renderer
      contracts проходят. Human clarity capture остаётся отдельным gate.

## Phase 6 — regression и rollout

- [x] T17 automated regression suite по семи пунктам исходного промпта. Все семь
      measurable smoke-групп и roster-wide `combat-regression-report` готовы;
      solo/team outcome, 3×3 team mirror и roster-wide AI replay gates теперь
      проходят 20 раз; skill-disabled before/after outcome и basic-only /
      skill-assisted kill-rate gate также закрыты;
      benchmark runtime outcome signal и obstacle/stuck replay evidence теперь
      закрыты; full historical outcomes и human answers остаются open, поэтому
      общий production/acceptance gate ниже остаётся открытым.
- [ ] T10: handshake, staged rollout, mixed-version rejection и rollback drill.
      Versioned room/snapshot metadata и explicit incompatible-client rejection
      реализованы; runbook готов в `tasks/combat-rollout-runbook-2026-08.md`,
      strict operator evidence validator добавлен в
      `tools/validate_combat_rollout.py`, template находится в
      `tasks/rollout/combat-rollout-report-template.json`,
      history scan сохранён в
      `output/combat-rollback-scan-20260829-v3/combat-rollback-ref-scan.json`,
      release preflight теперь блокирует dirty working tree и отсутствие
      passing rollback ref; rollout validator также cross-checks validated
      rollback object/ref in the local manifest, historical baseline before/
      after deltas и реальные non-negative integer post-rollback counters; сам
      staged rollout/rollback drill всё ещё требует ops/playtest evidence.
- [x] Финальная automated browser QA для ranged, melee, support, zone, bat и team fight.
      Ranged/melee/support/zone/team shell smoke и backend ability
      miss/resolved contracts зелёные; dedicated bat lifecycle
      (`output/playwright/bat-lifecycle-visual-audit/report.json`) и mobile
      input/cancel (`output/playwright/ability-input-cancel/report.json`)
      captures зелёные. Полный roster effect audit теперь также сохраняет
      `consoleErrors`/`pageErrors` по каждому герою и падает при runtime error;
      текущий отчёт: 49 visual cases, 8 error summaries, 0/0 errors. Human
      clarity остаётся отдельным gate.

## Final gates

- [x] `python tools/validate_hero_catalog.py`
- [x] `cd battle; go test ./...`
- [x] `cd frontend; npm test`
- [x] `cd frontend; npm run build`
- [x] Deterministic combat/bot scenarios pass.
- [x] Focused browser QA for ranged, melee, support, zone, bat and team fight.
      Ranged/melee/support/zone/team smoke зелёные; combat feedback smoke
      зелёный; backend miss/resolved contract зелёный; dedicated bat visual и
      mobile input/cancel capture зелёные. Human clarity capture остаётся open.
- [x] `git diff --check`.

## Второй проход — обязательные артефакты до Phase 1

- [x] Balance power-budget matrix: Threat, Safety, Control, Mobility, Sustain,
      Information, ObjectiveValue для всех восьми героев. Отчёт:
      `cd battle; go run ./cmd/combat-balance-report`.
- [x] Scenario pack на 100/60/30% accuracy, direct trade, counter-role,
      cube/bat contest и 3v3. Закрыты Super/respawn/cube/bat и
      replayable 3v3 utility/peel с bot accuracy metric; Kaze smoke matrix
      теперь закрывает accuracy tiers и direct trade с валидируемым
      attempts/hits ratio, roster basic smoke закрывает readable hit path для
      8 героев, counter-role smoke закрывает базовые entry/disengage пары Kaze
      и Brock, skill-centrality smoke проверяет измеримый Super effect всех 8
      героев, time-injected bot reports проверяют активность solo/team и zero
      unexplained idle, role benchmark проверяет tactical priority всех 8
      героев, counter-role movement matrix прогоняет entry/keep-distance для
      всех 8, outcome matrix теперь сохраняет full-ammo damage/deletion,
      cadence/reload/basic DPS и finite TTK для всех 8; skill conversion и
      counterplay-window matrix теперь проверяет wind-up/feedback phase всех 8;
      skill-conversion matrix проверяет basic-vs-Super outcome всех 8, а
      miss-path smoke закрывает отсутствие урона при ошибочном aim; полный
      balance/counter matrix и historical delta остаются. Contract benchmark
      matrix исполняет все 16 пар в solo/team и проверяет impact обеих basic
      атак; blocked-route scenario проверяет waypoint path и stuck replan
      telemetry 20 replay cycles. Roster-wide bot matrix теперь отдельно
      проверяет оба режима, 20 replay cycles, zero unexplained idle и accuracy
      в диапазоне 0..1; empty-ammo ranged guard проверяет, что бот в своей
      attack range создаёт дистанцию до перезарядки и не остаётся в чистом
      circle-strafe.
- [ ] Historical outcome delta для полного scenario pack; cadence/power delta
      уже есть, но старый runtime не представлен approved release/ref.
- [x] Before/after cadence/power report: `cd battle; go run
      ./cmd/combat-regression-report`. Исторический cadence baseline сохранён
      в `tasks/scenarios/original-prompt/combat-cadence-before.json`; TTK,
      skill conversion и counterplay остаются отдельными scenario metrics;
      текущий report также проверяет reload dead-time ceiling `<=0.60` и
      публикует full-cycle `sustainedBasicDps`.
- [x] Combat event schema с `matchId`, `phase`, `hero`, `source`, `target`,
      `abilitySlot`, `distance`, `effectiveDamage`, `accepted/reason` и
      `resourceBefore/resourceAfter`; контекст заполняется authoritative core,
      версия события присутствует на snapshot/event уровне, сериализация и
      visibility-filter покрыты тестами.
- [ ] Версия правил и rollbackable profile для каждого playtest build: добавлен
      `tools/capture_combat_release.py`, который в clean режиме создаёт
      create-once manifest с commit/profile/fingerprint/generated-view/file
      hashes и passing rollback ref; immutable clean release/ref и фактически
      сохранённый build evidence ещё не созданы в этом dirty working tree.
- [x] AI utility report: hard interrupt count, action score, target switches,
      retreat, skill use, resource contest и basic attack accuracy уже
      экспортируются; idle decision ticks и mean score по action теперь тоже
      экспортируются; time-injected solo/team smoke теперь подтверждает
      active decisions, attack attempts и zero unexplained idle; roster-wide
      role/mode matrix и 20x replay теперь закрыты. Dedicated obstacle/stuck
      outcome report и 20x replay теперь тоже закрыты; human role acceptance
      остаётся отдельным external gate.
- [x] Visual timeline test: intent → cast → telegraph → active → impact →
      status, включая отсутствие эффекта при промахе. Counterplay-window smoke
      уже закрывает wind-up и phase mapping Super для 8 героев; полный timeline
      теперь проверяет accepted command и конкретные initial/impact effects для
      всех 8 Super; базовый и Super miss-path уже проверены.
- [ ] Human status/intent timeline acceptance в браузере; automated capture
      проверяет технические фазы, но не понимание игроком.

## Третий проход — implementation task cards

Задачи ниже намеренно разделены на небольшие вертикальные срезы. Нельзя
начинать следующую карточку, если её acceptance criteria не закрыты.

### T0 — Consolidate combat decisions

**Depends on:** none. **Likely files:** `tasks/*combat*.md`,
`tasks/hero-rework-2026-08-plan.md`.

- [x] Объявить audit-plan canonical и пометить конфликтующие старые решения.
- [x] Зафиксировать solo/team mode contract, resource ownership и respawn
      policy.
- [x] Принять Phase-1 default profile или явно заменить отдельные значения.
- [x] Составить decision log: вариант, причина, метрика, regression test.

**Acceptance:** любой спорный пункт имеет ровно один выбранный вариант или
явный эксперимент A/B; старые TODO не противоречат каноническому плану.

**Verification:** `tasks/combat-decisions-2026-08.md`, review документов и `git diff --check`.

### T1 — Combat profile и сетевой контракт

**Depends on:** T0, T14b. **Likely files:** `battle/model/game/game_types.go`,
`battle/model/game/protocol.go`, `battle/model/room/room_snapshot.go`,
`frontend/src/components/BattleGame/NetworkSimulation.js`.

- [x] Ввести versioned `CombatProfileId`/`CombatRulesVersion` в snapshot и
      combat event wire-контракт.
- [x] Добавить phase/event schema с accepted/rejected/reason и dedupe ID.
- [x] Убрать двусмысленность `omitempty` у результативных событий.
- [x] Описать snapshot/event budgets и не отправлять phase как поток тиков.
      Snapshot отправляет максимум 24 наиболее свежих combat events на
      клиента; phase остаётся событием intent/cast/impact, а не tick-stream.

**Acceptance:** клиент понимает версию правил, один event даёт одну реакцию,
rejected ability содержит причину, snapshot остаётся компактным.

**Verification:** Go protocol tests, frontend contract tests, snapshot-size
report и повторная доставка одного snapshot/event.

### T2 — Resource lifecycle

**Depends on:** T1. **Likely files:** `battle/model/game/game.go`,
`battle/model/game/team_objectives.go`, `battle/model/player/*`, combat tests.

- [x] Перевести Super на authoritative contribution resource для effective
      player, objective и neutral damage; initial control/support paths тоже
      кредитуют ресурс, а полный coverage и tuning остаются T11.
- [x] Реализовать charge credit и cap; diminishing return остаётся A/B в T11.
- [x] Закрыть death/respawn lifecycle для Super, Gadget, ammo, marks, shield,
      combo и временных статусов.

**Acceptance:** Super не зависит от `LastPrimaryAt`, spawn-protected hit не
заряжает ресурс, solo/team respawn scenarios воспроизводимы.

**Verification:** deterministic Go scenarios для damage/control/support,
respawn и resource reset/preserve matrix.

### T3 — Mobile skill input и минимальная readability

**Depends on:** T1. **Likely files:**
`frontend/src/components/BattleGame/BattleGame.jsx`,
`frontend/src/components/BattleGame/BattleGameUI.jsx`,
`frontend/src/components/BattleGame/NetworkSimulation.js`,
`frontend/src/components/BattleGame/rendering/combat/*`.

- [x] Описать directional/point/self/targeted input contract для скиллов.
- [x] Показывать authoritative ability reject с понятной причиной и
      dedupe по combat event ID.
- [x] Показывать cast cancel/miss с понятной причиной.
- [x] Реализовать deduplicated contact feedback и базовый telegraph/impact
      timeline хотя бы для одного ranged и одного melee slice.

**Acceptance:** игрок на touch device может намеренно направить и отменить
скилл; промах не выдаёт ложный hit/status; визуальный impact совпадает с
authoritative event.

**Verification:** frontend/backend tests, wire-contract tests и короткий mobile
browser QA без console/page errors, включая повтор snapshot.

### T4 — Kaze vertical slice

**Depends on:** T2, T3, T11, T15, T16. **Likely files:** Kaze kit/config/catalog/HUD/VFX/tests.

- [x] Закрыть entry, combo, dash hit-once, reset-only-on-kill и punish window.
- [x] Проверить direct trade без Super, Super entry и неудачный disengage.
- [x] Снять полный solo и team outcome report; общий roster-wide outcome
      matrix и 16 contract benchmark-карт исполняются в обоих режимах.

**Acceptance:** Kaze силён в execution, но промах оставляет цену; reset не
возникает от обычного hit или presentation pulse.

**Verification:** Go kit tests, catalog validation, focused browser QA и
before/after matrix.

### T5 — Katty vertical slice

**Depends on:** T2, T3, T11, T15, T16. **Likely files:** Katty kit/config/catalog/HUD/VFX/tests.

- [x] Закрыть paint 1/2/3, zone/flight phases и direct-trade floor.
- [x] Проверить, что зона читается как armed/active/expired и не наносит урон
      до telegraph completion.
- [x] Снять полный solo/team report против melee и ranged контр-ролей;
      roster-wide outcome matrix, counter-role movement matrix и contract
      benchmark coverage закрывают runtime-часть. Human acceptance остаётся
      отдельным gate.

**Acceptance:** Katty выигрывает пространство через setup, но не удаляет цель
одной непонятной комбинацией; зона имеет честное окно выхода.

**Verification:** deterministic zone tests, mobile VFX QA и balance report.

### T6 — Green cube и bat camp

**Depends on:** T0, T4, T5, T12. **Likely files:**
`battle/model/game/game.go`, `battle/model/gamemap/team_battle.go`,
`battle/model/monster/*`, map protocol, minimap/renderer/tests.

- [x] Удалить health crate/potion-red из выбранного combat profile.
- [x] Удалить все legacy entry points: `healthCratesAdd`, authored
      `spawnAuthoredTeamPickups`, `propsAdd`, monster `potion-red` drop и
      `collectPickups` heal branch.
      Runtime/map/frontend now ignore or omit legacy health pickups; hero
      ability/passive healing remains intentionally available to Support kits.
- [x] Ввести cube budget, TTL, cap, ownership и безопасный drop position.
      Сейчас закрыты profile TTL (30s), snapshot/expiry loop, 5-stack cap,
      hero-team ownership, safe-position fallback и deterministic bat
      reward-per-cycle; lifecycle telemetry, role-level bot response и
      claimant ownership/claim-denial telemetry и bounded active-budget
      закрыты. Если
      команда полностью на cap, cube не потребляется без state change.
- [x] Обновить `ApplyHealthBoost`/tests: `MaxLives` растёт, текущие `Lives`
      при подборе не растут.
      Реализовано: лимит — 5 стаков; после cap подбор не меняет состояние.
- [x] Перевести bats на patrol/notice/chase/wind-up/strike/leash/reward.
      Выполнено первым runtime-срезом: patrol вместо простоя, server-side
      wind-up/strike с отменой при потере цели, leash/return и deterministic
      respawn с одним reward за цикл camp. Notice-state, world lifecycle
      counters и bot-side contest response по роли теперь входят в
      runtime/telemetry; reward ownership, first damage, team contest start,
      damage contribution, denied enemy claim, expiry и successful
      role-attributed claim теперь также фиксируются.
- [x] Явно оставить lunar non-HP loot вне Phase-1 HP profile или выключить его
      отдельным flag; не смешивать его с зелёным cube.
      Профиль объявляет healthPickupIds=[health_boost] и отделяет lunar loot
      как optional_bonus без влияния на currentLives.
- [x] Добавить map/minimap/telemetry contract.

**Acceptance:** на карте один понятный зелёный cube; bat создаёт решение
«фармить или драться», не преследует бесконечно и не дропает дублирующий heal.

**Verification:** solo/team economy scenarios, map collision tests, minimap QA
и cube/bat contest report.

### T7 — Remaining roster slices

**Depends on:** T4, T5, T6, T11. **Likely files:** one hero kit/config/catalog/VFX
and tests per slice.

- [x] Провести Needle/Lumi/Mina как control/setup/support slice.
- [x] Провести Mandy/Brock/Mico как fighter/sharpshooter/tank slice.
- [x] Для каждого героя закрыть автоматический power budget, counter-role и
      solo/team outcome smoke; deterministic role/counter/skill smoke закрыт.
- [ ] Empirical solo/team outcome acceptance для каждого героя; нужны
      подтверждённые benchmark win-rate/role результаты, а не только
      deterministic simulation.

**Acceptance:** у каждого героя есть сила, цена, win condition, counterplay и
полезность без скрытого глобального multiplier.

**Verification:** per-hero Go tests, catalog validator, focused browser QA,
scenario report and review before next hero.

### T8 — Utility AI и team play

**Depends on:** T2, T6, T7. **Likely files:** `battle/model/game/game_bots.go`,
`battle/model/game/bot_ai.go`, `battle/model/game/game_types.go`, bot tests.

- [x] Добавить первый utility-срез поверх blackboard: отдельные
      `engage/retreat/collect_pickup/roam` scores, role-aware weights и
      короткий hysteresis/commitment window. Hard interrupts уже остаются выше
      utility (снаряд, bat wind-up, storm).
- [x] Ввести role-aware engage/retreat/skill/cube/bat/objective policies.
      Первый decision-срез закрыт для engage/retreat/green cube; добавлен
      expected-value выбор Super против Gadget по роли и боевой ситуации.
      Добавлен отдельный `batResourceBehavior`: только flank/assassin ведёт
      известный живой camp, когда нет видимого героя и нет критического HP/cap;
      выбор отражается в bounded `batFarmDecisions` metric. Для видимого
      contested camp добавлены perception-limited contest score, общий helper
      для utility/target selection и interrupt sticky bat-target при появлении
      героя-конкурента; contest response записывается отдельно от обычного
      фарма в `resourceContestDecisions`; objective priorities covered by the
      same tactical scorer and role benchmark.
- [x] Добавить team assignments, focus fire, regroup и revive/respawn awareness.
      Role-to-assignment слой уже добавлен для team bots (`support`, `flank`,
      `anchor`, `frontline`) и меняет порядок tactical policies; focus fire
      закреплён через recent ally contact, peel теперь реагирует на recent
      ally damage, а spawn-protected targets исключаются. Resource contest
      scoring добавлен для публичного зелёного cube; bat contest учитывается
      через единый perception-limited target/utility signal с приоритетом
      видимого героя над camp, respawn awareness ведёт team bot к ближайшему
      союзному spawn перед возрождением. Time-injected solo/team smoke и
      accuracy/idle reports зелёные.

**Acceptance:** bot не idle/stuck, не игнорирует безопасный ресурс без причины,
не убегает без угрозы, применяет skill по ожидаемой ценности и объясняет
решение telemetry.

**Verification:** deterministic solo/team scenarios, bot performance tests,
action-score report и focused browser QA.

### T9 — Role contribution и pacing telemetry

**Depends on:** T1, T4, T5, T7. **Likely files:** `battle/model/player/player.go`,
`battle/model/room/registry.go`, battle result/provider models, telemetry and
result tests.

- [x] Добавить match-only counters для control, heal, shield, damage prevented,
      assists, objective/bat/cube contest и escape saves.
- [x] Разделить `basicOnlyKills` и `skillAssistedKills`; rates считаются из
      этих match-local counts, без изменения leaderboard.
- [x] Снять `timeToFirstContact`, `combatUptime`, uncontested travel,
      resource contest и respawn downtime.
- [x] Не включать новые counters в leaderboard до отдельного решения.

**Acceptance:** support/control contribution виден в debug/result report и не
оценивается только по kills; pacing counters показывают first contact,
связное combat window, uncontested travel и respawn dead time.

**Verification:** deterministic solo/team matches, result serialization tests,
cadence/power report и review метрик по каждой роли; historical outcome
before/after остаётся отдельным release gate.

### T10 — Versioned rollout и client compatibility

**Depends on:** T1, T2, T9, T13, T17. **Likely files:** battle room handshake/snapshot,
frontend network capability handling, deployment/config docs and rollout tests.

- [x] Передавать `CombatRulesVersion`, `CombatProfileId` и schema capability.
      Room handshake and every snapshot/event carry the version; new clients
      advertise capabilities during auth.
- [x] Добавить safe fallback для неизвестного effect/phase.
      Client ignores an incompatible state before presentation and renderer
      keeps unknown effect kinds on the cast/fallback path.
- [x] Записывать combat version в telemetry/result. Kill switch остаётся
      операционным rollout-решением и не включается молча в gameplay.
- [ ] Прогнать staged rollout от deterministic bots до ограниченного playtest.
      Порядок, abort gates и rollback drill описаны в
      `tasks/combat-rollout-runbook-2026-08.md`.

**Acceptance:** несовместимый клиент не попадает в матч с неподдерживаемой
схемой; заранее approved предыдущий profile/build можно включить без нового
gameplay-кода; неизвестный эффект не ломает рендер и не меняет gameplay.

**Verification:** handshake tests, mixed-version rejection test, replay/report
comparison и rollback drill.

### T11 — Ability budget и kit contracts

**Depends on:** T0, T1. **Likely files:** hero catalog/balance source,
`battle/model/game/combat_balance.go`, kit tests, HUD skill contract.

- [x] Добавить power-budget rows по Threat, Control, Safety, Mobility, Sustain,
      Information и ObjectiveValue.
- [x] Зафиксировать cast cost, interrupt, miss outcome, recovery и counterplay
      для каждого Basic/Super/Gadget; validator проверяет все активные hero IDs.
- [x] Добавить sustain metrics: `healingDone`, `damagePrevented`,
      `healWindowMs`, `healingBlocked` для anti-heal interaction; effective
      HP/s выводится из healingDone и BattleResult duration.

**Acceptance:** ни одна способность не получает одновременно высокий burst,
hard CC, immunity, escape и sustain без явной цены; role signature совпадает с
реальным win condition героя.

**Verification:** balance report, per-kit tests и human playtest questions 1–4.

### T12 — Map topology и resource placement

**Depends on:** T0. **Likely files:** `battle/model/gamemap/*`, map protocol,
minimap/pickup renderer, map tests and deterministic scenario runner.

- [x] Снять static topology report: spawn reachability, collision/cover,
      bridge/vine/choke geometry, route reachability и visual sectors.
      Артефакт: `output/playwright/abandoned-city-map/team-battle-northern/global-audit/report.json`.
- [x] Дополнить topology report динамическими camp timing, resource contest и
      green-cube drop-safety p50/p90 измерениями. Повторяемый запуск:
      `cd battle; go run ./cmd/resource-topology-report`. Текущий baseline:
      168 маршрутов, 0 недостижимых, 0 небезопасных drop-кандидатов, 2/8
      bat-camp contestable; p50/p90 bat = 11.7/19.8 с, cube = 11.9/23.3 с.
- [x] Удалить authored potion-red sustain points или превратить их в camp/lair
      landmarks, не перекрашивать механически: в match spawn/drop pipeline
      остался только health_boost, а центральные bat camps теперь являются
      отдельными contest landmarks.
- [x] Проверить solo seed fairness и team lane symmetry по p50/p90 timing.
      Team lane p50/p90 deltas проходят mirror tolerance; solo battle-royale
      использует только dynamic killer-owned loot и проходит spawn/centre
      reachability tests, без искусственного camp-route metric.

**Acceptance:** cube/bat/objective создают выбор и contest, но не требуют
пассивного пробега через одну обязательную точку; collision/minimap/visual
representation совпадают.

**Verification:** map unit tests, deterministic map report, minimap browser QA
и solo/team topology comparison.

### T13 — Human playtest gate

**Depends on:** T4, T5, T6, T7, T8, T9, T11, T12. **Likely files:**
`tasks/playtest/*`, scenario reports, QA scripts and release checklist.

- [ ] Провести scripted tests для каждого role в solo и team mode. Скрипт и
      case matrix подготовлены в `tasks/playtest/combat-clarity-script-2026-08.md`;
      report validator теперь требует `heroCoverage` всех 8 активных героев и
      `heroCoverageEvidence` с привязкой каждого героя к реальному participant/
      case; generator назначает каждому C1–C6 существующего героя, а не
      оставляет невалидный placeholder.
- [ ] Записать ответы «что делает герой / где опасность / почему hit / как
      избежать / зачем cube или bat»; генератор
      `tools/init_combat_playtest.py` создаёт все C1–C6, но автоматический
      browser smoke это не заменяет.
- [ ] Сопоставить human notes с TTK, skill conversion, pacing и bot metrics.

**Acceptance:** игроки понимают минимум 3 из 5 ключевых ответов без wiki, а
изменение не ухудшает одновременно clarity, performance и counterplay.

**Verification:** signed playtest report, screenshot/video evidence, no new
console/page errors и approval перед staged rollout.

### T14a — CombatProfile schema и validator

**Depends on:** T0. **Likely files:** `docs/combat-profile.json`, новый
schema/profile file,
`docs/hero-catalog.json`, validator tests.

- [x] Описать schema для basic, Super, Gadget, pickup, bats, telegraph и AI.
- [x] Разделить balance data, runtime state, presentation и telemetry contracts.
- [x] Зафиксировать documented defaults и запрет неизвестных legacy fields.

**Acceptance:** profile можно проверить без запуска боя; отсутствующее поле имеет
явный default; невалидное значение сообщает путь и причину ошибки.

**Verification:** schema validator, malformed-profile tests и example profile
review.

### T14b — Generated balance views и fingerprint

**Depends on:** T14a. **Likely files:** `battle/model/game/*catalog*`,
frontend generated/fallback config, catalog validator and fingerprint manifest.

- [x] Сгенерировать Go/JS views из editable profile.
- [x] Добавить report расхождений между source и derived views.
- [x] Учитывать profile ID/schema version в fingerprint.

**Acceptance:** balance value редактируется в одном источнике, derived views
перестраиваются воспроизводимо, а намеренное presentation-only отличие помечено.

**Verification:** catalog validator, generated diff report, Go/frontend contract
tests и stale fingerprint test.

### T15 — Scenario runner и replayable reports

**Depends on:** T1, T2. **Likely files:** `battle/model/game/*scenario*`,
deterministic tests, report scripts and `tasks/scenarios/*`.

- [x] Сохранить seed/profile ID и валидируемый, монотонный input log в
      checkpoint report foundation; `ApplyInput` и time-injected simulation
      теперь доступны runner-у с simulation-sized шагами.
- [x] Сохранять event IDs, стабильный state hash и именованные metrics в
      checkpoint report; roster-wide cadence/power before/after report
      добавлен отдельно.
- [x] Добавить стабильный authoritative state hash и versioned checkpoint
      report foundation.
- [x] Добавить детерминированные сценарии Super charge, respawn, cube
      ownership, bat contest, Kaze/Katty и базовый solo/team smoke. Сейчас
      есть replayable Kaze basic и Katty paint-setup smoke tests, а также
      deterministic Super/respawn/cube/bat scenario pack.
- [x] Довести полный solo/team outcome matrix и replayable 3v3 smoke;
      solo/team outcome matrix, 20x replay и state-hash checks закрыты.
- [ ] Снять 3v3 historical outcome diff; остаётся approved старый release/ref
      с валидным profile/catalog fingerprint, иначе сравнение будет
      ретроактивной реконструкцией, а не evidence старого runtime.

**Acceptance:** повтор одного сценария даёт одинаковый state hash и event
timeline; изменение profile даёт читаемый diff, а не перезаписывает baseline.

**Verification:** 20–100 повторов каждого сценария, deterministic hash test и
serialized JSON report review.

### T16 — Hero contract cards

**Depends on:** T14b. **Likely files:** `tasks/hero-contracts/*`,
`docs/hero-catalog.json`, hero tests and HUD skill descriptions.

- [x] Заполнить contract rows для всех 8 героев до завершения roster slices;
      Kaze/Katty были первыми vertical slices.
- [x] Добавить target/cast/telegraph/impact/status/resource/miss/interrupt
      поля для каждого skill.
- [x] Согласовать role, win condition, counterplay, solo и team acceptance.

**Acceptance:** Go, catalog, HUD и VFX используют одинаковые имена и смысл
каждой ability phase; отсутствие поля не скрывает legacy behavior.

**Verification:** contract schema test, hero review и one-page playtest brief
для каждого vertical slice.

### T17 — Initial prompt regression suite

**Depends on:** T2, T4, T5, T6, T7, T8, T11, T12. **Likely files:**
`battle/model/game/*combat*test.go`, bot scenarios, frontend visual contracts,
`tasks/scenarios/original-prompt/*`.

- [x] Balance: каждый герой выигрывает свой documented benchmark matchup и
      имеет documented counterplay. `TestScenarioPackDocumentedBenchmarkOutcomesHaveAnAdvantageSignal`
      исполняет первый matchup contract для всех 8 героев в solo/team, требует
      положительный runtime advantage margin и survival, повторяется 20 раз;
      общий живой win-rate/historical acceptance остаётся отдельным gate.
- [x] Skill centrality: отключение skills меняет исход хотя бы одного сценария
      каждого героя. `TestScenarioPackSkillDisabledOutcomeChangesAcrossSoloAndTeam`
      сравнивает одинаковые health thresholds в solo/team, basic-only и
      skill-assisted kill rate для 8 героев на 20 replay cycles; Mina отдельно
      проходит survival-counter metric через фактически поглощённый удар.
- [x] Attack cadence: нет длинного необъяснимого downtime, input-to-fire и
      reload dead time входят в report; отдельный player-facing ceiling
      `reloadDeadTimeFraction <= 0.60` проходит для всех восьми героев.
- [x] Visual: один skill intent даёт один правильный telegraph/impact/status,
      промах не показывает успешный результат.
- [x] HP economy: на карте нет health crates/potion-red, зелёный cube меняет
      только MaxHP и не увеличивает текущие Lives; active reward budget bounded.
- [x] Bats: camp имеет telegraph/leash/contest/reward, но не становится
      обязательной бесконечной фермой.
- [x] Bots: нет idle, беспричинного retreat, circle-strafe рядом с целью или
      игнорирования безопасного cube; team roles соблюдаются в deterministic
      solo/team smoke.

**Acceptance:** семь сценарных групп проходят в solo и team profile, а failure
указывает на конкретный event/metric, а не только на общий win/loss.

**Verification:** deterministic runner, state hash comparison, focused mobile
browser QA, bot action report и human clarity answers.

### Checkpoint C — перед rollout

- [x] Все profile decisions записаны и воспроизводимы по version ID; decision
      log и generated profile fingerprint синхронизированы.
- [x] Solo/team reports не скрывают mode-specific outliers; отчёты разделяют
      режимы, а roster matrix и 3×3 team mirror повторяются 20 раз.
- [x] Role contribution и pacing metrics доступны до tuning rollout.
- [x] Ability budget и map topology reports приложены к каждому slice.
- [ ] CombatProfile schema, generated views и replayable scenario reports
      прошли независимый review; automated validators зелёные. Agent review
      зафиксирован в `tasks/combat-code-review-2026-08.md`, но human/independent
      sign-off ещё не подписан. Automated evidence:
      `tasks/combat-automated-gate-2026-08.md`.
- [x] Initial prompt automated regression suite проходит для solo/team profiles;
      historical outcome delta и human clarity не входят в этот checkbox.
- [x] Super нигде не вычисляется из `LastPrimaryAt` вне compatibility test;
      `LastPrimaryAt` используется только для cooldown/recovery, charge
      authoritative и contribution-based.
- [x] Go tests, frontend tests/build, catalog validation и browser QA зелёные.
      Последний sweep: `go test ./... -count=1`, `go vet ./...`, 600 frontend
      tests, lint/build, validators и visual audit с 49 cases и 0/0 runtime
      errors.
- [x] Нет новых XL-задач: оставшиеся действия вынесены в external gates
      (human playtest, approved clean rollback ref, staged rollout); кодовые
      изменения после этого checkpoint должны оставаться отдельными slices.
