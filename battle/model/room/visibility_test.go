package room

import (
	"battle/model/game"
	"battle/model/gamemap"
	"battle/model/player"
	"battle/service/geometry"
	"testing"
)

func TestVisiblePlayersForClientOmitsConcealedEnemyCoordinates(t *testing.T) {
	viewer := &player.Player{PlayerId: "viewer", Team: "Blue", CircleBody: geometry.CircleBody{X: 100, Y: 100}, Lives: 1}
	enemy := &player.Player{PlayerId: "enemy", Team: "Red", CircleBody: geometry.CircleBody{X: 500, Y: 500}, Lives: 1}
	ally := &player.Player{PlayerId: "ally", Team: "Blue", CircleBody: geometry.CircleBody{X: 520, Y: 500}, Lives: 1}
	state := &game.GameState{
		Players: map[string]*player.Player{"viewer": viewer, "enemy": enemy, "ally": ally},
		Map:     &gamemap.GameMap{Collisions: []*geometry.WallTile{{MinX: 450, MinY: 450, MaxX: 560, MaxY: 560, Type: "bush"}}},
	}
	snapshots := map[string]game.PlayerJSON{
		"viewer": {PlayerId: "viewer", X: 100, Y: 100},
		"enemy":  {PlayerId: "enemy", X: 500, Y: 500},
		"ally":   {PlayerId: "ally", X: 520, Y: 500},
	}

	visible := visiblePlayersForClient(state, "viewer", snapshots, 1_000)
	if _, leaked := visible["enemy"]; leaked {
		t.Fatal("concealed enemy coordinates leaked into personalized snapshot")
	}
	if _, ok := visible["ally"]; !ok {
		t.Fatal("ally in bush must remain visible")
	}

	enemy.RevealedUntil = 2_500
	visible = visiblePlayersForClient(state, "viewer", snapshots, 1_000)
	if _, ok := visible["enemy"]; !ok {
		t.Fatal("recently revealed enemy must be visible")
	}
}

func TestActivePlayerCountIncludesConcealedPlayers(t *testing.T) {
	state := &game.GameState{
		Players: map[string]*player.Player{
			"viewer": {Lives: 100},
			"hidden": {Lives: 100},
			"dead":   {Lives: 0},
		},
	}

	if got := activePlayerCount(state); got != 2 {
		t.Fatalf("active player count = %d, want 2", got)
	}
}

func TestCombatEventsForClientFiltersWithoutEmptyAllocation(t *testing.T) {
	events := []game.CombatEvent{
		{ID: 1, Ts: 900, SourceID: "viewer", Kind: "attack"},
		{ID: 2, Ts: 900, SourceID: "enemy", TargetID: "other", Kind: "attack"},
		{ID: 3, Ts: 900, TargetID: "viewer", Kind: "damage"},
	}

	visible := combatEventsForClient(events, "viewer", 1_000)
	if len(visible) != 2 || visible[0].ID != 1 || visible[1].ID != 3 {
		t.Fatalf("visible combat events = %#v, want events 1 and 3", visible)
	}
	if empty := combatEventsForClient(nil, "viewer", 1_000); empty != nil {
		t.Fatalf("empty combat events = %#v, want nil", empty)
	}
}
