package gamemap

import (
	"math"
	"testing"

	"battle/service/geometry"
)

func TestNorthernAshPublishesLargeOuterDistrictAnchors(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	features := make(map[string]MapFeature, len(mapValue.Features))
	for _, feature := range mapValue.Features {
		features[feature.ID] = feature
	}

	for _, id := range []string{
		"city-harbour-row",
		"city-harbour-row-mirror",
		"city-guildhall",
		"city-guildhall-mirror",
		"city-dock-warehouse",
		"city-dock-warehouse-mirror",
		"city-north-townhouses",
		"city-north-townhouses-mirror",
		"city-north-gate",
		"city-north-gate-mirror",
	} {
		feature, ok := features[id]
		if !ok {
			t.Fatalf("northern authored district is missing feature %q", id)
		}
		if feature.Type != "city_building" {
			t.Fatalf("northern district feature %q has type %q, want city_building", id, feature.Type)
		}
		if feature.Scale <= 0 {
			t.Fatalf("northern district feature %q has invalid scale %.2f", id, feature.Scale)
		}
	}

	if count := featureTypeCount(mapValue.Features, "city_building"); count < 18 {
		t.Fatalf("northern city building anchors = %d, want at least 18 including the residential frontage", count)
	}
}

func TestNorthernAshPublishesNorthTownhouseRowWithTightContacts(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	features := make(map[string]MapFeature, len(mapValue.Features))
	for _, feature := range mapValue.Features {
		features[feature.ID] = feature
	}
	for _, id := range []string{"city-north-townhouses", "city-north-townhouses-mirror"} {
		feature, ok := features[id]
		if !ok || feature.Type != "city_building" {
			t.Fatalf("northern townhouse row %q is missing or has type %q", id, feature.Type)
		}
	}
	if specs := teamBattleCityColliderSpecs("north_townhouses", true); len(specs) != 10 {
		t.Fatalf("northern townhouse contacts = %d, want three bays, rear shell and physical frontage props", len(specs))
	}
	for _, cell := range [][2]int{{21, 29}, {22, 31}, {29, 21}, {31, 22}} {
		point := &geometry.CircleBody{X: (float64(cell[0]) + .5) * 40, Y: (float64(cell[1]) + .5) * 40, Radius: .1}
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type == "objective" || !geometry.IsBlockingWall(wall.Type) {
				continue
			}
			if geometry.CollidesCircleWithWall(point, wall) {
				t.Fatalf("north townhouse route cell %v is blocked by %s bounds=(%.1f,%.1f)-(%.1f,%.1f)", cell, wall.Type, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
			}
		}
	}
}

func TestNorthernAshLargeArchetypesHaveTightColliderContracts(t *testing.T) {
	for _, archetype := range []string{
		"depot", "apartments", "north_gate", "south_ward", "inn", "harbour_row", "guildhall", "dock_warehouse",
	} {
		specs := teamBattleCityColliderSpecs(archetype, true)
		if len(specs) == 0 {
			t.Fatalf("northern archetype %q has no authored collider specs", archetype)
		}
		for index, spec := range specs {
			if spec.Radius <= 0 && (spec.Width <= 0 || spec.Height <= 0) {
				t.Fatalf("northern archetype %q collider %d has no positive footprint: %#v", archetype, index, spec)
			}
			if spec.Width > 2.2 || spec.Height > 2.2 || spec.Radius > 1.2 {
				t.Fatalf("northern archetype %q collider %d is too broad for a tight ground contact: %#v", archetype, index, spec)
			}
		}
	}
}

func TestNorthernAshPublishesDockWarehouseFrontageWithPhysicalContacts(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	features := make(map[string]MapFeature, len(mapValue.Features))
	for _, feature := range mapValue.Features {
		features[feature.ID] = feature
	}
	for _, id := range []string{"city-dock-warehouse", "city-dock-warehouse-mirror"} {
		feature, ok := features[id]
		if !ok || feature.Type != "city_building" {
			t.Fatalf("northern dock warehouse %q is missing or has type %q", id, feature.Type)
		}
	}
	if specs := teamBattleCityColliderSpecs("dock_warehouse", true); len(specs) != 8 {
		t.Fatalf("northern dock warehouse contacts = %d, want 3 bays, loading edge and physical dock props", len(specs))
	}
}

func TestNorthernAshPublishesDockyardCourtBetweenHarbourBuildings(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	features := make(map[string]MapFeature, len(mapValue.Features))
	for _, feature := range mapValue.Features {
		features[feature.ID] = feature
	}
	for _, id := range []string{"city-dockyard", "city-dockyard-mirror"} {
		feature, ok := features[id]
		if !ok || feature.Type != "city_dockyard" {
			t.Fatalf("northern dockyard %q is missing or has type %q", id, feature.Type)
		}
	}
	if count := featureTypeCount(mapValue.Features, "city_dockyard"); count != 2 {
		t.Fatalf("northern dockyards = %d, want 2 mirrored loading courts", count)
	}
	if specs := teamBattleFeatureColliderSpecs("city_dockyard", "northern-contract"); len(specs) != 5 {
		t.Fatalf("northern dockyard contacts = %d, want cart, crates, barrels and mooring post", len(specs))
	}
	for _, cell := range [][2]int{{57, 47}, {47, 57}} {
		point := &geometry.CircleBody{X: (float64(cell[0]) + .5) * 40, Y: (float64(cell[1]) + .5) * 40, Radius: .1}
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type == "objective" || !geometry.IsBlockingWall(wall.Type) {
				continue
			}
			if geometry.CollidesCircleWithWall(point, wall) {
				t.Fatalf("dockyard court cell %v is blocked by %s bounds=(%.1f,%.1f)-(%.1f,%.1f)", cell, wall.Type, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
			}
		}
	}
}

func TestNorthernAshPublishesConnectedUrbanCore(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	if count := featureTypeCount(mapValue.Features, "city_plaza"); count != 2 {
		t.Fatalf("northern urban plazas = %d, want 2 mirrored town squares", count)
	}
	if count := featureTypeCount(mapValue.Features, "city_street"); count != 6 {
		t.Fatalf("northern urban street segments = %d, want 6 mirrored connectors", count)
	}
	for _, archetype := range []string{"city_plaza", "city_street"} {
		if specs := teamBattleFeatureColliderSpecs(archetype, "northern-contract"); len(specs) == 0 {
			t.Fatalf("northern urban archetype %q has physical dressing without collider specs", archetype)
		}
	}
}

func TestNorthernAshPublishesPassableGuildhallPlazaLane(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	features := make(map[string]MapFeature, len(mapValue.Features))
	for _, feature := range mapValue.Features {
		features[feature.ID] = feature
	}
	for _, id := range []string{"city-lane-guildhall", "city-lane-guildhall-mirror"} {
		feature, ok := features[id]
		if !ok || feature.Type != "city_lane" {
			t.Fatalf("northern civic lane %q is missing or has type %q", id, feature.Type)
		}
	}
	if count := featureTypeCount(mapValue.Features, "city_lane"); count != 2 {
		t.Fatalf("northern civic lanes = %d, want one mirrored guildhall/plaza connector", count)
	}
	if specs := teamBattleFeatureColliderSpecs("city_lane", "northern-contract"); len(specs) == 0 {
		t.Fatal("northern civic lane decorations have no physical contact contract")
	}
	for _, cell := range [][2]int{{36, 47}, {47, 36}} {
		point := &geometry.CircleBody{X: (float64(cell[0]) + .5) * 40, Y: (float64(cell[1]) + .5) * 40, Radius: .1}
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type == "objective" || !geometry.IsBlockingWall(wall.Type) {
				continue
			}
			if geometry.CollidesCircleWithWall(point, wall) {
				t.Fatalf("civic lane center %v is blocked by %s bounds=(%.1f,%.1f)-(%.1f,%.1f)", cell, wall.Type, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
			}
		}
	}
}

func TestNorthernAshPublishesCastleCourtyardsWithPhysicalContacts(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	features := make(map[string]MapFeature, len(mapValue.Features))
	for _, feature := range mapValue.Features {
		features[feature.ID] = feature
	}
	for _, id := range []string{"castle-ashen-ward-courtyard", "castle-ashen-ward-courtyard-mirror"} {
		feature, ok := features[id]
		if !ok || feature.Type != "castle_courtyard" {
			t.Fatalf("northern castle courtyard %q is missing or has type %q", id, feature.Type)
		}
	}
	if count := featureTypeCount(mapValue.Features, "castle_courtyard"); count != 2 {
		t.Fatalf("northern castle courtyards = %d, want 2 mirrored inner courts", count)
	}
	if specs := teamBattleFeatureColliderSpecs("castle_courtyard", "northern-contract"); len(specs) != 9 {
		t.Fatalf("northern castle courtyard contacts = %d, want well, benches, braziers and rubble", len(specs))
	}
	for _, cell := range [][2]int{{26, 43}, {43, 26}} {
		point := &geometry.CircleBody{X: (float64(cell[0]) + .5) * 40, Y: (float64(cell[1]) + .5) * 40, Radius: .1}
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type == "objective" || !geometry.IsBlockingWall(wall.Type) {
				continue
			}
			if geometry.CollidesCircleWithWall(point, wall) {
				t.Fatalf("castle courtyard approach cell %v is blocked by %s bounds=(%.1f,%.1f)-(%.1f,%.1f)", cell, wall.Type, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
			}
		}
	}
}

func TestNorthernAshPublishesHarbourAvenueToPlaza(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	features := make(map[string]MapFeature, len(mapValue.Features))
	for _, feature := range mapValue.Features {
		features[feature.ID] = feature
	}
	for _, id := range []string{"city-avenue-harbour", "city-avenue-harbour-mirror"} {
		feature, ok := features[id]
		if !ok || feature.Type != "city_avenue" {
			t.Fatalf("northern harbour avenue %q is missing or has type %q", id, feature.Type)
		}
	}
	if count := featureTypeCount(mapValue.Features, "city_avenue"); count != 2 {
		t.Fatalf("northern harbour avenues = %d, want 2 mirrored plaza connectors", count)
	}
	if specs := teamBattleFeatureColliderSpecs("city_avenue", "northern-contract"); len(specs) != 7 {
		t.Fatalf("northern harbour avenue contacts = %d, want lamps, drain, crate and cart contacts", len(specs))
	}
	for _, cell := range [][2]int{{50, 44}, {54, 44}, {44, 50}, {44, 54}} {
		point := &geometry.CircleBody{X: (float64(cell[0]) + .5) * 40, Y: (float64(cell[1]) + .5) * 40, Radius: .1}
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type == "objective" || !geometry.IsBlockingWall(wall.Type) {
				continue
			}
			if geometry.CollidesCircleWithWall(point, wall) {
				t.Fatalf("harbour avenue route cell %v is blocked by %s bounds=(%.1f,%.1f)-(%.1f,%.1f)", cell, wall.Type, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
			}
		}
	}
}

func TestNorthernAshKeepsNaturalCoverAroundHarbourAvenue(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	natural := map[string]bool{
		"bush": true, "tree": true, "dead_tree": true,
		"vine": true, "thorn_vine": true, "ruin_wall": true,
	}
	for _, feature := range mapValue.Features {
		if feature.Type != "city_avenue" {
			continue
		}
		cover := 0
		for _, wall := range mapValue.Collisions {
			if wall == nil || !natural[wall.Type] {
				continue
			}
			wallX := (wall.MinX + wall.MaxX) * .5
			wallY := (wall.MinY + wall.MaxY) * .5
			distance := math.Hypot(wallX-feature.X, wallY-feature.Y) / 40
			if distance > 4 && distance <= 7 {
				cover++
			}
		}
		if cover == 0 {
			t.Fatalf("harbour avenue %s clears its entire outer natural-cover envelope", feature.ID)
		}
	}
}

func TestNorthernAshUrbanAnchorsOwnClearNaturalEnvelopes(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	for _, feature := range mapValue.Features {
		if feature.Type != "city_building" && feature.Type != "castle_house" && feature.Type != "city_plaza" && feature.Type != "city_street" && feature.Type != "city_avenue" && feature.Type != "castle_courtyard" {
			continue
		}
		radius := 2.0
		if feature.Type == "city_plaza" {
			radius = 4.0
		} else if feature.Type == "city_building" {
			radius = 3.2
		}
		for _, wall := range mapValue.Collisions {
			if wall == nil || (wall.Type != "bush" && wall.Type != "tree" && wall.Type != "dead_tree" && wall.Type != "vine" && wall.Type != "thorn_vine") {
				continue
			}
			wallX := (wall.MinX+wall.MaxX)/2 - feature.X
			wallY := (wall.MinY+wall.MaxY)/2 - feature.Y
			if hypotTiles(wallX, wallY) <= radius*40 {
				t.Fatalf("urban anchor %s is visually swallowed by %s at cell (%d,%d), distance %.1fpx", feature.ID, wall.Type, int(wall.MinX/40), int(wall.MinY/40), hypotTiles(wallX, wallY))
			}
		}
	}
}

func hypotTiles(x, y float64) float64 {
	return math.Hypot(x, y)
}
