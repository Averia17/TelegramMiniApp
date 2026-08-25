# Чек-лист глобальной переработки боя

## Phase 0 — baseline

- [ ] Починить catalog fingerprint и canonical master asset Brock Zeus.
- [ ] Разобрать 3 frontend test failures и module import failure.
- [ ] Прогнать Go tests из `battle/` и зафиксировать текущие результаты.
- [ ] Пересчитать balance matrix с runtime cadence/reload и skill metrics.
- [ ] Добавить deterministic scenario report до/после.
- [ ] Добавить authoritative combat telemetry для shots, abilities, hits,
      status, cubes и bats.

## Phase 1 — combat loop

- [ ] Заменить скрытые `AttackRateScale`/`ReloadTimeScale` на versioned
      `CombatProfile`.
- [ ] Сократить downtime basic attacks и сохранить per-shell reload.
- [ ] Перевести Super charge с чистого timer на combat contribution; убрать
      зависимость готовности от `LastPrimaryAt`.
- [ ] Зафиксировать charge credit для damage/control/support/objective,
      target cap, diminishing return и запрет charge по spawn-protected цели.
- [ ] Зафиксировать death/respawn policy для Super, Gadget, ammo, marks,
      shield, combo и временных статусов.
- [ ] Сделать Gadget charges/cooldown частью hero kit profile.
- [ ] Обновить HUD ready/cooldown/counterplay information.

## Phase 2 — hero vertical slices

- [ ] Kaze: entry risk, combo payoff, reset и punish window.
- [ ] Katty: paint 1/2/3, zone/flight readability и direct-trade floor.
- [ ] Needle/Lumi/Mina: control, setup, support и team value.
- [ ] Mandy/Brock/Mico: fighter, sharpshooter и tank counterplay.
- [ ] Добавить balance + scenario + visual phase test на каждый slice.

## Phase 3 — pickups и bats

- [ ] Удалить `health_crate` из match spawn pipeline.
- [ ] Удалить `potion-red` из боевого режима и monster drops.
- [ ] Оставить один зелёный health cube с процентным MaxHP bonus.
- [ ] Добавить soft cap/diminishing return и единый ownership contract;
      сравнить `killer-only` и одноразовый `team-claim`.
- [ ] Убрать автоматическую раздачу HP bonus всей команде при одном kill.
- [ ] Сделать bats camps/lairs: patrol, notice, chase, wind-up, strike,
      retreat/leash, defeat и понятный reward.
- [ ] Определить respawn waves/timer и contest-time budget для bat camps.
- [ ] Добавить bat/cube minimap и feedback.

## Phase 4 — bots

- [ ] Ввести perception blackboard без map-wide omniscience.
- [ ] Разделить decide → intent → steering/path.
- [ ] Перевести выбор действий на utility scores с hysteresis.
- [ ] Добавить hero-role policies для ranged/melee/controller/support/tank/assassin.
- [ ] Добавить farm/contest cube и bat-camp decisions.
- [ ] Добавить team assignments, focus-fire, regroup и defend/push logic.
- [ ] Добавить bot debug telemetry и deterministic scenarios.

## Phase 5 — visuals

- [ ] Унифицировать `intent → cast → telegraph → active → impact → status`.
- [ ] Привязать GLB skill action к authoritative phase, а не только pulse.
- [ ] Пересобрать ambiguous Super/Gadget effects и zone states.
- [ ] Согласовать telegraph geometry с authoritative hitbox.
- [ ] Проверить mobile readability, safe areas и reduced-flash/reduced-shake.

## Final gates

- [ ] `python tools/validate_hero_catalog.py`
- [ ] `cd battle; go test ./...`
- [ ] `cd frontend; npm test`
- [ ] `cd frontend; npm run build`
- [ ] Deterministic combat/bot scenarios pass.
- [ ] Focused browser QA for ranged, melee, support, zone, bat and team fight.
- [ ] `git diff --check`.

## Второй проход — обязательные артефакты до Phase 1

- [ ] Balance power-budget matrix: Threat, Safety, Control, Mobility, Sustain,
      Conversion для всех восьми героев.
- [ ] Scenario pack на 100/60/30% accuracy, direct trade, counter-role,
      cube/bat contest и 3v3.
- [ ] Before/after report с TTK, basic downtime, full-ammo deletion rate,
      skill conversion и counterplay window.
- [ ] Combat event schema с `matchId`, `phase`, `hero`, `source`, `target`,
      `abilitySlot`, `distance`, `effectiveDamage`, `accepted/reason` и
      `resourceBefore/resourceAfter`.
- [ ] Версия правил и rollbackable profile для каждого playtest build.
- [ ] AI utility report: hard interrupt count, action score, target switches,
      idle/stuck time, retreat, skill use и resource contest.
- [ ] Visual timeline test: intent → cast → telegraph → active → impact →
      status, включая отсутствие эффекта при промахе.

## Третий проход — implementation task cards

Задачи ниже намеренно разделены на небольшие вертикальные срезы. Нельзя
начинать следующую карточку, если её acceptance criteria не закрыты.

### T0 — Consolidate combat decisions

**Depends on:** none. **Likely files:** `tasks/*combat*.md`,
`tasks/hero-rework-2026-08-plan.md`.

- [ ] Объявить audit-plan canonical и пометить конфликтующие старые решения.
- [ ] Зафиксировать solo/team mode contract, resource ownership и respawn
      policy.
- [ ] Принять Phase-1 default profile или явно заменить отдельные значения.
- [ ] Составить decision log: вариант, причина, метрика, regression test.

**Acceptance:** любой спорный пункт имеет ровно один выбранный вариант или
явный эксперимент A/B; старые TODO не противоречат каноническому плану.

**Verification:** review документов и `git diff --check`.

### T1 — Combat profile и сетевой контракт

**Depends on:** T0, T14b. **Likely files:** `battle/model/game/game_types.go`,
`battle/model/game/protocol.go`, `battle/model/room/room_snapshot.go`,
`frontend/src/components/BattleGame/NetworkSimulation.js`.

- [ ] Ввести versioned `CombatProfileId`/`CombatRulesVersion`.
- [ ] Добавить phase/event schema с accepted/rejected/reason и dedupe ID.
- [ ] Убрать двусмысленность `omitempty` у результативных событий.
- [ ] Описать snapshot/event budgets и не отправлять phase как поток тиков.

**Acceptance:** клиент понимает версию правил, один event даёт одну реакцию,
rejected ability содержит причину, snapshot остаётся компактным.

**Verification:** Go protocol tests, frontend contract tests, snapshot-size
report и повторная доставка одного snapshot/event.

### T2 — Resource lifecycle

**Depends on:** T1. **Likely files:** `battle/model/game/game.go`,
`battle/model/game/team_objectives.go`, `battle/model/player/*`, combat tests.

- [ ] Перевести Super на authoritative contribution resource.
- [ ] Реализовать charge credit/cap/diminishing return.
- [ ] Закрыть death/respawn lifecycle для Super, Gadget, ammo, marks, shield,
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
- [ ] Показывать cast cancel/reject/miss с понятной причиной.
- [ ] Реализовать deduplicated contact feedback и базовый telegraph/impact
      timeline хотя бы для одного ranged и одного melee slice.

**Acceptance:** игрок на touch device может намеренно направить и отменить
скилл; промах не выдаёт ложный hit/status; визуальный impact совпадает с
authoritative event.

**Verification:** frontend tests и короткий mobile browser QA без console/page
errors, включая повтор snapshot.

### T4 — Kaze vertical slice

**Depends on:** T2, T3. **Likely files:** Kaze kit/config/catalog/HUD/VFX/tests.

- [ ] Закрыть entry, combo, dash hit-once, reset-only-on-kill и punish window.
- [ ] Проверить direct trade без Super, Super entry и неудачный disengage.
- [ ] Снять solo и team report.

**Acceptance:** Kaze силён в execution, но промах оставляет цену; reset не
возникает от обычного hit или presentation pulse.

**Verification:** Go kit tests, catalog validation, focused browser QA и
before/after matrix.

### T5 — Katty vertical slice

**Depends on:** T2, T3. **Likely files:** Katty kit/config/catalog/HUD/VFX/tests.

- [ ] Закрыть paint 1/2/3, zone/flight phases и direct-trade floor.
- [ ] Проверить, что зона читается как armed/active/expired и не наносит урон
      до telegraph completion.
- [ ] Снять solo/team report против melee и ranged контр-ролей.

**Acceptance:** Katty выигрывает пространство через setup, но не удаляет цель
одной непонятной комбинацией; зона имеет честное окно выхода.

**Verification:** deterministic zone tests, mobile VFX QA и balance report.

### T6 — Green cube и bat camp

**Depends on:** T0, T4, T5. **Likely files:**
`battle/model/game/game.go`, `battle/model/gamemap/team_battle.go`,
`battle/model/monster/*`, map protocol, minimap/renderer/tests.

- [ ] Удалить health crate/potion-red из выбранного combat profile.
- [ ] Ввести cube budget, TTL, cap, ownership и безопасный drop position.
- [ ] Перевести bats на patrol/notice/chase/wind-up/strike/leash/reward.
- [ ] Добавить map/minimap/telemetry contract.

**Acceptance:** на карте один понятный зелёный cube; bat создаёт решение
«фармить или драться», не преследует бесконечно и не дропает дублирующий heal.

**Verification:** solo/team economy scenarios, map collision tests, minimap QA
и cube/bat contest report.

### T7 — Remaining roster slices

**Depends on:** T4, T5, T6. **Likely files:** one hero kit/config/catalog/VFX
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

- [ ] Добавить hard interrupts, blackboard и utility scorers с hysteresis.
- [ ] Ввести role-aware engage/retreat/skill/cube/bat/objective policies.
- [ ] Добавить team assignments, focus fire, regroup и revive/respawn awareness.

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

**Depends on:** T1, T2, T9. **Likely files:** battle room handshake/snapshot,
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

- [ ] Добавить power-budget rows по Threat, Control, Safety, Mobility, Sustain,
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

**Depends on:** T0, T6. **Likely files:** `battle/model/gamemap/*`, map protocol,
minimap/pickup renderer, map tests and deterministic scenario runner.

- [ ] Снять topology report: spawn safety, cover, LOS, choke, route count,
      camp timing, resource contest и drop safety.
- [ ] Удалить authored potion-red sustain points или превратить их в camp/lair
      landmarks, не перекрашивать механически.
- [ ] Проверить solo seed fairness и team lane symmetry по p50/p90 timing.

**Acceptance:** cube/bat/objective создают выбор и contest, но не требуют
пассивного пробега через одну обязательную точку; collision/minimap/visual
representation совпадают.

**Verification:** map unit tests, deterministic map report, minimap browser QA
и solo/team topology comparison.

### T13 — Human playtest gate

**Depends on:** T4, T5, T6, T7, T9, T11, T12. **Likely files:**
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

**Depends on:** T0. **Likely files:** новый schema/profile file,
`docs/hero-catalog.json`, validator tests.

- [ ] Описать schema для basic, Super, Gadget, pickup, bats, telegraph и AI.
- [ ] Разделить balance data, runtime state, presentation и telemetry contracts.
- [ ] Зафиксировать documented defaults и запрет неизвестных legacy fields.

**Acceptance:** profile можно проверить без запуска боя; отсутствующее поле имеет
явный default; невалидное значение сообщает путь и причину ошибки.

**Verification:** schema validator, malformed-profile tests и example profile
review.

### T14b — Generated balance views и fingerprint

**Depends on:** T14a. **Likely files:** `battle/model/game/*catalog*`,
frontend generated/fallback config, catalog validator and fingerprint manifest.

- [ ] Сгенерировать Go/JS views из editable profile.
- [ ] Добавить report расхождений между source и derived views.
- [ ] Учитывать profile ID/schema version в fingerprint.

**Acceptance:** balance value редактируется в одном источнике, derived views
перестраиваются воспроизводимо, а намеренное presentation-only отличие помечено.

**Verification:** catalog validator, generated diff report, Go/frontend contract
tests и stale fingerprint test.

### T15 — Scenario runner и replayable reports

**Depends on:** T1, T2. **Likely files:** `battle/model/game/*scenario*`,
deterministic tests, report scripts and `tasks/scenarios/*`.

- [ ] Поддержать seed, profile ID, players, props, bats, objectives и input log.
- [ ] Сохранять event log, state hash, metrics и before/after diff.
- [ ] Добавить сценарии Super charge, respawn, cube ownership, bat contest,
      Kaze/Katty и solo/team mode.

**Acceptance:** повтор одного сценария даёт одинаковый state hash и event
timeline; изменение profile даёт читаемый diff, а не перезаписывает baseline.

**Verification:** 20–100 повторов каждого сценария, deterministic hash test и
serialized JSON report review.

### T16 — Hero contract cards

**Depends on:** T14b. **Likely files:** `tasks/hero-contracts/*`,
`docs/hero-catalog.json`, hero tests and HUD skill descriptions.

- [ ] Заполнить contract rows для Kaze/Katty до начала их implementation.
- [ ] Добавить target/cast/telegraph/impact/status/resource/miss/interrupt
      поля для каждого skill.
- [ ] Согласовать role, win condition, counterplay, solo и team acceptance.

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
      каждого героя; basic-only kill rate не растёт после rework без объяснения.
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
