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
