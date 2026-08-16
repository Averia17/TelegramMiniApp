# План переработки скиллов активных героев

## Цель

У каждого из восьми активных героев должен быть один читаемый боевой цикл и один
узнаваемый источник пространственного контроля. Базовая атака не должна скрыто
добавлять круговой урон, самонаведение или длительную зону, если это не является
главной идентичностью героя.

Текущий режим, ростер, три ammo, серверная авторитетность и слоты
Basic/Super/Gadget сохраняются. Hypercharge, второй Gadget и глобальная переделка
зарядов Gadget в cooldown-only в этот срез не входят.

## Внешний ориентир

Используем принципы, а не копируем цифры Brawl Stars:

- Basic формирует повторяемый цикл героя, Super усиливает этот цикл, Gadget решает
  узкую тактическую задачу.
- Controller контролирует маршрут замедлением, корнями или видимостью; Support
  лечит/защищает; Assassin получает вход и добивание; Tank конвертирует полученный
  урон в давление; Sharpshooter отвечает за дальнюю угрозу.
- Пространственный урон всегда имеет явный снаряд, телеграф или границу зоны.
- В актуальных наборах Brawl Stars полезны механики fixed radial split (Spike),
  focus payoff (Mandy), hit/heal одного снаряда (Berry/Wendy), resource payoff
  (Nori), dash + mark (Kaze), recall/ground anchor (Lumi) и последовательные
  телеграфированные удары.

Источники:

- https://support.supercell.com/brawl-stars/en/articles/brawler-classes.html
- https://supercell.com/en/games/brawlstars/blog/release-notes/updated-june-12-release-notes-the-battle-for-katana-kingdom/
- https://supercell.com/en/games/brawlstars/blog/release-notes/release-notes-ranked-rework-lumi-finx-2/
- https://supercell.com/en/games/brawlstars/blog/release-notes/release-notes-june-2026/

## Аудит текущего состояния

| Герой | Текущая проблема | Решение |
|---|---|---|
| Needle | Спора самонаводится, наносит полный радиальный урон и выпускает 6 самонаводящихся шипов; короткий aim скрыто превращает выстрел в рывок. | Один прямой снаряд. При попадании/конце пути — 6 фиксированных радиальных шипов без homing и без дополнительного кругового урона. Скрытый short-vault убрать. |
| Mandy | Хороший melee/focus-цикл, но Gadget создаёт неописанную ауру замедления и одновременно хранит усиление следующего удара. | Оставить Focus и карту-пробивающую узкую Super. Gadget сделать явной защитной стойкой: очистка текущего контроля, 40% reduction, неподвижность и замедляющий контрудар; без ауры вокруг. |
| Fairy Mina | Три звезды имеют скрытый splash, поверх него работают метка/взрыв метки и лечение союзников. | Убрать splash. Каждая звезда действует только на фактически задетую цель: врагу damage/mark, союзнику heal. Повторное попадание взрывает только эту метку. |
| Brock Zeus | Единственный оправданный дальний AoE, но взрыв неодинаково разрешается на враге, стене и максимальной дальности; обычный выстрел ещё и ломает стены. | Сделать Brock единственным героем с обычным ranged splash: один одинаковый взрыв при любой остановке снаряда. Basic не ломает стены. Super — 3 телеграфированных удара, последний больше и ломает стены, без скрытой огненной DoT-зоны. Gadget остаётся пробивающим лучом. |
| Kaze | Melee/combo читается, но Super навешивает глобальный `Doomed` (+30% от любого источника), хотя описание обещает усиленный следующий удар Kaze. | Удалить глобальный damage multiplier. Рывок наносит урон и готовит усиленный следующий удар самой Kaze. Gadget даёт invisibility и тот же понятный payoff. Без кругового урона. |
| Wukong Mico | Rage и вихрь подходят танку, но Stone Armor скрыто взрывается вокруг и наносит накопленный урон. | Оставить вихрь единственным self-AoE героя. Броня только снижает урон и конвертирует поглощённое в Rage; без ответного взрыва. |
| Persephone Lumi | Один снаряд оставляет цепочку перекрывающихся кругов на всём пути; Gadget взрывает все круги. | Снаряд наносит direct damage и создаёт один недамажащий цветок в точке остановки. Цветок замедляет/раскрывает. Super создаёт один большой сад, Gadget явно поглощает цветки/сад и наносит каждой цели один общий burst. |
| Katty | «Три выстрела» веером часто дают только одно полезное попадание и не раскрывают тему баллончика. | Один короткий направленный paint-spray наносит прямой урон и слой краски; попадание оставляет облако радиусом 58 на 1,8 секунды с четырьмя тиками по 6 урона и замедлением внутри зоны. |

## Архитектурные решения

- Все damage/status решения остаются на backend; frontend получает только контракт,
  события и эффекты.
- Удаляем источники скрытого урона, не создавая универсальную новую ability-систему.
- `DoomedUntil`, непрерывный Lumi trail и старые Katty paint spots удаляются только после
  тестов, доказывающих новое поведение.
- `docs/hero-catalog.json`, fallback-контракт frontend и серверные описания меняются
  в том же срезе; fingerprint пересчитывается штатным валидатором.
- Существующие `.blend`/GLB не меняются: слоты и клипы Attack/Super/Gadget остаются
  теми же.

## Задачи

### Task 1: Зафиксировать новые контракты тестами

**Критерии приёмки:**

- Тесты падают на текущем homing/radial Needle, splash Mina и hidden AoE Gadget.
- Тесты описывают одинаковое завершение Brock projectile и отсутствие wallbreak у Basic.
- Тесты Katty и Lumi задают один ground anchor вместо цепочки зон.

**Проверка:** точечный `go test ./model/game -run '<новые тесты>'` сначала RED.

### Task 2: Упростить базовые атаки Needle, Mina и Brock

**Критерии приёмки:**

- Needle split фиксированный и не наносит круговой урон.
- Mina поражает или лечит только фактически задетые цели.
- Brock всегда создаёт один читаемый impact и только Super/Gadget ломают стены.

**Проверка:** целевые Go-тесты GREEN; существующие тесты этих героев проходят.

### Task 3: Убрать скрытые эффекты Kaze, Mandy и Mico

**Критерии приёмки:**

- Нет глобального `Doomed` multiplier.
- Mandy stance не замедляет врагов вокруг себя.
- Stone Armor не наносит radial damage и корректно начисляет Rage.

**Проверка:** отдельные state-based тесты каждого Gadget/Super.

### Task 4: Перестроить ground-control Lumi и Katty

**Критерии приёмки:**

- Один выстрел Lumi создаёт не более одного flower anchor.
- Один basic Katty создаёт ровно три узких снаряда и ни одной постоянной зоны.
- Super/Gadget обоих героев сохраняют явно видимый контроль пространства.

**Проверка:** целевые Go-тесты и renderer contract tests.

### Task 5: Синхронизировать UI, каталог и VFX-контракты

**Критерии приёмки:**

- Карточки и HUD точно называют damage, control и условия срабатывания.
- Удалённые `doomed`, `paint_spot`, непрерывный trail не рекламируются и не рендерятся.
- Каталог и fingerprint валидны.

**Проверка:** frontend `npm test`, `npm run build`, `python tools/validate_hero_catalog.py`.

### Task 6: Финальная проверка

**Критерии приёмки:**

- Целевые тесты активного ростера проходят.
- Полный frontend suite и build проходят.
- Browser QA показывает разницу Basic/Super/Gadget и отсутствие console/page errors.
- Известные baseline-падения legacy Go-тестов перечислены отдельно и не замаскированы.

**Проверка:** `git diff --check` и короткий repository QA через
`tools/qa/playwright-runner.cjs` с обязательным закрытием task-owned браузера.

## Риски

| Риск | Мера |
|---|---|
| Рабочее дерево уже содержит пересекающиеся правки | Не откатывать их; редактировать минимальные участки и сверять diff после каждого среза. |
| Полный Go suite уже красный на legacy-ростере | Использовать новые точечные тесты как gate и отдельно повторить полный suite для честного отчёта. |
| Удаление статуса меняет wire payload | Удалять поля только если они больше нигде не используются; закрепить protocol/frontend тестами. |
| Новые projectile semantics расходятся с VFX | На каждый impact оставить один effect kind и проверить реальный браузерный кадр. |

## Baseline на 2026-08-13

- Frontend: 312 тестов, 308 pass, 4 skip, 0 fail.
- Backend: полный suite уже падал на legacy-контрактах вне активного ростера.

## Итоговая проверка на 2026-08-13

- Целевые Go-тесты восьми активных героев проходят.
- Полный Go suite оставляет 4 legacy-падения: cooldown/shield, rotation, Slam projectile и Viper shield stack.
- Frontend: 326 тестов, 321 pass, 4 skip, 1 несвязанный fail по визуальному footprint `dead_tree`.
- Frontend build, lint и каталог проходят.
- Browser QA: 24/24 действий героев, без console/page errors; task-owned процессы закрыты.
# Implementation Plan: Team Battle (2 × configurable party size)

## Overview

Extend the existing authoritative solo battle into a separate team-battle mode. The first playable slice keeps the current WebSocket and renderer contracts, while adding party-aware matchmaking, deterministic team assignment, team-safe hero selection, a larger diagonal two-base map, destructible base objectives, defensive towers, and territory respawn.

## Working assumptions

- The initial production format is two teams with three combatants each; `PartyMaxSize` and `TeamSize` remain configuration values.
- Parties are represented by a shared `partyId` in matchmaking. A party is indivisible, but solo players can fill remaining slots.
- The team objective is destruction of the enemy town hall. Towers are defensive structures and deal damage only to enemies in their own base perimeter.
- A dead hero respawns after a configurable cooldown at a safe point near its own town hall. Respawning is disabled after the team town hall is destroyed.
- Existing solo mode remains the default and keeps its current behavior.
- The map harness gets a mode selector and renders the team map through the same canonical map API.

## Architecture decisions

- Use a `MatchProfile`/queue contract instead of branching on transport messages.
- Add a party as a queue unit; team formation operates on units and validates capacity before room creation.
- Put team composition and hero uniqueness in pure functions with unit tests.
- Represent bases, towers, and town halls as authoritative map objectives/state, not frontend-only decorations.
- Keep the first balance pass conservative: structure attacks have range/cooldown, town halls have large health and damage reduction while an allied tower is alive.

## Task List

### Phase 1: contracts and matchmaking

- [x] Define team-battle configuration, party queue units, and profile compatibility.
- [x] Add party create/invite/leave transport messages with configurable max party size.
- [x] Match two complete teams from parties and solos; reject incompatible or over-capacity parties.
- [x] Assign exactly two teams and enforce unique heroes inside each team.

### Checkpoint: matchmaking

- [x] Go unit tests cover party capacity, queue grouping, deterministic teams, and hero uniqueness.
- [ ] Existing solo tests remain green; unrelated legacy hero-contract failures remain documented in verification output.

### Phase 2: map and authoritative objectives

- [x] Add the larger diagonal team map with corner spawns, grouped cover, passable diagonal stream, and base/objective metadata.
- [x] Add town halls, towers, attack cooldowns, objective damage rules, and team victory condition.
- [x] Add territory respawn cooldown and spawn protection.
- [x] Extend state protocol and frontend renderer/minimap/HUD for objectives.

### Checkpoint: playable team match

- [x] Unit/integration-style tests cover 1/2/3-player partial team composition and objective state.
- [x] Browser harness can switch between solo and team map and shows both bases.
- [x] Frontend build and focused contract tests pass.

### Phase 3: balance and polish

- [x] Add configuration-driven party/team limits and persistent party state.
- [x] Add party lobby UI, invite notifications, and team composition feedback.
- [x] Add regression coverage and document launch configuration.

## Open questions to revisit after the first playable slice

- Whether towers should be fixed turrets or a more active base-defense unit.
- Whether respawns should be limited per player/team in ranked play.
- Whether parties may span both teams in a later mode.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Legacy room queue assumes one client per queue entry | High | Queue parties as immutable units and test capacity boundaries first |
| Team objective state inflates snapshots | Medium | Send static map metadata once and delta/compact objective state in snapshots |
| Respawn creates spawn camping | High | Protected corner spawn zone, invulnerability, and tower coverage |
| Existing solo behavior regresses | High | Keep solo rules/map path intact and run the full existing suite after each slice |
