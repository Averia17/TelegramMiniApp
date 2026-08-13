package game

import (
	"testing"
	"time"
)

func TestIslandVoiceIsPersonalAndCooldowned(t *testing.T) {
	gs := newTestGameState()
	gs.MaxPlayers = 2
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Алиса", "Mandy")
	gs.PlayerAdd("p2", "Боб", "Kaze")

	type delivery struct {
		playerID string
		msgType  string
		params   map[string]interface{}
	}
	var deliveries []delivery
	gs.SendToPlayer = func(playerID, msgType string, params interface{}) {
		deliveries = append(deliveries, delivery{playerID: playerID, msgType: msgType, params: params.(map[string]interface{})})
	}

	now := int64(10_000)
	gs.emitIslandVoice("p1", IslandVoiceTriggerKill, now)
	gs.emitIslandVoice("p1", IslandVoiceTriggerKill, now+1_000)
	gs.emitIslandVoice("p2", IslandVoiceTriggerKill, now+1_000)

	if len(deliveries) != 2 {
		t.Fatalf("deliveries = %d, want 2 after same-player cooldown", len(deliveries))
	}
	if deliveries[0].playerID != "p1" || deliveries[1].playerID != "p2" {
		t.Fatalf("recipients = %#v, want p1 and p2", deliveries)
	}
	for _, item := range deliveries {
		if item.msgType != "island_voice" {
			t.Fatalf("message type = %q, want island_voice", item.msgType)
		}
		if item.params["name"] != "Глас острова" || item.params["text"] == "" {
			t.Fatalf("invalid voice payload = %#v", item.params)
		}
	}
}

func TestIslandPhaseSendsVoiceToEveryPlayer(t *testing.T) {
	gs := newTestGameState()
	gs.MaxPlayers = 2
	gs.State = GameStateGame
	gs.PlayerAdd("p1", "Алиса", "Mandy")
	gs.PlayerAdd("p2", "Боб", "Kaze")

	var recipients []string
	gs.SendToPlayer = func(playerID, _ string, _ interface{}) {
		recipients = append(recipients, playerID)
	}

	now := time.Now().UnixMilli()
	gs.MatchStartedAt = now - int64(31*time.Second/time.Millisecond)
	gs.updateIsland(now)

	if len(recipients) != 2 {
		t.Fatalf("phase voice recipients = %d, want 2", len(recipients))
	}
}

func TestIslandVoiceKillTriggersOnlyOnFirstKill(t *testing.T) {
	gs := newTestGameState()
	gs.MaxPlayers = 3
	gs.State = GameStateGame
	gs.PlayerAdd("killer", "Охотник", "Mandy")
	gs.PlayerAdd("target-1", "Первая цель", "Needle")
	gs.PlayerAdd("target-2", "Вторая цель", "Kaze")

	voices := 0
	gs.SendToPlayer = func(playerID, msgType string, _ interface{}) {
		if playerID == "killer" && msgType == "island_voice" {
			voices++
		}
	}

	gs.Players["target-1"].Lives = 1
	gs.dealPlayerDamage(gs.Players["killer"], gs.Players["target-1"], 1)
	gs.Players["target-2"].Lives = 1
	gs.dealPlayerDamage(gs.Players["killer"], gs.Players["target-2"], 1)

	if voices != 1 {
		t.Fatalf("kill voice count = %d, want 1", voices)
	}
}
