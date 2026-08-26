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

Текущий baseline на 2026-08-26: `go test ./...` проходит; frontend — 584
теста, 580 pass, 0 fail, 4 skipped. `validate_hero_catalog.py`, profile
validator, generated-view check, ESLint и production build проходят.

## Phase 1 — общий combat contract

- [x] T1: versioned CombatProfile, snapshot/event schema и compatibility fields.
- [x] T2: Super/resource lifecycle, Gadget policy и death/respawn rules.
- [ ] T3: mobile input, cast cancel/reject и минимальный hit feedback.
- [ ] T11: ability power budget, sustain policy и kit counterplay contracts.
- [ ] T15: deterministic scenario runner, input log и state hash; runner,
      time-injected execution, Super/respawn/cube/bat pack и replayable 3v3
      team-bot matrix готовы. Полные accuracy/direct-trade/role-mode reports
      и before/after diff ещё не закрыты.
- [x] T16: hero contract cards для Kaze/Katty.

## Phase 2 — первые вертикальные срезы

- [ ] T4: Kaze — entry, execution, reset и punish window.
- [ ] T5: Katty — paint setup, zone/flight readability и direct-trade floor.
- [ ] Для обоих slices закрыть server, catalog, HUD, input, VFX, bot policy,
      solo/team report и human clarity check.

## Phase 3 — карта и единая HP-экономика

- [ ] T12: topology report, spawn safety, LOS, camps и resource routes.
      Dynamic route report, safety gates и team-lane p50/p90 arrival deltas
      для bat/health_boost реализованы; для полного T12 остаётся solo seed
      fairness.
- [x] T6: удалить health crates/potion-red/auto-team HP reward.
- [ ] T6: оставить зелёный cube, который меняет только MaxHP, с cap/TTL/ownership.
      MaxHP-only, cap, TTL и hero/team ownership реализованы; safe-position,
      no-benefit consumption guard реализованы; active-budget остаётся.
- [ ] T6: сделать bats camps с patrol, telegraph, leash, contest и reward.
      Patrol, wind-up/strike, leash/return, deterministic respawn и reward
      cycle реализованы; bot-side contest signal/telemetry теперь добавлены,
      notice-state теперь фиксирует цель на 350 ms и передаётся в snapshot;
      world-level lifecycle telemetry (notice/cancel/windup/strike/reward/
      respawn) теперь собирается в replay и bounded metrics; role-level bot
      response и reward ownership/claim-denial/claim outcome также
      экспортируются; bounded claimant timeline добавлен в scenario report.

## Phase 4 — полный roster

- [ ] T7: Needle/Lumi/Mina — control, setup, support и team value.
- [ ] T7: Mandy/Brock/Mico — fighter, sharpshooter и tank counterplay.
- [ ] Для каждого героя пройти power budget, benchmark matchups и solo/team
      acceptance, не меняя общий protocol/schema.

## Phase 5 — AI, metrics и понимание игрока

- [ ] T8: perception → utility decision → intent → steering, team roles и
      situation matrix.
- [ ] T9: role contribution, skill centrality и pacing telemetry.
- [ ] T13: scripted human playtest с пятью clarity-вопросами.
- [ ] Визуальный polish выполнять сквозным gate каждого slice, а не только
      после AI.

## Phase 6 — regression и rollout

- [ ] T17: regression suite по семи пунктам исходного промпта.
- [ ] T10: handshake, staged rollout, mixed-version rejection и rollback drill.
- [ ] Финальная browser QA для ranged, melee, support, zone, bat и team fight.

## Final gates

- [x] `python tools/validate_hero_catalog.py`
- [x] `cd battle; go test ./...`
- [x] `cd frontend; npm test`
- [x] `cd frontend; npm run build`
- [x] Deterministic combat/bot scenarios pass.
- [ ] Focused browser QA for ranged, melee, support, zone, bat and team fight.
- [x] `git diff --check`.

## Второй проход — обязательные артефакты до Phase 1

- [ ] Balance power-budget matrix: Threat, Safety, Control, Mobility, Sustain,
      Conversion для всех восьми героев.
- [ ] Scenario pack на 100/60/30% accuracy, direct trade, counter-role,
      cube/bat contest и 3v3. Сейчас закрыты Super/respawn/cube/bat и
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
      balance/counter matrix и historical delta остаются.
- [ ] Before/after report с TTK, basic downtime, full-ammo deletion rate,
      skill conversion и counterplay window. Сейчас есть replayable baseline
      TTK/cadence/full-ammo reports, но нет исторического before-профиля и
      сводной after/before delta-таблицы.
- [ ] Combat event schema с `matchId`, `phase`, `hero`, `source`, `target`,
      `abilitySlot`, `distance`, `effectiveDamage`, `accepted/reason` и
      `resourceBefore/resourceAfter`.
- [ ] Версия правил и rollbackable profile для каждого playtest build.
- [ ] AI utility report: hard interrupt count, action score, target switches,
      retreat, skill use, resource contest и basic attack accuracy уже
      экспортируются; idle decision ticks и mean score по action теперь тоже
      экспортируются; time-injected solo/team smoke теперь подтверждает
      active decisions, attack attempts и zero unexplained idle, но накопление
      по полной role/mode matrix, role-specific match outcomes и stuck report
      ещё открыто.
- [ ] Visual timeline test: intent → cast → telegraph → active → impact →
      status, включая отсутствие эффекта при промахе. Counterplay-window smoke
      уже закрывает wind-up и phase mapping Super для 8 героев; полный timeline
      теперь проверяет accepted command и конкретные initial/impact effects для
      всех 8 Super; базовый и Super miss-path уже проверены, status/intent
      timeline в браузере остаётся.

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

- [ ] Описать directional/point/self/targeted input contract для скиллов.
- [x] Показывать authoritative ability reject с понятной причиной и
      dedupe по combat event ID.
- [ ] Показывать cast cancel/miss с понятной причиной.
- [ ] Реализовать deduplicated contact feedback и базовый telegraph/impact
      timeline хотя бы для одного ranged и одного melee slice.

**Acceptance:** игрок на touch device может намеренно направить и отменить
скилл; промах не выдаёт ложный hit/status; визуальный impact совпадает с
authoritative event.

**Verification:** frontend tests и короткий mobile browser QA без console/page
errors, включая повтор snapshot.

### T4 — Kaze vertical slice

**Depends on:** T2, T3, T11, T15, T16. **Likely files:** Kaze kit/config/catalog/HUD/VFX/tests.

- [ ] Закрыть entry, combo, dash hit-once, reset-only-on-kill и punish window.
- [ ] Проверить direct trade без Super, Super entry и неудачный disengage.
- [ ] Снять solo и team report.

**Acceptance:** Kaze силён в execution, но промах оставляет цену; reset не
возникает от обычного hit или presentation pulse.

**Verification:** Go kit tests, catalog validation, focused browser QA и
before/after matrix.

### T5 — Katty vertical slice

**Depends on:** T2, T3, T11, T15, T16. **Likely files:** Katty kit/config/catalog/HUD/VFX/tests.

- [ ] Закрыть paint 1/2/3, zone/flight phases и direct-trade floor.
- [ ] Проверить, что зона читается как armed/active/expired и не наносит урон
      до telegraph completion.
- [ ] Снять solo/team report против melee и ranged контр-ролей.

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
- [ ] Ввести cube budget, TTL, cap, ownership и безопасный drop position.
      Сейчас закрыты profile TTL (30s), snapshot/expiry loop, 5-stack cap,
      hero-team ownership, safe-position fallback и deterministic bat
      reward-per-cycle; lifecycle telemetry, role-level bot response и
      claimant ownership/claim-denial telemetry закрыты; общий active-budget
      остаётся. Если
      команда полностью на cap, cube не потребляется без state change.
- [x] Обновить `ApplyHealthBoost`/tests: `MaxLives` растёт, текущие `Lives`
      при подборе не растут.
      Реализовано: лимит — 5 стаков; после cap подбор не меняет состояние.
- [ ] Перевести bats на patrol/notice/chase/wind-up/strike/leash/reward.
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
- [ ] Добавить map/minimap/telemetry contract.

**Acceptance:** на карте один понятный зелёный cube; bat создаёт решение
«фармить или драться», не преследует бесконечно и не дропает дублирующий heal.

**Verification:** solo/team economy scenarios, map collision tests, minimap QA
и cube/bat contest report.

### T7 — Remaining roster slices

**Depends on:** T4, T5, T6, T11. **Likely files:** one hero kit/config/catalog/VFX
and tests per slice.

- [ ] Провести Needle/Lumi/Mina как control/setup/support slice.
- [ ] Провести Mandy/Brock/Mico как fighter/sharpshooter/tank slice.
- [ ] Для каждого героя закрыть power budget, counter-role, solo/team report.

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
- [ ] Ввести role-aware engage/retreat/skill/cube/bat/objective policies.
      Первый decision-срез закрыт для engage/retreat/green cube; добавлен
      expected-value выбор Super против Gadget по роли и боевой ситуации.
      Добавлен отдельный `batResourceBehavior`: только flank/assassin ведёт
      известный живой camp, когда нет видимого героя и нет критического HP/cap;
      выбор отражается в bounded `batFarmDecisions` metric. Для видимого
      contested camp добавлены perception-limited contest score, общий helper
      для utility/target selection и interrupt sticky bat-target при появлении
      героя-конкурента; contest response записывается отдельно от обычного
      фарма в `resourceContestDecisions`. Objective policy и полная
      contest/assignment матрица всё ещё требуют отдельного слоя.
- [ ] Добавить team assignments, focus fire, regroup и revive/respawn awareness.
      Role-to-assignment слой уже добавлен для team bots (`support`, `flank`,
      `anchor`, `frontline`) и меняет порядок tactical policies; focus fire
      закреплён через recent ally contact, peel теперь реагирует на recent
      ally damage, а spawn-protected targets исключаются. Resource contest
      scoring добавлен для публичного зелёного cube; bat contest учитывается
      через единый perception-limited target/utility signal с приоритетом
      видимого героя над camp, respawn awareness ведёт team bot к ближайшему
      союзному spawn перед возрождением. Остались полная scenario matrix и
      accuracy/idle reports.

**Acceptance:** bot не idle/stuck, не игнорирует безопасный ресурс без причины,
не убегает без угрозы, применяет skill по ожидаемой ценности и объясняет
решение telemetry.

**Verification:** deterministic solo/team scenarios, bot performance tests,
action-score report и focused browser QA.

### T9 — Role contribution и pacing telemetry

**Depends on:** T1, T4, T5, T7. **Likely files:** `battle/model/player/player.go`,
`battle/model/room/registry.go`, battle result/provider models, telemetry and
result tests.

- [ ] Добавить match-only counters для control, heal, shield, damage prevented,
      assists, objective/bat/cube contest и escape saves.
- [ ] Разделить `basicOnlyKillRate` и `skillAssistedKillRate`.
- [ ] Снять `timeToFirstContact`, `combatUptime`, uncontested travel,
      resource contest и respawn downtime.
- [ ] Не включать новые counters в leaderboard до отдельного решения.

**Acceptance:** support/control contribution виден в debug/result report и не
оценивается только по kills; pacing report показывает, где матч превращается
в пустое перемещение или долгий dead time.

**Verification:** deterministic solo/team matches, result serialization tests,
before/after report и review метрик по каждой роли.

### T10 — Versioned rollout и client compatibility

**Depends on:** T1, T2, T9, T13, T17. **Likely files:** battle room handshake/snapshot,
frontend network capability handling, deployment/config docs and rollout tests.

- [ ] Передавать `CombatRulesVersion`, `CombatProfileId` и schema capability.
- [ ] Добавить safe fallback для неизвестного effect/phase.
- [ ] Записывать combat version в telemetry/result и поддерживать kill switch.
- [ ] Прогнать staged rollout от deterministic bots до ограниченного playtest.

**Acceptance:** несовместимый клиент не попадает в матч с неподдерживаемой
схемой; старый profile можно включить без нового кода; неизвестный эффект не
ломает рендер и не меняет gameplay.

**Verification:** handshake tests, mixed-version rejection test, replay/report
comparison и rollback drill.

### T11 — Ability budget и kit contracts

**Depends on:** T0, T1. **Likely files:** hero catalog/balance source,
`battle/model/game/combat_balance.go`, kit tests, HUD skill contract.

- [x] Добавить power-budget rows по Threat, Control, Safety, Mobility, Sustain,
      Information и ObjectiveValue.
- [ ] Зафиксировать cast cost, interrupt, miss outcome, recovery и counterplay
      для каждого Basic/Super/Gadget.
- [ ] Добавить sustain metrics: effective HP/s, damage prevented, heal window,
      anti-heal interaction.

**Acceptance:** ни одна способность не получает одновременно высокий burst,
hard CC, immunity, escape и sustain без явной цены; role signature совпадает с
реальным win condition героя.

**Verification:** balance report, per-kit tests и human playtest questions 1–4.

### T12 — Map topology и resource placement

**Depends on:** T0. **Likely files:** `battle/model/gamemap/*`, map protocol,
minimap/pickup renderer, map tests and deterministic scenario runner.

- [x] Снять static topology report: spawn reachability, collision/cover,
      bridge/vine/choke geometry, route reachability и visual sectors.
      Артефакт: `output/playwright/abandoned-city-map/global-audit/report.json`.
- [x] Дополнить topology report динамическими camp timing, resource contest и
      green-cube drop-safety p50/p90 измерениями. Повторяемый запуск:
      `cd battle; go run ./cmd/resource-topology-report`. Текущий baseline:
      168 маршрутов, 0 недостижимых, 0 небезопасных drop-кандидатов, 2/8
      bat-camp contestable; p50/p90 bat = 11.7/19.8 с, cube = 11.9/23.3 с.
- [x] Удалить authored potion-red sustain points или превратить их в camp/lair
      landmarks, не перекрашивать механически: в match spawn/drop pipeline
      остался только health_boost, а центральные bat camps теперь являются
      отдельными contest landmarks.
- [ ] Проверить solo seed fairness и team lane symmetry по p50/p90 timing.

**Acceptance:** cube/bat/objective создают выбор и contest, но не требуют
пассивного пробега через одну обязательную точку; collision/minimap/visual
representation совпадают.

**Verification:** map unit tests, deterministic map report, minimap browser QA
и solo/team topology comparison.

### T13 — Human playtest gate

**Depends on:** T4, T5, T6, T7, T8, T9, T11, T12. **Likely files:**
`tasks/playtest/*`, scenario reports, QA scripts and release checklist.

- [ ] Провести scripted tests для каждого role в solo и team mode.
- [ ] Записать ответы «что делает герой / где опасность / почему hit / как
      избежать / зачем cube или bat».
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
      checkpoint report; before/after diff остаётся pending.
- [x] Добавить стабильный authoritative state hash и versioned checkpoint
      report foundation.
- [x] Добавить детерминированные сценарии Super charge, respawn, cube
      ownership, bat contest, Kaze/Katty и базовый solo/team smoke. Сейчас
      есть replayable Kaze basic и Katty paint-setup smoke tests, а также
      deterministic Super/respawn/cube/bat scenario pack.
- [ ] Довести полный solo/team matrix, 3v3 reports и before/after diff.

**Acceptance:** повтор одного сценария даёт одинаковый state hash и event
timeline; изменение profile даёт читаемый diff, а не перезаписывает baseline.

**Verification:** 20–100 повторов каждого сценария, deterministic hash test и
serialized JSON report review.

### T16 — Hero contract cards

**Depends on:** T14b. **Likely files:** `tasks/hero-contracts/*`,
`docs/hero-catalog.json`, hero tests and HUD skill descriptions.

- [x] Заполнить contract rows для Kaze/Katty до начала их implementation.
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

- [ ] Balance: каждый герой выигрывает свой benchmark matchup и имеет
      documented counterplay.
- [ ] Skill centrality: отключение skills меняет исход хотя бы одного сценария
      каждого героя; baseline smoke уже проверяет измеримый Super effect всех 8,
      но before/after outcome и basic-only kill rate ещё не закрыты.
- [ ] Attack cadence: нет длинного необъяснимого downtime, input-to-fire и
      reload dead time входят в report.
- [ ] Visual: один skill intent даёт один правильный telegraph/impact/status,
      промах не показывает успешный результат.
- [ ] HP economy: на карте нет health crates/potion-red, зелёный cube меняет
      только MaxHP и не увеличивает текущие Lives.
- [ ] Bats: camp имеет telegraph/leash/contest/reward, но не становится
      обязательной бесконечной фермой.
- [ ] Bots: нет idle, беспричинного retreat, circle-strafe рядом с целью или
      игнорирования безопасного cube; team roles соблюдаются.

**Acceptance:** семь сценарных групп проходят в solo и team profile, а failure
указывает на конкретный event/metric, а не только на общий win/loss.

**Verification:** deterministic runner, state hash comparison, focused mobile
browser QA, bot action report и human clarity answers.

### Checkpoint C — перед rollout

- [ ] Все profile decisions записаны и воспроизводимы по version ID.
- [ ] Solo/team reports не скрывают mode-specific outliers.
- [ ] Role contribution и pacing metrics доступны до tuning rollout.
- [ ] Ability budget и map topology reports приложены к каждому slice.
- [ ] CombatProfile schema, generated views и replayable scenario reports
      прошли review.
- [ ] Initial prompt regression suite проходит для solo/team profiles.
- [ ] Super нигде не вычисляется из `LastPrimaryAt` вне compatibility test.
- [ ] Go tests, frontend tests/build, catalog validation и browser QA зелёные.
- [ ] Нет новых XL-задач: каждое следующее изменение разбито на 1–5 файлов
      или отдельный вертикальный slice.
