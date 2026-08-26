# Глобальный аудит и переработка боёв героев — 2026-08

## Итог аудита

Боёвка сейчас страдает не от одной плохой цифры, а от рассинхронизации
четырёх систем:

1. Базовая атака задаёт основной ритм и имеет самый понятный feedback.
2. Super заряжается практически как отдельный cooldown, а не как награда за
   боевое мастерство.
3. Hero kits уже содержат много сильных эффектов, но их cast, telegraph,
   active, impact и status не образуют единый язык.
4. Боты умеют видеть, двигаться по маршруту и выбирать цель, но не имеют
   единой оценки тактических действий: атаковать, отступить, фармить ресурс,
   дождаться перезарядки, применить skill или удерживать позицию.

Главный вывод: не нужно продолжать добавлять отдельные исключения в текущую
цепочку. Сначала требуется новый контракт боевого цикла, затем два вертикальных
геройских среза, и только после этого массовый rebalance оставшегося ростера.

## Аудит соответствия исходному запросу

Предыдущая версия плана была сильной по архитектуре, но недостаточно жёстко
отвечала на семь исходных проблем. Исправления ниже считаются обязательными,
а не дополнительными пожеланиями.

| Исходная проблема | Что было недостаточно в плане | Исправление |
|---|---|---|
| Нет баланса между героями | Ролевая таблица была качественной, но не фиксировала matchup и цену силы | Для каждого героя обязательны win condition, 2–3 benchmark matchups, power budget и solo/team acceptance |
| Basic сильнее скиллов | Заряд Super за бой ещё не гарантирует, что skills решают исход | Basic = давление/setup/resource; Super/Gadget = conversion, escape, control или objective swing; считать basic-only и skill-assisted kills |
| Долгая перезарядка ударов | Были только общие гипотезы cadence/reload | Ввести per-hero `inputToFireMs`, `reloadDeadTime`, `readyWindowUptime`, `shotsPerEngagement` и acceptance по 100/60/30% accuracy |
| Непонятные анимации | Общая phase-схема не проверяла смысл конкретного skill | Для каждого skill сделать visual audit: намерение, силуэт, telegraph geometry, impact, status и animation semantic; промах не должен выглядеть как успешный удар |
| Ненужные HP-хилки | План противоречил запросу: cube «сразу восстанавливал бонус», то есть оставлял скрытую хилку | Удалить instant heal: зелёный cube меняет только MaxHP; текущие Lives не увеличиваются при подборе |
| Непонятны bats | Был reward loop, но не было жёстко определено, зачем игроку рисковать | Bat camp = опциональная инвестиция в MaxHP через contested cube; не обязательная PvE-ферма, не источник дополнительной хилки и не случайный моб |
| Тупые боты | Utility framework был общим, но ситуации из запроса не были превращены в state matrix | Добавить явные HP/ammo/threat/resource/team policies, hard interrupts, commitment time и failure metrics для каждого жалуемого поведения |

### Что именно значит «скиллы — основа драки»

Нельзя принимать этот пункт по одному `SuperReadyRate`. Для каждого hero/role
нужно измерять:

- долю убийств, где Basic был только setup, а conversion сделан Super/Gadget;
- долю выигранных trade через control, escape, shield, mark, zone или mobility;
- число осмысленных skill decisions за engagement;
- успешные и сорванные casts, включая причину miss/cancel/reject;
- время от cast до результата и время ответа противника.

Role profiles могут отличаться, но у каждого героя должен быть хотя бы один
сценарий, где без skill игрок проигрывает, а правильный skill меняет исход.
Если герой по-прежнему выигрывает тем же raw Basic DPS при выключенных skills,
его slice не принят, даже если Super красиво заряжается.

### Scope guard: что не добавляем в эту переработку

Чтобы не налеплять новые слои поверх старых, до завершения T7 не добавлять:

- Hypercharge, Star Powers, новые progression/perks и новые активные кнопки;
- новые игровые режимы и новые objectives поверх текущих solo/team rules;
- elite bats, если обычный camp loop ещё не доказал ценность;
- новые типы HP-loot, auto-heal, team-wide passive rewards;
- отдельную сложную practice UI-систему — сначала headless runner/debug overlay;
- leaderboard rewards на основе support/utility counters;
- числовой rebalance всех восьми героев до прохождения Kaze/Katty slices.

Лунные non-HP crates остаются отдельным решением: они не должны участвовать в
первом тесте HP-экономики и не могут менять damage/reload/Super baseline. Их
либо выключаем в Phase-1 combat profile, либо тестируем отдельным profile после
стабилизации зелёного cube.

### Что берём у других мобильных игр, а что не копируем

Из Brawl Stars полезны не числа, а ясные роли и отдельные источники силы:
официальные классы связывают strength с weakness и counter-class, а Traits
используют разные способы заряда Super — damage, damage taken, time, proximity
или healing. Gadgets имеют собственные cooldown, зависящие от силы эффекта.
Это поддерживает нашу role matrix, per-kit resource model и отказ от одного
глобального timer. См. [Brawler Classes](https://support.supercell.com/brawl-stars/en/articles/brawler-classes.html),
[Brawler Traits](https://support.supercell.com/brawl-stars/en/articles/brawler-traits-5.html)
и [Gadgets](https://support.supercell.com/brawl-stars/en/articles/gadgets-4.html).

Из Pokémon UNITE полезен принцип: нейтральные существа и выпадающая энергия
создают повторяемый contest за карту, а moves и роль Pokémon определяют, как
команда конвертирует ресурс в победу. Для нас это означает: bat должен
создавать позиционное решение и риск, а не просто иметь больше HP. См.
[Pokémon UNITE Overview](https://unite.pokemon.com/en-us/overview/).

Не копируем напрямую их damage, match duration, количество кнопок или
progression. Переносим только проверяемые принципы: role/weakness, отдельная
экономика способности, contestable neutral resource и ясная цель режима.

## Фактический baseline

### Что уже является хорошей основой

- Go-симуляция в `battle/model/game` остаётся authoritative source of truth.
- Для героев уже есть отдельные `CombatKit`/`BasicCombatKit`, серверные
  cooldown, ammo, status effects и event-driven snapshot.
- Введены `combatEvents`, фазы эффектов, world-space hit feedback, prediction и
  reconciliation.
- Для ботов уже есть perception, concealment/line-of-sight, cached pathfinding,
  steering, dodge и отдельная стратегия командного режима.
- Визуальный runtime использует один Three.js-путь и авторские GLB-анимации.

### Системные проблемы, подтверждённые кодом

| Область | Наблюдение | Почему это плохо |
|---|---|---|
| Базовая атака | В `game_types.go` применяются глобальные `AttackRateScale = 1.55` и `ReloadTimeScale = 1.22`, поверх компактных значений каталога | Реальный темп боя скрыт от таблицы баланса; каждое изменение героя проходит через неочевидный multiplier |
| Super | `SuperChargePercent` фактически считает время от `LastPrimaryAt`; после reset герой стартует с `SuperCharge = 100` | Super ощущается как периодический таймер, а не как боевой payoff; стартовый бой может решаться готовым skill |
| Gadget | Для большинства героев используется один глобальный cooldown `6500 ms` | Сила и частота разных гаджетов не оплачиваются одинаково |
| Balance matrix | `combat_balance.go` считает только basic burst/DPS/range/HP/speed | В таблице отсутствуют control, mobility, sustain, setup и skill payoff; «сильный» hero может выглядеть слабым или наоборот |
| Ростер | Номинальный full-ammo burst: Needle 180, Mandy 300, Mina 495, Brock 255, Kaze 255, Mico 300, Lumi 180, Katty 165 | Одно и то же число попаданий не означает одинаковый бой; Mina имеет огромный theoretical burst, а Katty/Lumi/Needle должны зарабатывать силу через setup |
| Pickup economy | Legacy `health_crate`/`potion-red` pipeline удалён; hero и bat defeat создают только `health_boost` | Новый профиль имеет один HP-ресурс; осталось проверить budget/contest metrics и safe drop positions |
| Боты | `updateBattleRoyaleBots` и team strategy используют приоритетную цепочку условий, а не общую utility-модель | Ситуация «низкое HP + видимый враг + рядом зелёный куб» не сравнивается как единый выбор |
| Боты и HP-ресурс | `botPickupTarget` учитывает незаполненный cap `health_boost`; team и solo policies умеют идти к cube, а bat wind-up даёт hard retreat interrupt | Нужны role-aware action scores, hysteresis, assignments и contest metrics |
| Командный AI | Приоритеты team AI: defend → support → attack base → attack player → regroup → roam | Нет распределения ролей, фланга, фокус-фаера, contest ресурса и решения «сначала убить / отступить / удерживать choke» |
| Анимация | `GLBHeroController` запускает basic по `attackPulse`, а визуальное окно атаки фиксировано в `.42 s`; skill запускаются по pulse отдельно | Animation timing не связан с authoritative cast/impact; skill может выглядеть как обычный overlay или ударить до визуального payoff |
| Контракты | В каталоге и master-animation pipeline сейчас есть stale fingerprint/отсутствующий Brock master asset; frontend имеет 3 failing named tests и один module import failure | Нельзя честно балансировать или оценивать читаемость, пока источники данных и runtime assets не проходят базовую валидацию |

Это baseline, а не финальные balance-значения. Nominal DPS и burst должны быть
пересчитаны после устранения global multipliers и включения реального времени
перезарядки/попаданий.

## Целевая модель боя

### 1. Базовая атака — давление и подготовка

Basic должен быть доступным и отзывчивым, но не главным источником всей силы.

- Убрать скрытые глобальные scaling constants; runtime должен использовать
  значения из единого `CombatProfile`.
- На первом срезе оставить 3 ammo, но сделать reload per shell и разрешить
  быстро вернуть хотя бы один выстрел после короткого downtime.
- Выдать каждому hero собственную cadence/range/spread, а не балансировать весь
  ростер через одну скорость.
- Не блокировать движение длинной атакующей анимацией, кроме осознанного
  wind-up конкретного героя.
- Базовые попадания должны заряжать Super и/или подготавливать kit payoff, но не
  давать скрытый raw damage multiplier.

Гипотеза для playtest, не финальные значения: basic shot interval примерно
0.25–0.55 s, возврат одного ammo примерно 0.8–1.6 s. Конкретные числа должны
пройти scenario matrix для melee, ranged, shotgun и controller.

### 2. Super — награда за бой, а не второй reload timer

Предлагаемый контракт:

- стартовый Super обычно 0–25%, а не 100%; исключения возможны только как
  осознанная роль героя;
- charge приходит за подтверждённый damage, полезный control/support и contest
  ключевого объекта; формула нормализуется относительно HP цели;
- попадания по одной и той же цели не должны позволять бесконечный быстрый
  цикл без diminishing return;
- после Super должен оставаться понятный ответ: dodge, interrupt, break line of
  sight, выйти из зоны, переждать shield или наказать промах;
- cooldown может остаться как safety valve, но не должен быть единственным
  источником готовности.

Это переносит акцент с «ждать 12 секунд» на «хорошо разыграть окно боя».

### 3. Gadget — короткое тактическое решение

Gadget должен отвечать на конкретную ситуацию: escape, engage, cleanse,
defense, setup или conversion. Для каждого героя фиксируются:

- количество зарядов;
- cooldown и правило восстановления;
- лучший момент использования;
- видимый риск и контр-игра;
- связь с Basic/Super, но без обязательной комбинации, которую нельзя
  прервать.

Первый срез может сохранить 3 charges для совместимости, но cooldown нельзя
оставлять глобальным для всех kit.

## Ролевая матрица ростера

Сила героя должна быть не «у него больше damage», а «он лучше решает конкретную
задачу и уязвим в другой».

| Герой | Сильная задача | За что платит | Что должен понимать противник |
|---|---|---|---|
| Needle | anti-heal, root zone, lane denial | низкий мгновенный burst, setup | не входить в telegraph/root, выйти из spores |
| Mandy | ближний trade и Focus payoff | должна удерживать позицию, уязвима до cast | вынудить двигаться или наказать wind-up |
| Fairy Mina | sustain, mark conversion, спасение себя/команды | низкая стойкость в прямом burst | не дать накопить mark, разорвать aura |
| Brock Zeus | дальняя линия, splash, разрушение cover | медленный reload, плохой close-range | выйти из strike reticle и сократить дистанцию |
| Kaze | entry, execution, reset после правильного убийства | рискованный вход и слабее после промаха | пережить dash, наказать miss/reset window |
| Wukong Mico | engage, soak damage, close control | медленно входит в бой и не должен убивать издалека | не кормить Rage, выйти из vortex |
| Persephone Lumi | setup через flowers/garden и detonation | зависит от подготовки, уязвима без зон | уничтожать/обходить flowers, не стоять в garden |
| Katty | paint stacks, choke control, flight escape | короткий reach и слабый прямой trade | видеть stacks и не давать третье попадание |

Для каждого героя должен существовать один sentence win condition и один
sentence counterplay. Если их нельзя показать во время боя без wiki, kit ещё не
готов.

## HP-экономика и роль bats

### Что убрать

- Убрать случайно разбросанные `health_crate` как источник лечения.
- Убрать `potion-red` из боевого режима.
- Не оставлять несколько визуально похожих HP-ресурсов с разными правилами.

### Что оставить

Один зелёный health cube:

- выпадает из поверженного героя и bats;
- увеличивает `MaxLives` на фиксированный процент от базового HP героя;
- не восстанавливает текущие `Lives`: это инвестиция в выживаемость, а не хилка;
- имеет короткий, читаемый зелёный VFX и счётчик stacks;
- имеет soft cap/diminishing return, чтобы лидер не становился неубиваемым;
- в team mode сохраняет явное правило ownership: killer/team visibility должны
  быть понятны по HUD и minimap.

В `CombatProfile` это зафиксировано явно: `healthPickupIds` содержит только
`health_boost`. Лунные `nonHpPickupIds` остаются отдельным optional-бонусом:
они не являются HP-ресурсом, не лечат текущие `Lives` и не должны попадать в
метрики HP-экономики или менять её бюджет.

На первом балансовом срезе сохранить только формулу `HealthBoostFraction` от
`BaseMaxLives`, но не её текущий side effect на `Lives`. Заменить все остальные
HP-источники и проверить snowball на сценариях «ранняя победа», «камбэк» и
«командный обмен».

### Новая роль bats

Bats должны стать нейтральным contested resource, а не случайным раздражителем.

1. Предсказуемые lairs/camps на карте, симметричные в team mode.
2. Ограниченный aggro radius и leash к lair; bat не преследует игрока через всю
   карту.
3. Явный wind-up/telegraph атаки, чтобы его можно было обыграть движением.
4. Простая, но различимая модель поведения: patrol → aggro → strike/retreat.
5. Убийство всегда даёт зелёный cube или определённый гарантированный reward,
   а не случайную красную хилку.
6. Camp должен быть причиной занять позицию и вступить в конфликт: награда
   видна, но сбор требует времени и создаёт риск.
7. Elite bat не входит в первый срез: его можно добавлять только после того,
   как обычный camp loop докажет ценность и не создаёт обязательную PvE-ферму.

Так bats получают ясную функцию: темп, риск и повод для столкновения за ресурс.

## Новая архитектура ботов

Оставить существующие perception, steering и pathfinding как техническую базу,
но разделить AI на три слоя:

### Perceive

Blackboard собирает только доступную боту информацию:

- видимые враги, allies, bats, cube и objective;
- HP/shield/ammo/super/gadget/cast state;
- threat telegraphs, recent damage, line of sight, cover;
- дистанцию до preferred range и безопасную позицию;
- stuck/path confidence и last seen target.

Никакой map-wide omniscience.

### Decide

На каждом decision tick utility scorer сравнивает действия:

`evade`, `retreat`, `collect_cube`, `engage`, `kite`, `use_super`,
`use_gadget`, `farm_bats`, `contest_bat`, `defend_objective`, `push_objective`,
`regroup`, `scout`.

Каждое действие получает score из context: HP, expected damage, risk, distance,
time-to-value, ally support, enemy control, reward value и hero role. Решение
должно иметь hysteresis/cooldown, чтобы бот не прыгал между действиями каждый
тик.

### Act/steer

Decision выдаёт intent, а не телепорт к цели:

- target point;
- preferred range;
- aim point/lead;
- fire/ability command;
- retreat/cover point.

Steering и cached path превращают intent в движение. Для team mode добавить
assignment: engager, support, flanker, defender или resource runner. Это должно
быть role-aware, но не привязано к жёсткому списку имён героев.

### Bot situation matrix

Начальная матрица поведения должна быть явной. Пороговые значения — доля
текущего MaxHP, их можно тюнить профилем сложности, но не менять смысл решения:

| Состояние | Обязательная реакция | Запрещённое поведение |
|---|---|---|
| HP ≤25% + lethal threat | dodge/retreat/cover; cube только если путь безопаснее отхода | продолжать circle-strafe рядом с врагом |
| HP 25–45% + нет immediate threat | kite, найти cube/cover, ждать ammo или cooldown | беспричинно убегать через всю карту |
| HP ≥70% + ammo/skill ready | commit к выбранной цели, pressure или contest | стоять рядом без атаки |
| Ammo = 0 | disengage в preferred range/cover, reload, затем re-engage | пытаться атаковать пустым магазином |
| Враг в finish range | оценить finish skill, basic или безопасный retreat по risk | бесконечный strafe без command |
| Видимый зелёный cube | сравнить reward value с exposure и distance-to-threat | игнорировать ресурс без объяснимого score |
| Bat camp рядом и враг далеко | farm/contest по role и timer | атаковать bat, не учитывая появление врага |
| Telegraphed lethal skill | hard interrupt: evade, break LOS, shield или retreat | продолжать старый intent |

Для team mode добавить вторую матрицу:

- `engager` первым создаёт threat и не покидает цель без risk override;
- `support` держит preferred distance, использует peel/save и не забирает
  contested cube, если ally-killer безопаснее его конвертирует;
- `flanker` атакует backline/objective только при наличии exit path;
- `defender` прерывает push к собственной башне/ратуше;
- `resource runner` забирает bat/cube только когда команда не проигрывает
  4v3 в текущей зоне.

Каждый отказ от атаки, pickup или retreat должен иметь telemetry reason:
`no_los`, `out_of_range`, `low_ammo`, `lethal_risk`, `better_objective_value`,
`assigned_role`, `target_stale` или `stuck_recovery`. Это превращает жалобу
«бот тупой» в конкретную исправляемую причину.

### Обязательные bot scenarios

- видимый враг и полный ammo: бот атакует, а не кружит без причины;
- враг в melee range: бот выбирает finish/retreat/skill, а не бесконечный strafe;
- низкое HP + зелёный cube + опасный враг: scorer выбирает рискованный, но
  осмысленный pickup или retreat;
- готовый Super с telegraph opportunity: бот использует его в подходящее окно;
- enemy bat camp рядом: бот понимает contest/farm, а не игнорирует объект;
- team fight 3v3: союзники фокусируют одну цель, support держит дистанцию,
  defender не покидает базу без причины;
- target потерян за стеной: бот ищет/перестраивается, а не стоит на месте.

## Визуальный и animation contract

Для каждого Basic/Super/Gadget в authoritative effect должна быть фаза:

`intent → cast → telegraph → active/projectile/zone → impact → status/cleanup`.

Правила:

- hitbox и telegraph используют один и тот же радиус/линию/тайминг;
- Super визуально сильнее Basic, но не превращает экран в постоянный шум;
- status показывает причину и оставшееся окно: stun, slow, root, mark, stacks,
  shield, paint, flower, rage;
- hero animation должна запускаться по ability event/phase, а не только по
  общему pulse с фиксированным `.42 s`;
- impact effect привязан к фактическому authoritative event, а не к моменту
  клика;
- melee имеет отдельные wind-up/active/recovery окна;
- зоны и trails имеют `armed/active/triggered/expired`, чтобы не выглядеть как
  уже сработавший взрыв;
- для мобильного экрана есть priority tiers и reduced-flash/reduced-shake режим.

## Порядок реализации

### Phase 0 — заморозить baseline и исправить источники

1. Починить catalog fingerprint, canonical master assets и 4 текущих frontend
   test failures.
2. Прогнать battle/frontend tests из правильных module roots.
3. Зафиксировать текущую matrix по каждому hero, включая runtime cadence,
   reload, full-ammo burst, hit rate и skill cooldown.
4. Добавить deterministic combat scenarios и сериализованный report до/после.
5. Добавить события для `shot accepted/rejected`, `ability accepted/rejected`,
   `cast`, `telegraph`, `impact`, `status applied`, `cube collected`, `bat killed`.

**Checkpoint 0:** catalog validator, focused Go tests, frontend tests/build и
репродуцируемый matrix report зелёные.

### Phase 1 — новый общий combat loop

1. Ввести versioned `CombatProfile`/balance source вместо hidden global scales.
2. Перенастроить basic cadence/reload и melee lock без hero-specific hacks.
3. Перевести Super charge на combat contribution; оставить cooldown только как
   защиту от edge cases.
4. Сделать Gadget cooldown/charges частью kit profile.
5. Обновить HUD: ammo, ready window, Super charge source, gadget cooldown и
   короткий counterplay hint.

**Checkpoint 1:** одинаковый scenario pack показывает, что Basic создаёт
давление, но skill payoff решает исход; нет instant delete full-health hero без
телеграфированного окна.

### Phase 2 — два вертикальных hero slices

Начать с Kaze и Katty: это контраст сильного melee assassin и setup-controller.

- Kaze: entry risk, combo payoff, reset только после правильного finish, понятное
  окно наказания.
- Katty: paint 1/2/3, короткий reach, readable zone/flight и честный payoff.

Затем пройти Needle/Lumi/Mina как ranged/control/support slice, после этого
Mandy/Brock/Mico как fighter/sharpshooter/tank slice.

Для каждого hero обязательно: role contract, balance row, 1v1 scenario,
teamfight scenario, ability counterplay, visual phase test.

### Phase 3 — HP cube и bats

1. Удалить `health_crate` и `potion-red` из match spawn/drop pipeline.
2. Перекрасить и переименовать health cube в зелёный authoritative pickup.
3. Оставить единый `HealthBoostFraction` от BaseMaxLives и добавить soft cap.
4. Переписать bats как camps/lairs с telegraph, leash, reward и respawn rule.
5. Добавить UI/minimap ownership и reward feedback.

**Checkpoint 3:** игрок за 10 секунд понимает, что даёт зелёный cube, зачем
убивать bat и какой риск связан со сбором.

### Phase 4 — utility AI

1. Ввести blackboard/perception snapshot.
2. Вынести действия в utility scorers и добавить hysteresis.
3. Добавить role-aware combat policies: range, melee, controller, support,
   tank, assassin.
4. Добавить bat/cube/objective actions.
5. Добавить team assignments, focus-fire, regroup, defend/push transitions.
6. Добавить bot debug telemetry: state, chosen action, score, target, aim error,
   stuck time, shots, hits, skills, pickups, deaths.

**Checkpoint 4:** deterministic bot scenarios не показывают idle, бесконечный
circle-strafe или игнорирование доступного cube без объяснимой причины.

### Phase 5 — visual combat pass

1. Сопоставить server phases и GLB one-shot actions.
2. Ввести единый layer для cast/telegraph/active/impact/status.
3. Пересобрать ambiguous effects, начиная с Super/Gadget и зон.
4. Добавить сильный, но короткий hit feedback: contact flash, damage number,
   impact sound/shake/hit-stop только для значимых событий.
5. Проверить мобильные safe areas, occlusion, VFX priority и reduced motion.

### Phase 6 — team mode и финальная настройка

1. Повторить balance scenarios для 3v3, потому что support/control value сильно
   отличается от solo.
2. Проверить base/objective pressure, respawn и cube ownership.
3. Сделать малые tuning changes только после telemetry.
4. Выпустить combat version с changelog и rollbackable balance profile.

## Второй проход: решения, которые нужно зафиксировать до реализации

### 1. Super не должен вычисляться из `LastPrimaryAt`

Сейчас `SuperChargePercent` восстанавливает готовность по времени после
последней базовой атаки, а `resetPlayerMatchState` ещё и выставляет готовый
Super. Это делает Super вторым видом reload timer и не даёт различить damage,
control, support и objective contribution.

Предлагаемый контракт:

```text
chargeDelta = damageCredit
            + controlCredit
            + supportCredit
            + objectiveCredit
```

Каждая часть задаётся в hero/role profile. Damage считается от effective damage
по отношению к max HP цели, а control/support/objective получают ограниченный
кредит только за подтверждённый полезный результат. Для одной цели и одного
каста действует cap и diminishing return, чтобы AOE, DoT и stun не заряжали
Super бесконечно быстро. Урон по spawn-protected или уже побеждённой цели не
даёт ресурса.

`SuperCharge` становится authoritative source of truth. `LastPrimaryAt` может
остаться только для cooldown/антиспама и больше не должен определять готовность.
Начальный charge и charge после смерти должны быть явным параметром
`CombatProfile`, а не побочным эффектом reset-кода.

### 2. Зафиксировать смерть и респавн как отдельную экономическую систему

Для team mode рекомендую первый вариант playtest:

- постоянные зелёные HP-стэки сохраняются;
- текущий Super после смерти сбрасывается в 0% или небольшой role-specific
  стартовый минимум 10–25%;
- временные статусы, комбо, marks, shield и empowered state сбрасываются;
- ammo восстанавливается полностью;
- Gadget charges не восполняются полностью: сохраняется остаток, максимум
  возвращается только один charge по правилам kit.

Это предотвращает цикл «умер с готовым Super → моментально выиграл следующий
вход», но не превращает смерть в полное обнуление долгосрочной награды.
Поведение должно быть покрыто тестами отдельно для solo, team respawn и
последнего живого игрока.

### 3. Зелёный cube: один ресурс, но не бесплатный командный snowball

В текущей логике monster/hero drop может одновременно дать heal-подобный
pickup и HP boost, а team kill раздать бонус нескольким игрокам. Для новой
системы источник должен быть один: hero или bat создаёт зелёный cube,
`collect` даёт только `BaseMaxLives` bonus и не является мгновенной лечилкой.

Формула для первого теста:

```text
bonus = baseMaxHP * min(step * stacks, softCap)
```

Нужно сравнить два ownership-профиля:

- `killer-only`: cube достаётся игроку, который подтвердил убийство;
- `team-claim`: cube видит команда убийцы, но его может подобрать только один
  игрок, а не получить каждый автоматически.

Рекомендую начать с `killer-only` в solo и `team-claim` в team mode. Ввести
мягкий cap в 5–6 стэков и отдельный сценарий comeback: команда, которая
отстаёт, должна иметь возможность contest, но не получать гарантированный
бонус за пассивное ожидание.

Статические health crates и authored `potion-red` точки нужно удалить, а не
оставлять как запасной источник лечения. Нельзя одновременно тестировать новую
экономику и старую карту sustain.

### 4. Bats — это contestable camp, а не просто ещё один melee mob

У bat должен быть конечный, читаемый цикл:

```text
patrol → notice → chase → wind-up → strike → retreat/leash → defeated
```

На карте должны быть camp/lair points, ради которых игрок принимает решение
«заняться bat сейчас или продолжить бой». В первом варианте достаточно одного
гарантированного зелёного cube за camp и ограниченного respawn по таймеру;
редкий elite bat можно добавлять только после того, как обычный цикл доказал
свою ценность.

Обязательные правила: видимый wind-up, одна понятная зона удара, leash при
выходе из camp, запрет бесконечного преследования, spawn protection от
моментального урона и telemetry на contest time, damage taken, kills и reward
conversion. Если bat не создаёт выбора между риском и наградой, его нужно
убрать из режима, а не оставлять ради заполнения карты.

### 5. Балансировать не только DPS, а power budget героя

Для каждого героя нужна строка по шести измерениям:

| Измерение | Что проверяем |
|---|---|
| Threat | урон, burst, range и подтверждение попадания |
| Safety | escape, shield, invulnerability и дистанция |
| Control | slow, stun, zone, displacement и denial |
| Mobility | entry, reposition, chase и disengage |
| Sustain | HP, heal, shield и способность пережить trade |
| Conversion | насколько skill превращает setup в kill/objective |

Герой может быть сильным в 2–3 измерениях, но должен платить ценой в других:
дальность, skillshot, долгий wind-up, ограниченный ресурс, плохой escape или
низкий direct-trade floor. Так мы не будем пытаться сделать всех одинаковыми
по raw damage.

Минимальный scenario pack для каждого героя:

1. 1v1 при 100%, 60% и 30% accuracy;
2. direct trade без Super и с готовым Super;
3. entry/disengage против контр-роли;
4. contest зелёного cube и bat camp;
5. 3v3: damage, assist, peel, zone value и objective pressure.

### 6. Ввести измеримые целевые показатели до числового тюнинга

Числа ниже — не финальный баланс, а метрики для принятия решений:

- `time_to_first_meaningful_hit`: когда игрок впервые получает понятный
  результат после начала engagement;
- `TTK` на трёх уровнях точности и с разным состоянием ресурсов;
- `full-ammo deletion rate`: доля случаев, когда одна базовая обойма убивает
  full-health цель без skill setup;
- `skill conversion rate`: доля кастов, которые дали damage, control, save,
  escape или objective value;
- `basic downtime` и `ready-window uptime`;
- `Super ready rate`, среднее время до первого Super и charge source split;
- `counterplay window`: время от читаемого telegraph до active impact;
- для AI: idle time, stuck time, shots/hits, skill acceptance, retreat rate,
  cube/bat contest rate и необъяснимые смены цели.

Каждый tuning commit должен показывать before/after report. Если параметр
улучшает один metric и ломает два соседних, изменение отклоняется независимо
от субъективного ощущения одного матча.

### 7. AI: сначала hard interrupts, затем utility scores

Utility не должен позволять боту «выбрать красивую цель» во время смертельной
угрозы. Приоритеты должны быть двухслойными:

1. hard interrupts: lethal threat, imminent telegraph, storm/out-of-bounds,
   stuck recovery, spawn protection;
2. utility choice:

```text
score = expectedValue * confidence
      - exposureRisk
      - opportunityCost
      + roleFit
      + urgency
```

Решение принимает perception snapshot, а steering только исполняет уже
выбранный intent. Нужны hysteresis и minimum commitment time, иначе бот будет
переключаться между cube, bat и enemy каждый тик. Для team mode blackboard
должен хранить assigned target, assigned camp/objective, retreat point и
cooldown на повторную заявку помощи.

Для skill use бот должен оценивать не только «цель в радиусе», но и expected
value после cast: попадёт ли зона, есть ли союзник для save, создаёт ли entry
Super безопасный выход, не потратит ли он последний escape против угрозы.
Сложность бота должна менять confidence, reaction delay, aim error и глубину
планирования, но не давать ему map-wide knowledge.

### 8. Миграция — через версию правил, а не через полусмешанный режим

До начала Phase 1 добавить `CombatRulesVersion`/`CombatProfileId` в match
configuration и scenario report. Server остаётся authoritative, client только
визуализирует phase events. На переходный период допустимы старый и новый
profile для отдельных deterministic scenarios, но нельзя оставлять старый
таймер Super, старую potion-red экономику или hidden global multipliers как
неявный fallback нового режима.

Каждое изменение должно иметь rollbackable profile и changelog: правила
ресурсов, формула charge, damage/reload, ownership, respawn policy и AI
difficulty. Это позволит проводить playtest партиями и понимать, какая именно
часть переработки дала эффект.

## Третий проход: системные контракты, которых не хватало

### 1. Один canonical plan и карта конфликтов документации

`combat-audit-2026-08-plan.md` должен стать главным планом глобальной
переработки. Остальные документы не исчезают, но получают подчинённую роль:

- `hero-rework-2026-08-plan.md` — детальные hero-kit proposals;
- `hero-combat-overhaul-2026-08-spec.md` — общие инженерные ограничения;
- `combat-brawl-stars-plan.md` — hit-feel, presentation и map affordances;
- `combat-audit-2026-08-todo.md` — исполняемый список задач.

Перед кодом нужно закрыть конфликты между ними:

| Тема | Старое предположение | Каноническое решение для нового плана |
|---|---|---|
| Super | `LastPrimaryAt` и стартовая готовность 100% | `SuperCharge` — authoritative combat resource, старт 0–25% по profile |
| Gadget | Три одинаковых глобальных charge | Charges/cooldown задаются kit profile |
| Pickup | `health_crate`, `potion-red`, `health_boost`, lunar loot | В боевом core-профиле один зелёный HP cube; остальное выключено флагом режима |
| Respawn | HP/ammo сбрасываются, способности не описаны | Явная death/respawn policy для каждого ресурса |
| Visual | Pulse запускает fixed animation window | Серверная phase timeline управляет cast/telegraph/active/impact/status |
| Balance source | Go, catalog и frontend fallback редактируются рядом | Один versioned balance contract, остальные представления валидируются против него |

Ни один старый TODO нельзя считать разрешением на реализацию, если он
противоречит этой таблице. До Phase 1 нужен короткий decision log с датой,
вариантом, причиной и тестом, который будет ловить откат решения.

### 2. Разделить контракты solo и team mode

Общая hero-механика может быть одной, но темп и смысл ресурсов различаются:

| Контур | Solo deathmatch | Team deathmatch |
|---|---|---|
| Победа | последний выживший или beacon-фаза | town hall/towers и timeout по HP ратуши |
| Темп | island phases, storm/collapse, beacon | 5 минут, objectives, base regeneration |
| Смерть | матч для игрока закончен | respawn через 5–15 секунд до разрушения ратуши |
| Cube | личный contest и comeback | одноразовый team-claim, не автоматическая раздача всем |
| Bats | нейтральная охота и риск позиции | симметричные camps, contest между линиями |
| Balance check | 1v1, escape, survival, beacon pressure | 3v3, peel, focus fire, objective pressure, respawn entry |

Нельзя использовать средний solo TTK как единственный критерий team mode:
башни, base regen, focus fire и респавн меняют ценность безопасности и
контроля. Для objective damage разрешён отдельный target-class coefficient,
но скрытый глобальный buff у героя запрещён.

Каждый hero slice обязан иметь два acceptance reports: solo и team. Если герой
хорош в solo только благодаря самохилу, а в team ломает focus fire, это не
«балансная мелочь», а отдельный mode contract.

### 3. Cube economy должна иметь бюджет матча

Одного названия `health_boost` недостаточно. До реализации описать поля:

- `dropSource`: hero kill или bat defeat;
- `rewardFraction` и soft cap stacks;
- `ownerMode`: killer-only или one-time team-claim;
- `ttl` и active-map cap;
- `pickupGrace`: короткое время, когда reward защищён от случайного подбора;
- `dropPosition`: безопасная authoritative точка, а не позиция внутри стены;
- `comebackRule`: что меняется при большой разнице HP/stack count, если вообще
  меняется.

Начальный playtest profile: один cube за подтверждённый hero kill, один за
полученный bat reward, без одновременного heal; все значения вынесены в
profile, чтобы сравнивать варианты. Отдельно измерять `cubes created`,
`cubes collected`, `time on ground`, `denied/contested` и прирост win rate от
каждого стэка. Если cube только усиливает лидера, менять budget/ownership, а
не добавлять ещё один comeback pickup.

### 4. Skills должны иметь mobile input contract

Скилл не может считаться основой боя, если на телефоне он запускается только
как «нажать кнопку и надеяться на текущую цель». Для каждого Basic/Super/Gadget
зафиксировать:

| Тип | Ввод | Отмена/ошибка | Автонаведение |
|---|---|---|---|
| Directional | drag/aim + release | отпустить вне valid cast или cancel gesture | только в заданном cone |
| Point/zone | tap или drag в точку | cancel до release, invalid point — no cast | ближайшая valid точка только по profile |
| Self/channel | tap, затем channel state | interrupt/disable и стоимость ресурса | не выбирает случайную цель |
| Targeted | tap target или portrait | target lost — явный fail reason | только видимая разрешённая цель |

Для каждого действия нужны `castStarted`, `castCancelled`, `castRejected` с
причиной. При любом промахе игрок должен понимать: skill не попал, был
отменён, не прошёл cooldown или цель была недоступна. Auto-aim не должен
подменять skillshot в тестах баланса.

### 5. Presentation и сеть: дискретные события, а не поток тиков

Текущий `StateUpdate` уже переносит players, props, effects и последние
combat events. При добавлении telegraph/impact нельзя отправлять отдельное
сообщение каждый серверный тик.

Нужны два уровня:

1. компактный snapshot для состояния (`phase`, cooldown, status, resource);
2. одноразовый event stream для `cast`, `telegraph`, `impact`, `status` и
   `resource_change`, который клиент дедуплицирует по ID.

В контракте события нужно различать `accepted`, `rejected` и `not_applicable`;
не использовать `omitempty` для boolean, если отсутствие и `false` имеют
разный смысл. У rejected ability всегда должен быть `reason`.

`CombatRulesVersion`, `CombatProfileId` и phase/event ID должны приходить в
snapshot или match-start payload. Presentation не должен угадывать версию
правил по наличию поля.

До реализации задать бюджеты: максимальное число активных effect/event на
клиенте, TTL event history, допустимый размер snapshot, duplicate rate и
frame-time на среднем мобильном устройстве. Если эффект важен для gameplay,
он должен иметь одну authoritative запись и одну визуальную реакцию.

Первый зафиксированный сетевой budget: snapshot отдаёт не более 24 последних
релевантных `combatEvents` на клиента; это лимит окна доставки, а не разрешение
превращать серверный тик в поток событий. Остальные поля budget-а (TTL,
размер snapshot, duplicate rate и frame-time) закрываются отдельными
measurement reports.

### 6. Readability начинается до финального visual pass

Phase 5 не должна быть первым моментом, когда мы проверяем телеграфы. Для
каждого vertical slice уже в Phase 2 обязательны:

- цвет/форма Basic, Super, Gadget и cube не конфликтуют;
- telegraph показывает geometry и момент impact;
- промах не оставляет ложный status/flash;
- damage, control, heal, shield и resource gain различимы на мобильном экране;
- значимый hit имеет контактную реакцию, но обычный бой не превращается в
  постоянную вспышку.

Phase 5 тогда остаётся polish: camera punch, audio mix, priority tiers,
reduced motion, LOD и оптимизация. Балансировать «невидимый» скилл нельзя.

### 7. Practice room — не отдельная большая система, а инструмент проверки

Рекомендую не создавать полноценный новый matchmaking mode. Сделать
debug/practice profile, который позволяет:

- выбрать двух героев, уровень HP, accuracy и готовность ресурсов;
- зафиксировать карту, seed, дистанцию и obstacle layout;
- включить/выключить bats, cube, storm и objectives;
- повторить один сценарий 20–100 раз без сетевого шума;
- выгрузить before/after JSON report.

Игроку можно позже показать облегчённый hero trial, но инженерный scenario
runner нужен раньше и не должен зависеть от UI lobby.

### 8. Обновлённый порядок фаз

Текущий visual pass нужно считать сквозным gate, а не поздней полировкой.
Рекомендуемый порядок:

1. `Phase 0`: согласовать документы, source of truth, mode contract и baseline;
2. `Phase 1`: CombatProfile, Super/resource contract, snapshot/event contract,
   mobile input и минимальный universal hit feedback;
3. `Phase 2`: полностью закончить Kaze и Katty vertical slices в solo, затем
   team smoke — server, catalog, HUD, input, VFX, tests и reports вместе;
4. `Phase 3`: зелёный cube и bat camps с map/minimap/ownership;
5. `Phase 4`: остальные шесть героев, каждый с solo/team acceptance;
6. `Phase 5`: utility AI после стабилизации combat semantics;
7. `Phase 6`: team objective tuning, performance, telemetry review и rollout.

Между Phase 2–4 не разрешать массовую правку чисел «на ощущение»: сначала
обновляется scenario report, затем принимается решение о параметре.

### 9. Skill centrality измеряется не долей урона, а конверсией решения

Текущий `PlayerDamage` не отвечает на вопрос, стал ли skill основой боя.
Большой урон базовой атакой может быть правильным setup, а маленький урон
Super — правильным save, peel или displacement. Поэтому добавить раздельные
match-only counters:

- `basicOnlyKillRate` — убийства, где не было полезного Super/Gadget/control;
- `skillAssistedKillRate` — убийства после подтверждённого skill setup;
- `controlTime` и `controlTargets`;
- `healingDone`, `shieldGranted`, `damagePrevented`;
- `assistCount` с понятным окном attribution;
- `objectiveDamage`, `objectiveContestTime`, `batDamage`, `cubeContestTime`;
- `escapeSavedCount` — успешные casts, после которых герой пережил lethal
  threat или вышел из опасной зоны.

Эти показатели сначала идут в telemetry и debug result, а не сразу в
leaderboard. Для каждой роли заранее указать, какие 2–3 counters являются её
win contribution. Тогда support не будет оцениваться только по kills, а
assassin — только по общему PlayerDamage.

Приёмка centrality: для каждого hero/role существует хотя бы один сценарий,
где правильное применение skill заметно меняет исход, и хотя бы один сценарий,
где противник может его прочитать и наказать. Basic-only kill rate не имеет
одного глобального target для всех ролей — сравниваются role profiles и
before/after в одинаковых сценариях.

### 10. Темп матча должен быть отдельным балансным слоем

Если бой — главная часть игры, карта и фазы не должны создавать длинные окна
пустого перемещения. Для каждого режима фиксировать pacing budget:

```text
match time → orientation → first contact → first resource contest
           → repeated engagements → decisive phase → finish
```

Минимальные pacing metrics:

- `timeToFirstContact` и `timeToFirstMeaningfulHit`;
- `combatUptime`: время в threat/engagement относительно живого времени;
- `uncontestedTravelTime` и доля матча без видимой цели;
- `resourceContestFrequency`;
- `timeBetweenDeaths` и dead/respawn downtime в team mode;
- `phaseTransitionEngagementRate` — приводит ли смена island/objective-фазы к
  выбору или только к перемещению.

Для solo отдельно проверить, что storm/beacon усиливают столкновения, а не
обнуляют уже выигранную позицию. Для team отдельно проверить, что respawn не
создаёт бесконечный цикл «умер — пробежал — умер» и что objectives не заменяют
геройский бой пассивным уроном башен.

### 11. Миграция Super должна менять source of truth во всех слоях

Нельзя изменить только `SuperChargePercent`. Сейчас timer-поведение закреплено
сразу в нескольких местах:

1. `updateStatuses` каждый тик записывает `p.SuperCharge` из
   `LastPrimaryAt`;
2. room snapshot повторно вычисляет `SuperChargePercent` вместо публикации
   authoritative field;
3. frontend показывает readiness по этому snapshot;
4. bot predicates и существующие Go tests предполагают timer/full-ready
   semantics.

Миграция должна идти в таком порядке:

- ввести новый `charge source` и profile flag;
- временно считать старую и новую модель в debug report, но публиковать одну;
- перевести room snapshot и bot perception на новое поле;
- обновить tests, включая старые `TestPlayerHitDoesNotBuildSuperCharge` и
   `TestCoreCombatSuperChargeDoesNotUsePvPDamage`;
- удалить timer fallback после прохождения migration scenarios.

До удаления fallback нужен assertion: никакой код snapshot/UI/AI не может
самостоятельно пересчитать Super из времени или cooldown.

### 12. Rollout должен быть совместимым с мобильным клиентом

Telegram WebView не обновляется синхронно с сервером. Для каждой combat
version нужны:

- capability/version handshake клиента;
- минимальная совместимая версия snapshot/event schema;
- безопасный fallback UI для неизвестного effect/phase;
- серверный kill switch на предыдущий `CombatProfileId`;
- запись `combatVersion` в match result и telemetry;
- запрет смешивать в одном матче игроков с несовместимыми правилами.

Рекомендуемый rollout: deterministic runner → internal bot matches → closed
playtest → малый процент новых матчей → полный rollout. При desync, росте
rejected commands, frame-time или crash rate профиль автоматически возвращается
на предыдущий version ID. Balance regression сама по себе не должна маскироваться
под технический rollback — для неё нужен отдельный tuning profile.

### 13. Ability power budget и sustain policy

Каждая способность получает не только damage и cooldown, но и нормализованный
профиль ценности:

```text
power = threat
      + control
      + safety
      + mobility
      + sustain
      + information
      + objectiveValue
```

Это не формула, которая автоматически балансирует героя. Это обязательный
разбор, показывающий, за какие виды силы способность платит. В одном skill
нельзя одновременно выдавать высокий burst, hard CC, escape, immunity и
сильный sustain без заметных ограничителей:

- cast/wind-up и возможность interrupt;
- narrow hitbox, skillshot или ограниченный target set;
- ресурс, charge, дальность или частоту использования;
- self-root, recovery, плохой miss outcome или уязвимость после cast;
- telegraph и понятный ответ противника.

Для sustain отдельно фиксировать `effectiveHPPerSecond`, `damagePrevented`,
`healWindow` и `antiHealInteraction`. Умение не должно одновременно лечить,
давать щит и полностью очищать контроль без цены. Любой heal/shield должен быть
виден в telemetry и иметь понятный источник, иначе игрок не поймёт, почему
цель пережила burst.

На первом срезе role signatures такие:

| Роль | Высокий budget | Низкий budget |
|---|---|---|
| Assassin | Mobility, Conversion, Threat по одной цели | Sustain, Safety после промаха |
| Sharpshooter | Threat, Range, Information/zone | Mobility, close-range Safety |
| Controller | Control, ObjectiveValue, Information | direct Burst, chase |
| Support | Sustain, Safety команды, Control/peel | solo Burst и execution |
| Tank initiator | Safety, Mobility entry, Control | дальний Threat и скорость |
| Fighter | Threat, Safety в trade, Conversion | Range и escape после ошибки |

Если конкретный kit не укладывается в signature, сначала пересматривается
дизайн способности, а не только её damage.

### 14. Map topology — часть боевого баланса

Перед placement cube/bat провести topology report для каждой карты:

- расстояние от каждого spawn до ближайшего cover, центра и первого ресурса;
- число альтернативных маршрутов вокруг choke и objective;
- минимальная ширина прохода для melee, ranged и flying state;
- LOS и telegraph visibility на ключевых дистанциях;
- симметрия team lanes и равенство времени до camps;
- возможность безопасно забрать cube и возможность его contest;
- отсутствие drop point внутри wall/objective/flight boundary;
- совпадение authoritative collision, minimap и визуального препятствия.

В team map существующие authored pickup points нельзя просто перекрасить в
зелёные кубы: это сохранит старую логику пассивного sustain. Их нужно либо
превратить в camp/lair landmarks, либо удалить из combat profile. В solo
случайное распределение bats должно оставаться deterministic от seed и не
создавать один spawn, который статистически даёт больше безопасных reward.

Map acceptance строится на p50/p90 времени до ресурса и первого контакта для
обеих команд, а не только на визуальной симметрии координат.

### 15. Human playtest должен проверять понимание, а не только win rate

После каждого vertical slice проводить короткий scripted playtest с игроками
разного уровня. После боя фиксировать пять ответов:

1. Что этот герой пытался сделать?
2. Какой момент был самым опасным?
3. Почему произошёл последний значимый hit/kill?
4. Что можно было сделать, чтобы избежать результата?
5. Зачем на карте был cube или bat?

Если игрок выиграл, но не может объяснить ответ хотя бы на 3 из 5 вопросов,
это проблема clarity, а не только balance. Такой feedback сохраняется рядом с
scenario report и помечается по роли, режиму и уровню опыта.

Нельзя принимать изменение по одному яркому матчу. Минимальный playtest gate:
повторяемый scenario report, role/mode matrix, human notes, отсутствие
десинхронизации и отсутствие новых console/page errors.

## Текущий статус исполнения (2026-08-26)

Закрыты следующие foundation-gates:

- versioned `CombatProfile`, fingerprint, generated Go/JS views и validators;
- authoritative Super/resource и respawn policy, включая reset статусов;
- единый `health_boost`, TTL/expiry, cap, ownership/no-benefit guard и safe-drop;
- deterministic bat patrol/wind-up/leash/respawn loop с гарантированным reward;
- snapshot/event schema, rejection feedback и лимит 24 событий на snapshot;
- scenario runner со synthetic clock, simulation-sized steps, stable hash,
  checkpoint event IDs и именованными metrics; добавлены replayable Kaze basic
  и Katty paint-setup smoke scenarios;
- первый bot-срез для ownership-aware cube routing и реакции на bat wind-up;
- utility-AI decision-срез: role-aware `engage/retreat/collect_pickup/roam`
  scoring и короткий hysteresis, при этом hard interrupts остаются
  приоритетнее обычного выбора;
- expected-value выбор Super/Gadget у ботов по роли, дистанции, HP, боезапасу,
  численному давлению и типу цели;
- role-to-assignment слой для team bots (`support`, `flank`, `anchor`,
  `frontline`) с разным порядком tactical policies;
- peel по recent ally damage, исключение spawn-protected targets и contest-aware
  scoring публичного зелёного cube;
- contested bat target scoring, respawn-aware regroup к союзному spawn и
  match-only AI counters, экспортируемые в observability только при завершении
  матча;
- scenario runner получил `RecordBotAIMetrics` и replayable 3v3 team-bot
  matrix с проверкой peel и bot basic accuracy; в report добавлены
  target-switch, conservative idle-tick и per-action mean utility-score;
- добавлены replayable Kaze smoke trials для accuracy 100/60/30% и direct
  trade без/с готовым Super с проверкой фактического hit rate и damage delta;
  runner валидирует attempts/hits и сохраняет ratio как отдельные metrics;
- добавлен roster basic smoke для всех 8 героев; он выявил и исправил Mina
  launch-overlap collision, из-за которой звёзды гасли на первом тике;
- базовые catalog/frontend/build/lint/Go gates и browser checks для combat
  feedback и melee range.

Открыты и не должны считаться выполненными до evidence:

- deterministic time-injected Kaze/Katty solo и 3v3 reports;
- scenario pack уже покрывает Super contribution, respawn reset/preserve,
  cube ownership и bat telegraph/reward/respawn, но это ещё не заменяет полную
  solo/team matrix и before/after reports;
- полный role-aware utility AI с expected-value objective policy, полной
  accuracy/direct-trade scenario matrix для всего ростера, idle/stuck/
  action-score reports по role/mode и полноценные counter-role outcomes;
  расширенными human playtest evidence;
- bat notice-state и contest telemetry, topology reports карт и human playtest;
- полный visual contract для всего ростера и staged rollout/rollback;
- backend-backed mobile/team browser QA: локальный QA без party WebSocket не
  подтверждает сетевой сценарий.

## Definition of Done

- У каждого героя есть измеримая сила, цена, win condition и counterplay.
- Basic не является единственным надёжным способом нанести значимый урон.
- Super готовится боевыми действиями и имеет читаемое punish window.
- Нет скрытых глобальных multipliers, не отражённых в balance source.
- На карте остаётся один понятный зелёный health cube.
- Зелёный cube увеличивает только `MaxLives`; подбор не лечит текущие `Lives`.
- В combat profile отсутствуют health crates, `potion-red` и дублирующие HP drops.
- Bats имеют ясную цель, telegraph, leash, reward и contest value.
- Боты принимают решение из perception + utility, умеют атаковать/отступать/
  использовать skills/фармить resource и делают это в solo/team.
- Для каждого skill существует authoritative phase contract и визуальный
  counterpart.
- Для каждого героя доказано, что skill decision меняет хотя бы один исход,
  а Basic-only путь не остаётся единственным оптимальным решением.
- Catalog validator, focused/full Go tests, frontend tests/build,
  deterministic scenarios и browser QA проходят.
- Есть metrics до/после: first meaningful hit, damage by source, skill usage,
  role contribution, pacing, survival, pickup contest, bot idle/stuck/accuracy,
  match duration и win rate.
- Есть ability power-budget и topology report для каждого изменённого hero/map
  slice.
- Есть human playtest notes и staged rollout evidence для новой combat version.

## Риски

| Риск | Митигирование |
|---|---|
| Массовый rebalance ломает feel | Сначала общий loop, затем два вертикальных среза и только потом ростер |
| Super charge создаёт snowball | Нормализация по max HP, diminishing return и scenario tests на камбэк |
| Зелёные cubes усиливают лидера | Soft cap, ограниченный spawn/reward и контроль team ownership |
| Новые VFX станут шумнее старых | Priority tiers, короткая жизнь эффектов, reduced-flash режим |
| AI станет дорогим | Решения по interval, cached paths, budgeted utility evaluation |
| Dirty worktree скрывает регрессии | Не трогать чужие изменения; сначала привести assets/catalog/tests к зелёному baseline |

## Рекомендуемый Phase-1 default profile

Чтобы не блокировать реализацию, предлагаю принять следующие стартовые правила.
Это baseline для первого playtest, а не окончательный баланс:

| Решение | Phase-1 default | Что может быть A/B-тестом позже |
|---|---|---|
| Super start | 0% для всех героев | 10–25% только для роли, если первые 20 секунд слишком пустые |
| Super charge | effective damage + подтверждённый control/support/objective credit | per-role коэффициенты и caps |
| Team cube | виден команде убийцы, подобрать может один игрок, бонус получает только collector | killer-only или team-claim с рольным bonus |
| HP bonus | +5% от BaseMaxLives, soft cap 5 stacks, без мгновенной отдельной хилки | step/cap и comeback modifier |
| Respawn | HP stacks сохраняются, Super 0%, статусы/marks/shield/combo сбрасываются, ammo full, Gadget charges сохраняются как есть | вернуть один Gadget charge или дать 10–25% Super |
| Bats | фиксированные deterministic camps, patrol/leash, один cube за defeat, один respawn cycle | timer, число camps и elite variant |
| Gadget | оставить до 3 charges для совместимости, но cooldown и recharge идут из kit profile | 2 charges или полностью time-based resource |
| Practice | сначала headless deterministic runner и debug overlay | отдельный пользовательский hero trial |
| Balance source | один versioned JSON/profile как editable source, Go/JS представления валидируются против него | генерация производных файлов на build step |

Если в первом playtest понадобятся исключения, они добавляются в profile с
названием и метрикой, а не отдельным условием в коде. Это позволяет быстро
отличить плохое базовое правило от плохого значения конкретного героя.

## Шестой проход: implementation blueprint

### 1. Минимальная структура `CombatProfile`

`CombatProfile` должен описывать правила, а не содержать runtime state игрока.
Минимальный контракт:

```text
CombatProfile {
  id, schemaVersion,
  modes: {solo, team},
  defaults: {basic, super, gadget, pickup, bats, telegraph, ai},
  heroes: {heroId: {role, basic, super, gadget, powerBudget}}
}
```

Hero-specific values находятся в `heroes[heroId]` и переопределяют только явно
разрешённые поля из `defaults`. Общие mode rules находятся в `modes`, а не копируются в
каждый kit. Любое отсутствие поля означает documented default, а не случайное
значение из старого кода.

Отдельно разделить:

- `balance data`: числа и формулы профиля;
- `combat state`: текущие HP, ammo, charge, statuses, timers;
- `presentation contract`: phase, VFX kind, animation semantic и priority;
- `telemetry contract`: события и агрегаты для отчётов.

Так Super charge не будет повторно вычисляться из визуального cooldown, а
frontend не будет хранить собственную копию balance logic.

### 2. Hero contract до написания kit-кода

Для каждого героя создать одну contract row:

```text
HeroContract {
  id, role, fantasy,
  winCondition, counterplay,
  powerBudget,
  basicContract,
  superContract,
  gadgetContract,
  inputContract,
  visualContract,
  soloAcceptance,
  teamAcceptance
}
```

Каждый `basic/super/gadgetContract` обязан содержать: target type, cast time,
telegraph, active window, impact rule, status, resource cost, miss outcome,
recovery, interrupt rule и telemetry event. Если поле не применимо, записывается
`none` с причиной — не оставляется неявное поведение.

До реализации Kaze и Katty нужно заполнить их contract rows и получить
snapshot/visual review. Это дешевле, чем после кода выяснять, что «reset» или
«paint zone» означали разные вещи в Go, каталоге, HUD и VFX.

### 3. Balance source migration

Рекомендуемый pipeline:

```text
docs/hero-catalog.json + docs/combat-profile.json
                  │
                  ├── validator/schema checks
                  ├── generated Go balance view
                  └── generated frontend presentation/fallback view
```

`docs/hero-catalog.json` хранит identity, visual/animation metadata и тексты,
а `docs/combat-profile.json` является единственным редактируемым balance
source. Go остаётся единственным источником истины для расчёта текущего боя,
но balance contract не должен жить одновременно в трёх вручную
синхронизируемых местах. Генерируемые представления нельзя править руками;
fingerprint должен учитывать profile ID и schema version.

Миграция должна иметь отчет по каждому расхождению: catalog value, Go value,
frontend value, выбранное значение и причина. Если расхождение намеренное,
оно получает `derived`/`presentationOnly` маркировку.

### 4. Deterministic scenario и replay contract

Scenario runner должен хранить не только итоговые цифры, но и входы:

```text
Scenario {
  id, seed, combatProfileId, mode, mapId,
  players: [{hero, team, hp, ammo, charge, position}],
  props, bats, objectives,
  inputs: [{atMs, playerId, move, aim, fire, ability}],
  expected: {events, stateHash, metrics}
}
```

Каждый прогон сохраняет:

- authoritative event log;
- state hash на контрольных timestamp;
- damage/resource/role/pacing metrics;
- diff с предыдущей версией profile.

State hash нужен, чтобы отличать изменение баланса от недетерминизма или
рассинхронизации. Если один и тот же seed и input log дают разные lethal hit,
charge или pickup ownership, tuning нельзя принимать.

### 5. Порядок миграции legacy logic

Для Super, pickups и global scales использовать один переходный алгоритм:

1. описать старое поведение в regression scenarios;
2. добавить новый profile path рядом со старым без изменения client UI;
3. включить новый path только для deterministic scenarios;
4. сравнить state hash, metrics и event timeline;
5. перевести snapshot, bots и HUD на новый contract;
6. включить closed playtest profile;
7. удалить legacy fallback и тесты, которые требуют старое поведение;
8. оставить migration note и rollback profile.

Нельзя одновременно менять charge model, hero damage, pickups и AI без
отдельных profile IDs: иначе telemetry не покажет, какая система изменила
результат.

### 6. Dependency graph и безопасная параллельная работа

Последовательная цепочка:

```text
T0 decisions
   ↓
T14a profile schema + validator
   ↓
T14b generated views + fingerprint
   ↓
T1 profile + snapshot/event contract
   ↓
T2 resource lifecycle ──┬── T3 mobile input/feedback
                       │
                       ├── T4 Kaze slice
                       └── T5 Katty slice
                              ↓
                    T6 cube/bat economy
                              ↓
                 T7 roster ──┬── T8 utility AI
                              └── T9 role/pacing metrics
                                      ↓
                              T10 rollout + T13 playtest
```

Kaze и Katty можно делать параллельно только после стабилизации T1–T3 и при
условии, что они не меняют общий `CombatProfile` schema. Общие protocol,
catalog generator и renderer contracts должны иметь одного владельца.
Параллельные hero slices обязаны заканчивать свои локальные tests/reports до
слияния с общим balance matrix.

### 7. Hero slice Definition of Done

Конкретный герой считается завершённым только если выполнены все пункты:

- contract row утверждена;
- Go behavior и balance profile покрыты tests;
- catalog/generated views синхронизированы;
- HUD/input contract работает на touch и desktop;
- cast/telegraph/impact/status timeline совпадает с hitbox;
- bot policy понимает его role и resource usage;
- solo и team scenario reports не имеют необъяснимых outliers;
- human playtest отвечает минимум на 3 из 5 clarity-вопросов;
- catalog validator, focused Go/frontend tests, build и browser QA зелёные.

## Открытые решения перед Phase 1

1. Подтвердить или изменить Phase-1 default profile выше.
2. Выбрать точную схему генерации производных Go/JS balance представлений.
3. Утвердить, должны ли support counters попадать в пользовательский battle
   result или оставаться только в debug/telemetry.

## Внешние ориентиры

- [Brawl Stars — Gadgets](https://support.supercell.com/brawl-stars/en/articles/gadgets-4.html): сила гаджета выражается через отдельный cooldown, а не через общий для всех эффект.
- [Brawl Stars — Game Modes](https://support.supercell.com/brawl-stars/en/articles/game-modes-12.html): Power Cubes имеют одну понятную функцию усиления HP/атаки, а режим задаёт смысл карты и ресурсов.
- [Brawl Stars — Release Notes June 2026](https://supercell.com/en/games/brawlstars/blog/release-notes/release-notes-june-2026/): баланс регулярно двигает damage, reload, Super charge, area и cooldown раздельно и сопровождает изменения bug-fix/readability работой.
- [Pokémon UNITE — Overview](https://unite.pokemon.com/en-us/overview/): нейтральные существа и энергия дают карте contestable resource loop, а сила Pokémon выражается через разные роли и moves.
- [Brawl Stars — Brawler Traits](https://support.supercell.com/brawl-stars/en/articles/brawler-traits-5.html): Super может заряжаться от damage, damage taken, времени, proximity или healing, то есть источник charge может быть частью роли.
- [Brawl Stars — Hypercharge](https://support.supercell.com/brawl-stars/en/articles/hypercharge-4.html): отдельный ресурс может заряжаться атаками медленнее Super и затем работать как временный слой, а не как постоянный stat multiplier.
- [Brawl Stars — Event Modifiers](https://support.supercell.com/brawl-stars/en/articles/event-modifiers-12.html): карта и побеждённые бойцы могут быть источниками pickup-ресурсов, что поддерживает разделение «один pickup — одна функция».
