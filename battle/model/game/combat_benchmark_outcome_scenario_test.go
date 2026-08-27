package game

import (
	"math"
	"reflect"
	"testing"
)

type benchmarkOutcomeCase struct {
	hero           string
	opponent       string
	scenario       string
	targetDistance float64
}

func runBenchmarkOutcomeCase(t *testing.T, testCase benchmarkOutcomeCase, mode GameMode) CombatScenarioReport {
	t.Helper()
	state, attacker, defender := benchmarkMatchupState(testCase.hero, testCase.opponent, mode)
	state.Walls = nil
	state.Objectives = nil
	state.Props = nil
	attacker.X, attacker.Y = 160, 160
	defender.X, defender.Y = attacker.X+testCase.targetDistance, attacker.Y
	attacker.MaxLives, attacker.Lives = 1_000, 1_000
	defender.MaxLives, defender.Lives = 1_000, 1_000
	attacker.Ammo, attacker.MaxAmmo = 3, 3
	defender.Ammo, defender.MaxAmmo = 3, 3
	attacker.Rotation = 0
	attacker.AimDistance = testCase.targetDistance
	attacker.SuperCharge = 100
	defender.Rotation = math.Pi
	defender.AimDistance = testCase.targetDistance

	runner := NewCombatScenarioRunner("benchmark-outcome-"+string(mode)+"-"+testCase.hero+"-"+testCase.scenario, 680, mode, state)
	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "benchmark_advantage_super"}, func(gs *GameState, _ CombatScenarioInput) {
		gs.playerAbility(attacker.PlayerId, gs.nowMs(), "primary", "benchmark-advantage-super")
	}); err != nil {
		t.Fatalf("apply %s %s Super: %v", mode, testCase.hero, err)
	}
	if err := runner.AdvanceTo(1_000); err != nil {
		t.Fatalf("advance %s %s Super: %v", mode, testCase.hero, err)
	}
	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 1_000, PlayerID: attacker.PlayerId, Type: "benchmark_advantage_basic"}, func(gs *GameState, _ CombatScenarioInput) {
		angle := math.Atan2(defender.Y-attacker.Y, defender.X-attacker.X)
		gs.playerShoot(attacker.PlayerId, gs.nowMs(), screenAngleFromWorld(angle), math.Hypot(defender.X-attacker.X, defender.Y-attacker.Y))
	}); err != nil {
		t.Fatalf("apply %s %s follow-up basic: %v", mode, testCase.hero, err)
	}
	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 1_100, PlayerID: defender.PlayerId, Type: "benchmark_counter_basic"}, func(gs *GameState, _ CombatScenarioInput) {
		angle := math.Atan2(attacker.Y-defender.Y, attacker.X-defender.X)
		gs.playerShoot(defender.PlayerId, gs.nowMs(), screenAngleFromWorld(angle), math.Hypot(attacker.X-defender.X, attacker.Y-defender.Y))
	}); err != nil {
		t.Fatalf("apply %s %s counter basic: %v", mode, testCase.hero, err)
	}
	if err := runner.AdvanceTo(3_000); err != nil {
		t.Fatalf("resolve %s %s benchmark outcome: %v", mode, testCase.hero, err)
	}
	if err := runner.RecordMetric("attackerDamage", float64(1_000-defender.Lives)); err != nil {
		t.Fatalf("record %s %s attacker damage: %v", mode, testCase.hero, err)
	}
	if err := runner.RecordMetric("defenderDamage", float64(1_000-attacker.Lives)); err != nil {
		t.Fatalf("record %s %s defender damage: %v", mode, testCase.hero, err)
	}
	if err := runner.RecordMetric("attackerSurvived", boolMetric(attacker.IsAlive())); err != nil {
		t.Fatalf("record %s %s attacker survival: %v", mode, testCase.hero, err)
	}
	if err := runner.RecordMetric("advantageMargin", float64(attacker.Lives-defender.Lives)); err != nil {
		t.Fatalf("record %s %s advantage margin: %v", mode, testCase.hero, err)
	}
	return runner.Report()
}

func TestScenarioPackDocumentedBenchmarkOutcomesHaveAnAdvantageSignal(t *testing.T) {
	contracts := readCombatBenchmarkContracts(t)
	cases := []benchmarkOutcomeCase{
		{hero: "Needle", opponent: "Kaze", scenario: "deny_entry", targetDistance: 120},
		{hero: "Mandy", opponent: "Brock Zeus", scenario: "close_entry", targetDistance: 60},
		{hero: "Fairy Mina", opponent: "Kaze", scenario: "peel_assassin_entry", targetDistance: 120},
		{hero: "Brock Zeus", opponent: "Kaze", scenario: "hold_range", targetDistance: 260},
		{hero: "Kaze", opponent: "Brock Zeus", scenario: "assassin_entry", targetDistance: 220},
		{hero: "Wukong Mico", opponent: "Brock Zeus", scenario: "cross_open_lane", targetDistance: 100},
		{hero: "Persephone Lumi", opponent: "Kaze", scenario: "deny_route_entry", targetDistance: 120},
		{hero: "Katty", opponent: "Kaze", scenario: "painted_entry_denial", targetDistance: 80},
	}
	for _, testCase := range cases {
		matchups := benchmarkContractForHero(t, contracts, testCase.hero)
		if len(matchups) == 0 || matchups[0].Opponent != testCase.opponent || matchups[0].Scenario != testCase.scenario {
			t.Fatalf("%s benchmark case drifted from the first documented contract: case=%#v contracts=%#v", testCase.hero, testCase, matchups)
		}
	}

	run := func() []CombatScenarioReport {
		reports := make([]CombatScenarioReport, 0, len(cases)*2)
		for _, testCase := range cases {
			for _, mode := range []GameMode{ModeDeathmatch, ModeTeamDeathmatch} {
				report := runBenchmarkOutcomeCase(t, testCase, mode)
				if err := ValidateCombatScenarioReport(report); err != nil {
					t.Fatalf("%s %s benchmark outcome report invalid: %v", testCase.hero, mode, err)
				}
				attackerDamage, attackerOK := scenarioMetric(report, "attackerDamage")
				defenderDamage, defenderOK := scenarioMetric(report, "defenderDamage")
				survived, survivedOK := scenarioMetric(report, "attackerSurvived")
				margin, marginOK := scenarioMetric(report, "advantageMargin")
				if !attackerOK || attackerDamage <= 0 || !defenderOK || !survivedOK || survived != 1 || !marginOK || margin <= 0 {
					t.Fatalf("%s %s documented benchmark has no runtime advantage signal: attackerDamage=%.1f defenderDamage=%.1f survived=%.1f margin=%.1f report=%#v", testCase.hero, mode, attackerDamage, defenderDamage, survived, margin, report)
				}
				reports = append(reports, report)
			}
		}
		return reports
	}

	first := run()
	for replay := 2; replay <= 20; replay++ {
		next := run()
		if !reflect.DeepEqual(first, next) {
			t.Fatalf("documented benchmark outcome reports differ on replay %d", replay)
		}
	}
}
