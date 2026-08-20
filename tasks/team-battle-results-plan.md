# План: информативные результаты командного боя

## Цель

Показывать в конце командного боя полезную личную статистику и сохранять те же
данные в battle result payload для Redis, Kafka и recovery.

## Контракт результата

Для игрока сохраняются: убийства, смерти, урон по бойцам, урон по башням, урон
по ратуше, уничтоженные башни и уничтоженные ратуши. Solo-поля и текущая
семантика победы остаются совместимыми.

## Порядок работ

1. Добавить authoritative counters и тесты для PvP/objective damage и death.
2. Расширить provider/leaderboard result contracts, room persistence и recovery.
3. Расширить frontend result normalization и командный экран результата.
4. Прогнать точечные тесты, frontend suite/build/lint и затронутые Go-пакеты.

## Критерии приёмки

- [ ] Командный результат показывает kills, deaths, player damage, tower damage,
      town hall damage и destroyed structures.
- [ ] Redis/Kafka/recovery payload содержит эти же значения.
- [ ] Solo result и текущий leaderboard score не ломаются.
- [ ] Новые counters считаются authoritative, а не восстанавливаются из UI.
