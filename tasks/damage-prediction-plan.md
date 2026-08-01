# План: безопасная предикция боевого урона

## Цель

Сделать попадания визуально отзывчивее, не перенося авторитетную боевую логику на клиент. Фронт может временно показать ожидаемое уменьшение HP, но серверный `lives` остаётся источником истины. При подтверждении значение совпадает без скачка; при промахе или отличии урона предсказание мягко убирается.

## Архитектурные решения

- Предсказываем только базовые попадания, которые можно проверить по видимой геометрии: прямой путь пули и базовый melee-сектор.
- Не предсказываем смерть: пока сервер не прислал `lives = 0`, speculative HP не опускается ниже 1.
- Урон для пули берём из server state, а не дублируем баланс на фронте. Для melee сервер передаёт базовый `attackDamage` в уже существующем state игрока.
- Щиты, неуязвимость, stealth/dodge, сложные splash/chain/DoT и все способности с `prediction: server` остаются server-authoritative.
- При новом authoritative snapshot наблюдаем фактическое уменьшение HP и поглощаем им pending prediction. Если подтверждения нет в коротком TTL, визуальное значение возвращается к серверному с коротким easing.
- Данные передаются внутри battle state только для игроков/пуль, которые и так видимы клиенту; отдельная загрузка полного каталога героев в бою не нужна.

## Этапы

1. Pure ledger и geometry tests: predicted damage, authoritative reconciliation, expiry rollback, segment hit.
2. Wire fields: `PlayerJSON.attackDamage` и `BulletJSON.damage`.
3. Client integration: outgoing basic melee/ranged prediction, replicated bullet crossing prediction, visual HP reconciliation.
4. Verification: focused tests, full frontend tests, frontend build, Go battle tests.

## Ограничения

- Abilities remain authoritative until a separate per-ability damage contract is added. Their current mechanics include delayed zones, random/conditional modifiers and multi-target effects, so guessing them on the client would create more rollback than smoothness.
- Prediction is cosmetic only: it must not affect targeting, cooldowns, victory/death state, rewards or commands sent to the server.
