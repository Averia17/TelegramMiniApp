# Combat Brawl Stars — todo

> Архивный исследовательский checklist. Его пункты синхронизированы с
> каноническим планом в `tasks/combat-audit-2026-08-plan.md` и не являются
> отдельным backlog. Текущие статусы и remaining gates фиксируются в
> `tasks/combat-audit-2026-08-todo.md` и
> `tasks/combat-automated-gate-2026-08.md`.

## Этап 0 — аудит

- [x] Снять browser baseline полного боя.
- [x] Сверить текущие ammo/reload/Super/Gadget/combatEvents/effects с runtime.
- [x] Зафиксировать внешний ориентир по официальным материалам Supercell.

## Этап 1 — universal hit-feel

- [x] Добавить pure helper для дедупликации confirmed hit events.
- [x] Подключить event feedback к renderer без изменения server simulation.
- [x] Добавить world-space damage number и contact burst.
- [x] Добавить ограниченный camera punch.
- [x] Добавить unit/architecture tests на idempotency и target position.
- [x] Проверить в browser QA после реального выстрела.

## Этап 2 — ability readability

- [ ] Составить таблицу Basic/Super/Gadget → telegraph/projectile/impact/status.
- [ ] Сверить HUD hierarchy и cooldown states.
- [ ] Решить отдельным контрактом, нужен ли Hypercharge.

## Этап 3 — map combat affordances

- [ ] Повторить topology audit перед изменением layout.
- [ ] Выбрать не более одного нового функционального объекта.
- [ ] Синхронизировать backend/frontend/minimap/collision.

## Этап 4 — skills и баланс

- [ ] Матрица ролей всех героев.
- [ ] Повторяемые сценарии burst/sustain/control/mobility.
- [ ] Изменять цифры только вместе с contract tests и browser check.

## Финальная регрессия

- [ ] Frontend tests/build/lint.
- [ ] Backend game/map/handler tests.
- [ ] Real browser QA, screenshot, render text, console/page errors.
- [ ] `git diff --check`.
