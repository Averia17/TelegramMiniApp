# Combat overhaul code review — 2026-08-27

Статус: agent review завершён; human/independent release sign-off остаётся
внешним gate и не подменяется этим документом.

## Scope

Проверены изменения authoritative combat core, pickup economy, bot planner,
generated profile views, frontend pickup renderer, browser QA tooling и
release/preflight tooling относительно исходных требований глобальной
переработки.

## Review result

| Ось | Результат | Evidence |
| --- | --- | --- |
| Correctness | pass | `go test ./... -count=1`, legacy `power` regression tests, deterministic scenario pack |
| Readability / simplicity | pass | legacy health renderer удалён; stale pickup path изолирован guard-ом; архивные TODO явно помечены |
| Architecture | pass | Go остаётся authoritative source; profile generated views проверяются fingerprint validator-ом; frontend не рассчитывает gameplay |
| Security / boundaries | pass | snapshot/capability/profile входы валидируются на границе; stale legacy prop не мутирует player state |
| Performance | pass | no new per-frame unbounded allocation path; pickup cap и bounded bot/resource scans сохраняются; frontend build проходит |

## Required follow-up before release

Обязательных локальных code fixes после review не выявлено. Перед production
approval всё ещё обязательны:

1. signed human clarity/role playtest и verbatim answers по C1–C6;
2. clean immutable release manifest с approved rollback ref;
3. operator staged rollout и rollback drill с room/hash/counter evidence.

Эти пункты требуют людей, release history или deployment environment и потому
не могут быть достоверно закрыты тестовым запуском в dirty worktree.

## Verification snapshot

- backend Go tests и vet: pass;
- frontend: 600 tests, 596 pass, 0 fail, 4 skipped; lint/build pass;
- Python combat tooling: 65/65 pass;
- browser combat/map evidence: 49 visual cases, 0 console/page errors;
- release diagnostic:
  `output/combat-release-diagnostic-20260827-v4/combat-release-manifest.json`,
  `releaseEligible=false` из-за dirty worktree и отсутствия approved rollback.
