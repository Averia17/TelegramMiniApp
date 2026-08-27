package game

import "testing"

func TestAbilityCancelStopsMandySuperWindup(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mandy", "Mandy", "Mandy")
	p := gs.Players["mandy"]
	p.SuperCharge = 100
	now := gs.nowMs()
	gs.playerAbility(p.PlayerId, now, "primary", "cast")
	if len(gs.PendingMandySupers) != 1 || p.CastUntil <= now {
		t.Fatalf("Mandy cast was not armed: pending=%d castUntil=%d now=%d", len(gs.PendingMandySupers), p.CastUntil, now)
	}
	gs.playerAbilityCancel(p.PlayerId, now+100, "cancel", "cast")
	if len(gs.PendingMandySupers) != 0 || p.CastUntil != 0 || p.ShieldHP != 0 {
		t.Fatalf("Mandy cast survived cancellation: pending=%d castUntil=%d shield=%d", len(gs.PendingMandySupers), p.CastUntil, p.ShieldHP)
	}
	last := gs.CombatEvents[len(gs.CombatEvents)-1]
	if last.Reason != "ability_cancelled" || last.Phase != "cancelled" || last.Accepted || !last.Resolved {
		t.Fatalf("cancel event=%#v", last)
	}
	gs.updatePendingMandySupers()
	gs.updateAbilityResolutions(now + 4_000)
	for _, effect := range gs.Effects {
		if effect != nil && effect.Kind == "mandy_super_wave" {
			t.Fatalf("cancelled Mandy cast produced a wave: %#v", effect)
		}
	}
}

func TestAbilityCancelStopsBrockStrikeSequence(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("brock", "Brock", "Brock Zeus")
	p := gs.Players["brock"]
	p.SuperCharge = 100
	now := gs.nowMs()
	gs.playerAbility(p.PlayerId, now, "primary", "cast")
	if len(gs.LightningStrikes) != 3 || p.ChannelUntil <= now {
		t.Fatalf("Brock cast was not armed: strikes=%d channelUntil=%d now=%d", len(gs.LightningStrikes), p.ChannelUntil, now)
	}
	gs.playerAbilityCancel(p.PlayerId, now+100, "cancel", "cast")
	if len(gs.LightningStrikes) != 0 || p.ChannelUntil != 0 {
		t.Fatalf("Brock strike sequence survived cancellation: strikes=%d channelUntil=%d", len(gs.LightningStrikes), p.ChannelUntil)
	}
	last := gs.CombatEvents[len(gs.CombatEvents)-1]
	if last.Reason != "ability_cancelled" || last.Phase != "cancelled" || last.Accepted || !last.Resolved {
		t.Fatalf("cancel event=%#v", last)
	}
	gs.updateAbilityResolutions(now + 4_000)
	for _, event := range gs.CombatEvents {
		if event.CommandID == "cast" && event.Reason == "ability_missed" {
			t.Fatalf("cancelled Brock cast emitted a late miss: %#v", event)
		}
	}
}

func TestAbilityCancelUsesSuperResourceForUnavailablePrimaryCancel(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("kaze", "Kaze", "Kaze")
	p := gs.Players["kaze"]
	p.SuperCharge = 73
	now := gs.nowMs()
	gs.playerAbilityCancel(p.PlayerId, now, "cancel", "missing-cast")
	last := gs.CombatEvents[len(gs.CombatEvents)-1]
	if last.Reason != "ability_unavailable" || last.ResourceKind != "super_charge" || last.ResourceBefore != 73 || last.ResourceAfter != 73 {
		t.Fatalf("unavailable cancel event=%#v", last)
	}
}
