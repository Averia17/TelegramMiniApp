package game

import (
	"math"
	"reflect"
	"testing"
)

type skillCentralityTrial struct {
	hero           string
	targetDistance float64
}

func runSkillCentralityTrial(t *testing.T, trial skillCentralityTrial) CombatScenarioReport {
	t.Helper()
	state := newScenarioSoloState(trial.hero, "Kaze")
	state.Walls = nil
	attacker, target := state.Players["hero"], state.Players["target"]
	attacker.X, attacker.Y = 160, 160
	attacker.Rotation = 0
	attacker.AimDistance = trial.targetDistance
	attacker.SuperCharge = 100
	attacker.MaxLives, attacker.Lives = 1_000, 400
	target.X, target.Y = attacker.X+trial.targetDistance, attacker.Y
	target.MaxLives, target.Lives = 100_000, 100_000
	runner := NewCombatScenarioRunner("skill-centrality-"+trial.hero, 620, ModeDeathmatch, state)
	beforeTargetLives := target.Lives
	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "super_centrality"}, func(gs *GameState, _ CombatScenarioInput) {
		gs.playerAbility(attacker.PlayerId, gs.nowMs(), "primary", "skill-centrality")
	}); err != nil {
		t.Fatalf("apply %s Super: %v", trial.hero, err)
	}
	if !attacker.LastAbilityOK {
		t.Fatalf("%s Super was not accepted", trial.hero)
	}
	if err := runner.AdvanceTo(3_000); err != nil {
		t.Fatalf("advance %s Super: %v", trial.hero, err)
	}
	targetDamage := beforeTargetLives - target.Lives
	if err := runner.RecordMetric("targetDamage", float64(targetDamage)); err != nil {
		t.Fatalf("record %s target damage: %v", trial.hero, err)
	}
	if err := runner.RecordMetric("selfShield", float64(attacker.ShieldHP)); err != nil {
		t.Fatalf("record %s shield: %v", trial.hero, err)
	}
	if err := runner.RecordMetric("selfLivesAfter", float64(attacker.Lives)); err != nil {
		t.Fatalf("record %s self lives: %v", trial.hero, err)
	}
	return runner.Report()
}

func TestScenarioPackEveryHeroSuperHasReadableCentralitySignal(t *testing.T) {
	trials := []skillCentralityTrial{
		{hero: "Needle", targetDistance: 220},
		{hero: "Mandy", targetDistance: 300},
		{hero: "Fairy Mina", targetDistance: 260},
		{hero: "Brock Zeus", targetDistance: 260},
		{hero: "Kaze", targetDistance: 220},
		{hero: "Wukong Mico", targetDistance: 100},
		{hero: "Persephone Lumi", targetDistance: 220},
		{hero: "Katty", targetDistance: 80},
	}
	run := func() []CombatScenarioReport {
		reports := make([]CombatScenarioReport, 0, len(trials))
		for _, trial := range trials {
			report := runSkillCentralityTrial(t, trial)
			if err := ValidateCombatScenarioReport(report); err != nil {
				t.Fatalf("%s Super report invalid: %v", trial.hero, err)
			}
			targetDamage, _ := scenarioMetric(report, "targetDamage")
			selfShield, _ := scenarioMetric(report, "selfShield")
			selfLivesAfter, _ := scenarioMetric(report, "selfLivesAfter")
			if trial.hero == "Fairy Mina" {
				if selfShield < 500 || selfLivesAfter <= 400 {
					t.Fatalf("Mina Super has no readable support signal: shield=%.1f lives=%.1f report=%#v", selfShield, selfLivesAfter, report)
				}
			} else if targetDamage <= 0 {
				t.Fatalf("%s Super produced no readable combat effect at %.1f distance: damage=%.1f report=%#v", trial.hero, trial.targetDistance, targetDamage, report)
			}
			reports = append(reports, report)
		}
		return reports
	}
	first, second := run(), run()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("skill centrality reports differ:\nfirst=%#v\nsecond=%#v", first, second)
	}
	for _, report := range first {
		if targetDamage, ok := scenarioMetric(report, "targetDamage"); ok && math.IsNaN(targetDamage) {
			t.Fatalf("skill centrality report contains NaN damage: %#v", report)
		}
	}
}
