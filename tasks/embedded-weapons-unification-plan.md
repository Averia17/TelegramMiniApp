# План: отказ от detached weapon assets

## Цель

Сделать один самодостаточный runtime GLB на героя: модель, rig, authored-анимации и постоянное оружие находятся в `frontend/public/assets/heroes/output_heroes/<slug>_base.glb`.

Отдельные runtime weapon assets больше не участвуют в runtime, а frontend не знает о `weaponUrl`, `weaponAttachments` и механике повторного присоединения detached-оружия.

## Статус реализации

План выполнен. Для Kaze убрано исключение fan-мешей из exporter-а; четыре вооружённых base GLB пересобраны из focused-сцен и проверены round-trip через Three.js. Runtime weapon assets и obsolete detached-equipment QA/tools удалены. `frontend/assets-source/heroes/mandy/mandy_weapon.blend` сохранён только как source-архив и не является runtime-ассетом.

## Что обнаружено

- `assetManifest.js` объявляет detached-оружие для Kaze, Persephone Lumi и Wukong Mico; Mandy уже переведена на встроенный посох.
- `AssetRegistry.js` отдельно загружает weapon GLB, удаляет совпадающие встроенные объекты и присоединяет копии к socket/grip.
- Kaze специально исключается exporter-ом из base GLB через `select_character_objects(... excluded_names=...)`, поэтому для него потребуется отдельная проверка и изменение экспортного контракта.
- `docs/hero-catalog.json`, `frontend/glb-audit.html`, runtime-контракты и grip-тесты прямо завязаны на отдельные weapon assets.
- Exporter использует `scenes/idle.blend` как источник полной геометрии, а не legacy `hero.blend`. Наличие оружия только в `hero.blend` недостаточно: его нужно подтвердить/синхронизировать в focused-сценах.

## Архитектурные решения

1. Runtime-источник постоянного оружия — base GLB героя; отдельные weapon GLB не загружаются и не подмешиваются.
2. Оружие остаётся обычным authored attachment с `attachment_role: "held-weapon"` или `"throwable-weapon"`, socket/grip marker и родительством под нужной костью/socket.
3. Временные combat visuals — снаряды, звёзды, облако Brock и другие эффекты — не считаются persistent weapon и не переносятся в этот рефакторинг без отдельного контракта.
4. `hero.blend` можно использовать как источник восстановления геометрии, но финальная проверка и экспорт выполняются через focused-сцены, существующий exporter и round-trip GLB QA.

## Задачи

### 1. Зафиксировать инвентарь и source-of-truth

**Описание:** проверить для Mandy, Kaze, Wukong Mico и Persephone Lumi наличие оружия, sockets, grip markers и attachment metadata в `scenes/idle.blend` и в каждой focused-сцене. Отдельно сравнить с `hero.blend`; не переносить слепо legacy transforms или animation keys.

**Критерии приёмки:**

- [ ] Для каждого armed hero есть таблица `mesh → grip/socket → hand/wrist bone → role`.
- [ ] В каждой focused-сцене оружие либо уже присутствует и не теряется при открытии, либо есть явный migration action из master.
- [ ] Для Kaze зафиксировано, какие объекты сейчас исключаются exporter-ом и почему.
- [ ] Проверены все остальные attachment-типы, чтобы не принять projectile/effect за persistent weapon.

**Проверка:** Blender structural audit + сохранённый JSON/текстовый отчёт до изменения exporter-а.

**Зависимости:** нет.

### 2. Встроить и экспортировать оружие в canonical base GLB

**Описание:** синхронизировать focused-сцены, если это необходимо, убрать из exporter-а исключение оружия Kaze и проверить, что exporter выбирает persistent weapon вместе с героем. Пересобрать base GLB для всех armed heroes, не меняя authored Actions.

**Критерии приёмки:**

- [ ] `kaze_base.glb`, `mandy_base.glb`, `wukong-mico_base.glb`, `persephone-lumi_base.glb` содержат свои weapon meshes.
- [ ] Оружие имеет канонический `attachment_role`, корректный socket/grip и следует за рукой во всех Actions.
- [ ] В base GLB нет дублей одного и того же weapon mesh.
- [ ] Временные `.tmp.glb` не становятся новым источником истины и не попадают в каталог как canonical assets.

**Проверка:** `python tools/blender/...` structural/quality audits, затем `npm run validate:heroes` и clean GLB re-import.

**Зависимости:** задача 1.

### 3. Удалить detached weapon runtime из frontend

**Описание:** упростить manifest и `AssetRegistry`: герой загружается одним base GLB, а embedded attachments обрабатываются теми же правилами, что уже работают для Mandy.

**Вероятные файлы:**

- `frontend/src/components/BattleGame/rendering/assets/assetManifest.js`
- `frontend/src/components/BattleGame/rendering/assets/AssetRegistry.js`
- при необходимости `frontend/src/components/BattleGame/rendering/heroes/GLBHeroController.js`

**Критерии приёмки:**

- [ ] У asset profile отсутствуют `weaponUrl` и `weaponAttachments`.
- [ ] Удалены `loadHeroWeapon`, `weaponLoads`, `attachDetachedWeapon`, `removeEmbeddedDetachedWeapons` и `DetachedHeroWeapon.*`.
- [ ] `instantiateHero()` загружает только hero GLB и optional companion GLB.
- [ ] Mandy Spawn/throwable visibility и распознавание embedded `held-weapon`/`throwable-weapon` продолжают работать.

**Проверка:** frontend unit tests, проверка load calls и runtime tree без detached wrapper.

**Зависимости:** задача 2.

### 4. Переписать тесты и QA под embedded contract

**Описание:** заменить проверки detached-загрузки проверками содержимого canonical hero GLB и удалить ложные ожидания двухфайловой сборки.

**Вероятные файлы:**

- `frontend/test/rendering-architecture.test.js`
- `frontend/test/hero-grip-assets.test.js`
- `frontend/test/kaze-animation-runtime-contract.test.js`
- `frontend/test/mandy-animation-runtime-contract.test.js`
- `frontend/scripts/validate-hero-glb.mjs`
- `frontend/glb-audit.html`
- `frontend/dynamic-equipment-qa.html` или его replacement, если страница ещё используется

**Критерии приёмки:**

- [ ] Тесты требуют weapon nodes/markers внутри соответствующего `output_heroes/*_base.glb`.
- [ ] Нет тестов, которые ожидают отдельные weapon assets, `weaponUrl` или отдельный weapon load.
- [ ] GLB audit проверяет socket → grip → geometry непосредственно в embedded runtime scene.
- [ ] Browser QA покрывает selection, spawn, attack, super, victory и defeat для всех героев с persistent weapon.

**Проверка:** `cd frontend; npm test; npm run lint; npm run build` и Playwright/WebGL smoke.

**Зависимости:** задача 3.

### 5. Обновить каталог и документацию

**Описание:** убрать из hero catalog и документации отдельный runtime weapon contract, заменить статусы `runtime_ready_weapon_missing` на состояние, описывающее только base GLB, и убрать obsolete known gaps.

**Вероятные файлы:**

- `docs/hero-catalog.json`
- `tools/validate_hero_catalog.py`
- `docs/hero-catalog-maintenance.md`
- `docs/hero-animation-scene-workflow.md`
- связанные weapon/grip notes и инструкции

**Критерии приёмки:**

- [ ] В каталоге нет `runtimeWeapon` и `runtimeWeaponPattern`.
- [ ] `knownGaps` не сообщает об отсутствии отдельного weapon GLB.
- [ ] Validator проверяет наличие и embedded contract только `runtimeHero` (плюс `runtimeCompanion`, где нужно).
- [ ] Документация говорит об одном canonical GLB на героя и не противоречит exporter/runtime.

**Проверка:** `python tools/validate_hero_catalog.py` и `cd frontend; npm run validate:hero-catalog`.

**Зависимости:** задачи 2–4.

### 6. Удалить obsolete assets и инструменты

**Описание:** после прохождения всех проверок удалить отдельные runtime weapon GLB, временные weapon GLB и только те Blender/QA-скрипты, которые больше не имеют самостоятельного назначения. Сначала убрать все ссылки, затем удалять бинарные файлы.

**Критерии приёмки:**

- [ ] `rg` не находит production/runtime ссылок на отдельные weapon assets, `weaponUrl`, `runtimeWeapon`, `attachDetachedWeapon` и `DetachedHeroWeapon`.
- [ ] Legacy source вроде `mandy_weapon.blend` либо явно помечен как source-only, либо удалён отдельным согласованным решением; его нельзя случайно считать runtime asset.
- [ ] В repository остаются только canonical base GLB и нужные companion/effect assets.

**Проверка:** полный `rg`, clean checkout/build validation и проверка network requests в browser QA.

**Зависимости:** задачи 3–5.

### Checkpoint: embedded runtime

- [ ] Все armed heroes визуально держат оружие в правильной руке во всех ключевых Actions.
- [ ] Runtime делает один запрос на hero base GLB и не создаёт detached weapon wrapper.
- [ ] Нет двойной геометрии, скачков масштаба/поворота или потери оружия после `normalizeHeroHeight`.
- [ ] Полный frontend/catalog/GLB QA проходит.

## Риски

| Риск | Воздействие | Митигирование |
|---|---:|---|
| Оружие есть в `hero.blend`, но отсутствует в `scenes/idle.blend` | Высокое | Сначала inventory focused-сцен; синхронизировать source без перезаписи authored Actions |
| Kaze сейчас исключается exporter-ом | Высокое | Убрать exclusion только после проверки parent/grip и round-trip |
| Runtime-подгонка скрывает неверный pivot | Высокое | Проверять embedded geometry и grip marker на каждом кадре ключевых Actions |
| Удаление detached GLB ломает старые QA-страницы или инструменты | Среднее | Сначала переписать/удалить ссылки, затем удалять assets; прогнать `rg` и browser smoke |
| Dirty worktree содержит параллельную работу с теми же бинарными файлами | Высокое | Не смешивать изменения; перед реализацией выделить отдельную ветку/коммит или согласовать базовый набор изменений |

## Definition of Done

- Один canonical base GLB на каждого героя содержит его постоянное оружие и authored-анимации.
- Frontend не знает и не обращается к отдельным runtime weapon assets.
- Для persistent weapon нет отдельной загрузки, attach-компенсации или дубля геометрии.
- Catalog, GLB validator, unit tests, build и browser QA проходят.
- Удалены только действительно obsolete weapon assets/tools; временные combat visuals сохранены.

## Решённый вопрос после реализации

Под «оружием» убраны все persistent runtime weapon GLB (Kaze, Mandy legacy, Persephone Lumi, Wukong Mico). Projectile/effect assets и Brock cloud остались отдельными сущностями.
