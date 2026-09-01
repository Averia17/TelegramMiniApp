# Глобальный план улучшения драк — Combat 2.0

Подробное доказательство решений и текущий runtime-аудит вынесены в
[`combat-deep-analysis-2026-09.md`](combat-deep-analysis-2026-09.md). Этот файл
остаётся исполняемым планом, а deep analysis — картой причин, рисков и референсов.

## Цель

Сделать бой не последовательностью обычных атак, а читаемой цепочкой решений:

`занять позицию → обменяться атаками → пережить опасное окно → применить skill →
конвертировать преимущество или отступить → вернуться в бой`.

Игрок должен чувствовать, что герой определяется своим kit, а не только Basic
Attack. Смерть от полного здоровья за ~2 секунды допустима только как результат
явно телеграфированной комбинации, ошибки без выхода или командного focus fire;
обычный равный trade должен оставлять время на реакцию, движение и применение
способности.

Это не копирование чисел Brawl Stars. Берём проверяемые принципы: отдельные
тактические Gadgets с cooldown, разные способы зарядки Super и роли с сильной
стороной и контр-игрой. Эти принципы описаны в официальных материалах Supercell:
[Gadgets](https://support.supercell.com/brawl-stars/en/articles/gadgets-4.html),
[Brawler Traits](https://support.supercell.com/brawl-stars/en/articles/brawler-traits-5.html)
и [Brawler Classes](https://support.supercell.com/brawl-stars/en/articles/brawler-classes.html).
Для VFX используем правило: чем сильнее влияние способности на бой, тем заметнее
она должна быть, но читаемость важнее тематического шума — это хорошо сформулировано
в [Clarity in League](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/).

## Что именно изучаем у популярных мобильных игр

| Игра | Наблюдение | Что переносим к нам | Что не переносим |
|---|---|---|---|
| Brawl Stars | короткий цикл aim → shot → hit, крупный силуэт Super, сильная реакция цели и раздельные Gadget cooldown | мгновенный feedback, читаемые классы, короткие ability windows | их числа, roster и progression |
| Mobile Legends: Bang Bang | hero/skill identity строится вокруг направленного прицела, комбо и нескольких distinct abilities; официальный hero hub отдельно показывает heroes, skills и strategies | aim reticle, target selection, ability chain и понятный skill payoff — [официальный hero hub](https://www.mobilelegends.com/hero) | полноценную MOBA-экономику, 5v5 lanes и перегруженный HUD |
| Honor of Kings | сильные ultimates показывают направление, зону и момент попадания; displacement и damage/heal feedback видны одновременно | большие telegraph’ы, читаемые displacement, разные ally/enemy feedback | экранный шум и длинные combo без возможности ответить |
| Pokémon UNITE | wild Pokémon и крупные objectives меняют маршрут, дают ресурс и создают момент contest | фиксированные camps, spawn timing, рискованный contest и payoff | обязательный farm, уровни и копирование их objective economy |
| T3 Arena | короткие матчи и быстрый возврат от respawn к frontline поддерживают постоянный контакт | измерять downtime и time-to-reengage, держать бой плотным | копировать их auto-fire, темп и shooter-мету без проверки нашего ввода — [официальное описание](https://play.google.com/store/apps/details?id=com.xd.t3.global) |
| Rocket Arena | hit-stun, impulse, Blast Meter и Dodge создают промежуточное состояние между «жив» и «умер», а recovery action возвращает контроль | тестировать stagger/displacement/recovery как слой выживания и источник clutch | не добавлять второй ресурс/метр автоматически; сначала доказать, что он решает нашу проблему — [официальное объяснение механики](https://www.ea.com/games/rocket-arena/news/rocket-arena-knockouts-mechanics) |

Официальные материалы Brawl Stars подтверждают, что классы, traits и Gadgets —
это отдельные источники боевой идентичности, а не только украшение Basic; release
notes также регулярно меняют раздельно reload, Super charge, cooldown, range и
damage. Для лагерей официальный обзор Pokémon UNITE прямо связывает победу над
wild Pokémon с ресурсом, который влияет на дальнейшее продвижение. Это поддерживает
наш выбор: сначала ясный moment-to-moment combat, затем camps как contest, а не
случайный набор мобов.

Полезно также посмотреть на [официальные release notes Brawl Stars](https://supercell.com/en/games/brawlstars/blog/release-notes/release-notes-june-2026/):
там хорошо видно, что живой баланс меняется по отдельным осям — reload, Super
charge, Gadget cooldown, range, area и damage — поэтому в нашем плане эти параметры
разделены и проверяются сценариями, а не сводятся к одному глобальному multiplier.

## Чужие ошибки, которые нельзя повторить

| Anti-pattern | Почему игроку плохо | Наш запрет/решение |
|---|---|---|
| Raw burst или dash сразу убивает | игрок не понимает, что произошло, и не видит момента для ответа | обязательный telegraph, response window, damage split между entry/impact/trail |
| Длинная CC immunity или permanent escape | сильный герой не имеет контр-ответа и ломает позиционную игру | короткая immunity только на заявленную фазу; после miss — punish/recovery |
| Super looping без боевого риска | игрок просто ждёт кнопку или бесконечно цепляет ульты | charge за meaningful contribution, cap/diminishing return и cooldown по силе |
| Один kit одновременно безопасен, дальнобоен и контролирует карту | роли и matchup исчезают, герой становится универсально лучшим | каждому бонусу назначать цену: range, reload, HP, mobility, setup или vulnerability |
| Визуальный шум маскирует hitbox | смерть воспринимается как случайная и нечестная | gameplay silhouette/telegraph выше тематики; ally/enemy/status разделены |
| Анимация блокирует input дольше, чем gameplay phase | герой кажется медленным и неуправляемым | animation lock только там, где он является частью контр-игры; input buffer/cancel проверяются |
| Случайные PvE spawn’ы и reward snowball | карту нельзя выучить, а лидер получает ещё больше силы | authored camps, timing, bounded reward, симметрия и comeback route |
| Красивый эффект существует отдельно от действия | игрок видит декор, но не чувствует причинности | только live-сценарий с source → travel → target reaction → payoff считается готовым |

В [актуальных заметках Brawl Stars](https://supercell.com/en/games/brawlstars/blog/release-notes-august-2026/)
есть прямой пример такой коррекции: Chuck переводится от бесконечного заряда и
сырой силы dash к более контролируемому Super, а у Bolt часть силы переносится
из немедленного урона в trail и уменьшается окно CC immunity. Это не готовое
решение для наших героев, но сильный сигнал для архитектуры: экшен должен быть
ярким, а power — распределённым по читаемым фазам, а не спрятанным в одном
моменте контакта.

## Что изменено после критического пересмотра

Изучение популярных игр уточняет направление, но само по себе не доказывает, что
наш бой будет интересным. Поэтому план меняется в пяти местах:

1. **TTK больше не является универсальной целью.** Диапазон 6–10 секунд остаётся
   только стартовой гипотезой для конкретного равного 1v1. Решение принимается по
   распределениям `p50/p90` для роли, режима и точности, а главным запретом становится
   необъяснимая смерть до meaningful decision. Быстрый kill допустим, если он
   заранее читается, требует ошибки/комбинации и оставляет контр-ответ.
2. **PvP отделяется от расширения PvE.** Первый доказанный срез — один режим, одна
   карта и пара героев. Новые монстры и лагеря не должны задерживать исправление
   основного ощущения драки и не входят в первый retention-gate.
3. **Камера, звук и мобильный ввод становятся частью боевого контракта.** Красивый
   VFX без правильного release-звука, camera punch, input buffer и возврата контроля
   всё равно ощущается слабым.
4. **Сначала один vertical slice, потом весь ростер.** Не начинаем одновременно с
   восьми героев и трёх ролей: сначала доказываем melee/ranged clash на двух героях,
   затем добавляем controller и support.
5. **Исследование заканчивается прототипом и плейтестом.** Следующий полезный шаг —
   не бесконечно смотреть чужие игры, а сравнить текущий и новый бой в одинаковом
   live-сценарии с игроками и telemetry.

6. **Выживание не равно только HP.** До повышения здоровья проверяем мягкий слой:
   hit reaction, короткий stagger/knockback, defensive/recovery action, escape и
   безопасный re-entry. Второй ресурс вроде pressure meter допустим только как
   отдельный эксперимент, если базовый слой не даёт clutch-моментов.

## Что уже есть и что считаем незакрытым

В проекте уже существуют authoritative Go combat core, `CombatProfile`, Basic /
Super / Gadget, `combatEvents`, telegraph/impact-фазы, skill-centrality metrics,
фиксированные MonsterSpawns на team map и текущий bat lifecycle. Это хорошая
основа, но автоматический контракт ещё не доказывает, что бой ощущается живым.

Новый план закрывает именно следующие разрывы:

1. Равный PvP-trade всё ещё может быть слишком коротким и не оставлять пространства
   для выживания, отхода и повторного входа.
2. Skills формально влияют на результат, но игроку недостаточно ясно, когда и
   зачем их применять, а каст/impact/анимация часто не образуют один яркий момент.
3. Общий feedback есть, но у героев недостаточно различимый visual language:
   силуэт, цвет, звук, зона угрозы и payoff должны отличать один kit от другого.
4. В solo-пути `monstersAdd` всё ещё использует случайное размещение по регионам;
   один bat не создаёт полноценной PvE-экологии и территориального выбора.

### Локальный visual audit: почему текущие эффекты ещё не выглядят «дорого»

Существующие captures из `output/playwright/hero-effect-visual-audit` показывают
полезную, но недостаточную основу:

- Brock Super, Katty Super и Mina Super в основном читаются как большие
  полупрозрачные кольца с плоскими частицами;
- в кадре часто виден масштаб эффекта, но не виден полный causality chain:
  источник → движение → контакт с целью → hit reaction → status/payoff;
- эффект иногда выглядит как декоративная геометрия из debug harness, а не как
  событие в бою с направлением, скоростью, глубиной и реакцией персонажей;
- в `attack_f*.png` pose/prop героя меняются, но без цели, release trail и impact
  невозможно почувствовать вес атаки только по одной анимации.

Отсюда новый quality bar: showcase-кнопка, статичный ring и красивый idle не
считаются готовой боёвкой. Каждый эффект принимается только в live-сценарии,
где одновременно видны атакующий, цель, направление, active frame, hit/miss,
реакция цели и возвращение в locomotion.

### Beauty bar для одной способности

Способность считается визуально готовой, если за 0.5–1 секунду наблюдатель,
который не знает кода, может ответить на все вопросы:

1. Кто начал действие?
2. Куда оно направлено?
3. Когда появилась возможность увернуться?
4. Был ли hit или miss?
5. Что именно изменилось — damage, stun, slow, root, shield, heal или mark?
6. Когда действие закончилось и можно снова двигаться/атаковать?

Если ответ виден только по тексту, числу урона или большой окружности, ability
возвращается на доработку. Красивый эффект обязан быть причинно связан с gameplay,
а не просто занимать больше пикселей.

### Code-grounded priority order

Локальный код показывает, где начинать работу, чтобы не строить новую систему
поверх уже существующей:

1. `EffectRenderer` уже имеет много hero-specific constructors, но также добавляет
   shared outline/glow/core/motes; сначала нужно отделить намеренный shared polish
   от композиций, которые визуально превращаются в ring-only.
2. `GLBHeroController` запускает Basic через `attackPulse` и держит отдельное
   `attackVisualRemaining = .42` с процедурными release/strike/recover фазами;
   следующий шаг — получать release/impact из authoritative event, сохранив
   procedural fallback только для offline harness.
3. `MonsterRenderer` пока создаёт только `createBat`, даже если backend уже
   передаёт `tier/state/noticeUntil/windupUntil`; новые archetypes должны прийти
   через registry по `kind`, а не через ещё одну ветку bat.
4. Browser QA уже умеет снимать hero effect, skill animation и live skill audit;
   его нужно расширить с проверки «меш существует» до проверки временной истории
   и причинности эффекта.

Такой порядок снижает риск: сначала связываем существующие event/animation/VFX
слои, затем добавляем новые assets и monsters. Иначе можно получить больше
визуальных объектов, но тот же скучный бой.

## Целевая модель боя

### 1. Долгая, но не вязкая схватка

Рабочие гипотезы для первого playtest profile, не финальные цифры. Они являются
guardrails для проверки, а не обещанием одинаковой длительности каждой драки:

- равный 1v1 при 60% точности: примерно 6–10 секунд от первого значимого
  попадания до смерти;
- игрок должен иметь минимум 0.7–1.2 секунды на распознавание опасного skill и
  ответное действие;
- полный Basic-only burst не должен удалять full-health героя менее чем за
  2.5–3 секунды;
- телеграфированная skill-комбинация может быть быстрее, но только при понятном
  условии, успешном попадании и доступной контр-игре;
- после контакта с врагом должны существовать реальные окна: dodge, cover,
  disengage, shield, cleanse, interrupt или reposition.

Дополнительный критерий ритма: игрок не должен долго ждать cooldown в безопасной
пустоте. Бой проходит через читаемые состояния `approach → poke → commit → clash →
clutch → disengage/reset`; в каждом состоянии есть действие, риск и причина
изменить позицию. После escape должен быть короткий понятный шанс на re-entry, а не
полное выпадение из боя.

Каждый успешный контакт должен менять не только HP, но хотя бы один боевой объект:
позицию, доступ к проходу, безопасную зону, cooldown/ресурс, статус или право на
следующий objective. Это делает атаку осмысленной даже до убийства и связывает
экшен с картой.

Не увеличиваем HP всем подряд. Выживаемость распределяем между HP, damage,
reload, movement, invulnerability/defense windows, control и escape, чтобы роли
оставались различными.

### 2. Basic — давление и подготовка

Basic должен быть быстрым и приятным, но не закрывать весь power budget героя.
Он создаёт pressure, заряжает ресурс, ставит mark/zone или вынуждает противника
двигаться. Конвертация в kill, спасение или захват позиции должна происходить
через Super/Gadget или осознанное positional play.

Для каждого героя фиксируем:

- `inputToFireMs`, `attackCadenceMs`, `reloadDeadTime`, `shotsPerEngagement`;
- damage при 100/60/30% accuracy;
- сколько Basic-попаданий нужно, чтобы создать skill payoff;
- какие ошибки Basic оставляют противнику шанс на ответ.

### 3. Skills — центр решения

У каждого героя должен быть хотя бы один сценарий, где правильный skill меняет
исход, но промах/неудачный тайминг имеет цену. Каждая способность описывается
одинаковой фазовой схемой:

`intent → cast → telegraph → active/projectile/zone → impact → status/payoff → recovery`.

Super не должен ощущаться вторым reload timer: заряд преимущественно приходит за
эффективный damage, control, support или objective contribution. Gadget отвечает
на конкретную ситуацию — engage, escape, defense, setup, cleanse или conversion —
и имеет cooldown, соответствующий силе эффекта.

### 4. Яркость без визуального хаоса

Для каждого Basic/Super/Gadget задаём:

- уникальный силуэт и цветовую семантику;
- направляющий элемент, по которому понятна траектория;
- телеграф опасной зоны и точный active frame;
- impact VFX, hit reaction, status marker, звук и короткий camera punch;
- правило visibility в solo/team, чтобы союзный эффект не маскировал вражеский.

Приоритет читаемости: hitbox/зона → направление → опасность → результат →
тематические детали. Все сильные эффекты должны быстро возвращаться в покой;
добавить reduced-flash/reduced-shake настройку.

### 5. PvE как часть карты, а не случайный шум

Монстры должны создавать территорию, риск и повод для столкновения игроков.
Минимальная новая экология:

Для PvE берём принцип [Pokémon UNITE](https://unite.pokemon.com/en-us/overview/):
нейтральные существа дают команде причину менять маршрут и contest-ить ресурс,
а не просто служат бесконечной тренировочной мишенью.

- **Bat** — воздушный harasser/разведчик: notice → chase → wind-up → strike,
  быстро отступает к лагерю и оставляет текущую награду.
- **Пепельный гончий** — быстрый melee-ambusher из легенды Northern Ash: слышимый
  рывок, короткий charge, удар по линии, уязвимость после промаха. Проверяет
  dodge, spacing и burst-control героев Kaze/Mandy/Mico.
- **Корневой страж** — медленный ranged-controller, связанный с Needle/Lumi:
  ставит видимую споровую/корневую зону, защищает лагерь и вынуждает выбирать
  между обходом, focus fire и contest. После разрушения зоны остаётся короткое
  окно для безопасного добивания.

Первые два новых типа не должны просто иметь больше HP. Их сила — в разных
паттернах угрозы, телеграфах, маршрутах и уязвимостях. Награду на первом срезе
лучше переиспользовать из существующего bounded resource contract; новые виды
loot добавлять только после доказанной ценности camp loop.

## План по фазам

### Phase 0 — зафиксировать baseline и дизайн-контракт

- Снять воспроизводимые PvP-сценарии: melee duel, ranged trade, controller zone,
  team focus, escape/re-entry и bat camp.
- Получить текущие TTK, time-to-first-hit, damage by source, skill conversion,
  basic-only/skill-assisted kills, combat uptime и death downtime.
- Провести 5-вопросный human clarity test: что делает герой, где опасность,
  почему произошёл hit, когда использовать skill, куда можно убежать.
- Утвердить первый `Combat 2.0` profile revision и scope guard: без Hypercharge,
  Star Powers, новых режимов и массовой смены всех чисел.

**Gate:** есть before-отчёт, список конкретных скучных моментов и выбранные два
геройских vertical slice.

### Product gate — первое впечатление и retention

Красивый бой должен работать не только в отдельном showcase, но и в первом
матче новичка. Проверяем первые 60 секунд как отдельный пользовательский путь:

| Момент | Опыт игрока | Необходимый сигнал |
|---|---|---|
| 0–10 с | герой двигается и понимает, что он управляет живым персонажем | locomotion sway, turn, короткая idle-to-run реакция, понятный aim |
| 10–25 с | первая атака выглядит как действие, а не изменение цифры | anticipation, release, projectile/trail, contact и target reaction |
| 25–45 с | игрок впервые использует signature ability | кнопка ready pulse, прицел/telegraph, отдельный цвет и сильный payoff |
| 45–60 с | игрок понимает риск, выживает или осознанно проигрывает trade | damage readability, escape route, low-health feedback, короткий recovery |

Нельзя выпускать новую боёвку, если новичок видит только Basic, не понимает,
что Super готов, или умирает до первого meaningful decision. Для повторных матчей
нужны короткие «stories of the fight»: удачный dodge, interrupted cast, skill
assist, escape и revenge/re-entry должны оставлять запоминаемый visual/audio beat.

Retention-проверки:

- после первого матча игрок может своими словами объяснить, чем его герой
  отличается от другого;
- минимум один момент за матч заставляет нажать ability из-за ситуации, а не
  потому что кнопка просто загорелась;
- после смерти понятны причина и контр-решение, а не ощущение случайного delete;
- повторный матч предлагает новую ситуацию: другой camp, позиция, skill timing
  или matchup, но не меняет правила непредсказуемым случайным образом.

Это отдельный gate продукта, а не замена telemetry: короткие human interviews,
first-session capture и следующий-match intent должны храниться рядом с TTK и
skill-conversion отчётами.

### Phase 1 — ритм, выживание и контр-игра

- Настроить cadence/reload/ammo/HP только через `docs/combat-profile.json` и
  generated Go/JS views.
- Добавить единые recovery/escape правила: movement не блокируется лишней
  animation lock, skill можно отменить или прервать там, где это обещано
  контрактом, damage mitigation не превращается в бессмертие.
- Пересобрать damage windows для Kaze против Brock, затем Mandy/Mico и Brock против
  controller: не убирать identity героев, а перенести power из мгновенного
  raw burst в setup, mobility, control и conversion.
- Проверить respawn protection, ammo и Super/Gadget reset, чтобы смерть не
  превращалась ни в мгновенный повторный burst, ни в долгий downtime.
- Проверить soft-survival отдельно от HP: hit reaction, displacement, recovery
  action и time-to-reengage после escape/respawn.

**Gate:** равный trade оставляет окно реакции; игрок может пережить неидеальный
обмен, отступить и снова войти; ни один full-health сценарий не заканчивается
без telegraphed причины.

### Phase 2 — первый skill-driven vertical slice

Не начинать сразу с трёх ролей. Сначала собрать один противостоящий PvP-срез:

1. **Kaze против Brock** — dash/assassin против ranged/spacing: entry, dodge,
   cover, combo, punish после промаха и повторный вход.

После прохождения этого gate добавить melee-matchup Mandy или Mico, затем вторую
вертикаль:

2. **Needle или Katty** — controller: zone/mark/root, видимая граница угрозы и
  понятный выход из неё.
3. **Fairy Mina** — support/team: heal/shield/peel должны быть заметны и
   влиять на исход team trade, а не выглядеть как слабая атака.

Для каждого slice сделать одну завершённую вертикаль: серверный outcome →
combat event → animation phase → VFX/SFX → HUD state → browser QA.

**Gate:** тестер без чтения документа может назвать win condition героя, увидеть
момент cast/impact и объяснить, как против него сыграть.

Порядок важен: если первый melee/ranged slice не даёт ощущения погони, риска,
попадания, отступления и повторного входа, добавление controller/support только
увеличит объём контента, но не исправит основу.

### Phase 3 — массовый visual/animation combat pass

- Синхронизировать GLB Actions с authoritative phase markers; убрать fixed
  presentation window там, где он расходится с cast/impact.
- Ввести три tier feedback: routine hit, confirmed ability hit, fight-changing
  Super/kill; каждому tier назначить звук, particles, hit-stop, camera punch,
  hit reaction и duration.
- Для восьми героев составить VFX/animation cards и пройти их через silhouette,
  color, direction, danger, impact, status и recovery.
- Добавить skill preview/debug harness: freeze frame, phase timeline, hitbox и
  target state; это дешевле и точнее, чем оценивать эффект только по боевому
  матчу.

**Gate:** Basic/Super/Gadget, hit/miss и control effect различаются за один
короткий взгляд; VFX не перекрывает важный target/telegraph и держит 60 fps на
целевом мобильном профиле.

#### Детальный visual/game-feel blueprint

Нельзя решать ощущение боя одним общим `damage`-эффектом. Каждый боевой момент
должен проходить через шесть коротких слоёв:

1. **Read** — aim line/cone/arc и точка назначения показывают, куда направлено
   действие.
2. **Anticipation** — 60–180 мс подготовки: герой меняет силуэт, оружие/рука
   светится, вокруг цели появляется telegraph.
3. **Release** — резкий выброс вперёд, recoil или dash; используется ease-out,
   а не линейное движение.
4. **Travel/active** — projectile имеет головку, хвост и направление; zone имеет
   границу, внутренний pulse и понятное время жизни.
5. **Impact** — 5–8 коротких реакций за первые ~100 мс: target flash, hit pose,
   контактный burst, звук, damage number, небольшой hit-stop и camera punch.
6. **Payoff/recovery** — mark/slow/root/shield/knockback остаётся видимым,
   затем эффект затухает и герой возвращается в locomotion.

Это распределяется по существующим слоям runtime:

| Слой | Реализация | Правило |
|---|---|---|
| World aim | `AimRenderer` | Направление и зона не должны выглядеть как урон до фактического impact |
| Hero motion | `GLBHeroController` + master Actions | anticipation, release, recoil и recovery синхронизированы с phase event |
| Projectile/trail | `ProjectileRenderer` + pooled meshes/sprites | хвост сообщает направление, промах не создаёт ложный impact |
| VFX | `EffectRenderer` | explicit visual composition для каждого `effectKind`, generic ring только для неизвестного debug-case |
| Feedback | `CombatFeedbackRenderer`, `CameraRig` | hit-stop/shake только на confirmed impact, не на каждый tick зоны |
| HUD/CSS | `BattleGameUI`, `BattleGame.css` | ready/cast/cooldown/status различаются цветом, формой и анимацией кнопки |

В WebView не требуется тяжёлый particle engine. Достаточный выразительный набор
строится из pooled `THREE.Mesh`, `RingGeometry`, `ShapeGeometry`, billboard
sprites, additive materials, UV-scroll/flash shader и нескольких CSS overlays.
Аллокации в render loop запрещены: эффекты создаются из пулов и возвращаются в
пул после TTL.

#### Точные тайминги по archetype

Это стартовые диапазоны для authored/runtime audit; они настраиваются после
playtest, но не должны исчезать в произвольных fixed windows.

| Archetype | Timeline | Что игрок должен понять |
|---|---|---|
| Projectile | 0–100 мс anticipation → 80–160 мс release → travel → impact 80–140 мс | кто стреляет, куда летит и попал ли снаряд |
| Melee cone | 0–120 мс wind-up → 60–120 мс active arc → 180–260 мс recovery | когда можно выйти из дуги и когда удар наказуем |
| Dash | 60–100 мс charge → 160–280 мс перемещение → 400–800 мс trail/follow-through | точка входа, конечная точка и окно punish после промаха |
| Ground zone | 250–600 мс telegraph → impact pulse → 1.5–4 с active → fade 180–300 мс | граница опасности, оставшееся время и безопасный выход |
| Support | 100–220 мс cast → tether/target ring → heal/shield/cleanse pulse | кого поддерживает эффект и какую угрозу он снимает |

#### Feedback tiers

- **Routine hit:** target flash 45–60 мс, один contact spark, короткий звук,
  damage number; без полного screen shake.
- **Ability hit:** всё выше, 40–70 мс hit-stop, 0.08–0.16 camera trauma,
  направленный burst и отдельная status-иконка.
- **Fight-changing Super/kill:** 70–110 мс hit-stop, 0.18–0.30 camera trauma,
  крупный silhouette burst, короткий vignette/flash и kill confirmation.

В один момент времени действует максимум один сильный hit-stop, а camera trauma
складывается с cap. Shake двигает только визуальную камеру, никогда authoritative
body. Все значения имеют reduced-motion/reduced-flash вариант.

#### Цветовой язык восьми героев

У каждого героя должен быть один основной hue, один hot core и один shadow tone;
цвет не заменяет форму, но ускоряет распознавание:

- Needle — acid-lime spores, thorn rings, короткие шипы наружу;
- Mandy — gold/white crescent, тяжёлый staff arc, трещины при wall-break;
- Fairy Mina — pink/white stars, мягкий союзный heal tether, контрастная push-wave;
- Brock Zeus — cyan lightning, три reticles, vertical strike и electric afterimage;
- Kaze — violet slash silhouettes, длинный dash ribbon, dark vanish dissolve;
- Wukong Mico — amber/orange impact, ground crack, faceted stone shield и vortex;
- Persephone Lumi — magenta/lilac flower petals, roots, bloom pulse и slow field;
- Katty — hot-pink paint splash, smear trail, три stack rings и яркий flight streak.

Basic использует более спокойный вариант палитры, Gadget — насыщенный акцент,
Super — hot core + белый центр + крупнейший силуэт. Нельзя давать разным героям
одинаковую ring-only композицию.

#### Как сделать удар динамичным без изменения hitbox

На подтверждённом событии разрешены только визуальные реакции:

- visual pivot героя делает squash/stretch примерно 0.86×/1.14× и возвращается
  через 120–180 мс;
- атакующий получает recoil 2–6 см и eased return;
- цель получает hit pose на 80–160 мс, flash и направленный knockback, если он
  есть в authoritative event;
- projectile при release растягивается по оси полёта, при impact схлопывается в
  burst и исчезает;
- zone pulse масштабируется от 0.82 до 1.08 и затухает, но не вращается так,
  чтобы терялась граница hitbox.

Collider, damage, target position и server time не меняются этими приёмами.

#### Минимальный MVP красивого боя

Не начинать с визуальной переделки всех восьми героев. Сначала собрать один
законченный battle reel в live harness для одной карты и пары Kaze + Brock:

1. Kaze попадает Basic, промахивается Super-dash, затем успешно добивает цель.
2. Противник выдерживает первый контакт, использует escape/spacing, а затем
   получает подтверждённый impact только после читаемой ошибки или skill setup.
3. Все случаи показывают aim → cast → impact → recovery, sound/feedback,
   damage/status и отсутствие duplicate effects при повторном snapshot.

Controller и Mina становятся следующим slice после того, как первый PvP-срез
проходит human clarity и interest gate. Это уменьшает риск принять красивый
showcase за доказательство хорошего боя.

Если этот reel без паузы и объяснений читается на мобильном экране, тот же
`EffectRenderer`/preset-подход масштабируется на остальные skills.

### Phase 4 — authored monster camps и территории

Эта фаза **не блокирует первый PvP/retention release**. Она начинается только
после прохождения первого PvP vertical slice и его human playtest gate. Монстры
должны усиливать уже работающий combat loop, а не использоваться для маскировки
скучного PvP.

#### 4.1. Новый map contract

Заменить случайное solo-размещение production-монстров на канонические данные:

```text
MonsterCamp {
  id, kind, territory, spawnPoint, patrolWaypoints,
  difficulty, rewardPolicy, respawnPolicy, intendedRole
}
```

Минимальная карта: 6–8 camps — по одному-двум в каждом внешнем секторе и
1–2 contested camps ближе к центру. Camp territory — это понятная область с
маркером/ландмарком, а не невидимый радиус вокруг случайной точки.

Один источник должен обслуживать backend collision/AI, frontend renderer,
minimap и topology report. В solo и team map camps должны быть симметричными по
риску и времени доступа; случайность допустима только в patrol-пути внутри
заранее заданной территории.

#### 4.2. Archetype slices

- Реализовать `kind`, state machine, attack profile, telegraph, leash и reward
  policy для Пепельного гончего.
- Реализовать то же для Корневого стража, включая persistent zone/obstacle,
  которая не создаёт нечестный permanent choke.
- Передать в snapshot `campId`, `kind`, `state`, `territory/phase` и нужные
  timers; frontend должен показывать разные модели, а не ещё один bat.
- На minimap показывать статичные camp markers, но состояние danger/aggro только
  по правилам видимости.

#### 4.3. Pacing и contest

Разнести camps по tension curve: ранние внешние camp’ы обучают паттерну,
средние создают рискованный ресурсный выбор, центральные провоцируют PvP.
После победы над camp игрок получает ограниченную, заранее понятную выгоду;
camp не должен становиться обязательной бесконечной PvE-фермой.

**Gate:** игрок понимает, где находится территория, что умеет монстр, когда он
опасен и почему за camp стоит драться; все spawn/reward/respawn deterministic.

### Phase 5 — баланс, human playtest и rollout

- Прогнать scenario matrix для 8 героев в solo/team: 100/60/30% accuracy,
  direct trade, skill-assisted conversion, escape и camp contest.
- Сопоставить telemetry с human notes; субъективное «скучно» считать закрытым
  только если растут meaningful skill decisions, combat uptime и survival
  windows без скачка unfair deaths.
- Провести browser QA ranged/melee/support/controller и всех трёх monster kinds,
  включая mobile viewport, no console/page errors, screenshot и render text.
- Выпустить отдельную versioned profile через staged rollout с kill switch и
  rollback drill.

## Метрики и Definition of Done

### Обязательный итог для всех героев

Combat 2.0 нельзя считать завершённым после удачного Kaze+Brock-среза. Этот
срез является только доказательством архитектуры. До release каждый из восьми
героев — Needle, Mandy, Kaze, Brock Zeus, Wukong Mico, Persephone Lumi, Katty и
Fairy Mina — должен пройти одинаковую карточку боевой готовности для Basic,
Super и Gadget:

- авторитетные `cast → telegraph/anticipation → release → active → impact →
  recovery` с измеримыми timestamp’ами;
- собственный читаемый боевой глагол, направление, силуэт и цветовой акцент,
  которые не сводятся к общему кольцу;
- понятная причина применить способность, цена промаха и доступный ответ
  противника;
- реакция цели: hit-stop, hit pose/flash, displacement или status/payoff,
  после чего герой возвращается в locomotion без зависания;
- подтверждённые hit, miss, interrupt, escape/re-entry и взаимодействие с
  объектами карты там, где это предусмотрено kit’ом;
- animation/VFX/audio/camera/input используют одно и то же authoritative
  событие и корректно работают на mobile low/mid профилях;
- focused backend test, frontend unit test, live browser capture и human
  clarity check с записью «что сделал игрок и какой был контр-ответ».

Итоговый release gate: 8/8 героев имеют заполненные cards и проходят этот
чеклист в solo и team mode, нет героя, чья сила определяется только Basic,
нет Super/Gadget без meaningful decision, а telemetry и before/after playtest
показывают рост skill-driven decisions без роста смертей без telegraph.

### PvP

- `p50/p90 TTK` по роли, accuracy и mode;
- `timeToFirstMeaningfulHit` и `responseWindowMs`;
- доля смертей без распознанного telegraph и доля боёв без meaningful action в
  течение 3–4 секунд;
- `basicOnlyKillRate` против `skillAssistedKillRate`;
- skill casts: accepted, rejected, interrupted, missed, converted;
- escape/re-entry rate, combat uptime, deaths без telegraph;
- input-to-fire latency, cast cancel/buffer success, camera/audio feedback latency;
- доля team kills, где contribution был control/support/peel, а не только Basic.
- `respawnToActionMs`, `escapeToReentryMs` и доля матча в meaningful combat versus
  waiting/travel/downtime;
- доля попаданий, которые создали positional/status/objective advantage без kill.

### PvE/map

- время от spawn до первого camp contact;
- camp contest duration и число PvP-контактов вокруг contested camp;
- damage taken по каждому archetype, dodge/interrupt success;
- leash violations, blocked corridors, camp clear time, reward claim rate;
- fairness между симметричными секторами и отсутствие random spawn drift.

### Приёмка

- игрок не умирает от равного первого контакта без читаемой причины и meaningful
  response; конкретные TTK-границы подтверждаются по role/mode/accuracy, а не
  одной цифрой для всех;
- у каждого героя есть читаемый skill-driven win condition и контр-ответ;
- Super/Gadget ощущаются как боевые решения, а не как украшенные Basic;
- минимум три боевых роли и два новых monster type имеют разные паттерны угрозы;
- monster camps фиксированы, имеют территории, видимые landmarks и
  deterministic lifecycle;
- `go test ./...`, `cd frontend; npm test`, build, catalog/profile validators,
  focused browser QA и `git diff --check` проходят на чистом release candidate;
- human clarity test и staged rollback подписаны до объявления Combat 2.0 готовым.

## Риски и ограничения

| Риск | Митigation |
|---|---|
| Увеличение TTK превратит бой в вялый обмен | Сначала тестировать response window, movement и escape; HP повышать последним |
| Яркие VFX ухудшат читаемость и FPS | Priority tiers, короткая жизнь эффектов, LOD/budget и reduced-flash |
| Skills станут обязательными комбо без свободы | У каждой способности сохранять самостоятельную ценность и punish за miss |
| Новые монстры станут PvE-фермой вместо PvP-повода | Ограниченный reward, camp TTL/respawn, contested central placement и telemetry |
| Backend/frontend/map начнут расходиться | Один canonical camp contract, generated views, topology report и browser QA |
| Большой балансный проход сломает локальные правки | Делать vertical slices и отдельные profile revisions; не трогать unrelated dirty files |
| Endless research задержит реализацию | Зафиксировать reference matrix, затем перейти к прототипу; новые источники добавлять только если меняют решение |
| Красивый showcase не переносится в реальный матч | Принимать только live-сценарий с двумя игроками/ботами, target reaction, аудио и повторным входом |
| Плейтест покажет, что проблема не в VFX, а в ритме или вводе | Сначала измерять input latency, downtime, escape/re-entry и decisions, затем менять ассеты |
| Дополнительный pressure meter перегрузит бой | Сначала использовать hit reaction/displacement/recovery; второй ресурс вводить только после экспериментального gate |

## Открытые решения перед реализацией

1. Первый release mode: сначала solo battle или одновременно solo/team.
2. Выбрать второй controller slice: Needle (root/spores) или Katty (paint/flight).
3. Сохранить общую награду `health_boost` для всех camp’ов или позже ввести
   специализированную reward-экономику.
4. Какой target mobile profile использовать для VFX gate: текущий mid-range
   baseline или отдельный low-end device.
5. Какой melee-matchup добавить вторым после Kaze + Brock: Mandy или Mico;
   решение принимается по качеству close-range counterplay, а не по популярности.
6. Нужен ли отдельный stagger/pressure слой после базового теста soft-survival;
   по умолчанию не добавлять его в первый срез.
