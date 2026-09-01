package gamemap

import (
	"battle/service/geometry"
	"testing"
)

func TestTeamBattleBridgeApproachesFitAFullHero(t *testing.T) {
	for _, testCase := range []struct {
		name     string
		mapValue *GameMap
	}{
		{name: "classic", mapValue: GenerateTeamBattleClassic(CanonicalTeamBattleSeed)},
		{name: "northern", mapValue: GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)},
	} {
		mapValue := testCase.mapValue
		walls := geometry.NewSpatialHash(160)
		for _, wall := range mapValue.Collisions {
			walls.Insert(wall)
		}
		for _, center := range [][2]float64{{17.5, 17.5}, {34.5, 34.5}, {52.5, 52.5}} {
			for offset := -160.0; offset <= 160; offset += 4 {
				body := &geometry.CircleBody{
					X:      center[0]*40 + offset,
					Y:      center[1]*40 - offset,
					Radius: 15,
				}
				if geometry.CollidesCircleWithBlockingWalls(body, walls) {
					for _, wall := range walls.QueryCircle(body) {
						if geometry.IsBlockingWall(wall.Type) && geometry.CollidesCircleWithWall(body, wall) {
							t.Fatalf("map %s bridge center %.1f blocked at offset %.0f by %s bounds=(%.0f,%.0f)-(%.0f,%.0f)", testCase.name, center[0], offset, wall.Type, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
						}
					}
					t.Fatalf("map %s bridge center %.1f blocked at offset %.0f", testCase.name, center[0], offset)
				}
			}
		}
	}
}

func TestTeamBattleBridgeFeaturesAlignWithTheirCollisionLanes(t *testing.T) {
	wantCenters := map[string][2]float64{
		"team-bridge-north":  {17.5, 17.5},
		"team-bridge-center": {34.5, 34.5},
		"team-bridge-south":  {52.5, 52.5},
	}
	for _, mapValue := range []*GameMap{
		GenerateTeamBattleClassic(CanonicalTeamBattleSeed),
		GenerateTeamBattle(CanonicalTeamBattleNorthernSeed),
	} {
		seen := make(map[string]bool, len(wantCenters))
		for _, feature := range mapValue.Features {
			want, ok := wantCenters[feature.ID]
			if !ok {
				continue
			}
			got := [2]float64{feature.X / 40, feature.Y / 40}
			if got != want {
				t.Fatalf("bridge %s visual center=%v, want collision-lane center=%v", feature.ID, got, want)
			}
			seen[feature.ID] = true
		}
		if len(seen) != len(wantCenters) {
			t.Fatalf("map is missing bridge features: got %v", seen)
		}
	}
}
