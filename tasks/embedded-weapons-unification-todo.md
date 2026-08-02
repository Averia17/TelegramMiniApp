# TODO: embedded weapons вместо detached weapon assets

## Phase 0 — inventory

- [x] Проверить `scenes/idle.blend` и focused-сцены для Kaze, Mandy, Wukong Mico, Persephone Lumi.
- [x] Сверить их с `hero.blend` и зафиксировать source-of-truth для геометрии и Actions.
- [x] Снять baseline GLB/network/visual QA до миграции.

## Phase 1 — source и exporter

- [x] Встроить/восстановить persistent weapon meshes в focused-сцены без потери authored transforms.
- [x] Убрать Kaze weapon exclusion из `export_runtime_heroes_from_scenes.py` после structural audit.
- [x] Пересобрать четыре armed base GLB.
- [x] Проверить sockets, grip markers, attachment roles и отсутствие дублей.

## Phase 2 — frontend runtime

- [x] Удалить `weaponUrl`/`weaponAttachments` из `assetManifest.js`.
- [x] Удалить weapon loader/attach/detached wrapper из `AssetRegistry.js`.
- [x] Сохранить embedded held/throwable visibility и companion cloud behavior.

## Phase 3 — tests, QA, docs

- [x] Перевести rendering/grip/Kaze/Mandy tests на embedded contract.
- [x] Переписать GLB audit и dynamic-equipment QA либо удалить obsolete страницы.
- [x] Удалить `runtimeWeapon*` из catalog и validator.
- [x] Обновить animation/grip documentation.

## Phase 4 — cleanup

- [x] Удалить runtime weapon GLB и временные файлы после прохождения всех проверок.
- [x] Классифицировать legacy Blender weapon source и obsolete helper scripts.
- [x] Выполнить финальный `rg` по detached contract.

## Final verification

- [x] `cd frontend; npm test`
- [x] `cd frontend; npm run lint`
- [x] `cd frontend; npm run build`
- [x] `cd frontend; npm run validate:heroes`
- [x] `python tools/validate_hero_catalog.py`
- [x] `cd frontend; npm run validate:hero-catalog`
- [x] Browser/WebGL QA: selection, spawn, attack, super, victory, defeat для всех героев.
