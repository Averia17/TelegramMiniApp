# Правила каталога героев

`docs/hero-catalog.json` — обязательный контекст для любого ИИ, который меняет героя. Это не свободная заметка: карточка должна отражать gameplay-код, frontend-контракт и animation pipeline.

## Обязательное правило для ИИ

Если меняется хотя бы одна деталь героя — имя, роль, цвет, баланс, базовая атака, Super, Gadget, статус ассета, список анимаций, название clip или путь к модели — ИИ обязан в том же изменении:

1. Обновить соответствующую карточку в `docs/hero-catalog.json`.
2. Обновить `catalogRevision`, `lastReviewedAt` и `lastReviewedBy`.
3. Пересчитать `sourceFingerprints` для изменённых контрактных источников.
4. Запустить `python tools/validate_hero_catalog.py`.
5. Если изменение затрагивает `.blend`, вручную обновить `assets`, `animations` и `knownGaps`, затем прогнать Blender/runtime QA из существующего animation workflow.

Нельзя менять героя только в Go, frontend или Blender и оставлять каталог «на потом». Если изменение ещё не завершено, карточка должна явно содержать `status: "in_progress"` и описание незакрытого gap.

## Что является источником фактов

- Gameplay и баланс: `battle/model/game/heroes.go`.
- Attack geometry и projectile contract: `battle/model/game/attack_config.go`.
- Реализация способностей: `battle/model/game/combat_kits.go` и `battle/model/game/new_hero_kits.go`.
- Runtime-анимации: `tools/blender/hero_animation_scene_manifest.json`, master-файл `frontend/assets-source/heroes/<slug>/<slug>.blend` и экспортированные GLB. Для завершённых героев focused-сцен и legacy-архивов нет; Zeus временно остаётся исключением.
- Клиентское отображение: `frontend/src/components/BattleGame/heroesConfig.js`.

Каталог — единая точка контекста для ИИ, но не повод дублировать механику в нескольких runtime-источниках. При противоречии ИИ обязан остановиться, указать расхождение и синхронизировать источники в рамках текущей задачи.

## Проверка перед завершением задачи

```powershell
python tools/validate_hero_catalog.py
cd frontend
npm run validate:hero-catalog
```

Проверка должна завершиться с кодом `0`. Ошибка fingerprint означает, что исходный контракт изменился, а каталог не был пересмотрен.
