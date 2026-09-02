# План: ML-боты для боевой симуляции — 2026-09

## Цель

Добавить обучаемый тактический слой для ботов, не отдавая ML-модели
авторитетную физику, попадания, cooldown’ы, visibility, pathfinding или
server-side combat. Модель должна доказуемо улучшать решения в одинаковых
воспроизводимых матчах, а при ошибке/недоступности модели автоматически
возвращаться к текущему utility AI.

## Что показал аудит

- Авторитетная симуляция находится в `battle/model/game` и работает с
  synthetic clock через `CombatScenarioRunner`.
- Текущий бот уже имеет perception с LOS/стенами/кустами, target selection,
  hard interrupts для projectile/monster/storm, utility scoring, role-aware
  team behavior, strafe/aim/pathfinding и match-local telemetry.
- Тактическое решение принимается на каждом server tick, но movement и combat
  проходят через `playerMove`, `playerShoot` и `playerAbility`.
- В проекте нет ML runtime, dataset или checkpoint. Поэтому готовую модель
  нельзя честно «подключить»: веса должны быть обучены на нашей симуляции.

## Архитектурное решение

### Модель

Основной кандидат: **Recurrent PPO (LSTM actor)** с дискретными тактическими
намерениями и маской недоступных действий.

Почему:

1. Наблюдение частичное: бот знает только видимые цели и должен помнить
   последнюю позицию/намерение.
2. Action space смешанный по смыслу, но его можно безопасно разложить на
   компактные discrete heads: intent, target slot, ability slot.
3. PPO проще и устойчивее для первого custom environment, чем полноценные
   MuZero/Dreamer или end-to-end pixel policy.
4. LSTM позволяет учитывать короткую историю: projectile threat, missed shot,
   recent damage, target memory и commitment window.

### Иерархия управления

```text
hard interrupt (projectile / lethal monster / storm)
        |
        v
ML tactical policy (примерно каждые 320 ms)
        |
        +--> intent + target slot + optional ability
        |
        v
existing deterministic steering / aim / pathfinding / authoritative command
```

Модель не должна выдавать координаты, damage или результат столкновения.
Первый production-safe slice обучает только выбор intent:

Slice 1 intentionally uses the four actions already executable by the current
tactical layer: `roam`, `engage`, `retreat`, `collect_pickup`. `contest_resource`,
`regroup`, `defend_objective` and `attack_objective` are reserved for the next
action-head slice, after their execution semantics are separated from the
existing team priority policies.

Target selection и aim остаются существующими deterministic механизмами до тех
пор, пока benchmark не докажет пользу следующего head. Способности добавляются
отдельным experiment, иначе будет невозможно понять, что именно улучшило матч.

## Наблюдение v1

Фиксированный float32 vector, без скрытых map-wide данных:

- ego: normalized health, shield/status, ammo, super/gadget readiness,
  cooldown/reload, role/hero embedding, position/velocity/rotation;
- nearest visible enemies: distance, bearing, health, role/hero embedding,
  attack range, stunned/recently-fired, line-of-sight;
- nearest visible allies: distance, bearing, health, combat/pressure flags;
- nearest pickup/monster/objective: distance, bearing, kind, contest state,
  reward/health value;
- threat: closest projectile time-to-hit and lateral offset, monster windup,
  storm distance, current phase;
- memory: previous intent, intent age, last target class, last seen age;
- team context: visible enemy/ally counts and objective state.

Все distance/time/value поля нормализуются и clipping’ятся. Сортировка entity
slots стабильна по score, затем по ID, чтобы map iteration не меняла input.

## Обучение

1. **Expert bootstrap:** записать state/action пары текущего utility AI.
2. **Behavior cloning:** warm-start actor, чтобы модель не начинала с
   невалидных/бесполезных действий.
3. **Masked recurrent PPO:** дообучение на self-play в authoritative simulator.
4. **Opponent pool:** latest policy + несколько прошлых checkpoints + текущий
   utility bot; не играть только против последней версии.
5. **Curriculum:** открытая арена 1v1 → cover/LOS → pickups/monsters → team
   objectives → roster/mirror matchups.
6. **Export:** checkpoint + immutable observation/action schema fingerprint.
   Production rollout только с utility fallback и feature flag.

Training remains Python-side; the battle service remains Go. The first runtime
artifact uses a small JSON-exported LSTM and local Go inference, so production
does not gain a hard ONNX/Python dependency. The explicit runtime modes are
disabled (default), shadow, and active; active requires schema, combat-profile
and combat-rules compatibility plus a passing holdout quality gate.

## Reward v1

Основной reward — team/outcome reward с ограниченным shaping:

- positive: win, kill, assist, effective damage, objective damage/defense,
  pickup secured, successful dodge, meaningful re-entry;
- negative: death, damage taken, idle/stuck time, invalid action,
  target-switch thrashing, wasted ability, shooting through cover;
- small survival reward только при active/meaningful state, чтобы бот не учился
  бесконечно убегать.

Весовые коэффициенты версионируются вместе с profile и не смешиваются с
  balance tuning. Reward должен измерять результат, а не количество красивых
  действий.

## Simulation и доказательство улучшения

Каждый evaluation run использует paired seeds: один и тот же seed, map,
roster, spawn, opponent policy и clock сначала прогоняются baseline, затем
candidate. Сохраняются JSON reports и checkpoint hashes.

Минимальный evaluation matrix:

- solo 1v1: melee/ranged, 30/60/100% target accuracy;
- team 3v3: role mix, focus fire, peel, objective defense;
- resource: safe pickup, contested pickup, bat contest;
- threat: projectile dodge, low-health retreat, empty ammo;
- map: open space, cover/LOS, long wall/bridge.

Обязательные primary metrics:

`winRate`, `scorePerMinute`, `deaths`, `damagePerLife`, `objectiveConversion`,
`skillAssistedKillRate`, `attackAccuracy`, `reactionMs`, `idleMs`, `stuckReplans`,
`targetSwitchRate`, `retreatWhenOutnumbered`, `dodgeRate`, `reentryMs`.

Кандидат считается лучше baseline только если:

- win/score растут на holdout seeds;
- idle/stuck и deaths without readable threat не растут;
- attack accuracy и reaction latency остаются в заданных human-like bounds;
- нет regressions в existing deterministic scenario tests;
- улучшение повторяется минимум на двух независимых seed blocks.

## Этапы

### Slice 1 — contract + benchmark

- immutable observation/action schema;
- export current bot decision trajectories;
- paired simulation report для baseline vs arbitrary policy adapter;
- metrics, seed replay и report validation.

### Slice 2 — training environment

- Python Gymnasium/PettingZoo-style parallel adapter;
- JSONL/IPC bridge к Go simulator или batch scenario runner;
- expert dataset и behavior-cloning smoke training.

### Slice 3 — recurrent PPO

- LSTM actor, masked actions, self-play opponent pool;
- offline holdout evaluation и checkpoint registry;
- first trained checkpoint, не включённый в live по умолчанию.

### Slice 4 — shadow/runtime integration

- recurrent model inference adapter;
- shadow decisions beside utility AI;
- latency/error/fallback metrics;
- opt-in rollout for internal matches.

### Slice 5 — live rollout

- canary percentage, profile/model fingerprint, rollback;
- human playtest and telemetry review;
- enable only after deterministic and gameplay gates pass.

### Slice 6 — learned tactical control v2

The four-action checkpoint is intentionally not treated as the final brain. The
next policy contract is factored so the model can choose an intent, a local
target slot, a movement style and an ability request in one recurrent decision.
The Go executor remains authoritative for legality, pathfinding, cooldowns,
collision and damage resolution.

Acceptance criteria:

- target selection is learned from a stable ordered set of visible local
  candidates rather than silently reusing `botSelectTarget` as the only target;
- `kite`, `chase`, `take_cover`, `retreat` and `use_ability` have distinct
  executable semantics and structural action masks;
- the authoritative simulator can run a reproducible 3v3 episode with one
  policy controlling a team against a mixed opponent pool;
- reward reports expose team win, focus-fire contribution, ally assistance,
  cover usage, successful retreats and unsafe/stuck penalties;
- telemetry separates ML decisions, effective overrides, hard-interrupt
  overrides and deterministic fallbacks;
- a new checkpoint must beat the current utility baseline on independent paired
  3v3 holdout seeds before active rollout.

## Риски

| Риск | Митигирование |
|---|---|
| Model learns to farm/escape instead of fight | outcome/team reward, opponent pool, idle/contest metrics |
| Self-play strategy collapse | old checkpoint pool + utility opponent |
| Partial observability | LSTM + strict local observation contract |
| Model exploits simulator bug | holdout scenarios, invariant tests, human review |
| Runtime latency/availability | batched inference, tactical tick, utility fallback |
| Balance/profile drift | schema/profile fingerprint and model compatibility gate |

## Definition of Done

- There is a real trained checkpoint and reproducible command to recreate it.
- Candidate beats current utility bot on paired holdout evaluation without
  violating safety/quality thresholds.
- Model decisions can be replayed from observation/action logs.
- Live fallback is automatic and observable.
- Existing authoritative combat and deterministic replay tests remain green.
