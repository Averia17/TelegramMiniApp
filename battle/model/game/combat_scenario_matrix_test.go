package game

import (
	"battle/model/monster"
	"battle/model/player"
	"reflect"
	"testing"
)

func scenarioMatrixTeamState() *GameState {
	state := newScenarioTeamState()
	state.Walls = nil
	state.botAI = newTeamBattleBotStrategy()
	state.Players = make(map[string]*player.Player)
	for _, spec := range []struct {
		id, hero, team string
		x, y           float64
	}{
		{"blue-support", "Fairy Mina", "Blue", 160, 160},
		{"blue-frontline", "Wukong Mico", "Blue", 220, 160},
		{"blue-anchor", "Brock Zeus", "Blue", 160, 240},
		{"red-assassin", "Kaze", "Red", 300, 160},
		{"red-controller", "Katty", "Red", 700, 700},
		{"red-tank", "Wukong Mico", "Red", 760, 700},
	} {
		bot := GetHeroByName(spec.hero).CreatePlayer(spec.id, spec.id, spec.x, spec.y)
		bot.IsBot = true
		bot.SetTeam(spec.team)
		state.Players[bot.PlayerId] = bot
	}
	state.Players["blue-frontline"].Lives = 300
	state.Players["blue-frontline"].LastDamageAt = combatScenarioEpochMs + 1
	state.Monsters = map[string]*monster.Monster{
		"bat": monster.NewMonsterAt(combatScenarioEpochMs, 420, 300, 16, 1024, 1024, monster.MonsterLives),
	}
	return state
}

func TestScenarioMatrixTeamBotReportsAreReplayable(t *testing.T) {
	run := func() CombatScenarioReport {
		state := scenarioMatrixTeamState()
		runner := NewCombatScenarioRunner("team-bot-utility-matrix", 501, ModeTeamDeathmatch, state)
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: "scenario", Type: "team_decision_tick"}, func(gs *GameState, _ CombatScenarioInput) {
			gs.updateBots()
		}); err != nil {
			t.Fatalf("run initial team decision: %v", err)
		}
		if err := runner.AdvanceTo(640); err != nil {
			t.Fatalf("advance team utility matrix: %v", err)
		}
		runner.Checkpoint(640)
		if err := runner.RecordBotAIMetrics("bot"); err != nil {
			t.Fatalf("record bot metrics: %v", err)
		}
		metrics := state.BotAIMetricsSnapshot()
		if metrics.Decisions == 0 || metrics.ActionSelections["engage"] == 0 {
			t.Fatalf("team matrix produced no meaningful bot decisions: %#v", metrics)
		}
		if metrics.PeelDecisions == 0 {
			t.Fatalf("team matrix did not produce a peel decision: %#v", metrics)
		}
		if metrics.AttackAttempts == 0 {
			t.Fatalf("team matrix did not produce basic attack attempts: %#v", metrics)
		}
		if len(metrics.ActionScoreSums) == 0 || len(metrics.ActionScoreSamples) == 0 {
			t.Fatalf("team matrix did not produce action score samples: %#v", metrics)
		}
		report := runner.Report()
		accuracyFound := false
		for _, metric := range report.Metrics {
			if metric.Name == "bot.accuracy" {
				accuracyFound = true
				if metric.Value < 0 || metric.Value > 1 {
					t.Fatalf("bot accuracy out of range: %.3f", metric.Value)
				}
			}
		}
		if !accuracyFound {
			t.Fatal("team matrix report did not contain bot.accuracy")
		}
		return report
	}

	first, second := run(), run()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("team bot matrix reports differ:\nfirst=%#v\nsecond=%#v", first, second)
	}
	if err := ValidateCombatScenarioReport(first); err != nil {
		t.Fatalf("team bot matrix report invalid: %v", err)
	}
	metricNames := make(map[string]bool, len(first.Metrics))
	for _, metric := range first.Metrics {
		metricNames[metric.Name] = true
	}
	for _, name := range []string{"bot.targetSwitches", "bot.idleDecisionTicks", "bot.actionScore.engage"} {
		if !metricNames[name] {
			t.Fatalf("team bot matrix report missing %s", name)
		}
	}
}
