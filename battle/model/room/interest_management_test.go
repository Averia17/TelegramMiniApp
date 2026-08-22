package room

import (
	"battle/model/game"
	"battle/model/player"
	"battle/service/geometry"
	"testing"
)

func TestTransientInterestKeepsLocalAndNearbyEntities(t *testing.T) {
	viewer := &player.Player{
		PlayerId:   "viewer",
		CircleBody: geometry.CircleBody{X: 100, Y: 100},
	}

	monsters := monstersForClient(viewer, map[string]game.MonsterJSON{
		"near": {X: 900, Y: 100},
		"far":  {X: 1_500, Y: 100},
	})
	if len(monsters) != 1 {
		t.Fatalf("visible monsters = %#v, want only nearby monster", monsters)
	}
	if _, ok := monsters["near"]; !ok {
		t.Fatal("nearby monster was filtered out")
	}

	players := map[string]*player.Player{
		"viewer": viewer,
		"ally":   {PlayerId: "ally", Team: "Blue"},
		"enemy":  {PlayerId: "enemy", Team: "Red"},
	}
	viewer.Team = "Blue"
	bullets := bulletsForClient("viewer", viewer, players, []game.BulletJSON{
		{ID: 1, PlayerId: "viewer", X: 1_500, Y: 100},
		{ID: 2, PlayerId: "ally", X: 1_500, Y: 100},
		{ID: 3, PlayerId: "enemy", X: 900, Y: 100},
		{ID: 4, PlayerId: "enemy", X: 1_500, Y: 100},
		{ID: 5, PlayerId: "enemy", X: 1_500, Y: 100, TargetX: 100, TargetY: 100},
	})
	if len(bullets) != 4 {
		t.Fatalf("visible bullets = %#v, want own, ally, nearby, and targeted bullet", bullets)
	}
	for _, bullet := range bullets {
		if bullet.ID == 4 {
			t.Fatal("unrelated distant bullet leaked into the snapshot")
		}
	}
}

func TestEffectsForClientUsesAreaAndEndpointInterest(t *testing.T) {
	viewer := &player.Player{CircleBody: geometry.CircleBody{X: 100, Y: 100}}
	effects := effectsForClient(viewer, []game.EffectJSON{
		{Id: "near", X: 900, Y: 100},
		{Id: "far", X: 1_500, Y: 100},
		{Id: "endpoint", X: 1_500, Y: 100, ToX: 100, ToY: 100},
	})
	if len(effects) != 2 {
		t.Fatalf("visible effects = %#v, want nearby and endpoint effects", effects)
	}
	if effects[0].Id != "near" || effects[1].Id != "endpoint" {
		t.Fatalf("visible effects order/content = %#v", effects)
	}
}
