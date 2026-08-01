# TODO: обновлённый animation/runtime pipeline

## Фаза 1 — contract

- [x] Зафиксировать `Mandy` как единственное canonical имя.
  - Verify: manifest contract test и unknown-hero fallback test.
- [ ] Зафиксировать обязательные/optional clip names.
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
- [ ] Проверить sockets/grips для всех героев покадрово.
- [ ] Проверить attack/super/spawn transitions покадрово.
- [ ] Проверить clipping и deformation mesh.
- [ ] Собрать NLA/master GLB и выполнить round-trip validation.

Примечание: структурный аудит сохранён в `docs/hero-animation-pack-audit.json`; ability-сцены ещё не созданы.

- [x] Mandy vertical slice: собрать `mandy_nla_master.blend` из существующих Actions и добавить оба non-deform socket bones.
  - Verify: файл сохранён, 9 NLA-треков и `Socket.Weapon.L/R` присутствуют.

## Фаза 5 — harness/WebGL

- [x] Показывать resolved hero в harness.
- [ ] Добавить interrupt matrix.
- [x] Расширить `render_game_to_text()` weights/fallback/clip time.
- [ ] Запустить browser smoke всех героев (blocked: Playwright Chromium отсутствует).
- [ ] Зафиксировать console/screenshot evidence.
- [x] Отдельно отметить browser infrastructure blocker, если Chromium недоступен.

## Фаза 6 — delivery

- [ ] Сгенерировать JSON-отчёт по каждому герою.
- [ ] Разделить статусы `passed`, `fallback`, `blocked`.
- [x] Выполнить полный frontend test/build.
- [ ] Финальный review после browser QA и исправления validate:heroes fixture.
