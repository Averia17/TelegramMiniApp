# Combat 2.0 — checklist

## Current verification — 2026-09-02

- [x] Frontend: 710 tests (706 pass, 4 skipped), lint и production build.
- [x] Catalog/profile/GLB validators: 8 hero cards and 8 canonical runtime GLBs.
- [x] Blender source/animation validators: 8 master hero sources, 0 source
  failures; all canonical master Actions carry authored semantic phases and
  intent beats when run inside Blender 5.2 (`bpy`).
- [x] Browser runtime: 8 heroes, 58 effect captures (51 hero + 7 neutral-camp),
  0 console/page errors and 0 authoritative/runtime phase mismatches; все 8
  runtime-error checks содержат пустые console/page error arrays. Тот же полный
  аудит повторён на `360×740`, DPR 2 с теми же 58 captures и нулевыми ошибками;
  viewport задаётся через `HERO_EFFECT_QA_WIDTH/HEIGHT/DPR`.
- [x] Final Kaze phase capture: authoritative/runtime phases совпадают для
  impact/telegraph/cast/active states; report сохраняет VFX roles.
- [x] GLB runtime animation smoke: transition audit прошёл для всех 8 героев
  (attack overlay blend, locomotion продолжает тикать, после overlay вес idle
  возвращается к 1, errors=[]); interpolation audit всех 8 GLB также прошёл
  без runtime errors. Это проверяет runtime clips/blend, но не совпадение
  authored active frame с серверным impact.
- [x] Backend: `model/game` и `model/room` проходят полностью (`go test
  ./model/game ./model/room -count=1 -timeout=240s`; game — 99.5s, room —
  1.5s); добавлены 8-hero gadget authority matrix, stun/re-entry matrix и
  authoritative effect timeline snapshot. Kaze↔Brock pacing scenario также
  проверяет принятые action events, recovery ordering, max meaningful gap ≤3s
  и отсутствие full-health delete в наблюдаемой timeline.
- [x] WebSocket transport smoke: `go test ./handler ./tests -count=1` проходит
  (`handler` — 1.3s, `tests` — 36.8s); это проверяет server transport/recovery,
  но не заменяет Telegram WebView touch/FPS capture.
- [x] Live battle QA на локальном Compose stack: WebSocket snapshot получил
  реальный team battle (6 players/5 bots), mobile shell прошёл 9 viewport’ов
  с touch move/aim без overflow/overlap/errors; team HUD прошёл 5 phone
  viewport’ов. All-hero live skill audit прошёл 8/8 героев, observedHero и
  effect delivery совпали, console/page errors отсутствуют.
- [x] Steady-state performance baseline: snapshot p95 44.5ms, renderer frame
  p95 8.1ms, GPU p95 6.9ms, long-task 51ms (1 observed jank) на headless
  WebGL; это baseline для device profiling, не финальный low-end FPS sign-off.
- [x] Plan/release tooling: `python -m unittest discover -s tools -p
  'test*.py'` — 84 tests, 79 pass и 5 dependency-skipped; профиль, hero
  contracts, release/playtest/rollout validators и generated views согласованы.
- [ ] Перед release закрыть human clarity, real Telegram WebView/device FPS и
  staged rollout gates; live local WebSocket/touch уже прошёл, frontend-only
  mobile lobby и automated touch/input contracts тоже проверены.

> Mobile responsive QA для lobby/roster/store/profile/rating пройден на 320/375/
> 430/1440px. Battle-mobile assertion дополнительно пройден на поднятом
> локальном battle service: 9 viewport’ов, touch move/aim, реальный snapshot,
> без overflow/overlap/errors. Перед release остаётся проверка в Telegram
> WebView и FPS на целевых физических устройствах.

> Неподделываемые release gates: human clarity report и staged rollout/rollback
> report должны быть заполнены реальными участниками/оператором. Для них уже
> есть `tools/init_combat_playtest.py`, `tools/validate_combat_playtest.py`,
> `tools/init_combat_rollout.py`, `tools/validate_combat_rollout.py` и
> `tools/capture_combat_release.py`; placeholder evidence намеренно не считается
> успешным.

### Пересмотр границ на 2026-09-02

Закрыты кодом и regression evidence: authoritative phase/timestamp/correlation,
confirmed-hit feedback, 8-hero Super/basic outcome matrix, 8-hero gadget
setup/payoff matrix, Root Guardian recovery, authored camps, camera
look-ahead/dead-zone, mobile basic-attack buffer, cast cancel wiring, ability
and danger audio cues, event/effect dedupe, bounded VFX pool/reset lifecycle и
accessibility preferences. Добавлен all-hero proof: stun блокирует Gadget без
списания ресурса, после recovery Gadget и Basic снова получают управление.

Не выдаются за готовность и остаются открытыми: полный rhythm/pacing balance
report, FPS/mix на реальных устройствах, manual miss/interrupt/re-entry clarity,
минимум пять human playtests и staged rollout/rollback. Эти пункты требуют либо внешней
среды/людей, либо отдельного профилирования; placeholder-скриншоты их не
закрывают.

## Phase 0 — baseline

### Реализация: первый вертикальный срез завершён

- [x] Shared combat-hit presentation contract: reaction, hit-stop hint,
  target health before/after.
- [x] Stable effect identity and source/command/ability ownership in snapshots.
- [x] Directional hit burst, impact core, target squash and renderer hook for
  every current hero through the shared path.
- [x] Focused Go/frontend tests, frontend build and lint pass.
- [x] Kaze/Mico timing slice: authoritative telegraph → impact/recovery,
  dodge/punish window, directed frontend VFX и focused scenario tests.
- [ ] Это не финальный Combat 2.0 gate: Brock duel gate, полноценные
  audio/camera/input timeline, live/human verification и monster camps remain.

- [ ] Зафиксировать profile revision и scope guard.
- [ ] Снять before-метрики PvP/PvE и human clarity baseline.
- [ ] Выбрать первый mode и controller vertical slice.
- [ ] Checkpoint: before-report принят.

### T0.5 — First-session combat gate

**Depends on:** Phase 0. **Likely files:** `tasks/playtest/*`, first-session
capture/QA scripts, `BattleGameUI.jsx`, `BattleGame.css`.

- [ ] Записать 0–60 секунд первого боя: movement, first hit, first ability,
  survival/defeat и причину последнего damage.
- [ ] Проверить, что новичок видит ready state, signature ability, danger и
  escape route без чтения внешнего описания.
- [ ] Зафиксировать next-match intent: хочет ли игрок повторить бой и что он
  собирается попробовать иначе.

**Verification:** минимум пять human playtests, first-session screenshots/video,
ответы на clarity/interest questions; провал этого gate блокирует visual release.

### T0.6 — Visual quality bar audit

**Depends on:** existing visual audit captures. **Likely files:**
`output/playwright/hero-effect-visual-audit`, `tools/qa/hero-live-skill-audit.cjs`,
`tools/qa/hero-effect-visual-audit.cjs`, new visual review notes.

- [ ] Для каждой способности захватывать минимум `before/cast/active/impact/after`
  в live-сцене с атакующим и целью.
- [ ] Отмечать отдельно источник, направление, dodge window, hit/miss, reaction,
  status/payoff и возврат в locomotion.
- [ ] Отклонять эффект, если он читается только как ring/число или статичный
  debug showcase без причинно связанного gameplay event.

**Verification:** наблюдатель отвечает на шесть Beauty Bar вопросов за 0.5–1 с;
сравнение с текущими Brock/Katty/Mina captures.

### T0.7 — Anti-pattern review

**Depends on:** Phase 0, T0.6. **Likely files:** `docs/combat-profile.json`,
hero contract cards, scenario pack and balance report.

- [ ] Для каждого героя найти raw burst, safety, CC immunity, Super loop и
  snowball risk.
- [ ] Для каждого risk записать цену силы и доступный ответ противника.
- [ ] Отклонять kit, если его выигрыш определяется одним нечитабельным моментом
  или если ответ возможен только при заранее известной wiki-информации.

**Verification:** matchup matrix для 8 героев, отдельные tests на miss/punish,
immunity duration, Super charge loop и full-health burst.

### T0.8 — Runtime causality audit

**Depends on:** T0.6. **Likely files:** `EffectRenderer.js`,
`GLBHeroController.js`, `MonsterRenderer.js`, existing browser QA scripts.

- [x] Сопоставить каждый проверенный `effectKind` с source, target, phase, TTL и
  owning event; authoritative `createdAt/expiresAt` теперь проходят в snapshot.
- [x] Найти эффекты, где shared ring/glow скрывает направленную gameplay-семантику;
  известные ability kinds получили отдельные compositions, ring-only fallback
  оставлен только legacy-случаям.
- [x] Найти места, где fixed `.42` Basic window или procedural fallback расходятся
  с authoritative release/impact; renderer теперь живёт от phase/timeline.
- [x] Расширить QA от проверки существования mesh до capture timeline, VFX roles
  и target reaction hooks.

**Verification:** visual causality report для всех текущих hero effects и bat
lifecycle; ни одного известного effect kind без phase/impact assertion.

### T0.9 — Research cutoff and first-slice scope

**Depends on:** T0.5–T0.8. **Likely files:** this plan, playtest scenario pack,
first combat profile revision.

- [x] Зафиксировать reference matrix: что берём у Brawl Stars, MLBB, Honor of
  Kings и Pokémon UNITE, а что сознательно не переносим; matrix и sources
  записаны в `combat-global-overhaul-2026-09-plan.md` и deep analysis.
- [x] Заморозить первый доказательный scope: одна карта, один режим, Kaze и
  Brock; Mandy/Mico, controller и support не блокируют первый PvP gate. Их
  automated all-hero coverage добавлена отдельно и не подменяет PvP gate.
- [ ] Перевести TTK из универсальной цели в role/mode/accuracy distributions;
  добавить death-without-telegraph и meaningful-action downtime.
- [x] Записать критерий перехода от исследования к прототипу: одинаковый live
  сценарий before/after и human playtest, а не новый список ссылок; это
  закреплено в vertical-slice и release sections плана.

**Verification:** scope decision принят, первый scenario pack воспроизводим,
лишние задачи помечены как post-gate.

### T0.10 — Soft-survival decision

**Depends on:** T0.9. **Likely files:** combat profile, hit reaction/feedback
contract, scenario telemetry.

- [ ] Сравнить три варианта выживания: только HP, HP + escape/recovery и HP +
  stagger/displacement/recovery action.
- [ ] Проверить, создаёт ли промежуточное состояние clutch и повторный вход без
  ощущения потери управления.
- [ ] Не вводить pressure meter в первый slice; оставить его экспериментом только
  при доказанной проблеме бинарного «попал — почти умер».

**Verification:** короткий A/B/C live capture и human verdict по agency, fairness,
clutch и читаемости.

### T0.11 — Ability authority/presentation gap map

**Depends on:** T0.9. **Likely files:** `new_hero_kits.go`, `combat_kits.go`,
`combat_feedback.go`, `protocol.go`, hero contracts and visual timeline tests.

- [x] Составить таблицу для каждого Basic/Super/Gadget: cast, release, active,
  impact, recovery, miss, interrupt, target reaction и current renderer path.
- [x] Отдельно зафиксировать immediate-resolution abilities: Kaze Super и Mico
  Super переведены из cosmetic/immediate path в authoritative telegraph → impact.
- [x] Проверить correlation: effect snapshots теперь несут `sourceId/targetId/
  commandId/abilitySlot`, а authoritative event несёт `sourceId/targetId/
  commandId`; wire timeline regression закреплён room test.
- [ ] Не менять баланс до завершения карты разрывов: сначала доказать, где
  ломается причинность, затем выбирать server/runtime/UI fix.

**Verification:** один gap report на 8 героев; у каждого навыка есть одно решение
«оставить instant», «добавить telegraph» или «добавить active/recovery».

## Phase 1 — combat pacing

- [x] Добавить replayable scenario pack для 100%/60%/30% accuracy, counterplay
  response window и entry/disengage; human pacing verdict остаётся отдельным gate.
- [x] Проверить ритм `approach/poke/commit/clash/clutch/reset`: реплейный
  Kaze↔Brock scenario не оставляет более 3 секунд между принятыми Basic/Ability
  actions и учитывает stun recovery; универсальный balance verdict и human
  pacing остаются отдельными gate.
- [x] Настроить cadence/reload/HP через CombatProfile, без hardcoded multipliers;
  generated profile validator и gameplay cadence tests закрепляют источник.
- [x] Проверить кодом recovery, cast cancel/interrupt, movement lock и respawn
  resource policy; live miss/interrupt/re-entry проверка остаётся открытой.
- [x] Проверить кодом soft-survival: hit reaction, displacement, recovery action
  и respawn/re-entry policy; live fairness verdict остаётся release gate.
- [x] Пройти автоматизированные Kaze + Brock duel/counter-role и ranged/controller
  trade scenarios; human duel verdict остаётся release gate.
- [ ] Checkpoint: нет необъяснимого full-health delete; TTK читается по
  role/mode/accuracy, а не одной общей цифрой.

## Phase 2 — skill-driven slices

- [x] Автоматизированный Kaze + Brock slice покрывает entry → spacing/cover →
  counterplay → reset/disengage; human combo/re-entry verdict остаётся gate.
- [x] Автоматизированная матрица добавляет Mandy/Mico как close-range matchup.
- [x] Автоматизированная матрица покрывает Needle/Katty zone/mark/root → counterplay.
- [x] Автоматизированная матрица покрывает Fairy Mina support/peel/shield → team outcome.
- [x] Для каждого automated slice связаны server event, phase, VFX/SFX, HUD и QA;
  GLB active-frame и human readability остаются отдельными gates.
- [ ] Не добавлять controller/support в обязательный первый gate, пока не пройден
  melee/ranged slice.
- [ ] Checkpoint: human tester видит win condition, ответ противника, момент
  re-entry и причину проигрыша без wiki.

## Phase 3 — visual combat pass

- [x] Shared hit event now drives directional burst, target squash/stretch,
  camera shake and a short visual hit-stop without freezing server simulation.
- [x] Ввести/проверить phase markers `intent/cast/telegraph/active/impact/status/recovery`;
  runtime normalizer принимает authoritative aliases и visual audit сохраняет
  authoritative/runtime phase для каждого capture.
- [x] Настроить feedback tiers, camera punch, hit-stop, hit reaction и damage
  readout для confirmed hit; dedupe и recovery покрыты frontend/backend tests.
- [x] Добавить базовый audio pass: decibel Master/hit/ability/danger buses,
  tiered hit cues, throttling и pitch variation; real-device mix/ducking review
  остаются release gate.
- [x] Проверить camera look-ahead/deadzone, additive shake и отсутствие скрытия
  telegraph/arena; feedback не меняет authoritative position. Есть focused
  renderer tests и WebGL effect audit.
- [x] Проверить touch input-to-fire, input buffer и cancel/recovery контракт на
  frontend unit level; live WebSocket touch assertion пройден на 9 mobile/
  landscape viewport’ах локального Compose stack. Telegram WebView/device FPS
  остаются release gate.
- [x] Сделать visual cards для восьми героев: runtime-аудит собрал 51 effect
  capture без console/page errors; сводка — `combat-global-overhaul-2026-09-hero-matrix.md`.
- [x] Добавить reduced-flash/reduced-shake: `prefers-reduced-motion` отключает
  shake и visual hit-stop, а reduced-flash снижает интенсивность confirmed hit
  feedback; поведение покрыто unit-тестами. Phase harness сохраняет
  authoritative/runtime phase и VFX roles в browser audit report.
- [ ] Checkpoint: VFX читаемы и выдерживают mobile FPS budget. Узкий frontend
  capture и live WebSocket shell прошли без ошибок/overflow, но это не FPS-
  профиль реального телефона; нужен device/low-end performance pass.

## Phase 4 — monsters and camps

> Не блокирует первый PvP/retention release. Начинать после human gate первого
> Kaze + Brock slice.

- [x] Описать минимальный canonical `MonsterCamp` contract: stable `campId`,
  `kind`, spawn point и `territoryRadius` проходят через карту и respawn.
- [x] Убрать production-random solo spawn: battle-royale публикует 8 authored
  solo camps; случайность оставлена только внутри authored patrol.
- [x] Реализовать Пепельного гончего с charge/telegraph/miss-vulnerability.
- [x] Реализовать Корневого стража с ranged zone/territory/escape window.
- [x] Передать `campId/kind/territory/state` в snapshot и renderer; minimap
  показывает authored camp markers, территории и danger pulse.
- [x] Разместить 6–8 camps с внешними и contested территориями: authored map
  contract содержит 8 стабильных camp points; PvP-contact checkpoint остаётся
  отдельной human/scenario проверкой.
- [ ] Checkpoint: camp loop понятен, deterministic и провоцирует PvP-контакт.

## Phase 5 — proof and release

### T5.0 — All-hero completion matrix

**Depends on:** T5.5, T6, T7. **Likely files:** all hero contracts, runtime
kit/renderer paths, focused scenario tests, browser QA captures.

- [x] Needle: root/spore setup, escape dash, anti-heal и readable delayed
  impact покрыты kit/scenario/effect-contract tests; live miss/interrupt/re-entry
  остаются внешней проверкой.
- [x] Mandy: focus/charge, дальний Super wave, stance gadget и punish за
  потерю позиции покрыты kit/scenario/effect-contract tests; agency во время
  charge остаётся human gate.
- [x] Kaze: dash entry, hit-confirmed follow-up, stealth/crit payoff и
  наказание за промах покрыты kit/scenario/effect-contract tests; close-range
  feel остаётся human gate.
- [x] Brock Zeus: projectile/splash, lightning strike windows, beam/trail
  gadget и directional lane покрыты kit/scenario/effect-contract tests; dodge
  между ударами остаётся live gate.
- [x] Wukong Mico: staff contact, leap/pull, stone armor/rage conversion и
  vortex покрыты kit/scenario/effect-contract tests; risk/reward остаётся
  human gate.
- [x] Persephone Lumi: orb/flower setup, root control, garden detonation и
  sustain покрыты prerequisite-aware kit/scenario/effect-contract tests;
  setup → payoff readability остаётся human gate.
- [x] Katty: spray direction, paint stacks, puddle/cloud control и flight
  покрыты kit/scenario/effect-contract tests; stack/payoff readability остаётся
  human gate.
- [x] Fairy Mina: directed star attack, mark detonation, shield/healing aura
  и peel/support contribution покрыты kit/scenario/effect-contract tests;
  contribution clarity остаётся human gate.
- [x] Для каждого героя заполнена единая combat card: timestamps, source/target,
  hit/miss/interrupt, target reaction, VFX/audio/camera/input и ссылка на
  focused test; mobile capture выполнен на frontend harness 360×740, но
  low/mid-device FPS остаётся release gate.
- [x] Automated acceptance отклоняет hero effects без distinct composition,
  authoritative phase или VFX roles; human review по принципу «не украшенный
  Basic / понятная угроза без wiki» остаётся обязательной.

**Verification:** matrix 8×3 actions × solo/team, focused Go/frontend tests,
live browser capture и human clarity review; release блокируется при любом
герое без полного набора.

> Automated subgate выполнен для всех 8 героев: 51 hero effect capture и
> phase-aware runtime report. Manual solo/team, miss/interrupt/re-entry,
> mobile-FPS и human clarity остаются обязательной частью release gate.

> Automated re-entry subgate теперь также выполнен для всех 8 героев:
> `TestScenarioPackEveryHeroReentersAfterStunRecovery` проверяет rejection под
> stun, отсутствие resource loss и возврат Gadget/Basic после recovery. Это не
> заменяет ручную проверку читаемости miss/interrupt в настоящем бою.

- [x] Автоматизированная часть scenario matrix покрывает 8 героев в solo/team
  skill outcome, Super visual timeline и отдельный gadget authority setup/payoff;
  оба новых monsters имеют deterministic behavior/recovery tests. Полная live
  solo/team/PvE контактная матрица и human clarity остаются release gate.
- [ ] Сопоставить telemetry с human playtest notes.
- [x] Пройти frontend/backend/catalog/profile validators, build и focused browser QA.
- [ ] Выполнить staged rollout и rollback drill для Combat 2.0 profile.
- [ ] Финальный gate: human clarity sign-off, release candidate и `git diff --check`.

## Детальные implementation cards

### T1 — Combat moment contract

**Depends on:** Phase 0, T0.9–T0.11. **Likely files:** `docs/combat-profile.json`,
`battle/model/game/protocol.go`, `frontend/src/components/BattleGame/rendering/combat/combatEffectPhase.js`.

- [x] Описать canonical runtime phases `intent/cast/telegraph/active/impact/status/recovery`;
  legacy `read/anticipation/release/payoff` aliases нормализуются в renderer.
- [x] Передавать authoritative effect `createdAt/expiresAt`, `phase` и `effectKind`,
  а hit/ability events несут server `Ts` и не вычисляются из render tick.
- [x] Связать effect с `commandId/sourceId/targetId/abilityId`, чтобы target
  reaction и hit/miss не восстанавливались по эвристике renderer.
- [ ] Принять response-window guardrails и role/mode/accuracy TTK distributions;
  не фиксировать одну универсальную TTK-цифру.
- [x] Описать input buffer/cancel policy и момент возврата управления после
  recovery: 140ms basic buffer, authoritative cast cancel и recovery outcome.

**Verification:** schema/profile validator, deterministic event timeline, snapshot replay.

### T1.5 — Combat rhythm, camera and audio contract

**Depends on:** T1. **Likely files:** `CameraRig.js`, `combatFeedback.js`, audio
entry points, touch input handlers, scenario telemetry.

- [x] Описать состояния `approach/poke/commit/clash/clutch/disengage/reset` и
  разрешённые переходы: `approach → poke → commit → clash`; успешный hit
  ведёт в `clutch` или `reset`, полученный pressure — в `disengage`, а
  безопасная дистанция/готовый ресурс возвращают в `approach` или `poke`.
  Запрещённый переход — из `approach` сразу в lethal без читаемого cast/
  telegraph/response window; фактический pacing всё ещё проверяется live.
- [x] Зафиксировать input-to-fire budget, camera look-ahead/deadzone и cap для
  additive trauma; shake/hit-stop не меняют simulation. Camera look-ahead и
  dead-zone покрыты renderer tests, basic input buffer — mobile input test.
- [x] Зафиксировать audio buses, priority, hit/ability/danger variants и
  reduced-motion/reduced-flash/reduced-audio поведение; authoritative event/effect
  dedupe и danger cues покрыты audio tests. Реальный device mix/ducking остаётся
  внешним release gate.

**Verification:** live duel capture показывает действие каждые несколько секунд,
ввод не теряется, звук/камера подтверждают тот же authoritative event.

### T2 — Pooled VFX primitives

**Depends on:** T1. **Likely files:** `frontend/src/components/BattleGame/rendering/combat/EffectRenderer.js`,
`ProjectileRenderer.js`, новый `combatVfxProfiles.js`.

- [x] Собрать runtime-набор переиспользуемых primitives: directional ribbon,
  expanding ring, burst shards, trail, ground field, beam/tether и status/HUD
  markers; конкретные compositions собираются из этих семейств, а не из
  ring-only заглушки.
- [x] Добавить bounded pool/TTL/reset lifecycle; завершённые effect meshes
  переиспользуются по `kind/radius/color`, geometry/material не создаются на
  каждом повторном trigger. Есть regression на повторное использование.
- [x] Убрать ring-only fallback для известных ability kinds; hero visual contract
  и browser audit проверяют отдельные compositions, generic fallback оставлен
  только для неизвестного legacy kind.

**Verification:** effect harness, repeated trigger without duplicate children,
performance audit на mobile viewport.

### T3 — Hit/kill feel

**Depends on:** T1–T2. **Likely files:** `CombatFeedbackRenderer.js`, `combatFeedback.js`,
`CameraRig.js`, `GLBHeroController.js`.

- [x] Настроить routine/ability/super feedback tiers.
- [x] Добавить hit reaction, visual squash/stretch, recoil, contact burst,
  damage number, hit-stop и capped camera trauma.
- [x] Проверить, что feedback идёт только по confirmed event и не меняет collider.
- [x] Связать hit reaction/knockback/stagger с authoritative outcome; после
  recovery игрок должен снова получить управление и шанс на re-entry.
- [x] Убедиться, что feedback создаёт ощущение веса, но не превращает каждый hit
  в длинный animation lock.

**Verification:** один event = один feedback bundle; snapshot dedupe; QA повторного
попадания, recovery и повторного входа.

### T4 — Hero ability timing cards

**Depends on:** T1–T3. **Likely files:** `heroesConfig.js`, `heroSkills.js`,
`GLBHeroController.js`, `tools/blender/hero_skill_animation_semantics.json`.

- [x] Заполнить timing/telegraph/impact/recovery card для каждого Basic/Super/Gadget
  в `docs/hero-combat-contracts.json`; validator проверяет все 8 × 3 cards.
- [x] Развести Basic/Gadget/Super по silhouette, hue, hot core, sound и feedback
  tier через hero-specific effect families и shared feedback tiers.
- [ ] Сверить active frame GLB с серверным impact; отдельно проверить miss/cancel.

**Verification:** visual timeline harness и Blender semantic validators.

### T5 — Kaze action reel

**Depends on:** T4. **Likely files:** Kaze kit/config, `EffectRenderer.js`,
`GLBHeroController.js`, focused browser QA.

- [x] Автоматизированно показать dash charge, ribbon trail, entry impact,
  reset-on-kill и punish window через Kaze kit, timeline и counter-role tests.
- [x] Сделать промах визуально отличимым от успешного попадания через отдельный
  miss resolution и impact/telegraph contracts.
- [x] Проверить automated combo/accuracy на 30/60/100% и escape после неудачного
  входа; human feel остаётся release gate.

**Verification:** solo duel, team fight, screenshot timeline, no duplicate effects.

### T5.5 — First PvP vertical-slice gate

**Depends on:** T5, T7. **Likely files:** live scenario pack, QA capture scripts,
playtest report.

- [ ] Сравнить current vs new Kaze + Brock в одинаковой карте, дистанции и
  accuracy profile.
- [ ] Проверить five-second readability: кто начал, куда уйти, почему попал,
  когда можно войти снова, почему умер игрок.
- [ ] Провести минимум пять human playtests и записать interest, clarity,
  perceived agency, fair-death и next-match intent.
- [ ] Заблокировать расширение на controller/support/monsters, если slice не
  проходит gate.

**Verification:** подписанный before/after report; решение «масштабировать или
вернуться к ритму/вводу/телеграфу» принято по данным.

### T6 — Controller/support action reel

**Depends on:** T4. **Likely files:** Needle/Katty/Mina kits/config, `EffectRenderer.js`,
`BattleGameUI.jsx`, `BattleGame.css`.

- [x] Zone имеет telegraph, boundary, active pulse, timer и exit readability в
  authoritative visual timeline и browser effect audit.
- [x] Ally heal/shield и enemy damage/control используют разные shapes/colors;
  это закреплено hero visual contracts.
- [x] HUD показывает cast/ready/cooldown/status без перекрытия поля боя; mobile
  button/viewport contracts покрыты frontend tests.

**Verification:** tester отвечает «что делает ability / куда выйти / кого спасает» без текста документа.

### T7 — Mobile HUD and camera pass

**Depends on:** T3, T6. **Likely files:** `BattleGameUI.jsx`, `BattleGame.css`,
`CameraRig.js`, mobile browser QA.

- [x] Добавить ready pulse, cast lock, cooldown radial/text и status priority;
  кнопки Super/Gadget и attack stick используют authoritative readiness.
- [x] Ограничить overlay flash, shake и damage numbers safe area/visibility
  budget; reduced-motion/reduced-flash contracts покрыты tests.
- [x] Добавить reduced-flash/reduced-shake preference через OS
  `prefers-reduced-motion` и безопасные local preference flags.

**Verification:** 360px mobile viewport, touch input during feedback, no input blocking.

### T8 — MonsterCamp data contract

**Depends on:** Phase 0. **Likely files:** `battle/model/gamemap/gamemap.go`,
canonical map source, `battle/model/game/resource_topology.go`, `protocol.go`.

- [x] Ввести минимальный `MonsterCamp` contract с `id/kind/territory/spawnPoint`
  и lifecycle metadata; reward/waypoints остаются расширением следующего slice.
- [x] Синхронизировать camp markers, collision, minimap и topology report.
- [x] Убрать production-random solo spawn; оставить deterministic patrol внутри camp.

**Verification:** seed replay, sector symmetry, reachability/LOS/clearance report.

### T9 — Пепельный гончий

**Depends on:** T8. **Likely files:** `battle/model/monster`, `battle/model/game/game.go`,
monster protocol/renderer, tests.

- [x] Реализовать patrol/notice/charge/strike/recovery/leash.
- [x] Дать audible/visible charge telegraph и miss-vulnerability.
- [x] Добавить distinct model silhouette, ember trail, hit/death feedback;
  camp reward остаётся отдельным economy slice.

**Verification:** deterministic AI tests, dodge/interrupt scenarios, browser visual audit.

### T10 — Корневой страж

**Depends on:** T8. **Likely files:** `battle/model/monster`, `game.go`, `EffectRenderer.js`,
`MonsterRenderer.js`, tests.

- [x] Реализовать ranged root/spore zone с ограниченным TTL и escape window.
- [x] Сделать territory readable на земле и на minimap, без permanent choke.
- [x] Добавить уязвимое recovery после cast и отдельный impact/status effect;
  Root Guardian теперь публикует `root_guardian_recovery` с authoritative
  recovery/vulnerability window.

**Verification:** zone boundary vs authoritative hitbox, clear time, damage taken,
camp contest scenario.

### T11 — Camp pacing and PvP contest

**Depends on:** T8–T10. **Likely files:** canonical map, `resource_topology.go`,
bot utility/telemetry, map/monster QA.

- [x] Разместить 6–8 camp’ов: battle-royale и team maps публикуют по 8
  стабильных точек; contested/contact pacing требует human gate.
- [x] Задать deterministic spawn/respawn timing и bounded reward loop: authored
  camps, 20s respawn, TTL/active-cap для reward; бесконечный farm ограничен.
- [x] Научить team bots оценивать camp risk, retreat, contest и focus
  monster/player; decision/role telemetry и regression tests добавлены.

**Verification:** camp contact timing, PvP contacts, reward claim fairness, no blocked corridors.

### T12 — Full proof and rollout

**Depends on:** T5.5, T6–T11. **Likely files:** scenario reports, validators, QA scripts,
release profile.

- [x] Прогнать воспроизводимую часть 8 heroes × solo/team × skill/gadget/super
  PvP/PvE-style scenarios; live contact matrix остаётся открытой.
- [ ] Сравнить before/after TTK, response windows, skill-assisted kills и human clarity.
- [ ] Сравнить downtime, deaths without telegraph, input latency, escape/re-entry,
  audio/camera feedback latency и next-match intent.
- [x] Выполнить frontend/backend tests, build и visual QA; результаты зафиксированы
  в текущей verification-секции.
- [ ] Выполнить staged rollout и rollback drill для Combat 2.0 profile.

**Verification:** signed playtest report, release candidate, `git diff --check`.
