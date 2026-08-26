package game

import (
	"math"
	"reflect"
	"testing"
)

func runCounterRoleTrial(t *testing.T, botHero, enemyHero string, botX, enemyX float64) CombatScenarioReport {
	t.Helper()
	state := newScenarioSoloState(botHero, enemyHero)
	state.Walls = nil
	bot, enemy := state.Players["hero"], state.Players["target"]
	bot.IsBot = true
	bot.X, bot.Y = botX, 160
	enemy.X, enemy.Y = enemyX, 160
	runner := NewCombatScenarioRunner("counter-role-"+botHero, 620, ModeDeathmatch, state)
	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: bot.PlayerId, Type: "counter_role_tick"}, func(gs *GameState, _ CombatScenarioInput) {
		gs.updateBots()
	}); err != nil {
		t.Fatalf("apply %s counter-role tick: %v", botHero, err)
	}
	if err := runner.RecordMetric("moveX", bot.MoveX); err != nil {
		t.Fatalf("record %s move: %v", botHero, err)
	}
	if err := runner.RecordMetric("distanceBefore", math.Abs(enemy.X-botX)); err != nil {
		t.Fatalf("record %s distance: %v", botHero, err)
	}
	return runner.Report()
}

func TestScenarioPackCounterRolesKeepEntryAndDisengageReadable(t *testing.T) {
	run := func() []CombatScenarioReport {
		return []CombatScenarioReport{
			runCounterRoleTrial(t, "Kaze", "Brock Zeus", 100, 500),
			runCounterRoleTrial(t, "Brock Zeus", "Kaze", 300, 400),
		}
	}
	first, second := run(), run()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("counter-role reports differ:\nfirst=%#v\nsecond=%#v", first, second)
	}
	entryMove, ok := scenarioMetric(first[0], "moveX")
	if !ok || entryMove <= 0 {
		t.Fatalf("Kaze did not enter against a distant target: moveX=%.2f report=%#v", entryMove, first[0])
	}
	disengageMove, ok := scenarioMetric(first[1], "moveX")
	if !ok || disengageMove >= 0 {
		t.Fatalf("Brock did not create distance from close Kaze: moveX=%.2f report=%#v", disengageMove, first[1])
	}
	for _, report := range first {
		if err := ValidateCombatScenarioReport(report); err != nil {
			t.Fatalf("counter-role report invalid: %v", err)
		}
	}
}

func TestScenarioPackRosterCounterRoleMovementMatrix(t *testing.T) {
	tests := []struct {
		hero, enemy  string
		botX, enemyX float64
		wantSign     float64
	}{
		{hero: "Needle", enemy: "Kaze", botX: 100, enemyX: 180, wantSign: -1},
		{hero: "Mandy", enemy: "Brock Zeus", botX: 100, enemyX: 450, wantSign: 1},
		{hero: "Fairy Mina", enemy: "Kaze", botX: 100, enemyX: 180, wantSign: -1},
		{hero: "Brock Zeus", enemy: "Kaze", botX: 300, enemyX: 400, wantSign: -1},
		{hero: "Kaze", enemy: "Brock Zeus", botX: 100, enemyX: 500, wantSign: 1},
		{hero: "Wukong Mico", enemy: "Brock Zeus", botX: 100, enemyX: 450, wantSign: 1},
		{hero: "Persephone Lumi", enemy: "Kaze", botX: 100, enemyX: 180, wantSign: -1},
		{hero: "Katty", enemy: "Kaze", botX: 100, enemyX: 160, wantSign: -1},
	}
	run := func() []CombatScenarioReport {
		reports := make([]CombatScenarioReport, 0, len(tests))
		for _, test := range tests {
			report := runCounterRoleTrial(t, test.hero, test.enemy, test.botX, test.enemyX)
			moveX, ok := scenarioMetric(report, "moveX")
			if !ok || moveX*test.wantSign <= 0 {
				t.Fatalf("%s against %s movement=%.2f, want sign %.0f: %#v", test.hero, test.enemy, moveX, test.wantSign, report)
			}
			if err := ValidateCombatScenarioReport(report); err != nil {
				t.Fatalf("%s counter-role report invalid: %v", test.hero, err)
			}
			reports = append(reports, report)
		}
		return reports
	}
	first, second := run(), run()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("roster counter-role reports differ:\nfirst=%#v\nsecond=%#v", first, second)
	}
}
