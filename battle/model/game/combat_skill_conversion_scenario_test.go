package game

import (
	"math"
	"reflect"
	"testing"
)

type skillConversionTrial struct {
	hero           string
	targetDistance float64
	basicDistance  float64
}

func runBasicConversionDamage(t *testing.T, trial skillConversionTrial) int {
	t.Helper()
	state := newScenarioSoloState(trial.hero, "Kaze")
	state.Walls = nil
	attacker, target := state.Players["hero"], state.Players["target"]
	attacker.X, attacker.Y = 160, 160
	basicDistance := trial.basicDistance
	if basicDistance <= 0 {
		basicDistance = trial.targetDistance
	}
	target.X, target.Y = attacker.X+basicDistance, attacker.Y
	target.MaxLives, target.Lives = 100_000, 100_000
	runner := NewCombatScenarioRunner("skill-conversion-basic-"+trial.hero, 660, ModeDeathmatch, state)
	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "conversion_basic"}, func(gs *GameState, _ CombatScenarioInput) {
		gs.playerShoot(attacker.PlayerId, gs.nowMs(), screenAngleFromWorld(0), basicDistance)
	}); err != nil {
		t.Fatalf("apply %s basic conversion: %v", trial.hero, err)
	}
	if err := runner.AdvanceTo(3_000); err != nil {
		t.Fatalf("advance %s basic conversion: %v", trial.hero, err)
	}
	return 100_000 - target.Lives
}

func runSkillConversionTrial(t *testing.T, trial skillConversionTrial) CombatScenarioReport {
	t.Helper()
	basicDamage := runBasicConversionDamage(t, trial)
	state := newScenarioSoloState(trial.hero, "Kaze")
	state.Walls = nil
	attacker, target := state.Players["hero"], state.Players["target"]
	attacker.X, attacker.Y = 160, 160
	attacker.AimDistance = trial.targetDistance
	attacker.SuperCharge = 100
	attacker.Lives = 400
	target.X, target.Y = attacker.X+trial.targetDistance, attacker.Y
	target.MaxLives, target.Lives = 100_000, 100_000
	runner := NewCombatScenarioRunner("skill-conversion-"+trial.hero, 661, ModeDeathmatch, state)
	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "conversion_super"}, func(gs *GameState, _ CombatScenarioInput) {
		gs.playerAbility(attacker.PlayerId, gs.nowMs(), "primary", "skill-conversion")
	}); err != nil {
		t.Fatalf("apply %s Super conversion: %v", trial.hero, err)
	}
	statusSignal := false
	for _, atMs := range []int64{500, 1_000, 2_000} {
		if err := runner.AdvanceTo(atMs); err != nil {
			t.Fatalf("advance %s Super conversion to %d: %v", trial.hero, atMs, err)
		}
		if target.StunUntil > runner.CurrentTimeMs() || target.SlowUntil > runner.CurrentTimeMs() || target.BlindUntil > runner.CurrentTimeMs() || target.VineUntil > runner.CurrentTimeMs() {
			statusSignal = true
		}
	}
	skillDamage := 100_000 - target.Lives
	supportSignal := 0.0
	if trial.hero == "Fairy Mina" && (attacker.ShieldHP >= MinaSuperShield || attacker.Lives > 400) {
		supportSignal = 1
	}
	if err := runner.RecordMetric("basicDamage", float64(basicDamage)); err != nil {
		t.Fatalf("record %s basic conversion: %v", trial.hero, err)
	}
	if err := runner.RecordMetric("skillDamage", float64(skillDamage)); err != nil {
		t.Fatalf("record %s skill conversion: %v", trial.hero, err)
	}
	if err := runner.RecordMetric("skillDelta", float64(skillDamage-basicDamage)); err != nil {
		t.Fatalf("record %s skill delta: %v", trial.hero, err)
	}
	if err := runner.RecordMetric("skillStatusSignal", boolMetric(statusSignal)); err != nil {
		t.Fatalf("record %s status signal: %v", trial.hero, err)
	}
	if err := runner.RecordMetric("supportSignal", supportSignal); err != nil {
		t.Fatalf("record %s support signal: %v", trial.hero, err)
	}
	return runner.Report()
}

func TestScenarioPackSkillConversionChangesEveryHeroOutcome(t *testing.T) {
	trials := []skillConversionTrial{
		{hero: "Needle", targetDistance: 220, basicDistance: 120},
		{hero: "Mandy", targetDistance: 300, basicDistance: 60},
		{hero: "Fairy Mina", targetDistance: 260, basicDistance: 120},
		{hero: "Brock Zeus", targetDistance: 260, basicDistance: 120},
		{hero: "Kaze", targetDistance: 220, basicDistance: 60},
		{hero: "Wukong Mico", targetDistance: 100, basicDistance: 70},
		{hero: "Persephone Lumi", targetDistance: 220, basicDistance: 120},
		{hero: "Katty", targetDistance: 80, basicDistance: 120},
	}
	run := func() []CombatScenarioReport {
		reports := make([]CombatScenarioReport, 0, len(trials))
		for _, trial := range trials {
			report := runSkillConversionTrial(t, trial)
			if err := ValidateCombatScenarioReport(report); err != nil {
				t.Fatalf("%s conversion report invalid: %v", trial.hero, err)
			}
			basicDamage, basicOK := scenarioMetric(report, "basicDamage")
			skillDamage, skillOK := scenarioMetric(report, "skillDamage")
			status, statusOK := scenarioMetric(report, "skillStatusSignal")
			support, supportOK := scenarioMetric(report, "supportSignal")
			if !basicOK || !skillOK || !statusOK || !supportOK || basicDamage <= 0 {
				t.Fatalf("%s conversion report is incomplete: %#v", trial.hero, report)
			}
			if trial.hero == "Fairy Mina" {
				if support != 1 {
					t.Fatalf("Mina Super did not change support outcome: basic=%.1f skill=%.1f support=%.1f report=%#v", basicDamage, skillDamage, support, report)
				}
			} else if skillDamage <= 0 && status != 1 {
				t.Fatalf("%s Super has no damage or control conversion: basic=%.1f skill=%.1f status=%.1f report=%#v", trial.hero, basicDamage, skillDamage, status, report)
			}
			reports = append(reports, report)
		}
		return reports
	}
	first, second := run(), run()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("skill conversion reports differ:\nfirst=%#v\nsecond=%#v", first, second)
	}
}

func TestScenarioPackRosterBasicMissPathDealsNoDamage(t *testing.T) {
	trials := []skillConversionTrial{
		{hero: "Needle", targetDistance: 120},
		{hero: "Mandy", targetDistance: 60},
		{hero: "Fairy Mina", targetDistance: 120},
		{hero: "Brock Zeus", targetDistance: 120},
		{hero: "Kaze", targetDistance: 60},
		{hero: "Wukong Mico", targetDistance: 70},
		{hero: "Persephone Lumi", targetDistance: 120},
		{hero: "Katty", targetDistance: 120},
	}
	for _, trial := range trials {
		state := newScenarioSoloState(trial.hero, "Kaze")
		state.Walls = nil
		attacker, target := state.Players["hero"], state.Players["target"]
		attacker.X, attacker.Y = 160, 160
		target.X, target.Y = attacker.X+trial.targetDistance, attacker.Y
		target.MaxLives, target.Lives = 100_000, 100_000
		runner := NewCombatScenarioRunner("miss-path-"+trial.hero, 662, ModeDeathmatch, state)
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "basic_miss"}, func(gs *GameState, _ CombatScenarioInput) {
			gs.playerShoot(attacker.PlayerId, gs.nowMs(), screenAngleFromWorld(math.Pi), trial.targetDistance)
		}); err != nil {
			t.Fatalf("apply %s miss: %v", trial.hero, err)
		}
		if err := runner.AdvanceTo(3_000); err != nil {
			t.Fatalf("advance %s miss: %v", trial.hero, err)
		}
		if target.Lives != target.MaxLives {
			t.Fatalf("%s miss dealt damage=%d at distance %.1f", trial.hero, target.MaxLives-target.Lives, trial.targetDistance)
		}
	}
}
