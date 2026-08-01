# План: переработка authored-анимаций и runtime QA

## Текущее состояние

Проект использует один canonical gameplay GLB на героя с embedded clips, `AssetRegistry`, `SkeletonUtils.clone`, один `AnimationMixer` и страницу `test/glb-hero-harness.html`. Все 134 frontend-теста проходят; дополнительно browser matrix покрывает 8 героев × 10 событий. Этот этап закрывает runtime-риски и доводит authored pipeline до строгого контракта.

## Цели

- Сохранить один самодостаточный GLB на героя.
- Гарантировать безопасный fallback для отсутствующих клипов.
- Сделать blending переходов стабильным: 0.15–0.20 секунды.
- Не накладывать procedural gait/aim поверх authored-анимаций без явного fallback-режима.
- Сделать harness пригодным для реального interrupt и visual QA.
- Сохранить ручное создание анимаций в Blender; код использовать только для сборки, проверки, экспорта и runtime-оркестрации.

## Архитектурные решения

1. Canonical name: backend, manifest и harness используют только `Mandy`; опечатка `Mendy` не является alias.
2. `AssetRegistry` остаётся единственной точкой загрузки GLB; неизвестный hero не должен приводить к обращению к `null`.
3. `GLBHeroController` получает явные методы `transitionLocomotion`, `playOverlay`, `playOutcome` и `playSafe`, а отсутствие клипа становится диагностируемым fallback-событием.
4. Для переходов используются константы `LOCOMOTION_FADE = 0.16` и `OVERLAY_FADE = 0.18`; новая action стартует с weight 0 и cross-fade’ится из предыдущей.
5. Authored `run` и `aim` имеют приоритет. Procedural leg gait/aim разрешены только при отсутствии соответствующего authored clip и фиксируются в telemetry как fallback.
6. Victory/defeat не смешиваются с обычным locomotion как случайный overlay: для них задаётся отдельная политика loop/hold/re-entry.

## План работ

### Фаза 1 — contract и безопасная загрузка

**Задача 1.1: Нормализация идентификаторов героя**

- Использовать только canonical имя `Mandy` в manifest, backend и harness.
- Использовать resolver в harness, `AssetRegistry` и входных runtime-командах.
- При неизвестном имени выбирать `Mandy` или первый доступный hero и показывать warning.

Проверка: harness с корректным `?hero=Mandy` загружает валидный GLB; неизвестное имя безопасно отклоняется к default без exception.

**Задача 1.2: Manifest/clip contract**

- Проверять обязательные `idle`, `run`, `attack`, `spawn` и optional states.
- Разделить missing clip, failed GLB load и invalid track binding.
- Добавить тесты на canonical names и fallback metadata.

Проверка: `npm test -- --test-name-pattern="manifest|AssetRegistry|fallback"`.

### Checkpoint A

- [ ] Invalid hero не ломает harness.
- [x] `Mandy` остаётся единственным canonical именем; `Mendy` не добавляется в каталог.
- [ ] Ошибка загрузки не маскируется под успешный fallback.

### Фаза 2 — controller transitions

**Задача 2.1: Исправить cross-fade**

- Вынести fade constants.
- Перевести locomotion на `crossFadeFrom`/эквивалентный порядок с weight 0 у новой action.
- Overlay fade увеличить с 0.04 до 0.18 сек.
- При interrupt корректно остановить предыдущий overlay и сбросить его weight.

Проверка: unit-тесты измеряют веса на старте transition и отсутствие резкого snap.

**Задача 2.2: Safe playback и fallback**

- Добавить `playSafe(name, fallback = "idle")`.
- Для missing `super`, `aimSuper`, `victory`, `defeat` писать `console.warn` с hero/state.
- Возвращать героя в idle/run по текущему locomotion-контексту.
- Собирать список fallback-событий для browser JSON report.

Проверка: запрос отсутствующего клипа не бросает exception, state становится idle, warning присутствует.

**Задача 2.3: Outcome policy**

- Реализовать `playOutcome("victory"|"defeat")`.
- Настроить loop/hold отдельно от attack/super.
- После завершения или interrupt возвращаться в idle.

Проверка: victory/defeat не оставляют stale overlay и корректно прерываются атакой.

### Checkpoint B

- [ ] Controller стабильно проходит `run → super → attack → idle`.
- [ ] Все optional clip fallback’и безопасны и диагностируются.
- [ ] Fade duration соответствует 0.15–0.20 сек.

### Фаза 3 — authored priority

**Задача 3.1: Authored locomotion gate**

- Отключить procedural leg gait, если есть authored `run`.
- Оставить procedural gait только для явно отмеченного fallback-клипа.
- Сохранить authored run timeScale по скорости без добавления независимой фазы ног.

Проверка: тест подтверждает отсутствие bone quaternion edits при authored run.

**Задача 3.2: Authored aim gate**

- Не накладывать procedural upper-body aim на authored `Aim`/`AimSuper`, если клип содержит нужные tracks.
- Использовать procedural yaw/pitch только для героев без authored aim или в специальном additive режиме.

Проверка: track audit и browser visual check на Mandy/Kaze/Brock.

### Фаза 4 — Blender и export validation

- Для каждого героя проверить rig master, weapon pivot, right/left sockets и detached weapon attachment.
- Покадрово проверить grip/clipping на attack, super, spawn и transitions.
- Сохранить ручные Actions и Graph Editor curves; не генерировать animation keys кодом.
- Собрать NLA и master GLB, затем выполнить round-trip импорт.

Проверка: `npm run validate:heroes` плюс Blender audit JSON без critical issues.

### Фаза 5 — harness и WebGL QA

- Harness должен безопасно загружать invalid/alias hero и отображать resolved hero.
- Добавить кнопки/сценарии interrupt: `run → super → attack → idle`, `aimSuper → attack`, `victory → defeat`.
- В `window.render_game_to_text()` добавить resolved hero, active action weights, fallback events и current clip time.
- Запустить browser smoke для всех героев и visual check оружия в переходах.
- Если Chromium недоступен, зафиксировать это как infrastructure blocker и не считать visual QA пройденным только по unit-тестам.

Проверка: Playwright/DevTools, screenshot и console log; zero uncaught errors, warnings только ожидаемые fallback’и.

### Фаза 6 — отчётность

- JSON на героя: asset URL, resolved hero, clip list, durations, states, fallback events, audit status, browser status.
- Отдельно отмечать `passed`, `fallback`, `blocked`.
- Не считать blocked WebGL QA успешным.

## Definition of Done

- `Mandy` загружается как единственное canonical имя.
- Unknown hero не вызывает runtime exception.
- Missing animation мягко возвращает героя в idle/run и создаёт warning.
- Все переходы используют 0.15–0.20 сек blending.
- Authored run/aim не искажаются постоянным procedural overlay.
- Все canonical GLB проходят clip, socket, weapon и round-trip audits.
- Harness проходит interrupt matrix и сохраняет JSON evidence.

## Риски

| Риск | Влияние | Митигирование |
|---|---:|---|
| В URL попадает опечатка `Mendy`, а canonical name — `Mandy` | Medium | Общий fallback unknown hero; не добавлять alias |
| Cross-fade стартует с weight 1 | High | Тестировать веса до/после transition |
| Procedural gait портит authored run | High | Authored priority gate |
| Browser QA не запускается без Chromium | High | Установить/подключить browser runtime и явно помечать QA blocked |
| Detached weapon получает другой transform после normalize | High | Socket/grip audit после каждого GLB round-trip |
Runtime follow-up: authored full-body super включён в gameplay и harness; root/hips position tracks санитизируются; полный frontend suite — 144 tests (141 pass, 3 skipped), browser matrix — 80/80.
