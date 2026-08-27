# Todo: Большая переработка героев

> Архивный список исходного design draft. Исполняемый checklist находится в
> `tasks/combat-audit-2026-08-todo.md`; значения и статусы этого файла не надо
> использовать для реализации или rollout.

## Phase 0 — контракт и фундамент

- [ ] Зафиксировать трактовку Brock Super timings: абсолютные 0.7/1.1/1.5s или интервалы.
- [ ] Зафиксировать правило Kaze третьего удара: armor penetration или missing-HP damage.
- [ ] Зафиксировать, разрешено ли Mandy двигаться во время 800ms Super wind-up.
- [ ] Обновить Go balance source и `heroAttackConfigs` стартовыми значениями.
- [ ] Добавить общие periodic damage/heal helpers с защитой от двойного тика.
- [ ] Добавить status helpers: slow, stun, reveal, blind, anti-heal, cleanse.
- [ ] Добавить collision-aware pull/dash, shield и wall-break helpers.
- [ ] Добавить combat matrix и deterministic balance scenarios.
- [ ] Проверить, какие новые поля нужны в `player.Player` и room snapshot.

## Needle

- [ ] Перевести Super на 300ms cast, initial 40 damage и pull.
- [ ] Добавить root zone 3s, 15 damage/500ms, slow 60%.
- [ ] Добавить Basic anti-heal 50%/2s.
- [ ] Заменить gadget heal-zone на 6m dash + spore cloud.
- [ ] Реализовать spore stacks 1/3 и stun на третьем.
- [ ] Обновить Needle effect phases, status marker и descriptions.
- [ ] Добавить Go tests для telegraph, pull, ticks, anti-heal и stacks.
- [ ] Добавить frontend contract/browser assertions для root/cloud readability.

## Mandy

- [ ] Установить HP 700 и basic damage 100.
- [ ] Настроить Focus: 2s stillness, 150 damage, range ×1.3, stun 800ms.
- [ ] Перевести Super на 800ms, shield 30% HP, stun 1.2s, wall break.
- [ ] Добавить Gadget heal 10% max HP после empowered hit.
- [ ] Ограничить суммарные Focus/Gadget multipliers cap 2.0×.
- [ ] Обновить Focus/shield/wave telegraphs и HUD.
- [ ] Обновить Go tests для timing, shield window, heal и multiplier cap.

## Fairy Mina

- [ ] Установить HP 650 и star damage 55.
- [ ] Добавить self-heal 5 за каждую попавшую звезду.
- [ ] Перевести mark payoff на третий hit: 80 AoE/radius 100 + slow 1s.
- [ ] Сделать Super self-only: shield 500/4s, aura radius 180.
- [ ] Добавить aura self-heal 15/500ms и enemy damage 10/500ms.
- [ ] Переписать Gadget на radius 150, damage 30, knockback, cleanse.
- [ ] Удалить из каталога/frontend обещание ally-targeted Super.
- [ ] Добавить Go tests для star count, aura ticks, self-only shield и cleanse.

## Brock Zeus

- [ ] Установить HP 600, damage 85, basic splash radius 80.
- [ ] Перенастроить три strikes на 80/80/120 и radius 70/70/110.
- [ ] Разрушать стены на каждом strike.
- [ ] Добавить slow 40%/1s после каждого strike.
- [ ] Зафиксировать и реализовать выбранную timing semantics.
- [ ] Усилить Gadget fire trail: 3s, 5 damage/500ms.
- [ ] Синхронизировать LightningStrike payload с frontend telegraph.
- [ ] Добавить Go tests для timing, damage tiers, wall breaks, slow и fire ticks.

## Kaze

- [ ] Установить HP 650, сохранить speed 16 и damage 85.
- [ ] Реализовать third-hit armor/missing-HP payoff по выбранному правилу.
- [ ] Добавить Super kill reset только при смерти цели от dash.
- [ ] Добавить haste +20%/2s после успешного dash.
- [ ] Настроить Super stun 1s и deduplicate targets per dash.
- [ ] Настроить Gadget stealth 3s и first-hit crit +100%.
- [ ] Добавить snapshot/HUD для crit-ready, haste и reset.
- [ ] Добавить Go tests для reset, miss, multi-target dash и stealth crit.

## Wukong Mico

- [ ] Установить speed 14, сохранить HP 900/damage 100.
- [ ] Добавить Super initial impact 50.
- [ ] Реализовать collision-aware pull 30% во время vortex.
- [ ] Сохранить Rage scaling duration/radius и Mico heal 1/tick.
- [ ] Перевести Stone Armor на reduction 60%/4s и stored cap 240.
- [ ] Добавить timeout/cap explosion 80/radius 140 и до 4 Rage.
- [ ] Защитить explosion от двойного срабатывания.
- [ ] Обновить armor meter, vortex pull visual и rage payoff.
- [ ] Добавить Go tests для pull, heal, cap, timeout и explosion.

## Persephone Lumi

- [ ] Установить HP 680, basic damage 60, projectile range 520.
- [ ] Перевести authoritative Basic с melee sector на `lumi_orb` projectile.
- [ ] Создавать flower on hit/end-of-path, radius 70, max 5.
- [ ] Добавить flower damage 15/500ms на 6s + slow/reveal.
- [ ] Настроить Super impact 60 + stun 1s после 600ms.
- [ ] Сохранить garden slow 60%/6.6s и single-entry impact semantics.
- [ ] Добавить Gadget heal 10 per destroyed object, cap 50.
- [ ] Обновить `heroesConfig`, aim/projectile renderer и catalog.
- [ ] Добавить Go tests, что Basic больше не melee и zones detonates once.
- [ ] Добавить browser QA для projectile, flower, garden и seedburst.

## Katty

- [ ] Установить basic damage 55 и splash radius 65.
- [ ] Добавить Super pull 25% на 500ms.
- [ ] Сохранить impact 70, 3 layers, stun 1s, blind 2.5s.
- [ ] Сохранить puddle 12/600ms, slow 80%, duration 7.5s.
- [ ] Добавить trail trigger explosion 40 damage + 2 layers.
- [ ] Дедуплицировать repeated contact per trail segment.
- [ ] Обновить paint/pull/blind/trail effect phases.
- [ ] Добавить Go tests для radius, pull, ticks, blind и trail trigger.
- [ ] Проверить mobile readability и priority tiers.

## Cross-cutting frontend and catalog

- [ ] Обновить `docs/hero-catalog.json` descriptions/mechanics/balance.
- [ ] Обновить `frontend/src/components/BattleGame/heroesConfig.js` fallback.
- [ ] Обновить `statusEffects.js` для anti-heal, spore, shield, blind, flower и armor.
- [ ] Обновить `combatEffectPhase.js` и `EffectRenderer.js` для новых effect kinds.
- [ ] Добавить phase-aware effect contract tests.
- [ ] Обновить ability button/HUD copy и counterplay hints.
- [ ] Проверить payload size новых snapshot fields.

## Checkpoints

- [ ] Checkpoint A: helpers + matrix + catalog validator.
- [ ] Checkpoint B: Needle/Lumi/Mina ranged and zone browser QA.
- [ ] Checkpoint C: Mandy/Kaze/Mico melee scenarios and browser QA.
- [ ] Checkpoint D: Brock/Katty destruction/space scenarios and mobile QA.

## Final verification

- [ ] `cd battle; go test ./...`
- [ ] `cd frontend; npm test`
- [ ] `cd frontend; npm run build`
- [ ] `python tools/validate_hero_catalog.py`
- [ ] Focused browser QA through `tools/qa/playwright-runner.cjs`.
- [ ] Проверить закрытие task-owned Playwright/Chrome процессов.
- [ ] `git diff --check`
