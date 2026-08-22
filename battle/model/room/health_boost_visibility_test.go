package room

import (
	"battle/model/player"
	"battle/model/prop"
	"testing"
)

func TestHeroHealthBoostIsVisibleOnlyToKillerTeam(t *testing.T) {
	drop := prop.NewProp("health_boost", 120, 120, 14)
	drop.HealthBoostKillerID = "killer"
	drop.VisibilityTeam = "Blue"

	blue := &player.Player{PlayerId: "ally", Team: "Blue"}
	red := &player.Player{PlayerId: "enemy", Team: "Red"}

	if got := propsForClient(blue, []*prop.Prop{drop}); len(got) != 1 {
		t.Fatalf("killer team saw %d hero health boosts, want 1", len(got))
	}
	if got := propsForClient(red, []*prop.Prop{drop}); len(got) != 0 {
		t.Fatalf("enemy team saw %d hero health boosts, want 0", len(got))
	}
}

func TestSoloHeroHealthBoostIsVisibleOnlyToItsKiller(t *testing.T) {
	drop := prop.NewProp("health_boost", 120, 120, 14)
	drop.HealthBoostKillerID = "killer"
	drop.VisibilityPlayerID = "killer"

	killer := &player.Player{PlayerId: "killer"}
	other := &player.Player{PlayerId: "other"}

	if got := propsForClient(killer, []*prop.Prop{drop}); len(got) != 1 {
		t.Fatalf("killer saw %d solo hero health boosts, want 1", len(got))
	}
	if got := propsForClient(other, []*prop.Prop{drop}); len(got) != 0 {
		t.Fatalf("other solo player saw %d hero health boosts, want 0", len(got))
	}
}
