# TODO: обновлённый animation/runtime pipeline

## Фаза 1 — contract

- [x] Зафиксировать `Mandy` как единственное canonical имя.
  - Verify: manifest contract test и unknown-hero fallback test.
- [x] Зафиксировать обязательные/optional clip names.
  - Verify: manifest contract tests.
- [ ] Разделить load failure, missing clip и invalid binding.

## Фаза 2 — controller

- [x] Ввести fade constants 0.16/0.18 сек.
- [x] Исправить порядок cross-fade: новая action стартует с weight 0.
- [x] Добавить `playSafe` с warning и возвратом в idle/run.
- [x] Добавить отдельный `playOutcome` для victory/defeat.
- [x] Добавить тесты на interrupt и fallback.

## Checkpoint A

- [x] `run → super → attack → idle` проходит без stale actions на controller-тестах.
- [x] Отсутствующий clip не бросает exception.
- [x] Warning содержит hero и semantic state.

## Фаза 3 — authored priority

- [x] Отключить procedural leg gait при наличии authored run.
- [x] Отключить procedural aim поверх authored Aim/AimSuper.
- [x] Оставить procedural поведение только как маркированный fallback.
- [x] Добавить regression tests на отсутствие лишних bone edits.

## Фаза 4 — Blender/export

- [x] Выполнить структурный inventory event-сцен, actions, sockets и grips для всех героев.
- [x] Проверить sockets/grips для всех героев структурным audit-тестом и browser visual QA.
- [x] Проверить attack/super/spawn transitions покадрово через harness matrix и controller interrupt test.
- [ ] Проверить clipping и deformation mesh на полном покадровом проходе в Blender.
- [x] Выполнить технический frame sweep: 80 сцен / 2899 кадров, finite transforms и bounds.
- [x] Собрать focused-сцены/master GLB и выполнить round-trip validation.

Примечание: scene pack сохранён в `artifacts/hero-animation-scene-pack.json`; runtime использует один canonical GLB на героя.

- [x] Mandy vertical slice: собрать `mandy_nla_master.blend` из существующих Actions и добавить оба non-deform socket bones.
  - Verify: файл сохранён, 9 NLA-треков и `Socket.Weapon.L/R` присутствуют.

## Фаза 5 — harness/WebGL

- [x] Показывать resolved hero в harness.
- [x] Добавить interrupt matrix.
- [x] Расширить `render_game_to_text()` weights/fallback/clip time.
- [x] Запустить browser smoke всех героев и всех 10 событий.
- [x] Зафиксировать console/screenshot evidence.
- [x] Отдельно отметить browser infrastructure blocker, если Chromium недоступен.

## Фаза 6 — delivery

- [x] Сгенерировать JSON-отчёт по каждому герою.
- [x] Разделить статусы `passed`, `fallback`, `blocked`.
- [x] Выполнить полный frontend test/build.
- [x] Финальный review после browser QA и исправления validate:heroes fixture.
## Runtime follow-up

- [x] Authored full-body super is enabled in gameplay and the harness.
- [x] Exporter root/hips position tracks are sanitized at runtime.
- [x] Browser matrix repeated: 80/80, 8 heroes, 10 events, 0 fallback, 0 browser errors.

## Final authored animation verification

- [x] Re-authored 80 focused Blender scenes with explicit pose samples on every contract frame.
- [x] Re-exported one canonical runtime GLB per hero; no duplicate runtime GLBs are referenced.
- [x] Full Blender frame sweep: 3244 frames, 215228 keyframes, finite pose and evaluated mesh bounds, 0 failures.
- [x] Browser harness matrix: 80/80 event cases, 0 animation fallbacks; standalone backend 500 remains an expected harness warning.
- [x] `npm run validate:heroes` and `npm run build` pass.
