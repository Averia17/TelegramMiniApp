# Правила каталога героев

`docs/hero-catalog.json` — обязательный контекст для любого ИИ, который меняет героя. Это не свободная заметка: карточка должна отражать gameplay-код, frontend-контракт и animation pipeline.

Редактируемые боевые значения постепенно выносятся в `docs/combat-profile.json`.
На текущем переходном шаге профиль является версионируемым balance-контрактом:
его generated views уже проверяются, а окончательное переключение runtime-источника
выполняется в T1. Профиль генерирует
`battle/model/game/combat_profile_generated.go` и
`frontend/src/components/BattleGame/combatProfile.generated.js`; fingerprint
хранится в `docs/combat-profile.fingerprint.json`.

## Обязательное правило для ИИ

Если меняется хотя бы одна деталь героя — имя, роль, цвет, баланс, базовая атака, Super, Gadget, статус ассета, список анимаций, название clip или путь к модели — ИИ обязан в том же изменении:

1. Обновить соответствующую карточку в `docs/hero-catalog.json`.
2. Обновить `catalogRevision`, `lastReviewedAt` и `lastReviewedBy`.
3. Пересчитать `sourceFingerprints` для изменённых контрактных источников.
4. Запустить `python tools/validate_hero_catalog.py`.
5. Если изменяется боевое значение, обновить `docs/combat-profile.json`, затем
   запустить `python tools/validate_combat_profile.py` и
   `python tools/generate_combat_profile.py`.
6. Если изменение затрагивает `.blend`, вручную обновить `assets`, `animations` и `knownGaps`, затем прогнать Blender/runtime QA из существующего animation workflow.

Нельзя менять героя только в Go, frontend или Blender и оставлять каталог «на потом». Если изменение ещё не завершено, карточка должна явно содержать `status: "in_progress"` и описание незакрытого gap.

## Что является источником фактов

- Gameplay и баланс: `battle/model/game/heroes.go`.
- Новый editable combat contract: `docs/combat-profile.json`; generated views не
  редактируются вручную. До завершения T1 `hero-catalog.json` остаётся
  совместимым зеркалом старых balance-полей.
- Attack geometry и projectile contract: `battle/model/game/attack_config.go`.
- Реализация способностей: `battle/model/game/combat_kits.go` и `battle/model/game/new_hero_kits.go`.
- Runtime-анимации: `tools/blender/hero_animation_scene_manifest.json`, master-файл `frontend/assets-source/heroes/<slug>/<slug>.blend` и экспортированные GLB. Для завершённых героев focused-сцен и legacy-архивов нет; Zeus временно остаётся исключением.
- Клиентское отображение: `frontend/src/components/BattleGame/heroesConfig.js`.

Каталог — единая точка контекста для ИИ, но не повод дублировать механику в нескольких runtime-источниках. При противоречии ИИ обязан остановиться, указать расхождение и синхронизировать источники в рамках текущей задачи.

## Проверка перед завершением задачи

```powershell
python tools/validate_hero_catalog.py
python tools/validate_combat_profile.py
python tools/generate_combat_profile.py --check
cd frontend
npm run validate:hero-catalog
```

Проверка должна завершиться с кодом `0`. Ошибка fingerprint означает, что исходный контракт изменился, а каталог не был пересмотрен.
