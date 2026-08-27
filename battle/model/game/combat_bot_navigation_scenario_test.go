package game

import (
	"battle/model/gamemap"
	"battle/model/player"
	"battle/service/geometry"
	"reflect"
	"testing"
)

func runBlockedBotNavigationScenario(t *testing.T) CombatScenarioReport {
	t.Helper()
	wall := &geometry.WallTile{MinX: 180, MinY: 80, MaxX: 220, MaxY: 240, Type: "wall"}
	state := &GameState{
		Mode:           ModeDeathmatch,
		State:          GameStateGame,
		MatchStartedAt: combatScenarioEpochMs,
		GameEndsAt:     combatScenarioEpochMs + 120_000,
		rules:          DeathmatchRules{},
		Players: map[string]*player.Player{
			"bot":    GetHeroByName("Kaze").CreatePlayer("bot", "Bot", 100, 160),
			"target": GetHeroByName("Needle").CreatePlayer("target", "Target", 400, 160),
		},
		Map: &gamemap.GameMap{
			WidthInPixels: 480, HeightInPixels: 320,
			Collisions: []*geometry.WallTile{wall},
		},
		Walls: geometry.NewSpatialHash(TileSize),
	}
	state.Walls.Insert(wall)
	state.resetBotAIMetrics()
	body := &geometry.CircleBody{X: 100, Y: 160, Radius: 14}
	targetX, targetY := 400.0, 160.0
	runner := NewCombatScenarioRunner("bot-navigation-blocked-route", 670, ModeDeathmatch, state)
	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: "bot", Type: "navigation_blocked_start"}, func(gs *GameState, _ CombatScenarioInput) {
		dx, dy := gs.botTravelDirection("bot", body, targetX, targetY, gs.nowMs())
		if dx == 0 && dy == 0 {
			t.Fatal("blocked-route bot produced no navigation direction")
		}
		if len(gs.BotMemory["bot"].Path) == 0 {
			t.Fatal("blocked-route bot did not build a waypoint path")
		}
	}); err != nil {
		t.Fatalf("start blocked-route scenario: %v", err)
	}
	stuckAt := BotPathRefreshInterval.Milliseconds() + BotStuckTimeout.Milliseconds() + 1
	if err := runner.ApplyInput(CombatScenarioInput{AtMs: stuckAt, PlayerID: "bot", Type: "navigation_stuck_replan"}, func(gs *GameState, _ CombatScenarioInput) {
		// Keep the body fixed: this models repeated collision against the same
		// obstacle and proves the AI eventually invalidates its cached route.
		gs.botTravelDirection("bot", body, targetX, targetY, gs.nowMs())
	}); err != nil {
		t.Fatalf("replan blocked-route scenario: %v", err)
	}
	if state.BotMemory["bot"].PathReplanCount != 1 || state.BotAIMetricsSnapshot().StuckReplans != 1 {
		t.Fatalf("blocked-route replan counters = path=%d metrics=%d, want 1/1", state.BotMemory["bot"].PathReplanCount, state.BotAIMetricsSnapshot().StuckReplans)
	}
	runner.Checkpoint(stuckAt)
	if err := runner.RecordMetric("blockedRoute", 1); err != nil {
		t.Fatalf("record blocked-route metric: %v", err)
	}
	if err := runner.RecordMetric("stuckReplans", float64(state.BotAIMetricsSnapshot().StuckReplans)); err != nil {
		t.Fatalf("record stuck-replan metric: %v", err)
	}
	if err := runner.RecordBotAIMetrics("bot"); err != nil {
		t.Fatalf("record blocked-route bot metrics: %v", err)
	}
	return runner.Report()
}

func TestScenarioPackBlockedBotNavigationReplansDeterministically(t *testing.T) {
	first := runBlockedBotNavigationScenario(t)
	if err := ValidateCombatScenarioReport(first); err != nil {
		t.Fatalf("blocked-route report invalid: %v", err)
	}
	blocked, blockedOK := scenarioMetric(first, "blockedRoute")
	replans, replansOK := scenarioMetric(first, "stuckReplans")
	telemetryReplans, telemetryOK := scenarioMetric(first, "bot.stuckReplans")
	if !blockedOK || blocked != 1 || !replansOK || replans != 1 || !telemetryOK || telemetryReplans != 1 {
		t.Fatalf("blocked-route metrics are incomplete: %#v", first.Metrics)
	}
	for replay := 0; replay < 20; replay++ {
		next := runBlockedBotNavigationScenario(t)
		if !reflect.DeepEqual(first, next) {
			t.Fatalf("blocked-route report differs on replay %d", replay+1)
		}
	}
}
