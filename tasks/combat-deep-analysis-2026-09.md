# Глубокий анализ боёв — текущий runtime против успешных hero-fight игр

## Executive verdict

У проекта уже есть значительный объём боевой логики: восемь героев, Basic/Super/
Gadget, роли, Super charge, зоны, projectile runtime, bot utility, combat events,
профили баланса, server-side tests и визуальные QA harness’ы. Проблема не в том,
что «у героев мало скиллов».

Проблема в том, что игрок видит преимущественно такую последовательность:

`нажал → цифра урона → универсальная вспышка/кольцо → следующий Basic`.

Успешный hero-fight выглядит иначе:

`заметил намерение → оценил угрозу → занял позицию → дождался/создал окно →
применил способность → увидел контакт и реакцию → пережил recovery → решил,
продолжать ли бой или выйти`.

Нам нужно добавлять не больше кнопок, а больше **боевых состояний, причинности и
ответов**. HTML/Three.js способен это показать: для этого не требуется тяжёлый
3D particle engine. Нужны точные тайминги, направленные формы, реакции цели,
камера, звук и отсутствие рассинхронизации с authoritative simulation.

## 1. Как проводился аудит

Выводы основаны на трёх источниках:

1. Реальный Go combat core, hero contracts, combat profile, protocol и текущие
   scenario tests.
2. Реальный Three.js runtime, input path, renderer’ы и локальные captures из
   `output/playwright/hero-effect-visual-audit`.
3. Официальные материалы успешных игр и их developer/support notes.

Внешние игры дают проверенные паттерны, но не доказывают причинность удержания сами
по себе. Финальный критерий — одинаковый live-сценарий current/new, telemetry и
human playtest. Мы не должны копировать чужие числа или считать больше частиц
синонимом качества.

## 2. Что уже есть у нас

| Область | Уже сделано | Что это значит |
|---|---|---|
| Авторитетность | Go simulation, server-side damage, cooldown, Super charge, respawn | фундамент правильный; баланс можно менять централизованно |
| Идентичность героев | `docs/hero-combat-contracts.json`, роли, win condition, counterplay, 8 kit’ов | дизайнерское намерение уже описано, но его нужно довести до runtime |
| Ability timing | отдельные delayed zones и pending Mandy/Brock sequences | часть героев уже имеет окна ответа |
| Visual protocol | `combatEvents`, `BattleEffect.Phase`, telegraph/active/impact registry | есть зачаток причинности, но модель ещё слишком плоская |
| Browser QA | visual timeline, skill audit, combat feedback, melee range и live tests | можно принимать бой по наблюдаемому сценарию, а не только по unit tests |
| Mobile input | move/aim touch sticks, manual aim, bounded auto-aim, haptic feedback | ввод существует, но момент выстрела и auto-aim нужно проверять как skill expression |
| VFX | hero-specific constructors, color tokens, projectile signatures, impact bursts | ассетов уже много; следующая проблема — композиция и движение, не количество |
| PvE | bat lifecycle, authored team spawns, map topology | можно строить camp ecology после того, как PvP loop станет живым |

## 3. Главные разрывы в текущем коде

### 3.1. У некоторых Super нет настоящего боевого окна

В `battle/model/game/new_hero_kits.go` Kaze Super сразу вызывает `vaultMove`, затем
проверяет пересечение, наносит damage/stun и добавляет `kaze_dash`. Это означает,
что визуальный dash может быть красивым, но authoritative hit уже произошёл.
Противник не может увидеть полноценный cast, выбрать ответ и попасть по recovery.

Mico Super аналогично в одном вызове делает leap, radial damage, pull/stun и
включает vortex. В текущем `combat_visual_timeline_scenario_test.go` для Kaze и Mico
ожидается `resolveAt: 100`, а в `combat_counterplay_window_scenario_test.go` для
обоих указан `wantWindowMs: 0`. Это точная фиксация текущего дизайна: часть самых
«экшеновых» навыков не оставляет реактивного окна.

**Вывод:** сначала нужно разделить `accepted/cast`, `release`, `travel/active`,
`impact`, `recovery`. Иначе VFX будет лишь постфактум украшать уже решённый исход.

### 3.2. Effect phase не равен полноценной истории действия

`CombatEffectPhase` сейчас покрывает `cast`, `telegraph`, `active`, `impact`.
`BattleEffect` содержит kind, геометрию, цвет, урон и время жизни, но не содержит
полноценной связи source/target/command для направленной target reaction. Поэтому
renderer вынужден угадывать часть поведения по `kind` и положению.

**Нужно:** authoritative event timeline с `commandId`, `sourceId`, optional
`targetId`, `abilityId`, `phase`, `phaseStartedAt`, `phaseEndsAt`, `hit/miss`,
`status`, `recoveryEndsAt`. Для поля боя это не обязательно означает большой
JSON: можно передавать короткие IDs и timestamps, а визуальные детали оставлять
локальному preset’у.

### 3.3. Basic-анимация имеет общий фиксированный ритм

`GLBHeroController` запускает Basic по изменению `attackPulse`, задаёт
`attackVisualRemaining = .42` и вычисляет charge/strike/recover процедурно вокруг
фиксированной точки `phase .52`. Это удобно как fallback, но опасно как production
источник истины: у Kaze, Brock, Mandy и Mina разные дистанции, release verbs,
weapon arcs и recovery.

**Симптом:** animation pose есть, но по одному кадру неясно, был ли release, куда
полетел снаряд и что произошло с целью. Master clip должен иметь semantic markers,
а не только имя `Attack`.

### 3.4. Hit feedback слишком универсален

`CombatFeedbackRenderer` на каждый confirmed hit создаёт один и тот же bundle:
кольцо, шесть shards и damage number с фиксированной жизнью `.62`. Цвет меняется
для local/source/other, но gameplay-verb не меняется.

Такой feedback подтверждает «что-то попало», но не отвечает, чем попали, откуда
пришёл удар, куда отбросило цель, был ли это критический момент и какой status
теперь активен.

**Вывод:** нужны tiered и verb-specific реакции: обычный hit, ability hit,
interrupt/defensive break, kill/fight-changing event. Universal damage number —
дополнение, не главный carrier действия.

### 3.5. В VFX много геометрии, но недостаточно кинематики

`EffectRenderer` уже содержит много custom compositions, но shared treatment
часто строится вокруг ring/glow/core/motes, а `createOrbitalEffect` по умолчанию
снова даёт ring + orbiting particles. Это объясняет локальные captures: эффект может
быть ярким и тематичным, но выглядит как объект, поставленный на землю, а не как
событие, которое кто-то совершил над кем-то.

**Нужная смена акцента:** источник, направление, скорость, контакт и реакция цели
должны быть визуально важнее декоративного радиуса.

### 3.6. Mobile input может быть слишком «удобным» для Basic

Tap без drag переводится в auto-aim gesture; server-side auto-aim выбирает ближайшую
цель в reach и добавляет assist radius, а для projectile может включать homing.
Это полезно для первого знакомства, но потенциально снижает ощущение точности и
погони, если assist слишком часто исправляет ошибку игрока.

Это пока **гипотеза для измерения**, а не готовый verdict. Нужно сравнить tap,
manual drag и assist strength по hit rate, perceived agency, miss/punish и желанию
повторить бой.

### 3.7. Монстры — отдельный разрыв, но не причина начинать с них

Backend solo `monstersAdd` всё ещё использует random regions, а
`MonsterRenderer` создаёт только bat. Это действительно ослабляет карту и PvE.
Но новые монстры не исправят отсутствие интересного PvP-контакта. Их нужно
выпускать после первого успешного PvP vertical slice.

## 4. Что общего у успешных игр

### Brawl Stars

Brawl Stars снижает порог входа через короткие матчи, простой aim/movement и
быстро считываемые способности, но оставляет пространство для классов,
Gadgets, traits и разных способов заряда Super. Официальные материалы отдельно
описывают Gadgets, Brawler Classes и Brawler Traits, а список режимов даёт бою
разные цели: удержание зоны, мяч, gems, safe, bounty, knockout и другие.

Берём: маленькое число понятных действий, сильный silhouette, короткий feedback,
разные роли и objectives.

Не берём: их конкретные damage/cooldown/HP, размер roster и progression.

Источники: [Gadgets](https://support.supercell.com/brawl-stars/en/articles/gadgets-4.html),
[Classes](https://support.supercell.com/brawl-stars/en/articles/brawler-classes.html),
[Game Modes](https://support.supercell.com/brawl-stars/en/articles/game-modes-12.html).

### Mobile Legends и Honor of Kings

Эти игры показывают ценность kit’а как цепочки решений: направленный skill,
target selection, displacement, CC, burst с условием и возможность выбрать момент
входа. Их риск — перегрузить экран, сделать combo слишком длинным или скрыть
причину смерти числом overlapping effects.

Берём: у каждого героя должен быть свой боевой глагол — dash, pull, peel, mark,
zone, burst, shield, root — и собственная цена ошибки.

Не берём: длинные цепочки без ответа, универсальные kit’ы и HUD, который требует
изучить wiki до первого матча.

### Pokémon UNITE

Здесь neutral objectives важны не как декорация: wild Pokémon дают Aeos energy,
которая переносится в goal, а сильные wild Legendary могут изменить ход боя.
Поэтому путь к победе создаёт столкновения вокруг пространства и ресурса, а не
только deathmatch.

Берём: camps должны провоцировать выбор маршрута, риск contest и последующее
позиционное преимущество.

Не берём: обязательный длинный farm и snowball-экономику, пока базовый бой не
стабилизирован.

Источник: [официальный обзор Pokémon UNITE](https://unite.pokemon.com/en-us/overview/).

### T3 Arena

Официальное описание подчёркивает 3–5 минут матча и быстрый возврат от respawn к
frontline. Это полезный ориентир не по shooter-механике, а по плотности контакта:
игрок не должен долго смотреть на cooldown, бежать через пустую карту или ждать
возвращения в действие.

Берём: `downtime`, `respawnToActionMs`, частоту meaningful combat и быстрый
re-engagement как метрики.

Не берём: auto-fire и shooter-специфику без отдельного теста нашего управления.

Источник: [официальное описание в Google Play](https://play.google.com/store/apps/details?id=com.xd.t3.global).

### Smash Legends и Rocket Arena

Smash Legends связывает combat advantage с objective, а не только с убийством.
Rocket Arena показывает другой важный слой: hit-stun, impulse, Blast Meter и Dodge
создают промежуточное состояние между попаданием и knockout; recovery action
возвращает контроль игроку.

Берём: hit reaction, displacement, stagger/recovery и возможность сделать clutch.

Не берём автоматически второй pressure meter. Сначала тестируем тот же эффект
через уже существующие movement, shields, knockback, interrupt и recovery.

Источники: [Smash Legends developer notes](https://smashlegends.com/en/developer-team-notes-6/),
[Rocket Arena combat mechanics](https://www.ea.com/games/rocket-arena/news/rocket-arena-knockouts-mechanics).

### Общий знаменатель

Успешный боевой момент почти всегда имеет семь звеньев:

`intent → readable threat → commitment → answer → contact → state change → recovery/re-entry`.

Если убрать звено:

- нет intent — игрок не знает, кто начал;
- нет threat — смерть кажется случайной;
- нет answer — навык ощущается нечестным;
- нет contact/reaction — действие выглядит пустым;
- нет state change — всё сводится к HP;
- нет recovery — ошибка превращается в беспомощный animation lock;
- нет re-entry — игрок выпадает из боя и теряет интерес.

## 5. Какая конкретно динамика нужна нашей игре

### P0 — настоящая action grammar

Для каждого skill вводим одну и ту же историю:

1. **Intent:** герой и HUD показывают, что он собирается сделать.
2. **Commit:** короткое окно, в котором решение можно прочитать и при некоторых
   навыках прервать.
3. **Release:** действие покидает героя — projectile, slash, dash, wave, zone.
4. **Active:** снаряд/зона/траектория существует в мире, а не только в моменте
   вызова функции.
5. **Contact:** проверенный server event, target reaction, hit/miss и status.
6. **Recovery:** герой возвращается к locomotion; miss должен иметь цену, но не
   оставлять игрока без контроля дольше, чем обещает ability.

Первым делом это нужно применить к Kaze Super и Mico Super, потому что сейчас они
самые «мгновенные» по runtime. Затем сверить Basic melee с тем же правилом.

### P0 — первый эталонный matchup: Kaze против Brock

Это лучший диагностический срез, потому что проверяет сразу:

- дальнюю угрозу против ближнего входа;
- projectile travel против dash path;
- cover и line of sight;
- dodge telegraph;
- punish после промаха;
- разные camera/audio/VFX signatures;
- выбор момента re-entry.

Сценарий должен выглядеть так:

1. Brock создаёт дистанцию и выпускает читаемый lightning projectile.
2. Kaze пересекает пространство, видит угрозу и выбирает cover/вход.
3. Kaze объявляет dash, Brock получает короткий ответ: уйти, повернуть линию,
   использовать defensive timing или принять trade.
4. При попадании Kaze получает stun/prime и обязан конвертировать его в follow-up.
5. При промахе Kaze заканчивает в recovery; Brock получает punish window.
6. После отступления оба могут снова войти в бой, а не ждать полный reset.

### P1 — мягкое выживание

До увеличения HP проверяем:

- направленный hit reaction;
- короткий stagger или knockback;
- defensive/recovery action;
- shield/cleanse/escape в понятной фазе;
- low-health readability;
- короткое окно повторного входа.

Не добавляем pressure meter в первый срез. Если после этого бой всё ещё бинарный,
проводим отдельный A/B/C тест, а не внедряем механику по аналогии с чужой игрой.

### P1 — attacks должны создавать состояние поля

Попадание должно менять хотя бы одно из: позицию, доступ к проходу, safe zone,
статус, ресурс, cooldown pressure или право на objective. Это превращает Basic в
давление/подготовку, а Super/Gadget — в конвертацию преимущества.

## 6. Что именно добавить в анимации

Не делать для каждого навыка длинную дорогую cinematic-анимацию. Использовать
layered stack:

`locomotion + aim → anticipation pose → release accent → travel/active → hit pose → recovery blend`.

### Обязательные анимационные признаки

- Kaze: корпус и оружие объявляют направление, dash оставляет ghost/path ribbon,
  удар фиксирует короткую контактную позу, miss заканчивается заметной потерей
  инерции.
- Brock: прицел/reticle заряжается, рука и корпус фиксируют release, lightning
  имеет вертикальную траекторию и удар по поверхности, а не только кольцо.
- Mandy/Mico: видимый weight shift, foot plant, arc оружия, recoil и knockback;
  тяжёлый удар должен читаться массой, а не только damage number.
- Needle/Katty/Lumi: бросок/посадка зоны, boundary, active pulse, exit path и
  status marker; persistent zone не должна выглядеть как спокойная декоративная
  лужа.
- Mina: tether к союзнику, distinct heal/shield pulse, peel wave и раздельная
  реакция союзника/врага.

### Semantic animation contract

Каждый GLB clip или procedural fallback должен иметь маркеры:

`anticipationStart`, `release`, `activeStart`, `impact`, `recoveryStart`, `recoveryEnd`.

Server event является источником истины для damage и control, а animation marker
определяет presentation. Если marker и authoritative impact расходятся, срез не
принимается.

## 7. Как должны выглядеть VFX в HTML/Three.js

Нам нужен не «3D ради 3D», а пять коротких carriers смысла:

1. **Source silhouette** — вспышка оружия/руки/корпуса, чтобы было видно, кто
   начал.
2. **Direction carrier** — ribbon, cone, beam, slash arc, projectile head или
   wave-front.
3. **Threat carrier** — telegraph с границей и оставшимся временем.
4. **Contact carrier** — burst в точке цели, направленный recoil, hit-stop и
   material-specific sound.
5. **Persistent state carrier** — shield, slow, root, mark, paint/spore stack,
   heal tether или safe/unsafe zone.

### Принципы композиции

- ring разрешён, только если gameplay действительно radial;
- directional ability не должна выглядеть как плоский круг на земле;
- impact должен иметь один главный focal point, а не 20 равных объектов;
- target reaction должна быть контрастнее декоративных motes;
- ally/enemy/status должны различаться формой, не только цветом;
- эффект быстро возвращается к покою, чтобы следующий важный момент был виден;
- geometry/material создаются из pool’а и не аллоцируются на каждом кадре.

Riot формулирует тот же принцип через силуэт, hierarchy и отсутствие excess noise:
чем сильнее gameplay impact, тем заметнее способность, но дополнительные детали
не должны скрывать ответ игрока. [Clarity in League](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/).

## 8. Аудио, камера и мобильный UX

### Audio

У каждого боевого глагола должны быть минимум:

- anticipation/charge sound;
- release whoosh;
- impact sound с variation pool;
- status/kill/interrupt stinger;
- material cue для стены, брони, щита, земли или героя.

Музыка должна слегка реагировать на combat intensity, но не забивать danger cue.
Нужны buses `Master/Music/SFX/UI/Voice`, ducking для fight-changing impact и
reduced-audio option.

### Camera

Камера должна помогать читать действие: небольшой look-ahead в сторону aim/атаки,
короткий additive punch на confirmed impact, trauma cap и отсутствие shake на
каждом damage tick. Камера не меняет authoritative body и не закрывает telegraph.

### Mobile input

Для tap/drag отдельно проверяем:

- input-to-fire latency;
- момент визуального подтверждения нажатия;
- силу auto-aim assist;
- возможность удерживать движение и одновременно кастовать;
- input buffer во время короткого hit-stop/recovery;
- отсутствие ложного cast после touch cancel.

Первое впечатление должно быть forgiving, но mastery — зависеть от позиции,
времени и направления, а не от того, насколько auto-aim исправил ошибку игрока.

## 9. Почему успешные игры удерживают игрока

Это не один эффект и не только красочная графика. Рабочая гипотеза состоит из
четырёх петель:

1. **Immediate agency:** нажатие сразу меняет состояние героя или даёт понятный
   feedback.
2. **Mastery:** игрок видит, что точный aim, dodge, timing и matchup дали лучший
   исход.
3. **Clutch story:** после ошибки есть шанс выжить, выйти и вернуться.
4. **Next-match question:** после смерти игрок понимает, что попробует иначе —
   другой маршрут, момент Super, cover или matchup.

Brawl Stars дополнительно поддерживает повторяемость через множество режимов и
короткие сессии; Pokémon UNITE — через objectives и contest; T3 Arena — через
плотный возврат к frontline. Для нас это означает: retention начнётся с качества
одного repeatable combat story, а не с количества monster types.

## 10. Что нельзя делать

- не лечить скучный бой простым повышением HP;
- не добавлять больше колец, частиц и вспышек без motion/target reaction;
- не переделывать сразу восемь героев;
- не добавлять одновременно controller, support, два monster type и новый mode;
- не копировать Brawl Stars cooldown/TTK или чужую auto-aim модель;
- не делать долгий animation lock только ради красивого clip;
- не разрешать Super убивать до того, как появился читаемый threat/answer;
- не выпускать красивый showcase без live-сценария и human playtest;
- не использовать случайные production spawn’ы для контента, который должен учить
  карту;
- не вводить pressure meter, пока soft-survival не провален экспериментально.

## 11. Рекомендованный порядок реализации

### Gate 0 — runtime truth audit

Составить таблицу по всем Basic/Super/Gadget: server cast, release, active,
impact, target reaction, recovery, miss, interrupt, current VFX, current animation,
current sound и HUD. Отдельно пометить Kaze/Mico как immediate-resolution risk.

### Gate 1 — action foundation

Сделать authoritative timeline, target/source correlation, release/impact events,
recovery state и live debug timeline. Сначала без массовой смены баланса.

### Gate 2 — Kaze + Brock vertical slice

Проверить chase, cover, dash, projectile, miss punish, target reaction, camera,
audio, mobile input и re-entry на одной карте.

### Gate 3 — soft-survival and melee extension

Сравнить HP-only против hit reaction/displacement/recovery; затем добавить Mandy
или Mico как второй matchup.

### Gate 4 — controller/support

Добавить Needle/Katty и Mina только после того, как базовый clash уже интересен.

### Gate 5 — map objectives and camps

Перевести monsters на authored territories и добавить два новых archetype после
PvP gate. Их задача — создавать contest и маршрут, а не заменять бой с героями.

### Gate 6 — roster pass and rollout

Масштабировать visual/action cards на восемь героев, прогнать mobile performance,
human clarity, telemetry, staged rollout и rollback.

## 12. Definition of Done для боевого среза

Срез нельзя считать готовым, если выполнены только unit tests или красивый
showcase. Нужны все условия:

- наблюдатель за 3–5 секунд понимает source, direction, danger, hit/miss и
  результат;
- у способности есть measurable cast/release/impact/recovery;
- успешный hit и miss визуально различаются;
- цель реагирует направленно и status остаётся понятным;
- игрок может пережить первый контакт, изменить позицию и повторно войти;
- full-health death без читаемого threat отсутствует;
- Basic создаёт pressure, но не съедает весь power budget kit’а;
- Super/Gadget меняют решение, а не только увеличивают число damage;
- input, camera и audio подтверждают тот же authoritative event;
- current/new сравнивались на одном live-сценарии;
- human testers могут назвать win condition и контр-ответ без wiki;
- telemetry показывает рост meaningful decisions, а не только FPS/VFX count.

## Итог

У нас не пустой прототип и не проблема «нужно добавить больше героев». У нас уже
есть хорошая боевая логика, но игроку не хватает живой причинно-следственной
сцены. Самый большой выигрыш даст не новый monster или ещё один цветной круг, а
переход от мгновенного разрешения к последовательности:

`предупредил → дал выбрать ответ → совершил контакт → показал реакцию → дал
восстановиться → создал повод продолжить`.

Это и есть следующий правильный фундамент для красивой, динамичной и удерживающей
драки.
