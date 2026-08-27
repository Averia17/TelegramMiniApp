# Combat automated gate evidence — 2026-08-27

Статус: automated implementation gate закрыт; external release gates остаются
явно открытыми.

Этот файл фиксирует последний воспроизводимый sweep после исправления cancel
lifecycle для delayed Super и quarantine legacy `power` pickup. Он не заменяет
signed human playtest и clean release evidence.

## Закрытые automated gates

| Gate | Evidence | Result |
| --- | --- | --- |
| Profile/catalog/contract | `validate_hero_catalog.py`, `validate_combat_profile.py`, `validate_hero_combat_contracts.py`, `generate_combat_profile.py --check` | pass |
| Backend regression | `cd battle; go test ./... -count=1` | pass; all packages |
| Backend static checks | `cd battle; go vet ./...` | pass |
| Frontend regression | `cd frontend; npm test` | 600 tests, 596 pass, 0 fail, 4 skipped |
| Frontend quality/build | `npm run lint`, `npm run build` | pass; only known Sass/chunk-size warnings |
| Tooling regression | `python -m unittest discover -s tools -p 'test*.py'` | 65/65 pass; release, playtest, staged-rollout, template-init и rollback-scan validators |
| Deterministic combat | `combat-regression-report`, roster solo/team matrix, skill-disabled matrix, benchmark matrix, 3x3 team mirror | pass; replay/state-hash gates green; isolated 1v1 `basicDamage` is exactly equal between solo/team for all 8 heroes across 20 replays |
| Resource topology | `resource-topology-report` | pass; 168 routes, 0 unreachable, 0 unsafe drops |
| Static map browser audit | `global-team-map-browser-audit.cjs` | pass; current `team-battle-northern@20260827`, symmetric reachability, 0 console/page errors |
| Browser combat | roster effect audit, bat lifecycle, mobile input/cancel | pass; 49 visual cases, 0 console errors, 0 page errors |
| HP pickup visual contract | health boost renderer/unit contract | pass; cube/halo use green palette, legacy crate/potion renderer removed |
| Legacy pickup safety | backend `power` pickup regression tests | pass; stale power props are discarded without heal, MaxHP or damage multiplier |
| Rollout evidence contract | `validate_combat_rollout.py` + 17 tests | pass; template and strict Stage 0–3/rollback validator added; manifest commit identity, validated rollback object/ref, historical baseline profile fingerprint/metric scope and numeric before/after deltas, local playtest contents, profile fingerprint, hero coverage, per-case hero evidence links and numeric rollback counters are cross-checked; no operator report is fabricated |
| Playtest template initialization | `init_combat_playtest.py` + 6 tests | pass; current revision/fingerprint, concrete signature/timestamp fields, two participant scaffolds covering all C1–C6 and all active heroes with create-once protection; generated v8 keeps human fields empty while prewiring hero-coverage evidence links |
| Rollout template initialization | `init_combat_rollout.py` + 3 tests | pass; current revision/fingerprint and verified Stage 0–1 evidence generated, external stages remain not_run |
| Rollback history scan | `scan_combat_rollback_refs.py` | pass; 16 historical refs checked, 0 eligible targets; current report saved under `output/combat-rollback-scan-20260827-v2/` |
| Diff hygiene | `git diff --check` | pass; only line-ending warnings |

## Fresh final verification sweep

На 2026-08-27 20:33 MSK после миграции health-boost policy повторно
подтверждены профильные и runtime gates:

- `python -m unittest discover tools -p 'test_combat_profile.py'` — 14/14
  pass;
- `python tools/validate_combat_profile.py` и
  `python tools/generate_combat_profile.py --check` — pass;
- `go test ./... -count=1` и `go vet ./...` — pass после изменения сигнатуры
  `Player.ApplyHealthBoost`;
- `npm test`, `npm run lint`, `npm run build` — pass; frontend остаётся на
  600 тестах (596 pass, 0 fail, 4 skipped), build сообщает только известные
  Sass/chunk-size warnings;
- новый runtime parity test подтверждает, что fraction, teamFraction,
  maxStacks, maxActivePickups и ttlMs читаются из generated combat profile;
- runtime parity дополнен Super/Gadget/AI defaults, а authoritative ability
  path ограничивает stale Gadget charges profile capacity; focused regression
  test `TestPlayerAbilityClampsGadgetChargesToProfileCapacity` проходит;
- playtest/rollout evidence validators теперь отклоняют placeholder metadata,
  participant signature/timestamp без concrete capture и отрицательную
  telemetry; актуальный create-once playtest scaffold — v8;
- свежий fingerprint профиля:
  `FB04F651CBFF6F8FCBE7830CB752CBE1F52FC04976274D90B5C1CFD25CFF2488`;
- обновлённый diagnostic manifest:
  `output/combat-release-diagnostic-20260827-v4/combat-release-manifest.json`.
- актуальные create-once scaffolds пересозданы после смены fingerprint:
  `output/playtest/combat-clarity-20260827/generated-template-v8.json` и
  `output/rollout/combat-rollout-2026-08-27/report-v5.json`; их validators
  отвергают только незаполненные signed human/operator и rollout fields.
- после обновления source fingerprint текущий release preflight снова проходит
  без ошибок; catalog и manifest теперь согласованы.

Ниже сохранён предыдущий полный sweep для трассировки остальных evidence.

На 2026-08-27 20:10 MSK повторно подтверждены все локальные automated gates:

- `go test ./... -count=1` и `go vet ./...` — pass для всех backend-пакетов;
- `npm test` — 600 тестов, 596 pass, 0 fail, 4 skipped;
- `npm run lint` и `npm run build` — pass; остаются только известные Sass
  deprecation и chunk-size warnings;
- Python tooling — 65/65 pass;
- `output/playwright/hero-effect-visual-audit/report.json` — 49 visual cases,
  8 runtime summaries, 0 console/page errors;
- `output/combat-regression-report-20260827.json` — свежий профильный balance,
  power-budget и cadence report с fingerprint текущего профиля;
- team bot AI дополнительно проверен на обычный видимый bat: здоровый бот
  выбирает явное `farm_bat`-решение и пишет farm telemetry, а emergency остаётся
  только для реальной угрозы/отступления;
- team bot health-economy integration test проходит полный simulation tick:
  бот доходит до видимого зелёного `health_boost`, получает ровно один
  MaxHP-stack и деактивирует pickup;
- solo bot integration test также проходит полный simulation tick: здоровый
  bot выбирает видимый bat через обычный combat target loop и наносит ему урон
  (в lethal sample bat удаляется как подтверждение успешного farm combat);
- task-owned Playwright Chromium processes после capture отсутствуют.

Это обновляет только automated evidence. Signed human playtest, approved clean
rollback ref/build и operator staged rollout по-прежнему намеренно не
фабрикуются и остаются external gates.

## Cancel lifecycle evidence

`output/playwright/ability-input-cancel/report.json` содержит связку
`cancelTargetClientId` с исходным cast id и пустые `consoleErrors`/`pageErrors`.
Backend tests дополнительно подтверждают, что отмена Mandy/Brock удаляет только
исходную delayed resolution и не создаёт поздний ложный `ability_missed`.

## Release preflight

Текущий working tree намеренно диагностический: `validate_combat_release.py`
возвращает `errors=[]`, но `workingTreeClean=false`, поэтому этот каталог не
является rollout artifact.

Диагностический manifest текущего кандидата сохранён в
`output/combat-release-diagnostic-20260827-v4/combat-release-manifest.json`;
он фиксирует profile fingerprint и SHA-256 critical files, но явно содержит
`releaseEligible=false` и не заменяет clean release artifact.

Проверенный исторический кандидат `ba17770` проходит архивный Go suite, но
отклонён по stale catalog fingerprint. Другой проверенный HEAD-кандидат имеет
исторический collider regression. Ни один ref не помечается approved без нового
чистого release artifact.

Исторический scan profile/catalog history: 16 refs checked, 0 passing
release-level rollback refs found; 14 refs lacked required current artifacts or
failed preflight. Это diagnostic evidence, не approval.

## Открытые external gates

1. Signed human clarity/role playtest по scripted cases: минимум 3/5 ответов
   на каждый role case, screen/video evidence и сопоставление с telemetry.
2. Approved clean rollback ref и immutable build manifest.
3. Operator-run staged rollout и rollback drill с affected rooms, hashes и
   post-rollback counters; Stage 3 must attach the approved historical baseline
   and declare every required comparison metric.

Для human gate добавлен строгий `tools/validate_combat_playtest.py`: он
проверяет report shape и version, C1–C6, signed participant, порог 3/5,
telemetry, пять дословных ответов на каждый case, фактическую привязку всех 8
героев к participant/case evidence и отсутствие runtime errors. Validator и его тесты зелёные, но
самих participant answers/evidence в рабочем дереве пока нет.

До получения этих артефактов нельзя честно ставить `[x]` для полного T13/T10,
historical outcome delta или production release approval. Автоматический T17
при этом закрыт по семи исходным группам; его оставшийся open-status означает
только недостающие historical/human evidence.
