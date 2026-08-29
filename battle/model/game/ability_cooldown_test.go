package game

import (
	"testing"
	"time"
)

func TestPrimaryAbilityIsAvailableWithoutHitChargeAndRespectsCooldown(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("kaze", "Kaze", "Kaze")
	p := gs.Players["kaze"]
	p.SuperCharge = 0
	now := time.Now().UnixMilli()

	gs.playerAbility(p.PlayerId, now, "primary", "first-super")
	if !p.LastAbilityOK {
		t.Fatalf("primary ability was rejected without hit charge: events=%#v", gs.CombatEvents)
	}

	p.LastAbilityOK = false
	gs.playerAbility(p.PlayerId, now+1, "primary", "cooldown-super")
	if p.LastAbilityOK {
		t.Fatalf("primary ability ignored its cooldown")
	}
	last := gs.CombatEvents[len(gs.CombatEvents)-1]
	if last.Reason != "ability_cooldown" {
		t.Fatalf("cooldown rejection = %#v, want ability_cooldown", last)
	}

	p.LastAbilityOK = false
	gs.playerAbility(p.PlayerId, now+AbilityCooldownMs(p.HeroName, "primary"), "primary", "ready-super")
	if !p.LastAbilityOK {
		t.Fatalf("primary ability stayed unavailable after its cooldown: events=%#v", gs.CombatEvents)
	}
}
