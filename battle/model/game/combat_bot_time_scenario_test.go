package game

import (
	"math"
	"reflect"
	"testing"
)

func runBotTimeReport(t *testing.T, mode GameMode) CombatScenarioReport {
	t.Helper()
	var state *GameState
	if mode == ModeTeamDeathmatch {
		state = scenarioMatrixTeamState()
	} else {
		state = newScenarioSoloState("Kaze", "Brock Zeus")
		state.Walls = nil
		state.Players["hero"].IsBot = true
		state.Players["hero"].X, state.Players["hero"].Y = 100, 160
		state.Players["target"].X, state.Players["target"].Y = 520, 160
		state.Players["target"].MaxLives, state.Players["target"].Lives = 100_000, 100_000
		state.botAI = newBotAIStrategy(mode)
	}
	runner := NewCombatScenarioRunner("bot-time-"+string(mode), 630, mode, state)
	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: "scenario", Type: "bot_time_start"}, func(gs *GameState, _ CombatScenarioInput) {
		gs.updateBots()
	}); err != nil {
		t.Fatalf("start %s bot time report: %v", mode, err)
	}
	if err := runner.AdvanceTo(2_000); err != nil {
		t.Fatalf("advance %s bot time report: %v", mode, err)
	}
	runner.Checkpoint(2_000)
	if err := runner.RecordBotAIMetrics("bot"); err != nil {
		t.Fatalf("record %s bot time metrics: %v", mode, err)
	}
	return runner.Report()
}

func TestScenarioPackBotTimeReportsKeepSoloAndTeamBotsActive(t *testing.T) {
	run := func() []CombatScenarioReport {
		return []CombatScenarioReport{
			runBotTimeReport(t, ModeDeathmatch),
			runBotTimeReport(t, ModeTeamDeathmatch),
		}
	}
	first, second := run(), run()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("bot time reports differ:\nfirst=%#v\nsecond=%#v", first, second)
	}
	for _, report := range first {
		if err := ValidateCombatScenarioReport(report); err != nil {
			t.Fatalf("bot time report invalid: %v", err)
		}
		decisions, decisionsOK := scenarioMetric(report, "bot.decisions")
		attacks, attacksOK := scenarioMetric(report, "bot.attackAttempts")
		idle, idleOK := scenarioMetric(report, "bot.idleDecisionTicks")
		accuracy, accuracyOK := scenarioMetric(report, "bot.accuracy")
		if !decisionsOK || decisions <= 0 || !attacksOK || attacks <= 0 {
			t.Fatalf("%s bot did not produce active decisions and attacks: %#v", report.Mode, report)
		}
		if !idleOK || idle != 0 {
			t.Fatalf("%s bot accumulated unexplained idle decision ticks: %.0f report=%#v", report.Mode, idle, report)
		}
		if accuracyOK && (math.IsNaN(accuracy) || accuracy < 0 || accuracy > 1) {
			t.Fatalf("%s bot accuracy out of range: %.3f", report.Mode, accuracy)
		}
		if _, engageOK := scenarioMetric(report, "bot.actionScore.engage"); !engageOK {
			if _, roamOK := scenarioMetric(report, "bot.actionScore.roam"); !roamOK {
				t.Fatalf("%s bot report has no engage or roam utility score: %#v", report.Mode, report)
			}
		}
	}
}
