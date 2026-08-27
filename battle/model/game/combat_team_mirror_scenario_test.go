package game

import (
	"battle/model/player"
	"fmt"
	"math"
	"reflect"
	"testing"
)

func teamMirrorState(hero string) *GameState {
	state := newScenarioTeamState()
	state.Walls = nil
	state.Objectives = nil
	state.Props = nil
	state.Players = make(map[string]*player.Player)
	state.State = GameStateWaiting
	for lane := 0; lane < 3; lane++ {
		blueID := fmt.Sprintf("blue-%d", lane)
		redID := fmt.Sprintf("red-%d", lane)
		state.PlayerAdd(blueID, "Blue", hero)
		state.PlayerAdd(redID, "Red", hero)
	}
	state.State = GameStateGame
	for lane := 0; lane < 3; lane++ {
		blue := state.Players[fmt.Sprintf("blue-%d", lane)]
		red := state.Players[fmt.Sprintf("red-%d", lane)]
		blue.SetTeam("Blue")
		red.SetTeam("Red")
		blue.X, blue.Y = 160, 120+float64(lane*40)
		red.X, red.Y = 240, 120+float64(lane*40)
		blue.MaxLives, blue.Lives = 2_000, 2_000
		red.MaxLives, red.Lives = 2_000, 2_000
		blue.Ammo, blue.MaxAmmo = 3, 3
		red.Ammo, red.MaxAmmo = 3, 3
	}
	return state
}

func resetTeamMirrorRound(state *GameState) {
	for _, participant := range state.Players {
		participant.Lives = participant.MaxLives
		participant.Ammo = participant.MaxAmmo
		participant.LastShootAt = 0
		participant.NextAmmoAt = 0
		participant.StunUntil = 0
		participant.CastUntil = 0
		participant.ChannelUntil = 0
		participant.MoveX, participant.MoveY = 0, 0
	}
}

func runTeamMirrorScenario(t *testing.T, hero string) CombatScenarioReport {
	t.Helper()
	state := teamMirrorState(hero)
	runner := NewCombatScenarioRunner("team-mirror-"+hero, 670, ModeTeamDeathmatch, state)
	for lane := 0; lane < 3; lane++ {
		blueID := fmt.Sprintf("blue-%d", lane)
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: blueID, Type: "mirror_basic"}, func(gs *GameState, _ CombatScenarioInput) {
			gs.playerShoot(blueID, gs.nowMs(), screenAngleFromWorld(0), 80)
		}); err != nil {
			t.Fatalf("apply Blue %s lane %d basic: %v", hero, lane, err)
		}
	}
	if err := runner.AdvanceTo(1_000); err != nil {
		t.Fatalf("advance %s Blue team mirror: %v", hero, err)
	}
	blueDamage := 0
	for lane := 0; lane < 3; lane++ {
		blueDamage += 2_000 - state.Players[fmt.Sprintf("red-%d", lane)].Lives
	}
	resetTeamMirrorRound(state)
	for lane := 0; lane < 3; lane++ {
		redID := fmt.Sprintf("red-%d", lane)
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 2_000, PlayerID: redID, Type: "mirror_basic"}, func(gs *GameState, _ CombatScenarioInput) {
			gs.playerShoot(redID, gs.nowMs(), screenAngleFromWorld(math.Pi), 80)
		}); err != nil {
			t.Fatalf("apply Red %s lane %d basic: %v", hero, lane, err)
		}
	}
	if err := runner.AdvanceTo(3_000); err != nil {
		t.Fatalf("advance %s Red team mirror: %v", hero, err)
	}
	redDamage := 0
	for lane := 0; lane < 3; lane++ {
		redDamage += 2_000 - state.Players[fmt.Sprintf("blue-%d", lane)].Lives
	}
	if err := runner.RecordMetric("blueDamage", float64(blueDamage)); err != nil {
		t.Fatalf("record Blue %s damage: %v", hero, err)
	}
	if err := runner.RecordMetric("redDamage", float64(redDamage)); err != nil {
		t.Fatalf("record Red %s damage: %v", hero, err)
	}
	if err := runner.RecordMetric("damageDelta", math.Abs(float64(blueDamage-redDamage))); err != nil {
		t.Fatalf("record %s damage delta: %v", hero, err)
	}
	if err := runner.RecordMetric("lanes", 3); err != nil {
		t.Fatalf("record %s lanes: %v", hero, err)
	}
	return runner.Report()
}

func TestScenarioPackThreeVsThreeTeamMirrorKeepsHeroDamageSymmetric(t *testing.T) {
	run := func() []CombatScenarioReport {
		reports := make([]CombatScenarioReport, 0, len(combatRosterHeroes))
		for _, hero := range combatRosterHeroes {
			report := runTeamMirrorScenario(t, hero)
			if err := ValidateCombatScenarioReport(report); err != nil {
				t.Fatalf("%s team mirror report invalid: %v", hero, err)
			}
			blue, blueOK := scenarioMetric(report, "blueDamage")
			red, redOK := scenarioMetric(report, "redDamage")
			delta, deltaOK := scenarioMetric(report, "damageDelta")
			lanes, lanesOK := scenarioMetric(report, "lanes")
			if !blueOK || !redOK || !deltaOK || !lanesOK || blue <= 0 || red <= 0 || lanes != 3 || delta != 0 {
				t.Fatalf("%s team mirror is not symmetric: blue=%.1f red=%.1f delta=%.1f lanes=%.1f report=%#v", hero, blue, red, delta, lanes, report)
			}
			reports = append(reports, report)
		}
		return reports
	}

	first := run()
	for replay := 2; replay <= 20; replay++ {
		next := run()
		if !reflect.DeepEqual(first, next) {
			t.Fatalf("team mirror reports differ on replay %d", replay)
		}
	}
}
