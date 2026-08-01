package game

import "testing"

func TestBasicAttackEmitsAuthoritativeCommandAndHitEvents(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("attacker", "Attacker", "Mandy")
	gs.PlayerAdd("target", "Target", "Mandy")
	gs.Players["attacker"].X, gs.Players["attacker"].Y = 100, 100
	gs.Players["target"].X, gs.Players["target"].Y = 130, 100

	gs.playerShootWithCommand("attacker", 1_000, 0, "shot-1")

	if len(gs.CombatEvents) != 2 {
		t.Fatalf("combat events = %d, want hit and command result", len(gs.CombatEvents))
	}
	hit := gs.CombatEvents[0]
	if hit.Kind != "hit" || hit.CommandID != "shot-1" || hit.TargetID != "target" || hit.Damage <= 0 {
		t.Fatalf("hit event = %#v", hit)
	}
	result := gs.CombatEvents[1]
	if result.Kind != "attack" || !result.Accepted || !result.Resolved || result.CommandID != "shot-1" {
		t.Fatalf("command event = %#v", result)
	}
}
