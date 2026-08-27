# План большой переработки героев — соло-фантазия, роли и контр-игра

> Исторический design draft. Исполняемый план и текущие значения находятся в
> `tasks/combat-audit-2026-08-plan.md` и `docs/combat-profile.json`; этот файл
> не является source of truth. В частности, актуальный профиль Mina использует
> 40 урона за звезду в revision `2026-08-27-cadence-window`.

## 1. Цель

Переработать восемь активных героев так, чтобы каждый был самодостаточен в
соло-режиме, имел ясную игровую фантазию и выраженную уязвимость. Авторитетной
остаётся Go-симуляция в `battle/model/game`; React/Three.js только отображает
состояние, телеграфы и результаты, не рассчитывая урон локально.

Целевые роли:

| Герой | Роль | Что игрок хочет делать | За что герой платит |
|---|---|---|---|
| Needle | зональный контроллер | занимать проходы и стягивать врагов в корни | низкий ближний burst и уязвимость к флангу |
| Mandy | ближний воин | пережить контратаку и реализовать усиленный удар/волну | короткая дальность и необходимость остановиться |
| Fairy Mina | гибридный саппорт | держать дистанцию, метить цель и выигрывать центр аурой | средний прямой урон и зависимость от тайминга супер-способности |
| Brock Zeus | дальний разрушитель | держать линию, выбивать укрытия и закрывать область молниями | медленный темп и слабость в ближнем бою |
| Kaze | ассасин | найти одиночную цель, убить её комбо и выйти | низкий запас ошибок; промах рывком оставляет без escape |
| Wukong Mico | танк-зачинатель | войти в группу, собрать врагов и пережить ответный урон | медленная атака и необходимость войти в опасную зону |
| Persephone Lumi | тактический контроллер | заранее расставить цветы и превратить их в опасный сад | задержка подготовки и средний мгновенный урон |
| Katty | контроллер пространства | накапливать краску, заставляя врага менять маршрут | короткая дальность и слабый урон без попаданий |

## 2. Зафиксированные стартовые значения

Это не финальная истина, а первая конфигурация для плейтеста. После каждого
вертикального среза значения сверяются с матрицей burst/устойчивого урона,
дальностью, контролем, мобильностью и самоисцелением.

| Герой | HP | Скорость | Базовый урон | Дальность | Ключевой payoff |
|---|---:|---:|---:|---:|---|
| Needle | 600 | 13 | 60 | 620 | притяжение + корни + замедление |
| Mandy | 700 | 15 | 100 / 150 усиленный | 110 / 143 усиленный | контратака, stun, wave |
| Fairy Mina | 650 | 14 | 40 за звезду | 510 | самолечение, mark burst, aura |
| Brock Zeus | 600 | 12 | 85 | 760 | три молнии, wall break, slow |
| Kaze | 650 | 16 | 85 / 128 усиленный | 125 | kill-reset, stealth crit |
| Wukong Mico | 900 | 14 | 100 | 140 | pull vortex, armor explosion |
| Persephone Lumi | 680 | 15 | 60 + 15/тик цветка | 520 | цветы, сад, seedburst |
| Katty | 640 | 14 | 55 | 220 | paint layers, blind, puddle |

Сохраняются `maxAmmo = 3` и три заряда гаджета. Все длительности и интервалы
должны быть серверными миллисекундами, без скрытых множителей в клиенте.

## 3. Архитектурные решения до изменения героев

### 3.1. Единый источник и порядок синхронизации

1. Сначала меняются Go-статы и `heroAttackConfigs`.
2. Затем обновляется `docs/hero-catalog.json`.
3. После этого обновляется fallback в
   `frontend/src/components/BattleGame/heroesConfig.js`.
4. В конце обновляются описания, HUD, VFX и fingerprint каталога.
5. Каждый hero-slice заканчивается `python tools/validate_hero_catalog.py`.

### 3.2. Общие серверные примитивы

До массового изменения китов добавить или обобщить следующие операции:

- `applyPeriodicDamage` и `applyPeriodicHeal` с `NextTickAt`, интервалом,
  количеством тиков и защитой от двойного применения в одном серверном шаге;
- `applySlow`, `applyStun`, `applyReveal`, `applyAntiHeal` с единым правилом
  продления/замены эффекта и явным временем окончания;
- `pullPlayersToPoint` с ограничением максимального смещения за тик, проверкой
  стен/тел и безопасным поведением при нулевом расстоянии;
- `dash/vault` с возвращаемой информацией о фактическом пройденном расстоянии,
  столкновении и убийстве цели;
- `applyShield`/снятие щита с корректным поглощением урона;
- wall-destruction helpers для радиуса, сектора и линии;
- единый `addEffect(kind, phase, ...)` контракт: `cast`, `telegraph`, `active`,
  `impact`, `status`.

Новые поля в `player.Player` и/или `HeroZone` добавлять только если их нельзя
выразить существующим временем окончания. Для каждого поля нужен snapshot
контракт, если по нему клиент должен показывать состояние.

### 3.3. Матрица баланса и сценарии

Добавить чистый Go-отчёт по каждому герою:

- урон одной атаки, полный урон трёх патронов и устойчивый DPS;
- максимальный единичный burst от Basic/Super/Gadget-комбо;
- максимальную дальность, радиус и длительность контроля;
- эффективное HP с учётом щита/лечения;
- мобильность и reset-потенциал;
- предупреждение, если полный базовый цикл убивает героя без response window.

Детерминированные сценарии: melee duel, long-lane trade, splash hit, вход в
зону контроля, solo sustain, support aura, full-ammo cycle, assassin reset и
разрушение стен. Числа разрешено менять только после записи результата сценария.

## 4. План по героям

### 4.1. Needle — «Ловчий контроллер»

#### Игровой цикл и контр-игра

Needle ставит корень на траектории отхода или под себя, стягивает противников и
добивает их серией шипов. Враг должен видеть 300-мс замах и успевать выйти из
центра; после срабатывания нужно избегать зоны или переждать её. Фланг и
прыжок в ближний бой остаются главной уязвимостью Needle.

#### Серверная реализация

- `heroes.go`: HP 600, speed 13, attack damage 60; роль и descriptions.
- `attack_config.go`: сохранить line projectile/range 620 и добавить параметр
  лёгкого steer 15 градусов только как ограниченное отклонение projectile.
- `new_hero_kits.go`:
  - Basic оставляет шипы и при успешном попадании накладывает `antiHeal = 50%`
    на 2 секунды; конечный радиальный split не должен многократно накладывать
    эффект на одну цель;
  - Super создаёт cast/telegraph на 300 мс, затем немедленно наносит 40 урона,
    притягивает врагов к центру и оставляет зону на 3 секунды;
  - зона тикает каждые 500 мс, наносит 15 урона и держит slow 60%; pull
    выполняется один раз на активации, не каждый тик;
  - Gadget заменяет `needle_moisture_reserve`: рывок на 6 метров, зона спор
    радиусом 90 на 2 секунды, slow 40%, один spore stack за тик/пересечение;
    третий stack оглушает и сбрасывает stacks;
  - определить, может ли гаджетный рывок пересекать стены; стартовое решение —
    обычный collision-aware dash, чтобы он не стал универсальным escape.
- `HeroZone` расширить полями для pull strength, tick damage/slow и stack state,
  либо вынести в отдельный компактный `StatusInstance`.

#### Frontend/VFX/HUD

- `heroesConfig.js` и каталог объясняют 300 мс замах, 40 initial damage,
  15/0.5s, anti-heal и stack-to-stun.
- Отдельные эффекты: `needle_root_cast`, `needle_root_pull`,
  `needle_root_tick`, `needle_spore_dash`, `needle_spore_cloud`.
- В world-space показать радиус корня до активации, направление pull и счётчик
  спор цели 1/3, 2/3; не показывать несуществующий клиентский урон.

#### Тесты и критерии готовности

- 300 мс telegraph, single initial hit 40, pull не повторяется;
- 6 тиков за 3 секунды, slow и damage обновляются ровно один раз за тик;
- anti-heal длится 2 секунды и не влияет на союзников;
- dash ограничен 6 м, cloud живёт 2 секунды, третий stack stun-ит один раз;
- побочный observer может покинуть зону после pull и не получает скрытый
  повторный burst.

### 4.2. Mandy — «Воин контратаки»

#### Игровой цикл и контр-игра

Mandy выбирает момент остановки, принимает часть урона под Gadget и отвечает
усиленным ударом. Super ломает коридор, но 800 мс подготовки остаются читаемым
окном для ухода или прерывания. Её нельзя одновременно сделать мобильной,
дальнобойной и неуязвимой.

#### Серверная реализация

- `heroes.go`: HP 700, damage 100; оставить speed 15, basic range 110.
- Focus после 2 секунд неподвижности даёт 150 damage, range 143 (×1.3),
  stun 800 мс; обычный удар — stun 300 мс. Проверить, что movement/input
  сбрасывает focus по существующему правилу.
- Super: wind-up 800 мс, shield 30% от `MaxLives` на время подготовки; после
  подготовки wave 140–220 по текущему серверному правилу, stun 1.2 секунды и
  разрушение стен по пути. Зафиксировать, разрешено ли движение во время
  подготовки; стартовый вариант — оставить существующее разрешение движения,
  но shield не должен переживать каст.
- Gadget `Unyielding Stance`: существующее снижение урона + усиление следующего
  удара; при успешном усиленном hit heal 10% max HP. Усиление Focus и Gadget
  ограничить общим cap 2.0× базового удара.

#### Frontend/VFX/HUD

- Показать `focus ready`, shield duration и `counter window` отдельными
  статусами; перед wave — line telegraph, на impact — wall-break wave.
- Использовать текущий Mandy staff и `AimGadget`, новые GLB не требуются.
- На мобильном не совмещать shield, focus и super-ready маркеры в один нечитаемый
  текстовый блок.

#### Тесты и критерии готовности

- stationary focus ровно после 2 секунд, усиленный hit range/damage/stun;
- super impact не раньше 800 мс, shield поглощает урон только в cast window;
- wave разрушает стены по пути и не имеет скрытого глобального AoE;
- gadget-heal срабатывает только от успешного empowered hit и ограничен max HP;
- комбинация Focus + Gadget не превышает cap 2.0×.

### 4.3. Fairy Mina — «Гибридный саппорт»

#### Игровой цикл и контр-игра

Mina стреляет веером, лечит себя за точность и разрывает цель на третьем
попадании. Super всегда делает её центром опасной ауры, поэтому враг может
отойти и переждать 4 секунды вместо того, чтобы бездумно входить в melee.

#### Серверная реализация

- `heroes.go`: HP 650, star damage 55; speed 14, range 510.
- Basic fan сохраняет три звезды. За каждую реально попавшую звезду Mina
  лечит себя на 5 HP, capped max HP. Mark хранится по source/target, третье
  попадание сбрасывает mark, наносит 80 в радиусе 100 и slow на 1 секунду;
  один target не должен получать несколько burst от одного projectile event.
- Удалить team-target selection из Super. Super всегда на Mina: shield 500 на
  4 секунды, aura radius 180, self-heal 15 каждые 500 мс, enemy damage 10
  каждые 500 мс. Aura не лечит союзников в этой итерации, чтобы соло-фантазия
  была однозначной; командная поддержка остаётся через точность и space control.
- Gadget: radius 150, enemy damage 30, knockback и очистка Slow/Stun/Burn и
  аналогичных отрицательных эффектов с Mina; не взаимодействует с mark.

#### Frontend/VFX/HUD

- Star projectile должен различать обычное попадание, heal-self и mark stack.
- `mina_star_cocoon`/aura следует за Mina, а не за выбранным союзником;
  показать shield ring и периодический enemy damage визуально, но не спамить
  эффектами каждый серверный тик.
- Gadget показывает radial cleanse/knockback; обновить описание, чтобы HUD не
  обещал лечение союзника.

#### Тесты и критерии готовности

- 1/2/3 звезды корректно считают self-heal и mark; третий hit даёт ровно один
  burst 80 + slow;
- Super никогда не выбирает ally и не выдаёт ему Mina shield; Mina получает
  ровно 500 shield, aura 15 heal/500 ms и 10 damage/500 ms;
- gadget очищает только Mina, отталкивает врагов в radius 150 и наносит 30;
- team mode не ломается: союзники не получают случайный enemy damage.

### 4.4. Brock Zeus — «Дальний разрушитель»

#### Игровой цикл и контр-игра

Brock заранее закрывает три последовательные точки и вынуждает противника
выбирать маршрут. Каждая молния должна быть опасной, но телеграфированной;
slow даёт шанс следующему удару попасть, а не превращает Super в гарантированную
серию без выхода.

#### Серверная реализация

- `heroes.go`: HP 600, attack damage 85, speed 12, basic splash 80.
- `attack_config.go`: basic splash radius 80; range 760.
- Super schedules three strikes with an explicit timing contract. До кодинга
  зафиксировать трактовку `0.7/1.1/1.5 сек`: стартовый вариант — абсолютные
  времена от начала Super, а не интервалы между ударами, чтобы общая серия
  занимала 1.5 секунды и оставляла response window.
- Strike 1/2: 80 damage, radius 70; strike 3: 120 damage, radius 110.
  Все три разрушают стены и после попадания дают slow 40% на 1 секунду.
  Damage/slow/wall-break применяются в одной authoritative impact operation.
- Gadget beam сохраняет piercing/wall break и создаёт ground fire на 3 секунды:
  5 damage каждые 500 мс. Ограничить число тиков и не создавать fire zone при
  промахе, если текущий контракт этого не предусматривает.

#### Frontend/VFX/HUD

- `LightningStrike`/effect payload должны различать strike index 1–3, radius,
  damage tier и slow window.
- Увеличить splash preview до 80; для Super показывать три телеграфа с разной
  толщиной/цветом, финальный — явно крупнее.
- Fire trail — отдельная active zone, не маскировать под один beam impact.
  Сохранить companion cloud и существующие GLB clips.

#### Тесты и критерии готовности

- три strike создаются в нужном порядке и времени; 1/2/3 damage = 80/80/120;
- радиусы = 70/70/110; wall break происходит на каждом impact;
- slow применяется после каждого успешного impact и истекает через 1 секунду;
- gadget fire имеет 6 тиков за 3 секунды по 5 урона и не дублируется;
- basic explosion radius синхронен в Go, catalog и frontend.

### 4.5. Kaze — «Ассасин исполнения»

#### Игровой цикл и контр-игра

Kaze входит через stealth или dash, находит цель с малым HP, добивает третьим
ударом и получает шанс продолжить серию. Reset разрешён только за убийство;
промах рывком не возвращает Super и оставляет Kaze без защитного бонуса.

#### Серверная реализация

- `heroes.go`: HP 650, speed 16, damage 85; сохранить melee range 125.
- Basic: третий удар игнорирует 30% armor, если броня существует в общем
  damage model; иначе использует дополнительный урон 20% от missing HP.
  Выбрать одну ветку до реализации, не поддерживать обе одновременно. Базовый
  усиленный damage остаётся 128 (150% от 85) и не должен складываться с двумя
  разными finishers без cap.
- Super dash 320, damage 160, stun 1 сек. Собрать список целей, поражённых
  одним непрерывным dash, применить урон один раз на цель. Если хотя бы одна
  цель умерла от этого dash — reset SuperCharge; иначе charge не меняется.
  После dash при любом успешном попадании дать +20% move speed на 2 секунды.
- Gadget stealth 3 секунды; первая Basic атака из stealth получает +100% crit,
  после атаки stealth и crit-ready снимаются. Уточнить, снимает ли любой damage
  stealth; стартовый вариант — да, чтобы у цели была честная контр-игра.

#### Frontend/VFX/HUD

- HUD показывает combo 1/3, 2/3, crit-ready, dash hit и reset только из
  authoritative snapshot/effect.
- Добавить короткий speed trail на 2 секунды и явный reset burst при убийстве;
  не показывать reset после простого попадания.
- Stealth crit должен быть виден атакующему и цели через impact tier, но не
  раскрывать позицию Kaze постоянным контуром.

#### Тесты и критерии готовности

- третий hit имеет выбранное правило armor/missing HP и не удваивается от
  KazeCombo + Gadget;
- dash поражает каждую цель максимум один раз, stun 1 сек;
- kill reset происходит только при фактической смерти от dash;
- успешный dash даёт haste 2 секунды, промах не даёт haste;
- stealth crit = ровно +100% к первой атаке и снимается после неё.

### 4.6. Wukong Mico — «Танк-зачинатель»

#### Игровой цикл и контр-игра

Mico копит Rage, прыгает в группу и удерживает врагов рядом с собой. Его
защита должна позволять начать бой, но взрыв по окончании гаджета даёт врагу
понятный момент: переждать/отойти или забрать Mico после окончания.

#### Серверная реализация

- `heroes.go`: HP 900, speed 14, damage 100, range 140; Rage cap остаётся 5,
  если плейтест не покажет, что четыре заряда достаточно.
- Super: сохранить короткий leap, затем vortex. При активации 50 damage всем
  в радиусе; в течение вихря враги сдвигаются к Mico с pull strength 30%,
  ограниченной стенами и максимальным смещением за tick. Периодический урон и
  лечение Mico сохраняются по существующему tick contract: 1 HP за тик.
- Rage продолжает масштабировать duration/radius, но проверить budget: базовая
  duration 2.5 сек, +0.25 за charge; base radius 140, +10 за charge. Не давать
  pull force масштабироваться от Rage без отдельного теста.
- Gadget `Stone Armor`: 4 секунды, damage reduction 60%, накопление урона cap
  240. При окончании или достижении cap — explosion 80 radius 140 и до 4 Rage.
  Ввести флаг `detonationDone`, чтобы timeout и cap не взрывали дважды.

#### Frontend/VFX/HUD

- Vortex preview показывает направление pull и safe edge; active effect должен
  быть отличим от обычного staff swing.
- Armor ring показывает stored damage 0–240 и pending explosion; impact effect
  сообщает прирост Rage.
- Сохранить `mico_suppressed_rage` только как fallback для старого состояния;
  после миграции гаджет должен показывать explosion event.

#### Тесты и критерии готовности

- Super initial impact = 50, pull применяется только к врагам и блокируется
  геометрией стен;
- vortex heals Mico по одному за тик и не лечит союзников;
- armor снижает входящий урон на 60%, stores не более 240;
- cap и timeout взаимно исключают повторный explosion;
- explosion 80/radius 140 и Rage не превышает 4 новых зарядов.

### 4.7. Persephone Lumi — «Тактический контроллер»

#### Игровой цикл и контр-игра

Lumi бросает цветок на 520, превращает точку попадания в угрозу и строит сад
для инициации. Враг может уклониться от снаряда, уничтожить/обойти цветы и
выйти из сада после 600-мс телеграфа. Это исправляет текущий контрактный конфликт,
где каталог уже говорит projectile, а `PersephoneLumiKit.Basic` всё ещё melee.

#### Серверная реализация

- `heroes.go`: HP 680, speed 15, basic damage 60; `attackType` переименовать
  только если это нужно для существующих asset/renderer контрактов.
- `attack_config.go`: archetype projectile, line aim, range 520, kind
  `lumi_orb`, projectile speed/size из согласованной конфигурации.
- `PersephoneLumiKit.Basic` спавнит projectile. При hit или окончании пути:
  1) direct damage 60, если hit;
  2) flower radius 70 на точке остановки;
  3) flower slow/reveal сохраняются;
  4) flower active zone наносит 15 каждые 500 мс в течение 6 секунд;
  5) не больше пяти собственных цветов, старые expire корректно уменьшают
     authoritative flower count.
- Super через 600 мс создаёт/активирует garden на range 80–520: initial damage
  60 и stun 1 сек врагам в радиусе 200, затем zone держится 6.6 сек и обновляет
  slow 60%. Initial damage и stun должны сработать один раз, а не на каждом
  tick/повторном входе.
- Gadget уничтожает owned flowers/gardens, наносит target один общий всплеск
  55, лечит Lumi по 10 за уничтоженный объект, cap heal 50. Сохраняется защита
  от двойного урона по overlapping zones.

#### Frontend/VFX/HUD

- Обновить `heroesConfig.js`, aim renderer и projectile renderer с melee cone на
  line projectile; убрать старое `lumi_scythe_swing` как основной basic feedback.
- Показать цветок как active damage zone с отдельными slow/reveal маркерами;
  garden имеет собственный cast telegraph и impact burst.
- HUD показывает `flowers 0–5`, seedburst heal и готовность Super; не скрывать
  15/500ms damage внутри только зелёного slow-поля.

#### Тесты и критерии готовности

- Basic создаёт projectile, а не melee hit; hit/expiry создаёт ровно один flower;
- flower живёт 6 секунд, наносит 15 каждые 500 мс, slow/reveal не пропадают;
- Super impact через 600 мс даёт 60 + 1 сек stun один раз, zone slow 60%;
- gadget удаляет только свои объекты, target получает максимум один 55 burst;
- heal = 10 за объект, максимум 50, и flower count не уходит в минус.

### 4.8. Katty — «Агрессивный контроллер пространства»

#### Игровой цикл и контр-игра

Katty размечает цель слоями, заставляет её покинуть короткую зону и использует
полет для смены угла. Лёгкое притяжение Super удерживает врага лишь на старте,
после чего у него остаётся окно выйти из лужи. След гаджета опасен только при
повторном пересечении, поэтому игроки получают ясный маршрут обхода.

#### Серверная реализация

- `heroes.go`: сохранить HP 640/speed 14, изменить attack damage 55;
  `attack_config.go` splash radius 65.
- Basic cloud radius 65. Paint layer 3 даёт текущий payoff (+45% damage и
  stun 800 мс); не увеличивать прямой burst сверх этого.
- Super: self-centered puddle, activation 500 мс, initial pull 25% к центру
  в течение 500 мс, impact 70 + 3 layers + stun 1 сек + blind 2.5 сек; zone
  7.5 сек, 12 damage/600 мс, slow 80%.
- Gadget: speed +15%, wall flight 2.2 сек, trail 4 сек. Trail на повторном
  касании Katty или врагом взрывается, наносит 40 и 2 paint layers; добавить
  `Triggered`/cooldown per trail segment, чтобы один contact не срабатывал
  каждый tick.

#### Frontend/VFX/HUD

- Обновить radius 65 и супер telegraph: pull-start, blind impact, persistent
  puddle. Существующая paint-stack telegraph 1/3 и 2/3 остаётся.
- Trail должен иметь armed/triggered state и отдельный explosion effect;
  flight/fade не должны выглядеть как уже активированный взрыв.
- Проверить mobile readability: краска, slow и blind не должны перекрывать
  health/nameplate без priority tier.

#### Тесты и критерии готовности

- basic splash radius = 65 и third layer payoff один раз;
- super pull длится 500 мс, impact/slow/blind имеют правильные времена;
- puddle damage = 12/600ms, 7.5s duration, без лишнего тика после expiry;
- trail повторное касание взрывает один раз за сегмент, 40 damage + 2 layers;
- wall flight по-прежнему не позволяет пересечь ocean/map boundary.

## 5. Frontend, snapshot и визуальная читаемость

После серверных срезов обновить:

- `battle/model/room/room_snapshot.go` — только необходимые компактные поля:
  mark/stacks, flower count, rage, combo, shield, haste/stealth, cast/telegraph
  state и target-facing statuses;
- `frontend/src/components/BattleGame/statusEffects.js` — единые короткие
  маркеры для anti-heal, spore stacks, root, blind, shield, aura, flower и
  armor stored damage;
- `frontend/src/components/BattleGame/rendering/combat/combatEffectPhase.js`
  и `EffectRenderer.js` — полный phase mapping для новых effect kinds;
- `ProjectileRenderer.js`, `AimRenderer.js`, `HeroView.js` — projectile/aim
  исправления Lumi, Needle steer, Brock radius и VFX Super/Gadget;
- ability buttons/hero skill panel — обновлённые names, descriptions, durations,
  counterplay и cooldown/charge text.

Все визуальные изменения должны быть event-driven. Snapshot не должен заставлять
клиент выводить урон, которого не было в Go.

## 6. Порядок реализации и контрольные точки

### Phase 0 — контракт и фундамент

1. Зафиксировать target balance table и выбрать открытые трактовки (Brock timing,
   Kaze armor rule, Mandy movement during cast).
2. Добавить общие status/zone/pull/shield/dash helpers.
3. Добавить combat matrix и deterministic scenarios.
4. Обновить только контрактные тесты, не меняя kit behavior.

Checkpoint: Go tests, catalog validator и frontend tests зелёные на старом
поведении; новые helpers покрыты изолированно.

### Phase 1 — контроллеры и самый рискованный drift

1. Needle.
2. Persephone Lumi.
3. Fairy Mina.

Checkpoint: ranged/zone/support browser QA на desktop и mobile; проверка, что
Lumi больше не выполняет melee basic.

### Phase 2 — melee execution и tank engage

1. Mandy.
2. Kaze.
3. Wukong Mico.

Checkpoint: melee duel, counter window, assassin reset и vortex pull scenarios.

### Phase 3 — дальний разрушитель и пространство

1. Brock Zeus.
2. Katty.
3. Общая нормализация VFX priority и HUD.

Checkpoint: long-lane, wall-break, puddle/trail и mobile readability QA.

### Phase 4 — финальный баланс и выпуск

- собрать combat matrix до/после;
- прогнать все deterministic scenarios минимум по 20 повторов;
- выполнить только малые tuning changes в пределах согласованной роли;
- обновить каталог fingerprint и user-facing descriptions;
- выполнить полный набор проверок.

## 7. Definition of Done

- [ ] Go simulation является единственным источником combat truth.
- [ ] Все восемь героев имеют новый Basic/Super/Gadget контракт в Go, каталоге и
      frontend fallback.
- [ ] На каждое изменение поведения есть Go regression test.
- [ ] Новые snapshot fields покрыты wire/frontend contract tests.
- [ ] У каждого Super/Gadget есть читаемые cast/active/impact/status states.
- [ ] Ни один эффект не наносит скрытый повторный урон при overlapping tick,
      повторном входе или client re-render.
- [ ] Каталог валиден, Go tests и frontend tests проходят, build успешен.
- [ ] Есть browser QA для ranged, melee, support и ground-zone heroes на mobile
      и desktop, браузерные процессы закрыты после проверки.
- [ ] `git diff --check` чист.

## 8. Риски и открытые решения

| Риск/решение | Почему важно | Предлагаемый стартовый выбор |
|---|---|---|
| Brock `0.7/1.1/1.5` | интервалы или абсолютные времена меняют dodge window | абсолютные impact timestamps от старта, финал на 1.5s |
| Kaze third-hit armor | armor может отсутствовать или иметь другой контракт | сначала проверить модель; если armor нет — missing-HP формула |
| Mandy cast movement | движение + shield может убрать контр-игру | сохранить движение, но shield только на 800ms |
| Mina aura в team mode | self-only aura усиливает соло, но меняет support-роль | не лечить союзников в первой итерации |
| Pull geometry | прямое смещение может протолкнуть в стену | только collision-aware movement с cap per tick |
| Новые анимации | увеличат scope и asset-риск | использовать текущие GLB; авторить только при плохой читаемости |
