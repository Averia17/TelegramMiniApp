package game

import "testing"

func TestBasicAttackEmitsAuthoritativeCommandAndHitEvents(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("attacker", "Attacker", "Mandy")
	gs.PlayerAdd("target", "Target", "Mandy")
	gs.State = GameStateGame
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
	if hit.MatchID != gs.RoomName || hit.Hero != "Mandy" || hit.Distance != 30 || hit.EffectiveDamage != hit.Damage {
		t.Fatalf("hit event context = %#v, want match/hero/distance/effective damage", hit)
	}
	result := gs.CombatEvents[1]
	if result.Kind != "attack" || !result.Accepted || !result.Resolved || result.CommandID != "shot-1" {
		t.Fatalf("command event = %#v", result)
	}
	if result.ResourceKind != "ammo" || result.ResourceBefore != 3 || result.ResourceAfter != 2 {
		t.Fatalf("attack resource delta = %#v, want ammo 3 -> 2", result)
	}
}

func TestAbilityEventCarriesHeroAndResourceDelta(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("caster", "Caster", "Mandy")
	gs.State = GameStateGame
	p := gs.Players["caster"]
	p.SuperCharge = 100

	gs.playerAbility("caster", 1_000, "primary", "ability-1")

	if len(gs.CombatEvents) != 1 {
		t.Fatalf("combat events = %d, want one ability acknowledgement", len(gs.CombatEvents))
	}
	event := gs.CombatEvents[0]
	if event.Kind != "ability" || !event.Accepted || event.Hero != "Mandy" || event.MatchID != gs.RoomName {
		t.Fatalf("ability event = %#v", event)
	}
	if event.ResourceKind != "super_charge" || event.ResourceBefore != 100 || event.ResourceAfter != 0 {
		t.Fatalf("ability resource delta = %#v, want super charge 100 -> 0", event)
	}
}
