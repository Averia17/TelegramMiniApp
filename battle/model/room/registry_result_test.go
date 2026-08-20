package room

import (
	"battle/model/player"
	"testing"
)

func TestBuildPlayerResultCarriesTeamBattleStats(t *testing.T) {
	p := &player.Player{
		PlayerId:           "player-1",
		PartyID:            "party-1",
		Team:               "Red",
		Name:               "Alice",
		HeroName:           "Needle",
		Kills:              3,
		Lives:              420,
		Deaths:             2,
		PlayerDamage:       600,
		TowerDamage:        900,
		TownHallDamage:     250,
		TowersDestroyed:    1,
		TownHallsDestroyed: 0,
	}

	result := buildPlayerResult(p, "Red team")

	if result.PlayerId != p.PlayerId || result.Team != p.Team || !result.Won {
		t.Fatalf("identity/win result = %#v, want player Red team winner", result)
	}
	if result.Deaths != 2 || result.PlayerDamage != 600 || result.TowerDamage != 900 || result.TownHallDamage != 250 || result.TowersDestroyed != 1 {
		t.Fatalf("team battle stats = %#v, want deaths/damage/destruction copied", result)
	}
}
