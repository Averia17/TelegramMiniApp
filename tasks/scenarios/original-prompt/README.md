# Combat regression artifacts

The measurable roster regression report is generated from the authoritative
catalog and versioned profile:

```text
cd battle
go run ./cmd/combat-regression-report
```

It includes the eight-hero balance matrix, normalized role power-budget
vectors, and a cadence delta against
`combat-cadence-before.json`. The `before` file is deliberately historical
context for review; the removed global cadence multipliers must not be added
back to runtime code.

The report is deterministic and carries the profile revision and fingerprint.
Scenario tests remain the acceptance gate for skill centrality, counterplay,
HP economy, bats, and bot decisions; this artifact makes the roster-wide
cadence/power-budget part of that gate inspectable in CI.
