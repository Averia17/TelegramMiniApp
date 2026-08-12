# План аудита и улучшения боя в стиле Brawl Stars

## Цель

Сделать бой похожим по читаемости и ритму на Brawl Stars, сохранив нашу authoritative-модель: один источник состояния боя на backend, один renderer карты/боя на frontend и одинаковые координаты/коллизии.

Рабочее допущение: текущий режим — короткий battle-royale-подобный матч на 8 участников с охотой, лунными ящиками и beacon-объектом. Сначала улучшаем общий бой, одинаково полезный для всех героев, а не добавляем новый режим без контракта.

## Что взято за внешний ориентир

- [Официальный раздел Gadgets](https://support.supercell.com/brawl-stars/en/articles/gadgets-4.html): гаджет — отдельная активируемая способность с ограниченным числом применений и cooldown.
- [Официальный раздел Hypercharge](https://support.supercell.com/brawl-stars/en/articles/hypercharge-4.html): временный усилитель, который делает Super сильнее и на короткое время меняет боевые параметры.
- [Официальные release notes Brawl Stars](https://supercell.com/en/games/brawlstars/blog/release-notes/release-notes-june-2026/): в актуальном бою отдельно настраиваются ammo/reload, Super, взаимодействие с разрушаемыми стенами и визуально заметные активные объекты способностей.
- [Официальный раздел Game Modes](https://support.supercell.com/brawl-stars/en/articles/game-modes-12.html): карта и правила подчинены цели режима, поэтому новые объекты нужно добавлять только вместе с понятной боевой функцией.

Из этого следуют четыре полезных для нас принципа:

1. Каждый выстрел должен иметь понятный цикл: aim → ammo → projectile/attack → hit/miss → reload.
2. Попадание обязано читаться мгновенно: контакт, damage, реакция цели и состояние здоровья.
3. Super и Gadget должны быть различимы визуально и по cooldown; временные усиления нельзя маскировать под обычный урон.
4. Карта должна создавать выбор через cover, bushes, water, destructible и objective, но декоративный объект не должен менять коллизию случайно.

## Локальный baseline

### Уже работает

- Backend отдаёт authoritative `combatEvents` и `effects`; frontend уже использует ammo, reload progress, Super, Gadget, status effects и prediction/reconciliation.
- Прицеливание поддерживает mouse/touch drag, auto-aim и дистанцию атаки.
- У героев есть отдельные Basic/Super/Gadget kits, серверные cooldown/charges и геройские эффекты.
- Canonical map уже содержит стены, кусты, воду, destructible, деревья, корни/log piles, центральный landmark и minimap.
- Browser QA боя прошёл без `consoleErrors`/`pageErrors`; baseline: 60 Hz state, 4.3 ms average renderer frame, 108 draw calls.

### Главные разрывы

1. `combatEvents` доходят до `NetworkSimulation`, но не образуют полноценный presentation-layer: нет общих damage numbers, hit-marker, kill confirmation и контактной вспышки для обычного попадания.
2. CameraRig не имеет короткого локального shake/punch, поэтому сильные попадания и Super ощущаются плоско.
3. Generic projectile impact почти не отличается от исчезновения снаряда; часть геройских эффектов уже есть, но общий язык контакта отсутствует.
4. HUD показывает ammo/Super/Gadget/status, но не разделяет будущий временный усилитель Hypercharge и не даёт единого визуального ответа на confirmed hit.
5. Карта функционально сильнее, чем её обратная связь: стены/кусты/вода есть, но сначала нужно сделать столкновения и боевые события визуально бесспорными. Новый map objective добавлять только после контрактной проверки режима.

## Порядок работ

### Этап 0 — baseline и контракты (выполнен)

- Снять реальный browser QA после движения и атаки.
- Зафиксировать, какие события уже приходят и где теряется presentation.
- Не возвращать `lowQuality` и не создавать вторую карту.

### Этап 1 — universal hit-feel (текущий приоритет)

- Дедуплицировать `combatEvents` по ID, чтобы один server event не показывался несколько раз при snapshot-повторах.
- На подтверждённый hit добавить короткий world-space contact burst.
- Показывать damage number над фактической целью; для урона локальному игроку добавлять более заметный hit feedback.
- Добавить локальный camera punch с затуханием, ограниченный только значимыми боевыми событиями.
- Не менять damage, cooldown, hitbox и server resolution.

Приёмка:

- Один hit event создаёт ровно один feedback-пакет.
- Повтор snapshot не дублирует цифры, вспышку и shake.
- Позиция feedback вычисляется из authoritative target, а не из предсказанной декоративной позиции.
- При отсутствии hit event обычный промах не показывает ложный урон.

### Этап 2 — читаемость способностей

- Сверить каждый Basic/Super/Gadget с одним визуальным каналом: cast/telegraph → projectile/zone → impact → status.
- Усилить различие Super и Gadget в HUD и в world VFX.
- Добавить явные состояния target/ally для поддерживаемых умений (heal, shield, stun, root, slow, reveal), не меняя серверную механику.
- Отдельно решить, нужен ли Hypercharge как новый backend/UI контракт; не имитировать его обычным Super glow.

Приёмка: игрок без чтения текста отличает basic, Super, Gadget, hit, miss и control effect.

### Этап 3 — карта как боевая арена

- Сначала провести topology-аудит canonical map: spawn safety, свободные corridors, wall continuity, water ring, bush readability и совпадение `blocking`.
- Затем добавить максимум один функциональный map interaction, например contestable resource/objective, если он вписывается в текущую фазу hunt/beacon.
- Для нового объекта определить одновременно backend state, frontend render, collision/visibility и minimap representation.
- Не добавлять декор, который выглядит blocking, но проходим, и не добавлять проходную воду без authoritative water collision.

Приёмка: объект виден в бою и minimap, его состояние приходит из backend, а browser-проверка подтверждает одинаковую позицию и коллизию.

### Этап 4 — skills и баланс по данным

- Составить матрицу героев: range, burst, sustained damage, mobility, control, sustain, map interaction.
- Проверить ammo/reload, Super charge, Gadget charges и cooldown относительно роли; не менять цифры без повторяемого сценария или telemetry.
- Добавить skill-specific feedback только там, где universal hit-feel недостаточен.
- Расширить backend contract tests на выбранные изменения.

## Проверка каждого этапа

- Frontend unit/architecture tests для новых pure helpers и renderer contracts.
- Backend `go test ./model/game ./model/gamemap ./handler` при изменении серверного контракта.
- Frontend build и changed-file ESLint.
- `node tools/qa/battle-performance-browser-qa.cjs` в обычном timing режиме.
- Визуальный screenshot и проверка `render_game_to_text`.
- `git diff --check`.

## Ограничения

- Не использовать отдельный low-quality renderer.
- Не дублировать canonical map на frontend.
- Не исправлять коллизию только визуально.
- Не начинать с массового rebalance героев до появления достоверной обратной связи попаданий.
