# Combat clarity playtest script — 2026-08

Статус: подготовлен, human sign-off ещё не выполнен.

Цель — проверить, что игрок понимает бой без wiki, а не только то, что
автоматический сценарий получил урон. Playtest проводится на profile
`combat-profile`, rules version `2026-08-27-skill-cooldown-source`.

## Правила сессии

1. Участник получает только короткую инструкцию «выбери героя и победи».
   Описание способностей, wiki и подсказки наблюдателя до ответов запрещены.
2. Для каждого role signature пройти один solo-сценарий и один team-сценарий.
   Минимальный roster должен фактически покрыть всех 8 активных героев:
   Controller (Needle и Persephone Lumi), Fighter (Mandy), Support (Fairy Mina),
   Sharpshooter (Brock Zeus), Assassin (Kaze), Tank (Wukong Mico) и Katty как
   второй Controller/zone case. Два участника могут разделить этот roster;
   один и тот же case ID допустим у разных участников.
3. Наблюдатель записывает экран и build/profile version, но не объясняет,
   почему сработал hit, skill или resource.
4. После каждого сценария участник отвечает на пять вопросов своими словами:

   - Что делает выбранный герой и за счёт чего он выигрывает?
   - Где сейчас опасность или telegraph, который нужно уважать?
   - Почему последний hit/эффект сработал?
   - Как противник мог избежать этого эффекта?
   - Зачем на карте зелёный cube и bat camp?

## Сценарии

| Case | Режим | Setup | Наблюдаемое решение |
| --- | --- | --- | --- |
| C1 | Solo | дальняя линия, один противник | basic создаёт давление, Super меняет дистанцию/зону |
| C2 | Solo | близкий trade, 60–120 px | recovery, miss-punish и escape читаются без подсказки |
| C3 | Team | 3v3, один союзник под давлением | роль поддержки/peel/фокуса понятна |
| C4 | Team | bat camp рядом с маршрутом | игрок видит notice/wind-up и решает contest или отступить |
| C5 | Team | зелёный cube после kill/bat | понятно, что меняется MaxHP, а не текущие Lives |
| C6 | Solo | intentional miss | промах не воспринимается как успешный impact |

Для каждого case фиксируются: hero, mode, time-to-first-contact,
combat uptime, uncontested travel, deaths, skill casts, hit/miss reason,
resource contest, screenshot/video и пять дословных ответов. В report поле
`heroCoverageEvidence` должно один раз для каждого героя сослаться на
конкретные `participantId` и `caseId`; простого списка имён в
`heroCoverage` недостаточно.

## Acceptance

- На одного участника минимум 3 из 5 ответов должны быть правильными в каждом
  role case; отдельные ошибки классифицируются как clarity, balance или
  counterplay, а не смешиваются в win rate.
- Ни один case не допускается, если одновременно выросли confusion, page/
  console errors и uncontestable power.
- Ответы сопоставляются с deterministic report: TTK, skill conversion,
  counterplay window, bat/cube contest и bot action metrics.

## Sign-off table

| Participant | Roles/cases | Solo 3/5 | Team 3/5 | Clarity issue IDs | Counterplay issue IDs | Signed |
| --- | --- | ---: | ---: | --- | --- | --- |
| _pending_ | _pending_ | — | — | — | — | — |

Evidence directory convention: `output/playtest/combat-clarity-<date>/`.
Формат JSON можно взять из
`tasks/playtest/combat-clarity-report-template.json`; генератор
`tools/init_combat_playtest.py` создаёт два placeholder-участника и ссылки
coverage для всех 8 героев. Перед approval нужно заполнить все C1–C6,
поставить `signed: true` и прогнать
`python tools/validate_combat_playtest.py <report.json> --require-files`.
Для каждого участника должны быть заполнены concrete `signature` и
`capturedAt`; placeholder-ответы, telemetry и screen/video paths validator
отклоняет даже без режима `--require-files`.
Автоматический browser QA не заменяет эту таблицу: он проверяет отсутствие
ошибок и наличие feedback, но не может ответить за нового игрока.
