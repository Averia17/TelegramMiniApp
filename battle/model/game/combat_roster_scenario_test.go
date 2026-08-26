package game

import (
	"math"
	"reflect"
	"testing"
)

func TestScenarioPackRosterBasicsHaveAReadableHitPath(t *testing.T) {
	heroes := []string{"Needle", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico", "Persephone Lumi", "Katty"}
	run := func() []CombatScenarioReport {
		reports := make([]CombatScenarioReport, 0, len(heroes))
		for index, hero := range heroes {
			state := newScenarioSoloState(hero, "Kaze")
			state.Walls = nil
			attacker, target := state.Players["hero"], state.Players["target"]
			attacker.X, attacker.Y = 160, 160
			attacker.AttackRate = 1
			attacker.Ammo, attacker.MaxAmmo = 1, 1
			distance := math.Min(120, CombatKitFor(hero).AttackRange()*.5)
			if distance < 60 {
				distance = 60
			}
			target.X, target.Y = attacker.X+distance, attacker.Y
			target.MaxLives, target.Lives = 100_000, 100_000
			runner := NewCombatScenarioRunner("roster-basic-"+hero, int64(610+index), ModeDeathmatch, state)
			before := target.Lives
			if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "roster_basic"}, func(gs *GameState, _ CombatScenarioInput) {
				gs.playerShoot(attacker.PlayerId, gs.nowMs(), screenAngleFromWorld(0))
			}); err != nil {
				t.Fatalf("apply %s basic: %v", hero, err)
			}
			if err := runner.AdvanceTo(10_000); err != nil {
				t.Fatalf("advance %s basic: %v", hero, err)
			}
			damage := before - target.Lives
			if damage <= 0 {
				t.Fatalf("%s basic produced no readable hit at %.1f distance", hero, distance)
			}
			if err := runner.RecordMetric("basicDamage", float64(damage)); err != nil {
				t.Fatalf("record %s basic: %v", hero, err)
			}
			report := runner.Report()
			if err := ValidateCombatScenarioReport(report); err != nil {
				t.Fatalf("%s roster report invalid: %v", hero, err)
			}
			reports = append(reports, report)
		}
		return reports
	}

	first, second := run(), run()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("roster basic reports differ:\nfirst=%#v\nsecond=%#v", first, second)
	}
}
