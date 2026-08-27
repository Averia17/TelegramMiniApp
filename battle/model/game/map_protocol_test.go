package game

import (
	"battle/model/gamemap"
	"testing"
)

func TestNewMapJSONPublishesCanonicalIdentityAndRevision(t *testing.T) {
	canonical := gamemap.GenerateBattleRoyale(gamemap.CanonicalBattleRoyaleSeed)
	got := NewMapJSON("battle-royale", canonical, 7, true)

	if got.ID != gamemap.CanonicalBattleRoyaleID || got.Name != "battle-royale" || got.Seed != gamemap.CanonicalBattleRoyaleSeed || got.Revision != 7 {
		t.Fatalf("map identity = %#v", got)
	}
	if len(got.Walls) != len(canonical.Collisions) {
		t.Fatalf("walls = %d, want %d", len(got.Walls), len(canonical.Collisions))
	}
	if got.Walls[0].Type != canonical.Collisions[0].Type || got.Walls[0].Blocking == false {
		t.Fatalf("first wall = %#v", got.Walls[0])
	}
	if got.Walls[0].ColliderInsetX != canonical.Collisions[0].ColliderInsetX || got.Walls[0].ColliderInsetY != canonical.Collisions[0].ColliderInsetY {
		t.Fatalf("first wall collider = %#v", got.Walls[0])
	}
	for _, wall := range got.Walls {
		if wall.Type == "beacon" && wall.ColliderRadius <= 0 {
			t.Fatalf("beacon collider radius was not serialized: %#v", wall)
		}
	}
}

func TestNewMapJSONKeepsIdentityOnCompactSnapshots(t *testing.T) {
	canonical := gamemap.GenerateBattleRoyale(gamemap.CanonicalBattleRoyaleSeed)
	got := NewMapJSON("battle-royale", canonical, 3, false)

	if got.ID != gamemap.CanonicalBattleRoyaleID || got.Seed != gamemap.CanonicalBattleRoyaleSeed || got.Revision != 3 {
		t.Fatalf("compact map identity = %#v", got)
	}
	if got.Walls != nil {
		t.Fatalf("compact map unexpectedly contains %d walls", len(got.Walls))
	}
}

func TestNewMapJSONPublishesPassableTeamFeatures(t *testing.T) {
	canonical := gamemap.GenerateTeamBattleClassic(gamemap.CanonicalTeamBattleSeed)
	got := NewMapJSON("team-battle", canonical, 0, true)
	if got.ID != gamemap.CanonicalTeamBattleClassicID {
		t.Fatalf("team map identity = %q", got.ID)
	}
	if len(got.Features) != len(canonical.Features) || len(got.Features) < 4 {
		t.Fatalf("features = %d, want all authored features and at least 4", len(got.Features))
	}
	if got.Features[0].Type != "river" {
		t.Fatalf("first team feature = %#v", got.Features[0])
	}
}

func TestNewMapJSONPublishesNorthernTeamMapIdentity(t *testing.T) {
	canonical := gamemap.GenerateTeamBattle(gamemap.CanonicalTeamBattleNorthernSeed)
	got := NewMapJSON("team-battle-northern", canonical, 2, true)
	if got.ID != gamemap.CanonicalTeamBattleNorthernID || got.Name != "team-battle-northern" || got.Seed != gamemap.CanonicalTeamBattleNorthernSeed || got.Revision != 2 {
		t.Fatalf("northern team map identity = %#v", got)
	}
	if len(got.Features) <= len(gamemap.GenerateTeamBattleClassic(gamemap.CanonicalTeamBattleSeed).Features) {
		t.Fatalf("northern team map did not retain its detailed city features: %d", len(got.Features))
	}
}

func TestNewMapJSONPublishesRiverAndBridgeCollisionLayers(t *testing.T) {
	canonical := gamemap.GenerateTeamBattleClassic(gamemap.CanonicalTeamBattleSeed)
	got := NewMapJSON("team-battle", canonical, 0, true)

	river, bridge := 0, 0
	for _, wall := range got.Walls {
		switch wall.Type {
		case "river":
			river++
			if !wall.Blocking {
				t.Fatalf("river wall is passable: %#v", wall)
			}
		case "river_bridge":
			bridge++
			if wall.Blocking {
				t.Fatalf("bridge wall is blocking: %#v", wall)
			}
		}
	}
	if river == 0 || bridge == 0 {
		t.Fatalf("serialized river layers = river %d, bridge %d", river, bridge)
	}
}
