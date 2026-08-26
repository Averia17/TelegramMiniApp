package game

import (
	"math"
	"reflect"
	"testing"
)

func runKazeAccuracyTier(t *testing.T, tierName string, hitCount int) CombatScenarioReport {
	t.Helper()
	state := newScenarioSoloState("Kaze", "Katty")
	state.Walls = nil
	attacker, target := state.Players["hero"], state.Players["target"]
	attacker.X, attacker.Y = 160, 160
	attacker.Ammo, attacker.MaxAmmo = 10, 10
	attacker.AttackRate = 1
	target.X, target.Y = 260, 160
	target.MaxLives, target.Lives = 100_000, 100_000
	runner := NewCombatScenarioRunner("accuracy-"+tierName, 601, ModeDeathmatch, state)
	actualHits := 0
	for index := 0; index < 10; index++ {
		atMs := int64(index * 300)
		input := CombatScenarioInput{AtMs: atMs, PlayerID: attacker.PlayerId, Type: "basic_accuracy_trial"}
		if err := runner.ApplyInput(input, func(gs *GameState, _ CombatScenarioInput) {
			before := target.Lives
			angle := 0.0
			if index >= hitCount {
				angle = math.Pi
			}
			gs.playerShoot(attacker.PlayerId, gs.nowMs(), screenAngleFromWorld(angle))
			if target.Lives < before {
				actualHits++
			}
		}); err != nil {
			t.Fatalf("accuracy tier %s input %d: %v", tierName, index, err)
		}
	}
	if err := runner.RecordAccuracyMetric("accuracy."+tierName, 10, uint64(actualHits)); err != nil {
		t.Fatalf("record accuracy tier %s: %v", tierName, err)
	}
	return runner.Report()
}

func TestScenarioPackAccuracyTiersAreReplayable(t *testing.T) {
	run := func() []CombatScenarioReport {
		return []CombatScenarioReport{
			runKazeAccuracyTier(t, "100", 10),
			runKazeAccuracyTier(t, "60", 6),
			runKazeAccuracyTier(t, "30", 3),
		}
	}
	first, second := run(), run()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("accuracy reports differ:\nfirst=%#v\nsecond=%#v", first, second)
	}
	for index, report := range first {
		if err := ValidateCombatScenarioReport(report); err != nil {
			t.Fatalf("accuracy report invalid: %v", err)
		}
		want := []float64{1, .6, .3}[index]
		got, ok := scenarioMetric(report, "accuracy."+[]string{"100", "60", "30"}[index]+".accuracy")
		if !ok || math.Abs(got-want) > .0001 {
			t.Fatalf("accuracy tier %d = %.3f, want %.3f", index, got, want)
		}
	}
}

func TestScenarioPackDirectTradeComparesBasicAndReadySuper(t *testing.T) {
	run := func(withSuper bool) CombatScenarioReport {
		state := newScenarioSoloState("Kaze", "Katty")
		state.Walls = nil
		attacker, target := state.Players["hero"], state.Players["target"]
		attacker.X, attacker.Y = 160, 160
		attacker.Ammo, attacker.MaxAmmo = 3, 3
		target.X, target.Y = 260, 160
		target.MaxLives, target.Lives = 10_000, 10_000
		runner := NewCombatScenarioRunner("direct-trade", 602, ModeDeathmatch, state)
		before := target.Lives
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "direct_trade"}, func(gs *GameState, _ CombatScenarioInput) {
			if withSuper {
				attacker.SuperCharge = 100
				gs.playerAbility(attacker.PlayerId, gs.nowMs(), "primary")
			}
			gs.playerShoot(attacker.PlayerId, gs.nowMs(), screenAngleFromWorld(0))
		}); err != nil {
			t.Fatalf("apply direct trade: %v", err)
		}
		damage := before - target.Lives
		if err := runner.RecordMetric("directTradeDamage", float64(damage)); err != nil {
			t.Fatalf("record direct trade damage: %v", err)
		}
		if err := runner.RecordMetric("superReady", boolMetric(withSuper)); err != nil {
			t.Fatalf("record super state: %v", err)
		}
		return runner.Report()
	}

	withoutSuper, withSuper := run(false), run(true)
	withoutDamage, withoutOK := scenarioMetric(withoutSuper, "directTradeDamage")
	withDamage, withOK := scenarioMetric(withSuper, "directTradeDamage")
	if !withoutOK || !withOK || withDamage <= withoutDamage {
		t.Fatalf("ready Super did not change direct trade report: without=%#v with=%#v", withoutSuper, withSuper)
	}
	if err := ValidateCombatScenarioReport(withoutSuper); err != nil {
		t.Fatalf("basic direct trade report invalid: %v", err)
	}
	if err := ValidateCombatScenarioReport(withSuper); err != nil {
		t.Fatalf("Super direct trade report invalid: %v", err)
	}
}

func boolMetric(value bool) float64 {
	if value {
		return 1
	}
	return 0
}

func scenarioMetric(report CombatScenarioReport, name string) (float64, bool) {
	for _, metric := range report.Metrics {
		if metric.Name == name {
			return metric.Value, true
		}
	}
	return 0, false
}
