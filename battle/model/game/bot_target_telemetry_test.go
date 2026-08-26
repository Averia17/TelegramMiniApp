package game

import "testing"

func TestRecordBotTargetSelectionCountsOnlyActualTargetChanges(t *testing.T) {
	gs := &GameState{
		BotMemory: map[string]*BotPerception{
			"bot": {TargetType: "player", TargetID: "first"},
		},
	}
	gs.resetBotAIMetrics()
	gs.recordBotTargetSelection("bot", &botTarget{kind: "player", id: "first"})
	gs.recordBotTargetSelection("bot", &botTarget{kind: "player", id: "second"})
	gs.recordBotTargetSelection("bot", &botTarget{kind: "monster", id: "bat"})
	gs.recordBotTargetSelection("bot", nil)
	if got := gs.BotAIMetricsSnapshot().TargetSwitches; got != 2 {
		t.Fatalf("target switches=%d, want 2", got)
	}
}
