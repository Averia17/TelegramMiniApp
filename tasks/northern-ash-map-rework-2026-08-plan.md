# План переработки Северного Пепла

## Этап 1 — контракт и greybox

- [x] Инвентаризировать текущий canonical generator, feature types, colliders и browser harness.
- [x] Зафиксировать северный визуальный и коллизионный spec.
- [x] Ввести тестовые метрики authored districts, collider coverage, twin symmetry и обязательных проходов.
- [x] Снять baseline snapshot/screenshots и зафиксировать список текущих слабых зон.

## Checkpoint A — geometry contract

- [x] Каждый новый крупный feature сначала появляется в backend tests как ожидаемый authored object.
- [x] Для каждого нового archetype есть collider specs либо явная passable декларация.
- [x] Ни один route/spawn/objective test не регрессирует.

## Этап 2 — крупная серверная композиция

- [x] Разделить northern layout на authored clusters: outer gate district, central ward, south/harbour district.
- [x] Заменить случайно воспринимаемые мелкие city fragments на фасадные ряды, дворы и проходы.
- [x] Сохранить diagonal mirror, мосты, воду, spawn pockets и objective clearance.
- [x] Добавить tight multi-contact colliders для новых зданий и физических декораций.
- [x] Обрамить центральную площадь парными civic guildhall-фасадами и оставить plaza approach проходимым.
- [x] Связать guildhall и plaza парной passable cobble-lane с физическими фонарями, drain и handcart contacts.
- [x] Добавить парные внутренние castle courtyards с колодцами, лавками, жаровнями, rubble и 9 tight contacts на двор.
- [x] Добавить парную harbour avenue на сухой береговой террасе между boathouse row и river-side city route.
- [x] Расширить waterfront парными dock warehouse и общим dockyard court, сохранив bridge landing свободным.

## Checkpoint B — playable blockout

- [x] Backend route/pathability tests подтверждают два подхода к основным зонам.
- [x] Bridge landings, castle gates, base courtyards и objective cells свободны.
- [x] Размеры collider footprints соответствуют визуальным ground contacts.

## Этап 3 — frontend authored visuals

- [x] Сделать registry/dispatch для крупных building archetypes вместо разрастания случайных веток.
- [x] Собрать цельные фасады: каменный низ, timber frame, plaster, крыша, окна, двери, навесы и локальные детали.
- [x] Добавить дворы/проезды/ворота как читаемые группы с role metadata и без frontend-only collision.
- [x] Ограничить микродекор крупными anchors: вывеска, фонарь, телега, колодец, складские связки.
- [x] Добавить отдельный guildhall visual с тремя bays, шестью фронтонами, civic arch и площадкой.
- [x] Добавить отдельный city-lane visual с мощением, gutters, cobbles, фонарями и телегой.
- [x] Добавить отдельный harbour-avenue visual с длинным мощёным полотном, gutters, 4 фонарями, drain, crate и handcart.
- [x] Добавить отдельный dockyard visual с широким plank court, edge curbs, cart, crate, barrels и mooring post.
- [x] Добавить северный townhouse-row с тремя фасадными bay, общим основанием, дверями, окнами, фонарями и tight colliders.
- [x] Заменить плоские северные city-roof на общие low-poly двускатные объёмы с коньком и eave trim.
- [x] Расширить authored city_street до вытянутой passable мощёной улицы с продольными бордюрами и швами.

## Checkpoint C — art pass

- [x] Desktop/mobile screenshots читаются как единый северный город.
- [x] Визуальная симметрия сохранена, но зеркальные фасады не выглядят механической копией.
- [x] Feature count и renderer timing остаются приемлемыми для WebView.

## Этап 4 — интеграционная проверка

- [x] Targeted Go tests и frontend rendering tests.
- [x] Frontend `npm test`, `npm run build`, `npm run lint` (668 tests: 664 pass, 4 skipped; build и lint зелёные).
- [x] Browser harness на `map-environment-harness.html?mode=team&map=team-battle-northern` в desktop/mobile.
- [x] Проверка console/page errors и player movement по границам объектов через Go pathability/bypass contracts.
- [x] `git diff --check`, review только затронутых файлов, сохранение screenshots/checkpoint.

## Правило итераций

Каждый вертикальный срез должен менять одну архитектурную идею: сначала collider contract, затем один district, затем его visual dressing. После каждого среза запускаются соответствующие tests и browser smoke; крупная партия новых props без промежуточной проверки запрещена.

## Следующий активный срез

- [x] Уплотнить outer/north residential frontage крупным townhouse-row и соединить его с north gate route, сохранив bridge clearance.
- [x] Провести финальный художественный проход по всем крупным городским узлам и сверить desktop/mobile кадры после последнего среза.
