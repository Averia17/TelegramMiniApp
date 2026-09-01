package game

import "testing"

func TestCombatHitCarriesPresentationContract(t *testing.T) {
	state := NewGameState(GameConfig{MatchID: "combat-feedback-contract", Mode: ModeDeathmatch})
	state.State = GameStateGame
	state.PlayerAdd("attacker", "Attacker", "Kaze")
	state.PlayerAdd("target", "Target", "Brock Zeus")
	attacker := state.Players["attacker"]
	target := state.Players["target"]
	state.activeCommandID = "contract-basic-1"
	state.activeSourceID = attacker.PlayerId
	state.activeAbilitySlot = "basic"
	before := target.Lives

	if got := state.dealPlayerDamage(attacker, target, 25); got != 25 {
		t.Fatalf("damage=%d, want 25", got)
	}
	if len(state.CombatEvents) != 1 {
		t.Fatalf("events=%#v, want one hit event", state.CombatEvents)
	}
	event := state.CombatEvents[0]
	if event.Reaction != "hit" || event.HitStopMs != 55 {
		t.Fatalf("presentation reaction=%q hitStop=%d, want hit/55", event.Reaction, event.HitStopMs)
	}
	if event.TargetLivesBefore != before || event.TargetLivesAfter != before-25 {
		t.Fatalf("target lives=%d->%d, want %d->%d", event.TargetLivesBefore, event.TargetLivesAfter, before, before-25)
	}
}

func TestCombatEffectCarriesOwningActionIdentity(t *testing.T) {
	state := NewGameState(GameConfig{MatchID: "combat-effect-contract", Mode: ModeDeathmatch})
	state.activeCommandID = "contract-super-1"
	state.activeSourceID = "attacker"
	state.activeAbilitySlot = "primary"
	effect := state.addEffect("kaze_dash", 1, 2, 3, 4, 25, 0, 320, 0, "#fff", 160, 450)
	if effect.ID == 0 || effect.CommandID != "contract-super-1" || effect.SourceID != "attacker" || effect.AbilitySlot != "primary" {
		t.Fatalf("effect identity=%#v", effect)
	}
}
