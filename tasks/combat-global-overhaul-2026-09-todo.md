# Combat 2.0 — checklist

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

- [ ] Сопоставить каждый `effectKind` с source, target, phase, TTL и owning event.
- [ ] Найти эффекты, где shared ring/glow скрывает направленную gameplay-семантику.
- [ ] Найти места, где fixed `.42` Basic window или procedural fallback расходятся
  с authoritative release/impact.
- [ ] Расширить QA от проверки существования mesh до capture timeline и target reaction.

**Verification:** visual causality report для всех текущих hero effects и bat
lifecycle; ни одного известного effect kind без phase/impact assertion.

### T0.9 — Research cutoff and first-slice scope

**Depends on:** T0.5–T0.8. **Likely files:** this plan, playtest scenario pack,
first combat profile revision.

- [ ] Зафиксировать reference matrix: что берём у Brawl Stars, MLBB, Honor of
  Kings и Pokémon UNITE, а что сознательно не переносим.
- [ ] Заморозить первый доказательный scope: одна карта, один режим, Kaze и
  Brock; Mandy/Mico, controller и support не блокируют первый PvP gate.
- [ ] Перевести TTK из универсальной цели в role/mode/accuracy distributions;
  добавить death-without-telegraph и meaningful-action downtime.
- [ ] Записать критерий перехода от исследования к прототипу: одинаковый live
  сценарий before/after и human playtest, а не новый список ссылок.

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

- [ ] Составить таблицу для каждого Basic/Super/Gadget: cast, release, active,
  impact, recovery, miss, interrupt, target reaction и current renderer path.
- [x] Отдельно зафиксировать immediate-resolution abilities: Kaze Super и Mico
  Super переведены из cosmetic/immediate path в authoritative telegraph → impact.
- [ ] Проверить, какие события имеют source/target/command correlation, а какие
  renderer вынужден угадывать по `effectKind` и позиции.
- [ ] Не менять баланс до завершения карты разрывов: сначала доказать, где
  ломается причинность, затем выбирать server/runtime/UI fix.

**Verification:** один gap report на 8 героев; у каждого навыка есть одно решение
«оставить instant», «добавить telegraph» или «добавить active/recovery».

## Phase 1 — combat pacing

- [ ] Добавить scenario pack для 60%/30% accuracy, response window и escape/re-entry.
- [ ] Проверить ритм `approach/poke/commit/clash/clutch/reset`: нет 3–4 секунд
  без meaningful action или понятной причины отступления.
- [ ] Настроить cadence/reload/HP через CombatProfile, без hardcoded multipliers.
- [ ] Проверить recovery, cast cancel/interrupt, movement lock и respawn resource policy.
- [ ] Проверить soft-survival: hit reaction, displacement, recovery action и
  `respawnToActionMs`/`escapeToReentryMs`, не увеличивая HP вслепую.
- [ ] Пройти Kaze + Brock duel и отдельно проверить ranged/controller trade.
- [ ] Checkpoint: нет необъяснимого full-health delete; TTK читается по
  role/mode/accuracy, а не одной общей цифрой.

## Phase 2 — skill-driven slices

- [ ] Сначала Kaze + Brock: entry → spacing/cover → combo → reset/punish → re-entry.
- [ ] После gate добавить Mandy или Mico как close-range matchup.
- [ ] Needle или Katty: zone/mark/root → counterplay.
- [ ] Fairy Mina: support/peel/shield → team outcome.
- [ ] Для каждого slice связать server event, phase, GLB animation, VFX/SFX, HUD и QA.
- [ ] Не добавлять controller/support в обязательный первый gate, пока не пройден
  melee/ranged slice.
- [ ] Checkpoint: human tester видит win condition, ответ противника, момент
  re-entry и причину проигрыша без wiki.

## Phase 3 — visual combat pass

- [x] Shared hit event now drives directional burst, target squash/stretch,
  camera shake and a short visual hit-stop without freezing server simulation.
- [ ] Ввести/проверить phase markers `intent/cast/telegraph/active/impact/status/recovery`.
- [ ] Настроить feedback tiers, camera punch, hit-stop, hit reaction и damage readout.
- [x] Добавить базовый audio pass: decibel Master/hit/ability/danger buses,
  tiered hit cues, throttling и pitch variation; real-device mix/ducking review
  остаются release gate.
- [ ] Проверить camera look-ahead/deadzone, additive shake и отсутствие скрытия
  telegraph/arena; feedback не должен менять authoritative position.
- [ ] Проверить touch input-to-fire, input buffer и cancel/recovery на 360px viewport.
- [ ] Сделать visual cards для восьми героев.
- [ ] Добавить reduced-flash/reduced-shake и debug phase harness.
- [ ] Checkpoint: VFX читаемы и выдерживают mobile FPS budget.

## Phase 4 — monsters and camps

> Не блокирует первый PvP/retention release. Начинать после human gate первого
> Kaze + Brock slice.

- [x] Описать минимальный canonical `MonsterCamp` contract: stable `campId`,
  `kind`, spawn point и `territoryRadius` проходят через карту и respawn.
- [ ] Убрать production-random solo spawn; оставить случайность только внутри authored patrol.
- [x] Реализовать Пепельного гончего с charge/telegraph/miss-vulnerability.
- [x] Реализовать Корневого стража с ranged zone/territory/escape window.
- [x] Передать `campId/kind/territory/state` в snapshot и renderer; minimap
  показывает authored camp markers, территории и danger pulse.
- [ ] Разместить 6–8 camps с внешними и contested территориями.
- [ ] Checkpoint: camp loop понятен, deterministic и провоцирует PvP-контакт.

## Phase 5 — proof and release

### T5.0 — All-hero completion matrix

**Depends on:** T5.5, T6, T7. **Likely files:** all hero contracts, runtime
kit/renderer paths, focused scenario tests, browser QA captures.

- [ ] Needle: root/spore setup, escape dash, anti-heal и readable delayed
  impact; подтвердить miss/interrupt/re-entry.
- [ ] Mandy: focus/charge, дальний Super wave, stance gadget и punish за
  потерю позиции; подтвердить сохранение agency во время charge.
- [ ] Kaze: dash entry, hit-confirmed follow-up, stealth/crit payoff и
  наказание за промах; подтвердить close-range response window.
- [ ] Brock Zeus: projectile/splash, три lightning strike окна, beam/trail
  gadget и directional lane; подтвердить dodge между ударами.
- [ ] Wukong Mico: staff contact, leap/pull, stone armor/rage conversion и
  vortex; подтвердить risk/reward и отсутствие бесплатной неуязвимости.
- [ ] Persephone Lumi: orb/flower setup, root control, garden detonation и
  sustain; подтвердить readable setup → payoff и counterplay.
- [ ] Katty: spray direction, paint stacks, puddle/cloud control и flight;
  подтвердить видимость stack/payoff и безопасное возвращение.
- [ ] Fairy Mina: directed star attack, mark detonation, shield/healing aura
  и поддержка команды; подтвердить contribution через peel/support, а не
  только урон.
- [ ] Для каждого героя заполнить одну и ту же combat card: timestamps,
  source/target, hit/miss/interrupt, target reaction, VFX/audio/camera/input,
  low/mid mobile result и ссылку на focused test.
- [ ] Не принимать героя, если его Super/Gadget выглядит как украшенный Basic,
  если вся реакция — универсальное кольцо, или если без wiki невозможно
  понять угрозу и ответ.

**Verification:** matrix 8×3 actions × solo/team, focused Go/frontend tests,
live browser capture и human clarity review; release блокируется при любом
герое без полного набора.

- [ ] Прогнать полный scenario matrix для 8 героев, solo/team и двух новых monsters.
- [ ] Сопоставить telemetry с human playtest notes.
- [ ] Пройти frontend/backend/catalog/profile validators, build и focused browser QA.
- [ ] Выполнить staged rollout и rollback drill для Combat 2.0 profile.
- [ ] Финальный gate: human clarity sign-off, release candidate и `git diff --check`.

## Детальные implementation cards

### T1 — Combat moment contract

**Depends on:** Phase 0, T0.9–T0.11. **Likely files:** `docs/combat-profile.json`,
`battle/model/game/protocol.go`, `frontend/src/components/BattleGame/rendering/combat/combatEffectPhase.js`.

- [ ] Описать event phases `read/anticipation/release/active/impact/payoff/recovery`.
- [ ] Передавать authoritative cast/impact timestamps и `effectKind`, не вычислять их из render tick.
- [ ] При необходимости связать effect с `commandId/sourceId/targetId/abilityId`,
  чтобы target reaction и hit/miss не восстанавливались по эвристике renderer.
- [ ] Принять response-window guardrails и role/mode/accuracy TTK distributions;
  не фиксировать одну универсальную TTK-цифру.
- [ ] Описать input buffer/cancel policy и момент возврата управления после recovery.

**Verification:** schema/profile validator, deterministic event timeline, snapshot replay.

### T1.5 — Combat rhythm, camera and audio contract

**Depends on:** T1. **Likely files:** `CameraRig.js`, `combatFeedback.js`, audio
entry points, touch input handlers, scenario telemetry.

- [ ] Описать состояния `approach/poke/commit/clash/clutch/disengage/reset` и
  разрешённые переходы.
- [ ] Зафиксировать input-to-fire budget, camera look-ahead/deadzone и cap для
  additive trauma; shake/hit-stop не меняют simulation.
- [ ] Зафиксировать audio buses, priority/ducking, hit/ability/danger variants и
  reduced-motion/reduced-flash/reduced-audio поведение.

**Verification:** live duel capture показывает действие каждые несколько секунд,
ввод не теряется, звук/камера подтверждают тот же authoritative event.

### T2 — Pooled VFX primitives

**Depends on:** T1. **Likely files:** `frontend/src/components/BattleGame/rendering/combat/EffectRenderer.js`,
`ProjectileRenderer.js`, новый `combatVfxProfiles.js`.

- [ ] Собрать переиспользуемые primitives: directional ribbon, expanding ring,
  burst shards, trail, ground decal, tether, status badge.
- [ ] Добавить pool/TTL/reset lifecycle; не создавать geometry/material на каждом кадре.
- [ ] Убрать ring-only fallback для известных ability kinds.

**Verification:** effect harness, repeated trigger without duplicate children,
performance audit на mobile viewport.

### T3 — Hit/kill feel

**Depends on:** T1–T2. **Likely files:** `CombatFeedbackRenderer.js`, `combatFeedback.js`,
`CameraRig.js`, `GLBHeroController.js`.

- [ ] Настроить routine/ability/super feedback tiers.
- [ ] Добавить hit reaction, visual squash/stretch, recoil, contact burst,
  damage number, hit-stop и capped camera trauma.
- [ ] Проверить, что feedback идёт только по confirmed event и не меняет collider.
- [ ] Связать hit reaction/knockback/stagger с authoritative outcome; после
  recovery игрок должен снова получить управление и шанс на re-entry.
- [ ] Убедиться, что feedback создаёт ощущение веса, но не превращает каждый hit
  в длинный animation lock.

**Verification:** один event = один feedback bundle; snapshot dedupe; QA повторного
попадания, recovery и повторного входа.

### T4 — Hero ability timing cards

**Depends on:** T1–T3. **Likely files:** `heroesConfig.js`, `heroSkills.js`,
`GLBHeroController.js`, `tools/blender/hero_skill_animation_semantics.json`.

- [ ] Заполнить timing/telegraph/impact/recovery card для каждого Basic/Super/Gadget.
- [ ] Развести Basic/Gadget/Super по silhouette, hue, hot core, sound и feedback tier.
- [ ] Сверить active frame GLB с серверным impact; отдельно проверить miss/cancel.

**Verification:** visual timeline harness и Blender semantic validators.

### T5 — Kaze action reel

**Depends on:** T4. **Likely files:** Kaze kit/config, `EffectRenderer.js`,
`GLBHeroController.js`, focused browser QA.

- [ ] Показать dash charge, ribbon trail, entry impact, reset-on-kill и punish window.
- [ ] Сделать промах визуально отличимым от успешного попадания.
- [ ] Проверить combo на 30/60/100% accuracy и escape после неудачного входа.

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

- [ ] Zone имеет telegraph, boundary, active pulse, timer и exit readability.
- [ ] Ally heal/shield и enemy damage/control используют разные shapes/colors.
- [ ] HUD показывает cast/ready/cooldown/status без перекрытия поля боя.

**Verification:** tester отвечает «что делает ability / куда выйти / кого спасает» без текста документа.

### T7 — Mobile HUD and camera pass

**Depends on:** T3, T6. **Likely files:** `BattleGameUI.jsx`, `BattleGame.css`,
`CameraRig.js`, mobile browser QA.

- [ ] Добавить ready pulse, cast lock, cooldown radial/text и status priority.
- [ ] Ограничить overlay flash, shake и damage numbers safe area/visibility budget.
- [ ] Добавить reduced-flash/reduced-shake preference.

**Verification:** 360px mobile viewport, touch input during feedback, no input blocking.

### T8 — MonsterCamp data contract

**Depends on:** Phase 0. **Likely files:** `battle/model/gamemap/gamemap.go`,
canonical map source, `battle/model/game/resource_topology.go`, `protocol.go`.

- [ ] Ввести `MonsterCamp` с `id/kind/territory/spawnPoint/waypoints/reward/respawn`.
- [ ] Синхронизировать camp markers, collision, minimap и topology report.
- [ ] Убрать production-random solo spawn; оставить deterministic patrol внутри camp.

**Verification:** seed replay, sector symmetry, reachability/LOS/clearance report.

### T9 — Пепельный гончий

**Depends on:** T8. **Likely files:** `battle/model/monster`, `battle/model/game/game.go`,
monster protocol/renderer, tests.

- [ ] Реализовать patrol/notice/charge/strike/recovery/leash.
- [ ] Дать audible/visible charge telegraph и miss-vulnerability.
- [ ] Добавить distinct model silhouette, ember trail, hit/death feedback и camp reward.

**Verification:** deterministic AI tests, dodge/interrupt scenarios, browser visual audit.

### T10 — Корневой страж

**Depends on:** T8. **Likely files:** `battle/model/monster`, `game.go`, `EffectRenderer.js`,
`MonsterRenderer.js`, tests.

- [ ] Реализовать ranged root/spore zone с ограниченным TTL и escape window.
- [ ] Сделать territory readable на земле и на minimap, без permanent choke.
- [ ] Добавить уязвимое recovery после cast и отдельный impact/status effect.

**Verification:** zone boundary vs authoritative hitbox, clear time, damage taken,
camp contest scenario.

### T11 — Camp pacing and PvP contest

**Depends on:** T8–T10. **Likely files:** canonical map, `resource_topology.go`,
bot utility/telemetry, map/monster QA.

- [ ] Разместить 6–8 camp’ов: внешние обучающие и 1–2 центральных contested.
- [ ] Задать spawn/respawn timing и tension curve; не создавать бесконечный farm.
- [ ] Научить bots оценивать camp risk, retreat, contest и focus monster/player.

**Verification:** camp contact timing, PvP contacts, reward claim fairness, no blocked corridors.

### T12 — Full proof and rollout

**Depends on:** T5.5, T6–T11. **Likely files:** scenario reports, validators, QA scripts,
release profile.

- [ ] Прогнать 8 heroes × solo/team × PvP/PvE scenarios.
- [ ] Сравнить before/after TTK, response windows, skill-assisted kills и human clarity.
- [ ] Сравнить downtime, deaths without telegraph, input latency, escape/re-entry,
  audio/camera feedback latency и next-match intent.
- [ ] Выполнить frontend/backend tests, build, visual QA, staged rollout и rollback drill.

**Verification:** signed playtest report, release candidate, `git diff --check`.
