package game

import (
	"battle/model/gamemap"
	"battle/service/geometry"
	"math"
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

func TestNewMapJSONPublishesAuthoredMonsterCamps(t *testing.T) {
	canonical := gamemap.GenerateTeamBattle(gamemap.CanonicalTeamBattleSeed)
	got := NewMapJSON("team-battle", canonical, 1, false)
	if len(got.MonsterCamps) != len(canonical.MonsterSpawns) || len(got.MonsterCamps) < 6 {
		t.Fatalf("monster camps=%d, want %d authored camps", len(got.MonsterCamps), len(canonical.MonsterSpawns))
	}
	for index, camp := range got.MonsterCamps {
		spawn := canonical.MonsterSpawns[index]
		if camp.ID != spawn.ID || camp.Kind != string(spawn.Kind) || camp.X != spawn.X || camp.Y != spawn.Y || camp.TerritoryRadius != spawn.TerritoryRadius {
			t.Fatalf("camp %d=%#v, want authored %#v", index, camp, spawn)
		}
	}
}

func TestNewMapJSONPublishesEditableWallRotation(t *testing.T) {
	canonical := &gamemap.GameMap{Collisions: []*geometry.WallTile{{
		MinX: 20, MinY: 40, MaxX: 60, MaxY: 80, Type: "city_object", Rotation: math.Pi / 2, LinkedFeatureID: "building-a",
	}}}

	got := NewMapJSON("team-battle-northern", canonical, 0, true)
	if len(got.Walls) != 1 || got.Walls[0].Rotation != math.Pi/2 || got.Walls[0].LinkedFeatureID != "building-a" {
		t.Fatalf("wall rotation = %#v, want %v", got.Walls, math.Pi/2)
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

func TestNewMapJSONPublishesRoundTeamTowerColliders(t *testing.T) {
	canonical := gamemap.GenerateTeamBattle(gamemap.CanonicalTeamBattleSeed)
	got := NewMapJSON(gamemap.CanonicalTeamBattleNorthernID, canonical, 0, true)

	towers := 0
	for _, wall := range got.Walls {
		if wall.Type != "objective" || wall.ColliderRadius <= 0 {
			continue
		}
		towers++
	}
	if towers != 4 {
		t.Fatalf("serialized round tower colliders = %d, want 4", towers)
	}
}

func TestNewMapJSONPublishesNorthernTeamMapIdentity(t *testing.T) {
	canonical := gamemap.GenerateTeamBattle(gamemap.CanonicalTeamBattleNorthernSeed)
	got := NewMapJSON("team-battle-northern", canonical, 2, true)
	if got.ID != gamemap.CanonicalTeamBattleNorthernID || got.Name != "team-battle-northern" || got.Seed != gamemap.CanonicalTeamBattleNorthernSeed || got.Revision != 2 {
		t.Fatalf("northern team map identity = %#v", got)
	}
	if featureJSONTypeCount(got.Features, "castle_keep") != 2 || featureJSONTypeCount(got.Features, "castle_house") != 8 {
		t.Fatalf("northern team map did not retain its collision buildings: castle keeps=%d houses=%d", featureJSONTypeCount(got.Features, "castle_keep"), featureJSONTypeCount(got.Features, "castle_house"))
	}
}

func featureJSONTypeCount(features []FeatureJSON, featureType string) int {
	count := 0
	for _, feature := range features {
		if feature.Type == featureType {
			count++
		}
	}
	return count
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
