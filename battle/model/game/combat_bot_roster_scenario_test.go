package game

import (
	"battle/model/player"
	"math"
	"reflect"
	"testing"
)

var combatRosterHeroes = []string{
	"Needle", "Mandy", "Fairy Mina", "Brock Zeus",
	"Wukong Mico", "Persephone Lumi", "Kaze", "Katty",
}

func rosterBotState(hero string, mode GameMode) *GameState {
	if mode == ModeTeamDeathmatch {
		state := newScenarioTeamState()
		state.Walls = nil
		state.Objectives = nil
		state.Props = nil
		state.Players = make(map[string]*player.Player)
		// PlayerAdd fills a live team lobby with bots. Build this isolated
		// three-actor fixture while waiting so the matrix cannot inherit a
		// random lobby roster, then start the deterministic match.
		state.State = GameStateWaiting
		state.PlayerAdd("bot", "Bot", hero)
		state.PlayerAdd("ally", "Ally", "Wukong Mico")
		state.PlayerAdd("enemy", "Enemy", "Kaze")
		state.State = GameStateGame
		state.Players["bot"].SetTeam("Blue")
		state.Players["ally"].SetTeam("Blue")
		state.Players["enemy"].SetTeam("Red")
		state.Players["bot"].X, state.Players["bot"].Y = 160, 160
		state.Players["ally"].X, state.Players["ally"].Y = 220, 160
		state.Players["enemy"].X, state.Players["enemy"].Y = 160+math.Min(220, CombatKitFor(hero).AttackRange()), 160
		state.Players["bot"].IsBot = true
		return state
	}

	state := newScenarioSoloState(hero, "Kaze")
	state.Walls = nil
	state.Props = nil
	state.Players["hero"].IsBot = true
	state.Players["hero"].X, state.Players["hero"].Y = 160, 160
	state.Players["target"].X, state.Players["target"].Y = 160+math.Min(220, CombatKitFor(hero).AttackRange()), 160
	state.Players["target"].MaxLives, state.Players["target"].Lives = 100_000, 100_000
	return state
}

func runRosterBotReport(t *testing.T, hero string, mode GameMode) CombatScenarioReport {
	t.Helper()
	state := rosterBotState(hero, mode)
	state.botAI = newBotAIStrategy(mode)
	botID := "hero"
	if mode == ModeTeamDeathmatch {
		botID = "bot"
	}
	runner := NewCombatScenarioRunner("bot-roster-"+string(mode)+"-"+hero, 650, mode, state)
	for _, atMs := range []int64{0, 640, 1_280} {
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: atMs, PlayerID: botID, Type: "roster_bot_decision"}, func(gs *GameState, _ CombatScenarioInput) {
			gs.updateBots()
		}); err != nil {
			t.Fatalf("run %s %s bot decision at %d: %v", hero, mode, atMs, err)
		}
	}
	if err := runner.AdvanceTo(2_000); err != nil {
		t.Fatalf("advance %s %s bot scenario: %v", hero, mode, err)
	}
	if err := runner.RecordBotAIMetrics("bot"); err != nil {
		t.Fatalf("record %s %s bot metrics: %v", hero, mode, err)
	}
	return runner.Report()
}

func TestScenarioPackRosterBotsStayActiveAcrossSoloAndTeam(t *testing.T) {
	run := func() []CombatScenarioReport {
		reports := make([]CombatScenarioReport, 0, len(combatRosterHeroes)*2)
		for _, hero := range combatRosterHeroes {
			for _, mode := range []GameMode{ModeDeathmatch, ModeTeamDeathmatch} {
				report := runRosterBotReport(t, hero, mode)
				if err := ValidateCombatScenarioReport(report); err != nil {
					t.Fatalf("%s %s bot report invalid: %v", hero, mode, err)
				}
				decisions, decisionsOK := scenarioMetric(report, "bot.decisions")
				idle, idleOK := scenarioMetric(report, "bot.idleDecisionTicks")
				accuracy, accuracyOK := scenarioMetric(report, "bot.accuracy")
				if !decisionsOK || decisions <= 0 || !idleOK || idle != 0 || !accuracyOK || accuracy < 0 || accuracy > 1 {
					t.Fatalf("%s %s bot activity is not readable: decisions=%.0f idle=%.0f report=%#v", hero, mode, decisions, idle, report)
				}
				actions := []string{"bot.attackAttempts", "bot.retreatDecisions", "bot.abilityUses", "bot.action.engage", "bot.action.retreat", "bot.action.roam", "bot.action.collect_pickup"}
				meaningful := false
				for _, name := range actions {
					if value, ok := scenarioMetric(report, name); ok && value > 0 {
						meaningful = true
						break
					}
				}
				if !meaningful {
					t.Fatalf("%s %s bot made no meaningful action: report=%#v", hero, mode, report)
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
			for index := range first {
				if !reflect.DeepEqual(first[index], next[index]) {
					t.Fatalf("roster bot report %s differs on replay %d: first metrics=%#v next metrics=%#v", first[index].ScenarioID, replay, first[index].Metrics, next[index].Metrics)
				}
			}
			t.Fatalf("roster bot reports differ on replay %d", replay)
		}
	}
}
