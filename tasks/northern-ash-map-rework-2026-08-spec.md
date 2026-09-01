# Северный Пепел — спецификация глобальной переработки карты

## Цель

Переработать `team-battle-northern` в цельный северный городской квартал с настроением Новиграда: крупные узнаваемые здания, связанные улицами и дворами, выразительные вертикальные силуэты и локальные декорации, которые читаются как части архитектуры, а не как случайный шум.

Это оригинальная композиция проекта, вдохновлённая общими архитектурными признаками северного средневекового города: фахверк, тёмный камень, красно-коричневая черепица, узкие проезды, ворота, навесы, вывески, фонари, мосты и тёплые окна. Файлы и ассеты Witcher 3 в проект не копируются.

## Область изменений

- Основной scope: только каноническая карта `team-battle-northern@20260827` и её preview/live renderer.
- Классическая `team-battle@20260816` сохраняет текущий контракт и не получает северный layout случайно.
- Единственным источником игровой геометрии остаётся Go generator; frontend строит визуальное отражение `MapFeature`.
- Крупные здания, дворы, башни, ворота, мостовые узлы и физические декорации публикуются как authored features.
- Визуальные overhangs, крыши, балконы, лозы и вывески могут выступать за ground footprint только если они не заявлены как блокирующие.

## Дизайн-контракт

### Пространство

- Сохраняются 3v3-симметрия относительно диагонали, три переправы, шесть целей, spawn pockets и островная вода.
- Центральный castle ward остаётся главным landmark и не должен превращаться в непроходимую коробку.
- Между крупными объектами должны оставаться минимум два независимых маршрута к каждой переправе/цели, если это не существующая водная граница.
- Каждый district имеет читаемый вход, внутренний двор или loading yard и обходной lane; закрытые фасадом клетки не считаются маршрутом.
- Декорация размещается после greybox-проверки и не должна закрывать spawn, objective, bridge landing или authored lane.

### Иерархия объектов

1. **Landmarks** — castle ward/keep, gatehouses, watchtowers, base compounds.
2. **District buildings** — depot/warehouse, inn, apartments, forge/ward, gate row.
3. **Connected architecture** — courtyard walls, facade wings, covered passages, yards, bridge-side clusters.
4. **Grounded dressing** — wells, carts, barrels, lanterns, signs, vegetation beds; только как поддержка крупного силуэта.

Критерий «цельный объект»: он имеет один стабильный `feature.id`, полноценный frontend group, видимый ground footprint и явный backend collision/passability контракт. Несколько мешей внутри здания допустимы и ожидаемы.

### Коллизии

- Все блокирующие здания и физические декорации коллизионно авторитетны на backend.
- Для сложного объекта используются несколько tight rectangles/circles, а не один огромный AABB; doorway, courtyard, veranda и principal lane остаются открытыми.
- `city_object` — только транспортный тип collision wall, не самостоятельная визуальная сущность.
- Для каждого authored archetype тестируется: наличие collider specs, отсутствие нулевого/гигантского footprint, симметрия twin feature, проходимость обязательных route cells.
- Passable dressing явно отмечается отсутствием collider specs и не должен выглядеть как непрозрачное здание.

## Измеримые критерии приёмки

- На полном desktop кадре карта читается как 4–6 крупных северных районов, а не как поле с мелкими объектами.
- Не менее 8 крупных authored building/landmark features на северной половине до зеркалирования; каждый имеет distinct silhouette/archetype.
- Не менее 3 связных architectural clusters: outer gate/bridge district, central castle ward, base/harbour-side district.
- Для каждого крупного feature визуальная группа и backend collision появляются из одного `MapFeature` id/archetype; ручных frontend-only blockers нет.
- Для каждого из трёх мостов остаются walkable landing и минимум один обходной подход без прохождения через воду.
- Spawn pockets, objectives и центральный route проходят существующие и новые collision/pathability tests.
- Browser harness на указанном URL показывает canonical map, `environment.ready === true`, отсутствие console/page errors; сохраняются desktop и mobile screenshots.
- Frontend build/lint и backend map tests проходят; draw-call/feature count не растёт из-за микропропов без оправданной архитектурной роли.

## Вне scope

- Полная замена renderer на сторонние GLB-паки.
- Копирование моделей, текстур или скриншотов из The Witcher 3.
- Изменение боевых правил, целей, spawn-команд или сетевого протокола.
- Переписывание classic map ради визуального паритета.

## Риски

- Слишком плотная застройка может ухудшить pathing и combat sightlines — лечится greybox route tests до dressing.
- Большие procedural groups могут ударить по WebView — ограничиваем повторяемые детали и проверяем harness/renderer counts.
- Несовпадение масштаба feature и collider создаёт нечестные углы — коллайдеры проверяются на backend, а визуальные ground contacts снабжаются role metadata.
