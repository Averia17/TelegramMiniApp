package game

import (
	"battle/model/gamemap"
	"encoding/json"
	"testing"
)

func TestCombatResourceTopologyReportIsDeterministicAndReachable(t *testing.T) {
	build := func() ResourceTopologyReport {
	report, err := BuildResourceTopologyReport("team-battle", gamemap.GenerateTeamBattleClassic(gamemap.CanonicalTeamBattleSeed))
		if err != nil {
			t.Fatalf("build resource topology report: %v", err)
		}
		return report
	}

	first, second := build(), build()
	if string(first.StableJSON()) != string(second.StableJSON()) {
		t.Fatalf("resource topology report is not deterministic:\nfirst=%s\nsecond=%s", first.StableJSON(), second.StableJSON())
	}
	if len(first.BatRoutes) == 0 || len(first.HealthBoostRoutes) == 0 || len(first.ContestSamples) == 0 {
		t.Fatalf("resource topology report is incomplete: %#v", first)
	}
	if first.UnreachableRoutes != 0 {
		t.Fatalf("resource routes are unreachable: %d/%d", first.UnreachableRoutes, first.RouteCount)
	}
	if first.SafeDropFailures != 0 {
		t.Fatalf("safe health-boost drop candidates failed: %d", first.SafeDropFailures)
	}
	if first.BatP50Ms <= 0 || first.BatP90Ms < first.BatP50Ms {
		t.Fatalf("bat route percentiles are invalid: p50=%d p90=%d", first.BatP50Ms, first.BatP90Ms)
	}
	if first.HealthBoostP50Ms <= 0 || first.HealthBoostP90Ms < first.HealthBoostP50Ms {
		t.Fatalf("health-boost route percentiles are invalid: p50=%d p90=%d", first.HealthBoostP50Ms, first.HealthBoostP90Ms)
	}
	if first.ContestP50Ms <= 0 || first.ContestP90Ms < first.ContestP50Ms {
		t.Fatalf("contest percentiles are invalid: p50=%d p90=%d", first.ContestP50Ms, first.ContestP90Ms)
	}
	if first.MirroredContestMismatches != 0 {
		t.Fatalf("mirrored bat contests diverge: %d", first.MirroredContestMismatches)
	}
	if first.BatTeamArrivalP50DeltaMs > resourceTopologyMirrorTolerance || first.BatTeamArrivalP90DeltaMs > resourceTopologyMirrorTolerance {
		t.Fatalf("bat team lane timing diverges: p50=%dms p90=%dms", first.BatTeamArrivalP50DeltaMs, first.BatTeamArrivalP90DeltaMs)
	}
	if first.HealthBoostTeamArrivalP50DeltaMs > resourceTopologyMirrorTolerance || first.HealthBoostTeamArrivalP90DeltaMs > resourceTopologyMirrorTolerance {
		t.Fatalf("health-boost team lane timing diverges: p50=%dms p90=%dms", first.HealthBoostTeamArrivalP50DeltaMs, first.HealthBoostTeamArrivalP90DeltaMs)
	}
	if first.ContestedCamps == 0 {
		t.Fatalf("bat topology has no contestable neutral camp: max window=%dms", first.MaxContestWindowMs)
	}

	encoded, err := json.Marshal(first)
	if err != nil {
		t.Fatalf("marshal resource topology report: %v", err)
	}
	t.Log(string(encoded))
}
