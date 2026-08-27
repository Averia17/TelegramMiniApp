# Combat rollout / rollback runbook — 2026-08

Статус: runbook подготовлен, staged rollout оператором ещё не запускался.
Gameplay truth остаётся в Go simulation; profile revision и fingerprint должны
совпадать на каждом этапе.

Текущий runtime встраивает сгенерированный профиль в build. Поэтому rollback
в этой версии выполняется переключением на предыдущий release/build или git
ref целиком; config-only kill switch для выбора профиля без смены build пока не
является реализованным контрактом и не должен считаться доступным.

Исторические rollback references, проверенные локально:

| Артефакт | Значение |
| --- | --- |
| Code reference | `ba17770` — `go test ./... -count=1` проходит |
| Profile revision | `2026-08-26-phase-1-combat-core` |
| Fingerprint | `3B2F8D0486E03BA44B3A706E5E547BCA7AA1E3AEADDAA88462C56C41D9233BD4` |
| Release status | не approved: archive validator выявил stale catalog fingerprints; нужен зафиксированный passing release artifact |

`HEAD c3f5e48` не использовать как rollback target: его исторический Go
тест падает на city collider count (56 вместо 54). Наличие profile JSON или
проходящего отдельного package не заменяет release-level preflight.

Текущий candidate: revision `2026-08-27-cadence-window`, fingerprint
`FB04F651CBFF6F8FCBE7830CB752CBE1F52FC04976274D90B5C1CFD25CFF2488`.

Последний dry-run rollback reference: `ba17770` прошёл полный Go suite, но не
прошёл catalog fingerprint check в архивной копии. Поэтому rollback drill и
staged rollout остаются операционным gate до появления approved release/ref;
этот runbook не маскирует reference как готовый production rollback.

Дополнительный scan всех исторических refs, изменявших catalog, не нашёл
проходящего release-level rollback target: более ранние refs не содержат
актуального полного CombatProfile, `ba17770` отклонён по manifest fingerprint,
а `HEAD` дополнительно отклонён по collider regression. Следующий безопасный
шаг — получить passing release/ref после фиксации текущего working tree, а не
выбирать rollback target по давности коммита.

Повторяемая проверка 2026-08-27 просмотрела 16 refs из истории profile/catalog;
проходящих refs найдено 0 (14 refs не содержат нужных артефактов или не проходят
release-level preflight). Это подтверждает отсутствие локального rollback target,
но не является operator approval.

Машиночитаемый результат этого scan сохранён в
`output/combat-rollback-scan-20260827-v2/combat-rollback-ref-scan.json` и должен
перегенерироваться новой директорией после появления новых refs.

## Preflight gate

```text
python tools/validate_hero_catalog.py
python tools/validate_combat_profile.py
python tools/validate_hero_combat_contracts.py
python tools/generate_combat_profile.py --check
python tools/validate_combat_release.py --require-clean --rollback-ref <approved-ref> --go-tests
python tools/capture_combat_release.py --output-dir <new-evidence-dir> --rollback-ref <approved-ref> --go-tests
python tools/validate_combat_playtest.py output/playtest/combat-clarity-<date>/report.json --require-files
python tools/validate_combat_rollout.py tasks/rollout/combat-rollout-<date>.json --require-files
python tools/init_combat_playtest.py output/playtest/combat-clarity-<date>/report.json
python tools/init_combat_rollout.py output/rollout/combat-rollout-<date>/report.json
cd battle && go test ./... -count=1
cd frontend && npm test && npm run lint && npm run build
```

Для локальной разработки допустим диагностический запуск без
`--require-clean`, но он явно возвращает `workingTreeClean=false` и не является
release evidence. Rollout preflight обязан проверять clean working tree и
полный rollback ref; если rollback ref отсутствует или не проходит archive
preflight, Stage 2 блокируется.

Сохранить в release evidence: `CombatProfileID`, `CombatRulesVersion`,
`CombatEventSchemaVersion`, fingerprint, commit/ref, balance report, topology
report, browser screenshots и полный test output.

`capture_combat_release.py` создаёт `combat-release-manifest.json` только один
раз и фиксирует commit, profile/fingerprint и SHA-256 всех release-critical
файлов вместе с passing rollback ref. Повторная запись в ту же директорию
запрещена. `--allow-dirty` существует только для диагностики и выставляет
`releaseEligible=false`; такой manifest не является rollout evidence.

Для отдельной проверки rollback ref запускать `python
tools/validate_combat_release.py --ref <ref> --go-tests`. Команда проверяет
profile/catalog/fingerprint и generated Go/JS views именно из ref и завершает работу
с ненулевым кодом при stale fingerprint или падении archived Go suite; текущий
reference `ba17770` дал `goTest.exitCode=0`, но отклонён из-за stale manifest.

Human evidence перед approval проверяется отдельно командой
`tools/validate_combat_playtest.py`. Она требует текущие profile/rules version и
profile fingerprint,
подписанного участника, cases C1–C6, минимум 3/5 правильных ответов, telemetry
по каждому case, coverage всех 8 активных героев с `heroCoverageEvidence`,
связанным с реальными participant/case, и пустые console/page error lists. Отсутствующий или неполный
отчёт не может быть принят как Stage 2 evidence.

Для нового отчёта используйте `tools/init_combat_playtest.py`: он подставляет
текущие profile revision/fingerprint и создаёт два placeholder-участника с
полным C1–C6 и заранее связанным `heroCoverageEvidence` для всех активных
героев; human-подписи, ответы и runtime evidence остаются пустыми до сессии.

Итоговый операторский отчёт Stage 0–3 и rollback проверяется отдельно
`tools/validate_combat_rollout.py`. Шаблон находится в
`tasks/rollout/combat-rollout-report-template.json`; validator требует clean
eligible release manifest, совпадающие profile revision/fingerprint, подпись
оператора, стабильные hashes, zero abort gates, validated rollback object/ref
в release manifest и непустые post-rollback counters с неотрицательными
целыми значениями.

Для актуального шаблона рекомендуется `tools/init_combat_rollout.py`: он
подставляет текущие profile revision/fingerprint и переносит только уже
подтверждённые локальные Stage 0–1, не создавая ложного Stage 2/3 approval.

## Stages

### Stage 0 — deterministic bots

Запустить roster-wide `combat-regression-report`, resource topology report и
solo/team scenario pack. Отдельно прогнать
`TestScenarioPackThreeVsThreeTeamMirrorKeepsHeroDamageSymmetric`: все 8 героев,
3 lane, зеркальные Blue/Red damage rounds и 20 replay cycles. Повторить каждый
deterministic scenario минимум 20 раз; state hash и event timeline должны
совпадать. Для skill regression также обязателен
`TestScenarioPackSkillDisabledOutcomeChangesAcrossSoloAndTeam` с before/after
kill-rate и survival metrics. Также обязателен
`TestScenarioPackDocumentedBenchmarkOutcomesHaveAnAdvantageSignal` для первого
documented matchup всех 8 героев в solo/team. Любой outlier получает scenario
ID и блокирует следующий stage.

### Stage 1 — internal browser QA

Прогнать ranged, melee, support, zone, bat и team-fight cases через
`tools/qa/playwright-runner.cjs`. Требования: zero console/page errors,
accepted/rejected feedback различим, incompatible snapshot отвергается до
presentation, task-owned Playwright processes закрыты.

Минимальный roster visual command: `node tools/qa/hero-effect-visual-audit.cjs`.
Он должен завершиться с 49 visual cases, отдельной runtime-error записью для
каждого из 8 героев и `consoleErrors=0`, `pageErrors=0`.

### Stage 2 — ограниченный human playtest

Выпустить только текущий versioned profile небольшой группе участников и
заполнить `tasks/playtest/combat-clarity-script-2026-08.md`. Gate: минимум
3/5 clarity-ответов по каждому role case, без одновременного ухудшения
clarity/performance/counterplay. Записать server-side result counters, а не
только победы.

### Stage 3 — расширение

Только после approval Stage 2 увеличивать долю матчей. Report обязан содержать
`historicalBaseline.source`, отличающуюся от текущих `profileRevision` и
`profileFingerprint`, и объявить метрики `ttk`, `fullAmmoDeletion`, `reloadDeadTime`,
`skillConversion`, `botIdleRetreat`, `resourceContest`, `matchDuration` и
`winRate`. В `historicalBaseline.comparison` для каждой метрики должны быть
числовые `baseline`, `candidate` и арифметически согласованный `delta`.
Сравнивать с этим baseline по каждой метрике; не менять profile и код в одном
rollout window.

## Abort gates

Остановить расширение при любом из условий: mixed-version snapshot принят,
event schema parse error, новый console/page error, state-hash mismatch,
необъяснимый idle/retreat бота, ability без counterplay window, bat/cube reward
без ownership, либо одновременное ухудшение clarity и counterplay.

## Rollback drill

1. До Stage 2 сохранить предыдущий loadable profile, fingerprint и его
   generated views.
2. Переключить deployment/build на предыдущий profile без изменения
   gameplay-кода внутри rollback operation; новые комнаты должны объявить
   старую rules/schema version. Если runtime profile switching будет добавлен
   позже, этот пункт можно заменить на проверенный kill switch.
3. Existing rooms не смешивать с несовместимым snapshot; при mismatch клиент
   получает explicit rejection и возвращается в безопасный recovery flow.
4. Повторить Stage 0 и короткий Stage 1, затем зафиксировать время rollback,
   affected rooms, error count и post-rollback hashes.

Rollback считается успешным только с evidence; наличие fallback-кода само по
себе не является drill.
