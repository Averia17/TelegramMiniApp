package gamemap

import (
	"battle/service/geometry"
	"fmt"
	"math"
	"strings"
	"testing"
)

func TestTeamBattleVariantsShareCombatTopologyButHaveDistinctDressing(t *testing.T) {
	classic := GenerateTeamBattleClassic(CanonicalTeamBattleSeed)
	northern := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	if classic.WidthInPixels != northern.WidthInPixels || classic.HeightInPixels != northern.HeightInPixels {
		t.Fatalf("variant dimensions differ: classic %.0fx%.0f northern %.0fx%.0f", classic.WidthInPixels, classic.HeightInPixels, northern.WidthInPixels, northern.HeightInPixels)
	}
	if len(classic.TeamSpawners["Blue"]) != len(northern.TeamSpawners["Blue"]) || len(classic.TeamSpawners["Red"]) != len(northern.TeamSpawners["Red"]) {
		t.Fatalf("variant spawn topology differs")
	}
	if len(northern.Features) == 0 || len(classic.Features) == 0 {
		t.Fatalf("team map variant lost all authored dressing: classic features %d, northern %d", len(classic.Features), len(northern.Features))
	}
	if featureTypeCount(northern.Features, "castle_keep") == 0 || featureTypeCount(classic.Features, "castle_keep") != 0 {
		t.Fatalf("team map variants lost their distinct dressing: classic castle keeps %d, northern castle keeps %d", featureTypeCount(classic.Features, "castle_keep"), featureTypeCount(northern.Features, "castle_keep"))
	}
}

func TestTeamBattleMonsterCampsHaveStableKindsAndTerritories(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	if len(mapValue.MonsterSpawns) != 8 {
		t.Fatalf("monster camps=%d, want 8", len(mapValue.MonsterSpawns))
	}
	seenKinds := map[string]bool{}
	for index, spawn := range mapValue.MonsterSpawns {
		if spawn.ID == "" || spawn.Kind == "" || spawn.TerritoryRadius <= 0 {
			t.Fatalf("camp %d is missing identity or territory: %#v", index, spawn)
		}
		seenKinds[spawn.Kind] = true
	}
	if !seenKinds["ash_hound"] || !seenKinds["root_guardian"] {
		t.Fatalf("monster camps lack the two authored types: %#v", seenKinds)
	}
	if mapValue.MonsterSpawns[0].ID != "camp-01" || mapValue.MonsterSpawns[4].ID != "camp-05" {
		t.Fatalf("camp ids are not stable: first=%q mirror=%q", mapValue.MonsterSpawns[0].ID, mapValue.MonsterSpawns[4].ID)
	}
}

func TestNorthernTeamBattleDoesNotPlaceConfusingCrateDecorations(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	for _, wall := range mapValue.Collisions {
		if wall.Type == "crates" {
			t.Fatalf("northern team map contains crate decoration at (%.0f, %.0f)", wall.MinX, wall.MinY)
		}
	}
}

func TestNorthernTeamBattlePublishesDetailedCastleWardHouses(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	if count := featureTypeCount(mapValue.Features, "castle_house"); count != 8 {
		t.Fatalf("northern team map contains %d detailed castle-house features, want 8", count)
	}
}

func TestNorthernTeamBattleDoesNotPlaceSmallBuildingHousesBesideCastle(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	for _, wall := range mapValue.Collisions {
		if wall.Type != "building_wall" {
			continue
		}
		x, y := int(wall.MinX/40), int(wall.MinY/40)
		if x >= 27 && x <= 29 && y >= 41 && y <= 43 {
			t.Fatalf("northern castle still contains small building house at (%d, %d)", x, y)
		}
		if x >= 41 && x <= 43 && y >= 27 && y <= 29 {
			t.Fatalf("mirrored northern castle still contains small building house at (%d, %d)", x, y)
		}
	}
}

func featureTypeCount(features []MapFeature, featureType string) int {
	count := 0
	for _, feature := range features {
		if feature.Type == featureType {
			count++
		}
	}
	return count
}

func TestClassicTeamBattleRetainsPreviousCommitCityLayout(t *testing.T) {
	mapValue := GenerateTeamBattleClassic(CanonicalTeamBattleSeed)
	featureTypes := make(map[string]int)
	featureIDs := make(map[string]bool)
	for _, feature := range mapValue.Features {
		featureTypes[feature.Type]++
		featureIDs[feature.ID] = true
	}
	if !featureIDs["city-market"] || !featureIDs["city-market-mirror"] {
		t.Fatal("classic map lost the previous commit's market landmarks")
	}
	for _, typeName := range []string{"city_inn", "city_shrine", "city_detail", "castle_keep", "castle_gate", "castle_courtyard", "castle_detail"} {
		if featureTypes[typeName] != 0 {
			t.Fatalf("classic map contains northern-only feature type %q (%d)", typeName, featureTypes[typeName])
		}
	}
	if featureTypes["city_building"] != 10 || featureTypes["city_tower"] != 2 ||
		featureTypes["city_plaza"] != 2 || featureTypes["city_street"] != 6 {
		t.Fatalf("classic city layout changed: %#v", featureTypes)
	}
}

func TestTeamBattleHasDiagonalBasesAndThreeSpawnsPerTeam(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	if mapValue.WidthInPixels <= 2400 || mapValue.HeightInPixels <= 2400 {
		t.Fatalf("team map is not larger than the solo arena: %.0fx%.0f", mapValue.WidthInPixels, mapValue.HeightInPixels)
	}
	if len(mapValue.TeamSpawners["Blue"]) != 3 || len(mapValue.TeamSpawners["Red"]) != 3 {
		t.Fatalf("team spawns = blue %d red %d, want 3/3", len(mapValue.TeamSpawners["Blue"]), len(mapValue.TeamSpawners["Red"]))
	}
	if len(mapValue.Objectives) != 6 {
		t.Fatalf("objectives = %d, want two halls and four towers", len(mapValue.Objectives))
	}
	blueHall, redHall := mapValue.Objectives[0], mapValue.Objectives[1]
	if blueHall.Team != "Blue" || redHall.Team != "Red" || blueHall.X >= redHall.X || blueHall.Y <= redHall.Y {
		t.Fatalf("bases are not diagonal: blue=(%.0f,%.0f) red=(%.0f,%.0f)", blueHall.X, blueHall.Y, redHall.X, redHall.Y)
	}
}

func TestTeamBattleVariantsUseCompactCanvasWithoutDroppingAuthoredContent(t *testing.T) {
	for _, variant := range []struct {
		name string
		game *GameMap
	}{
		{name: "classic", game: GenerateTeamBattleClassic(CanonicalTeamBattleSeed)},
		{name: "northern", game: GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)},
	} {
		mapValue := variant.game
		if mapValue.WidthInPixels != 2800 || mapValue.HeightInPixels != 2800 {
			t.Fatalf("team map dimensions = %.0fx%.0f, want 2800x2800", mapValue.WidthInPixels, mapValue.HeightInPixels)
		}
		assertInside := func(label string, x, y float64) {
			if x < 0 || y < 0 || x > mapValue.WidthInPixels || y > mapValue.HeightInPixels {
				t.Fatalf("%s at (%.0f,%.0f) escaped compact map bounds", label, x, y)
			}
		}
		for _, wall := range mapValue.Collisions {
			if wall == nil {
				continue
			}
			if wall.MinX < 0 || wall.MinY < 0 || wall.MaxX > mapValue.WidthInPixels || wall.MaxY > mapValue.HeightInPixels {
				t.Fatalf("collision %s bounds=(%.0f,%.0f)-(%.0f,%.0f) escaped compact map", wall.Type, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
			}
		}
		for _, feature := range mapValue.Features {
			assertInside("feature "+feature.ID, feature.X, feature.Y)
		}
		for _, spawn := range mapValue.MonsterSpawns {
			assertInside("monster spawn", spawn.X, spawn.Y)
		}
		for team, spawns := range mapValue.TeamSpawners {
			for index, spawn := range spawns {
				assertInside(fmt.Sprintf("%s spawn %d", team, index), spawn.CenterX(), spawn.CenterY())
			}
		}
		for _, objective := range mapValue.Objectives {
			assertInside("objective "+objective.ID, objective.X, objective.Y)
		}
	}
}

func TestTeamBattlePublishesBlockingCollisionForEveryObjective(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)

	for _, objective := range mapValue.Objectives {
		var collider *geometry.WallTile
		minX, minY := math.MaxFloat64, math.MaxFloat64
		maxX, maxY := -math.MaxFloat64, -math.MaxFloat64
		for _, wall := range mapValue.Collisions {
			if wall.Type != "objective" {
				continue
			}
			minX, minY = math.Min(minX, wall.MinX), math.Min(minY, wall.MinY)
			maxX, maxY = math.Max(maxX, wall.MaxX), math.Max(maxY, wall.MaxY)
			if objective.X >= wall.MinX && objective.X <= wall.MaxX && objective.Y >= wall.MinY && objective.Y <= wall.MaxY {
				collider = wall
			}
		}
		if collider == nil {
			t.Fatalf("objective %s has no collision volume", objective.ID)
		}
		if !geometry.IsBlockingWall(collider.Type) {
			t.Fatalf("objective %s collision type %q is passable", objective.ID, collider.Type)
		}
		collisionRadius := teamBattleObjectiveCollisionRadius(objective)
		if minX > objective.X-collisionRadius || maxX < objective.X+collisionRadius ||
			minY > objective.Y-collisionRadius || maxY < objective.Y+collisionRadius {
			t.Fatalf("objective %s collider = (%.0f,%.0f)-(%.0f,%.0f), want collision radius %.0f around (%.0f,%.0f)",
				objective.ID, minX, minY, maxX, maxY, collisionRadius, objective.X, objective.Y)
		}
	}
}

func TestTeamBattleTowerCollidersCoverVisibleFoundations(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	for _, wall := range mapValue.Collisions {
		if wall == nil || wall.Type != "objective" || wall.ColliderRadius <= 0 {
			continue
		}
		// The live tower foundation is wider than its shaft. Keep the
		// authoritative body outside that visible base instead of allowing the
		// hero to stand inside the ring shown in the battle view.
		if wall.ColliderRadius < 34 {
			t.Fatalf("tower collider radius = %.1f, want at least 34 for visible foundation", wall.ColliderRadius)
		}
	}
}

func TestTeamBattleObjectiveCollidersDoNotExpandToWholeTileCells(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)

	for _, objective := range mapValue.Objectives {
		var matches []*geometry.WallTile
		collisionRadius := teamBattleObjectiveCollisionRadius(objective)
		for _, wall := range mapValue.Collisions {
			if wall.Type == "objective" &&
				wall.MinX >= objective.X-collisionRadius && wall.MaxX <= objective.X+collisionRadius &&
				wall.MinY >= objective.Y-collisionRadius && wall.MaxY <= objective.Y+collisionRadius {
				matches = append(matches, wall)
			}
		}
		if len(matches) != 1 {
			t.Fatalf("objective %s has %d exact collision volumes, want 1", objective.ID, len(matches))
		}
		collider := matches[0]
		if math.Abs(collider.MinX-(objective.X-collisionRadius)) > .001 ||
			math.Abs(collider.MaxX-(objective.X+collisionRadius)) > .001 ||
			math.Abs(collider.MinY-(objective.Y-collisionRadius)) > .001 ||
			math.Abs(collider.MaxY-(objective.Y+collisionRadius)) > .001 {
			t.Fatalf("objective %s collider = (%.1f,%.1f)-(%.1f,%.1f), want exact radius %.1f",
				objective.ID, collider.MinX, collider.MinY, collider.MaxX, collider.MaxY, collisionRadius)
		}
	}
}

func TestTeamBattleTowerLeavesAUsableLaneBesideBaseCover(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	var tower *MapObjective
	for index := range mapValue.Objectives {
		if mapValue.Objectives[index].ID == "blue-tower-east" {
			tower = &mapValue.Objectives[index]
			break
		}
	}
	if tower == nil {
		t.Fatal("blue tower was not generated")
	}

	var towerCollider *geometry.WallTile
	for _, wall := range mapValue.Collisions {
		if wall.Type == "objective" && tower.X >= wall.MinX && tower.X <= wall.MaxX && tower.Y >= wall.MinY && tower.Y <= wall.MaxY {
			towerCollider = wall
			break
		}
	}
	if towerCollider == nil {
		t.Fatal("blue tower has no collider")
	}
	if towerCollider.ColliderRadius <= 0 {
		t.Fatal("blue tower collider must follow the round tower footprint")
	}

	// This is the narrow lane beside the eastern tower. A 16 px hero needs
	// 32 px for its body; keep a small eight-pixel control margin too.
	const heroDiameterWithMargin = 40.0
	nearestCoverMaxX := -math.MaxFloat64
	for _, wall := range mapValue.Collisions {
		if wall.Type != teamBattleCityObjectCollisionType || wall.MaxX >= towerCollider.MinX || wall.MaxY < towerCollider.MinY || wall.MinY > towerCollider.MaxY {
			continue
		}
		nearestCoverMaxX = math.Max(nearestCoverMaxX, wall.MaxX)
	}
	if nearestCoverMaxX == -math.MaxFloat64 {
		t.Fatal("blue tower lane has no adjacent base cover")
	}
	if gap := towerCollider.MinX - nearestCoverMaxX; gap < heroDiameterWithMargin {
		t.Fatalf("tower lane is only %.1f px wide, want at least %.1f px", gap, heroDiameterWithMargin)
	}
}

func TestTeamBattleKeepsDiagonalLaneOpenBetweenTownHallAndTower(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	var hall, tower MapObjective
	for _, objective := range mapValue.Objectives {
		if objective.ID == "blue-town-hall" {
			hall = objective
		}
		if objective.ID == "blue-tower-west" {
			tower = objective
		}
	}

	walls := geometry.NewSpatialHash(40)
	for _, wall := range mapValue.Collisions {
		if wall.Type == "objective" &&
			((wall.MinX < hall.X && wall.MaxX > hall.X && wall.MinY < hall.Y && wall.MaxY > hall.Y) ||
				(wall.MinX < tower.X && wall.MaxX > tower.X && wall.MinY < tower.Y && wall.MaxY > tower.Y)) {
			walls.Insert(wall)
		}
	}

	hallCornerX := hall.X + teamBattleObjectiveCollisionRadius(hall)
	hallCornerY := hall.Y - teamBattleObjectiveCollisionRadius(hall)
	towerCornerX := tower.X - teamBattleObjectiveCollisionRadius(tower)
	towerCornerY := tower.Y + teamBattleObjectiveCollisionRadius(tower)
	body := &geometry.CircleBody{
		X:      (hallCornerX + towerCornerX) / 2,
		Y:      (hallCornerY + towerCornerY) / 2,
		Radius: 15,
	}
	if geometry.CollidesCircleWithBlockingWalls(body, walls) {
		t.Fatalf("hero cannot occupy the diagonal hall/tower lane: position=(%.1f,%.1f)", body.X, body.Y)
	}
}

func TestTeamBattleSpawnsAreOutsideAllObjectiveColliders(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	for team, spawners := range mapValue.TeamSpawners {
		for index, spawn := range spawners {
			body := &geometry.CircleBody{X: spawn.CenterX(), Y: spawn.CenterY(), Radius: 16}
			for _, wall := range mapValue.Collisions {
				if wall.Type != "objective" || !geometry.CircleToRectangle(body, &geometry.RectangleBody{
					X: wall.MinX, Y: wall.MinY, Width: wall.MaxX - wall.MinX, Height: wall.MaxY - wall.MinY,
				}) {
					continue
				}
				t.Fatalf("%s spawn %d at (%.0f,%.0f) overlaps objective collider (%.0f,%.0f)-(%.0f,%.0f)",
					team, index, body.X, body.Y, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
			}
		}
	}
}

func TestTeamBattleFortifiesBothBasesWithSemicircularRockWalls(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	fortress := make(map[[2]int]bool)
	for _, wall := range mapValue.Collisions {
		if wall.Type == "fortress_wall" {
			fortress[[2]int{int(wall.MinX / 40), int(wall.MinY / 40)}] = true
		}
	}
	if len(fortress) < 90 {
		t.Fatalf("fortress wall cells = %d, want two substantial base perimeters", len(fortress))
	}
	for cell := range fortress {
		if !fortress[[2]int{cell[1], cell[0]}] {
			t.Fatalf("fortress wall %v has no diagonal twin", cell)
		}
	}
	for _, objective := range mapValue.Objectives {
		cell := [2]int{int(objective.X / 40), int(objective.Y / 40)}
		if fortress[cell] {
			t.Fatalf("%s is inside a blocking fortress wall at %v", objective.ID, cell)
		}
	}
	for _, gate := range [][2]int{{10, 48}, {48, 10}} {
		if fortress[gate] {
			t.Fatalf("front gate at %v is blocked", gate)
		}
	}
	// The old layout exposed square corners at the far north-west and north-east
	// edges. A semicircular enclosure must leave those front corners open while
	// extending the rock arc farther around both sides of each base.
	for _, corner := range [][2]int{{5, 48}, {17, 48}, {48, 5}, {48, 17}} {
		if fortress[corner] {
			t.Fatalf("square fortress corner at %v should be open for a semicircular wall", corner)
		}
	}
	for _, arc := range [][2]int{{2, 58}, {4, 52}, {5, 51}, {6, 50}, {17, 64}, {11, 67}, {58, 2}, {52, 4}, {51, 5}, {50, 6}, {64, 17}, {67, 11}} {
		if !fortress[arc] {
			t.Fatalf("semicircular rock arc is missing at %v", arc)
		}
	}
}

func TestTeamBattleUsesGroupedCoverAndAPassableDiagonalBorder(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	if len(mapValue.Collisions) < 100 {
		t.Fatalf("team map has only %d collision cells, want a dressed arena", len(mapValue.Collisions))
	}
	waterCells := 0
	for _, wall := range mapValue.Collisions {
		if wall.Type == "water" || wall.Type == "pond" {
			waterCells++
		}
	}
	if waterCells < 12 {
		t.Fatalf("water cover = %d cells, want two readable flank pools", waterCells)
	}
	rivers, bridges := 0, 0
	for _, feature := range mapValue.Features {
		if feature.Type == "river" {
			rivers++
		}
		if feature.Type == "river_bridge" {
			bridges++
		}
	}
	if rivers != 1 || bridges != 3 {
		t.Fatalf("river features = %d/%d, want 1 river and 3 bridges", rivers, bridges)
	}
	occupied := make(map[[2]int]bool)
	for _, wall := range mapValue.Collisions {
		if wall.Type == "objective" || wall.Type == teamBattleCityObjectCollisionType {
			continue
		}
		cell := [2]int{int(wall.MinX / 40), int(wall.MinY / 40)}
		occupied[cell] = true
	}
	for cell := range occupied {
		if cell[0] < 2 || cell[1] < 2 || cell[0] > 67 || cell[1] > 67 {
			continue
		}
		neighbours := 0
		for y := -1; y <= 1; y++ {
			for x := -1; x <= 1; x++ {
				if (x != 0 || y != 0) && occupied[[2]int{cell[0] + x, cell[1] + y}] {
					neighbours++
				}
			}
		}
		if neighbours == 0 {
			t.Fatalf("isolated collision cell at %v", cell)
		}
	}
}

func TestTeamBattleRiverClearsPropsAndLeavesOnlyBridgeCrossings(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	openings := [][2]int{{17, 17}, {34, 34}, {52, 52}}
	isRiverCell := func(x, y int) bool {
		designX, designY := float64(x+teamBattleCropTiles), float64(y+teamBattleCropTiles)
		alongRiver := (designX + .5 + designY + .5) * .5
		return alongRiver >= teamBattleRiverStart && alongRiver <= teamBattleRiverMouth &&
			math.Abs((designX+.5)-(designY+.5)-teamBattleRiverCenter) <= teamBattleRiverHalfWidth &&
			math.Hypot(designX+.5-teamBattleIslandCenter, designY+.5-teamBattleIslandCenter) <= teamBattleIslandRadius
	}
	waterCells := 0
	for _, wall := range mapValue.Collisions {
		x, y := int(wall.MinX/40), int(wall.MinY/40)
		if x < 1 || y < 1 || x > 78 || y > 78 || !isRiverCell(x, y) {
			continue
		}
		open := false
		for _, center := range openings {
			if absInt(x-center[0]) <= 1 && absInt(y-center[1]) <= 1 {
				open = true
			}
		}
		if open {
			continue
		}
		if wall.Type != "river" {
			t.Fatalf("river cell (%d,%d) contains %s", x, y, wall.Type)
		}
		waterCells++
	}
	if waterCells < 120 {
		t.Fatalf("river has only %d water cells", waterCells)
	}
	for _, wall := range mapValue.Collisions {
		x, y := int(wall.MinX/40), int(wall.MinY/40)
		if isRiverCell(x, y) && wall.Type == "water" {
			for _, center := range openings {
				if absInt(x-center[0]) <= 1 && absInt(y-center[1]) <= 1 {
					t.Fatalf("bridge crossing blocked at (%d,%d)", x, y)
				}
			}
			continue
		}
	}
}

func TestTeamBattleBridgeDoesNotOpenRiverAlongItsLength(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	river := make(map[[2]int]string)
	cells := make(map[[2]int]string)
	for _, wall := range mapValue.Collisions {
		cell := [2]int{int(wall.MinX / 40), int(wall.MinY / 40)}
		cells[cell] = wall.Type
		if math.Abs((float64(cell[0])+.5)-(float64(cell[1])+.5)-teamBattleRiverCenter) <= teamBattleRiverHalfWidth {
			river[cell] = wall.Type
		}
	}

	for _, cell := range [][2]int{{15, 15}, {19, 19}, {32, 32}, {36, 36}, {50, 50}, {54, 54}} {
		if river[cell] != "river" {
			t.Fatalf("river cell %v was opened beyond the bridge deck: %q", cell, river[cell])
		}
	}
	for _, cell := range [][2]int{{17, 17}, {16, 17}, {17, 16}, {16, 18}, {18, 16}, {34, 34}, {52, 52}} {
		if river[cell] != "river_bridge" {
			t.Fatalf("bridge cell %v = %q, want explicit river_bridge collision", cell, river[cell])
		}
	}
	for _, center := range [][2]int{{17, 17}, {34, 34}, {52, 52}} {
		for distance := -4; distance <= 4; distance++ {
			cell := [2]int{center[0] + distance, center[1] - distance}
			if cells[cell] != "river_bridge" {
				t.Fatalf("bridge approach cell %v = %q, want a continuous passable deck", cell, cells[cell])
			}
		}
	}
	if !geometry.IsBlockingWall("river") {
		t.Fatal("river collision must block movement")
	}
	if geometry.IsBlockingWall("river_bridge") {
		t.Fatal("river_bridge collision must allow movement")
	}
}

func TestTeamBattleRiverReachesTheOceanOnBothSides(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	cells := make(map[[2]int]string)
	for _, wall := range mapValue.Collisions {
		cells[[2]int{int(wall.MinX / 40), int(wall.MinY / 40)}] = wall.Type
	}
	isRiver := func(cell [2]int) bool {
		return cells[cell] == "river" || cells[cell] == "river_bridge"
	}

	for _, cell := range [][2]int{{11, 11}, {13, 13}, {25, 25}, {45, 45}, {59, 59}} {
		if !isRiver(cell) {
			t.Fatalf("river does not reach the playable bank at %v: %q", cell, cells[cell])
		}
	}
	for _, cell := range [][2]int{{8, 8}, {61, 61}, {62, 62}} {
		if isRiver(cell) {
			t.Fatalf("river collision continues into the ocean at %v", cell)
		}
	}
	for coordinate := 11; coordinate <= 59; coordinate++ {
		if !isRiver([2]int{coordinate, coordinate}) {
			t.Fatalf("land bypass remains beside the river at diagonal cell %d", coordinate)
		}
	}
}

func TestTeamBattleRiverFeatureFollowsCroppedCanvas(t *testing.T) {
	const tile = 40.0
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	for _, feature := range mapValue.Features {
		if feature.ID != "team-river" {
			continue
		}
		want := float64(39.5 - teamBattleCropTiles)
		if feature.X/tile != want || feature.Y/tile != want {
			t.Fatalf("river feature = (%.1f, %.1f), want cropped center (%.1f, %.1f)", feature.X/tile, feature.Y/tile, want, want)
		}
		return
	}
	t.Fatal("team-river feature is missing")
}

func TestTeamBattleOnlyBridgesConnectTheTwoRiverBanks(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	type cell struct{ x, y int }
	layout := make(map[cell]string, len(mapValue.Collisions))
	for _, wall := range mapValue.Collisions {
		if wall.Type == "objective" || wall.Type == teamBattleCityObjectCollisionType {
			continue
		}
		layout[cell{int(wall.MinX / 40), int(wall.MinY / 40)}] = wall.Type
	}
	toCell := func(body *geometry.RectangleBody) cell {
		return cell{int(body.X / 40), int(body.Y / 40)}
	}
	blue := make(map[cell]bool)
	red := make(map[cell]bool)
	for _, spawn := range mapValue.TeamSpawners["Blue"] {
		blue[toCell(spawn)] = true
	}
	for _, spawn := range mapValue.TeamSpawners["Red"] {
		red[toCell(spawn)] = true
	}

	reachesOppositeBank := func(bridgesOpen bool) bool {
		queue := make([]cell, 0, len(blue))
		visited := make(map[cell]bool)
		for start := range blue {
			queue = append(queue, start)
			visited[start] = true
		}
		for head := 0; head < len(queue); head++ {
			current := queue[head]
			if red[current] {
				return true
			}
			for _, direction := range [][2]int{{-1, -1}, {0, -1}, {1, -1}, {-1, 0}, {1, 0}, {-1, 1}, {0, 1}, {1, 1}} {
				next := cell{current.x + direction[0], current.y + direction[1]}
				if next.x < 0 || next.y < 0 || next.x >= teamBattleCompactSize || next.y >= teamBattleCompactSize || visited[next] {
					continue
				}
				kind := layout[next]
				if !bridgesOpen && kind == "river_bridge" {
					continue
				}
				if kind != "" && geometry.IsBlockingWall(kind) {
					continue
				}
				visited[next] = true
				queue = append(queue, next)
			}
		}
		return false
	}

	if !reachesOppositeBank(true) {
		t.Fatal("the authored bridge network does not connect the two river banks")
	}
	if reachesOppositeBank(false) {
		t.Fatal("a non-bridge route still connects the two river banks")
	}
}

func TestTeamBattleHasCircularImpassableWaterBoundary(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	type cell struct{ x, y int }
	water := make(map[cell]bool)
	for _, wall := range mapValue.Collisions {
		if wall.Type == "water" {
			water[cell{int(wall.MinX / 40), int(wall.MinY / 40)}] = true
		}
	}
	if len(water) < 600 {
		t.Fatalf("outer water ring has only %d cells, want a visible circular boundary", len(water))
	}
	// Cropping removes the old five-cell empty ring, so the middle of each
	// side now reaches the playable island. The circular shoreline must still
	// close the corners and the outer side arcs.
	for _, edge := range []cell{{0, 0}, {17, 0}, {52, 0}, {69, 0}, {0, 17}, {0, 52}, {69, 17}, {69, 52}, {0, 69}, {17, 69}, {52, 69}, {69, 69}} {
		if !water[edge] {
			t.Fatalf("map edge cell %v is not water", edge)
		}
	}
	for _, land := range []cell{{35, 35}, {11, 58}, {58, 11}} {
		if water[land] {
			t.Fatalf("playable land cell %v was swallowed by the water ring", land)
		}
	}
	for team, spawns := range mapValue.TeamSpawners {
		for index, spawn := range spawns {
			cell := cell{int(spawn.X / 40), int(spawn.Y / 40)}
			if water[cell] {
				t.Fatalf("%s spawn %d is inside outer water at %v", team, index, cell)
			}
		}
	}
}

func TestTeamBattleCompactShorelineIsCenteredAfterCrop(t *testing.T) {
	wantCenter := float64(teamBattleCropTiles) + float64(teamBattleCompactSize)/2
	if teamBattleIslandCenter != wantCenter {
		t.Fatalf("design shoreline center = %.1f, want compact-grid center %.1f after crop", teamBattleIslandCenter, wantCenter)
	}
}

func TestTeamBattleIsDenseAndMirroredAcrossMainDiagonal(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	if len(mapValue.Collisions) < 650 {
		t.Fatalf("team map has only %d collision cells, want a densely dressed arena", len(mapValue.Collisions))
	}

	type cell struct{ x, y int }
	layout := make(map[cell]string, len(mapValue.Collisions))
	for _, wall := range mapValue.Collisions {
		if wall.Type == "objective" || wall.Type == teamBattleCityObjectCollisionType {
			continue
		}
		key := cell{int(wall.MinX / 40), int(wall.MinY / 40)}
		if previous, exists := layout[key]; exists && previous != wall.Type {
			t.Fatalf("cell %v has conflicting types %q and %q", key, previous, wall.Type)
		}
		layout[key] = wall.Type
	}
	for key, kind := range layout {
		mirrored := cell{key.y, key.x}
		if layout[mirrored] != kind {
			t.Fatalf("cell %v (%s) is not mirrored at %v (%s)", key, kind, mirrored, layout[mirrored])
		}
	}

	features := make(map[cell]string, len(mapValue.Features))
	for _, feature := range mapValue.Features {
		key := cell{int(feature.X / 40), int(feature.Y / 40)}
		features[key] = feature.Type
	}
	for key, kind := range features {
		mirrored := cell{key.y, key.x}
		if features[mirrored] != kind {
			t.Fatalf("feature %v (%s) is not mirrored at %v (%s)", key, kind, mirrored, features[mirrored])
		}
	}
}

func TestTeamBattleMirrorsSpawnsAndObjectives(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	blueSpawns, redSpawns := mapValue.TeamSpawners["Blue"], mapValue.TeamSpawners["Red"]
	if len(blueSpawns) != len(redSpawns) {
		t.Fatalf("team spawner counts = blue %d red %d, want equal", len(blueSpawns), len(redSpawns))
	}
	for index, blue := range blueSpawns {
		red := redSpawns[index]
		if blue.X != red.Y || blue.Y != red.X || blue.Width != red.Width || blue.Height != red.Height {
			t.Fatalf("spawner %d is not mirrored: blue=(%.0f,%.0f) red=(%.0f,%.0f)", index, blue.X, blue.Y, red.X, red.Y)
		}
	}

	for _, objective := range mapValue.Objectives {
		if objective.Team != "Blue" {
			continue
		}
		matched := false
		for _, candidate := range mapValue.Objectives {
			if candidate.Team == "Red" && candidate.Type == objective.Type && candidate.X == objective.Y && candidate.Y == objective.X {
				matched = true
				break
			}
		}
		if !matched {
			t.Fatalf("blue objective %s at (%.0f,%.0f) has no mirrored red objective", objective.ID, objective.X, objective.Y)
		}
	}
}

func TestTeamBattleHasFixedMirroredNeutralSpawns(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	if len(mapValue.MonsterSpawns) != 8 {
		t.Fatalf("monster spawns = %d, want 8", len(mapValue.MonsterSpawns))
	}
	for index := 0; index < 2; index++ {
		monster, mirror := mapValue.MonsterSpawns[index], mapValue.MonsterSpawns[index+4]
		if monster.X != mirror.Y || monster.Y != mirror.X {
			t.Fatalf("monster pair %d is not mirrored across main diagonal: (%.0f,%.0f) / (%.0f,%.0f)", index, monster.X, monster.Y, mirror.X, mirror.Y)
		}
	}
	for index, spawn := range mapValue.MonsterSpawns {
		assertTeamSpawnIsPlayable(t, mapValue, spawn.X, spawn.Y, "monster", index)
	}
}

func TestTeamBattleAddsMirroredRuinsVinesAndNearbyBatLairs(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	ruins, vines := 0, 0
	for _, wall := range mapValue.Collisions {
		switch wall.Type {
		case "ruin_wall":
			ruins++
		case "thorn_vine":
			vines++
		}
	}
	if ruins < 24 || vines < 12 {
		t.Fatalf("ruin dressing = %d walls and %d vines, want at least 24/12", ruins, vines)
	}
	for index, spawn := range mapValue.MonsterSpawns {
		nearby := false
		for _, wall := range mapValue.Collisions {
			if wall.Type != "ruin_wall" && wall.Type != "thorn_vine" {
				continue
			}
			cx := (wall.MinX + wall.MaxX) / 2
			cy := (wall.MinY + wall.MaxY) / 2
			if math.Hypot(spawn.X-cx, spawn.Y-cy) <= 8*40 {
				nearby = true
				break
			}
		}
		if !nearby {
			for _, bridge := range [][2]float64{{17.5, 17.5}, {34.5, 34.5}, {52.5, 52.5}} {
				if math.Hypot(spawn.X-bridge[0]*40, spawn.Y-bridge[1]*40) <= 4*40 {
					nearby = true
					break
				}
			}
		}
		if !nearby {
			t.Fatalf("bat spawn %d at (%.0f,%.0f) is not near a ruin lair or central bridge landmark", index, spawn.X, spawn.Y)
		}
	}
}

func TestTeamBattleAddsContinuousThornVinePerimetersAroundRuins(t *testing.T) {
	mapValue := GenerateTeamBattleClassic(CanonicalTeamBattleSeed)
	byCell := make(map[[2]int]string)
	for _, wall := range mapValue.Collisions {
		if wall == nil {
			continue
		}
		byCell[[2]int{int(wall.MinX / 40), int(wall.MinY / 40)}] = wall.Type
	}

	// The published map is cropped by five design cells on every side.
	anchors := [][2]int{{13, 39}, {24, 53}, {38, 62}}
	for _, anchor := range anchors {
		foundRun := false
		for _, y := range []int{anchor[1] - 2, anchor[1] + 2} {
			run := 0
			for x := anchor[0] - 3; x <= anchor[0]+3; x++ {
				if byCell[[2]int{x, y}] == "thorn_vine" {
					run++
					if run >= 5 {
						foundRun = true
						break
					}
				} else {
					run = 0
				}
			}
			if foundRun {
				break
			}
		}
		if !foundRun {
			t.Fatalf("ruin at published cell (%d,%d) has no continuous thorn-vine perimeter run", anchor[0], anchor[1])
		}
	}
}

func TestTeamBattleAddsPassableSlowVineClumps(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	vines := 0
	for _, wall := range mapValue.Collisions {
		if wall == nil || wall.Type != "vine" {
			continue
		}
		vines++
		if geometry.IsBlockingWall(wall.Type) {
			t.Fatalf("large vine clump at (%.0f,%.0f) must be passable", wall.MinX, wall.MinY)
		}
	}
	if vines < 24 {
		t.Fatalf("slow vine cells = %d, want at least 24 cells of mirrored clumps", vines)
	}
}

func TestTeamBattleAddsAbandonedCityDistricts(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	buildingWalls, rubble, buildings, plazas, streets, towers, shrines, details := 0, 0, 0, 0, 0, 0, 0, 0
	features := make(map[[2]int]string)
	for _, wall := range mapValue.Collisions {
		switch wall.Type {
		case "building_wall":
			buildingWalls++
		case "building_rubble":
			rubble++
		}
	}
	for _, feature := range mapValue.Features {
		cell := [2]int{int(feature.X / 40), int(feature.Y / 40)}
		features[cell] = feature.Type
		switch feature.Type {
		case "city_building":
			buildings++
		case "city_plaza":
			plazas++
		case "city_street":
			streets++
		case "city_tower":
			towers++
		case "city_shrine":
			shrines++
		case "city_detail":
			details++
		}
	}
	if buildingWalls < 36 || rubble != 0 {
		t.Fatalf("northern city collision dressing = %d building walls and %d rubble, want at least 36/0", buildingWalls, rubble)
	}
	if buildings < 8 || plazas != 2 || streets != 6 || towers != 2 || shrines != 0 || details != 0 {
		t.Fatalf("city features = buildings %d, plazas %d, streets %d, towers %d, shrines %d, details %d, want at least 8 buildings/2 towers, 2 plazas and 6 streets", buildings, plazas, streets, towers, shrines, details)
	}
	for cell, kind := range features {
		if kind != "city_building" {
			continue
		}
		if features[[2]int{cell[1], cell[0]}] != kind {
			t.Fatalf("city feature %v (%s) has no diagonal twin", cell, kind)
		}
	}
}

func TestNorthernTeamBattleAddsEnterableCastleCompound(t *testing.T) {
	classic := GenerateTeamBattleClassic(CanonicalTeamBattleSeed)
	northern := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	counts := map[string]int{}
	for _, feature := range northern.Features {
		if feature.Type == "castle_keep" || feature.Type == "castle_gate" || feature.Type == "castle_courtyard" || feature.Type == "castle_detail" || feature.Type == "castle_house" || feature.Type == "castle_market" || feature.Type == "castle_street" || feature.Type == "castle_bastion" {
			counts[feature.Type]++
			cell := [2]int{int(feature.X / 40), int(feature.Y / 40)}
			foundTwin := false
			for _, twin := range northern.Features {
				if twin.Type == feature.Type && int(twin.X/40) == cell[1] && int(twin.Y/40) == cell[0] {
					foundTwin = true
					break
				}
			}
			if !foundTwin {
				t.Fatalf("castle feature %s at %v has no diagonal twin", feature.ID, cell)
			}
		}
	}
	if counts["castle_keep"] != 2 || counts["castle_gate"] != 2 || counts["castle_courtyard"] != 2 || counts["castle_house"] != 8 || counts["castle_bastion"] != 0 {
		t.Fatalf("castle building features = %#v, want keep/gate/courtyard/house/bastion 2/2/2/8/0", counts)
	}
	for _, feature := range classic.Features {
		if feature.Type == "castle_keep" || feature.Type == "castle_gate" || feature.Type == "castle_courtyard" || feature.Type == "castle_detail" || feature.Type == "castle_house" || feature.Type == "castle_market" || feature.Type == "castle_street" || feature.Type == "castle_bastion" {
			t.Fatalf("classic map unexpectedly contains castle feature %#v", feature)
		}
	}
	fortressWalls := 0
	for _, wall := range northern.Collisions {
		if wall.Type == "fortress_wall" {
			fortressWalls++
		}
	}
	if fortressWalls < 115 {
		t.Fatalf("castle compound did not add a substantial wall ring: %d fortress cells", fortressWalls)
	}
	// The front gate and the centre of the court must remain enterable.
	for _, cell := range [][2]int{{25, 47}, {25, 44}, {22, 44}, {28, 44}, {47, 25}, {44, 25}} {
		point := &geometry.CircleBody{X: (float64(cell[0]) + .5) * 40, Y: (float64(cell[1]) + .5) * 40, Radius: .1}
		for _, wall := range northern.Collisions {
			if wall == nil || wall.Type == "objective" || !geometry.IsBlockingWall(wall.Type) {
				continue
			}
			if geometry.CollidesCircleWithWall(point, wall) {
				t.Fatalf("castle route cell %v is blocked by %s", cell, wall.Type)
			}
		}
	}
}

func TestNorthernTeamBattleKeepsOnlyCollisionBuildings(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	featureCounts := make(map[string]int)
	for _, feature := range mapValue.Features {
		featureCounts[feature.Type]++
	}

	for _, decorativeType := range []string{
		"city_shrine", "city_detail",
		"castle_detail", "castle_market", "castle_street",
	} {
		if featureCounts[decorativeType] != 0 {
			t.Fatalf("northern map still publishes decorative feature type %q (%d)", decorativeType, featureCounts[decorativeType])
		}
	}

	wanted := map[string]int{
		"city_building":    18,
		"city_tower":       2,
		"castle_keep":      2,
		"castle_gate":      2,
		"castle_courtyard": 2,
		"castle_house":     8,
		"city_dockyard":    2,
		"base_compound":    2,
	}
	for featureType, expected := range wanted {
		if featureCounts[featureType] != expected {
			t.Fatalf("northern building features %q = %d, want %d", featureType, featureCounts[featureType], expected)
		}
	}

	cityObjectCollisions := 0
	for _, wall := range mapValue.Collisions {
		if wall != nil && wall.Type == "city_object" {
			cityObjectCollisions++
		}
	}
	if cityObjectCollisions == 0 {
		t.Fatal("northern building features lost their city_object collisions")
	}
}

func TestNorthernTeamBattlePublishesOneReadableGatePerCastleSide(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	gateCount := 0
	for _, feature := range mapValue.Features {
		if feature.Type == "castle_gate" {
			gateCount++
			if feature.ID == "castle-ashen-ward-gate" {
				if math.Abs(feature.X/40-25) > 0.001 || math.Abs(feature.Y/40-47.8) > 0.001 || math.Abs(feature.Rotation) > 0.001 {
					t.Fatalf("castle gate is not centered in the wall corridor: position=(%.2f,%.2f) rotation=%.3f", feature.X/40, feature.Y/40, feature.Rotation)
				}
			}
		}
		if feature.ID == "castle-ashen-keep-gate" || feature.ID == "castle-ashen-keep-gate-mirror" {
			t.Fatalf("inner keep gate %q crowds the outer ward gate", feature.ID)
		}
	}
	if gateCount != 2 {
		t.Fatalf("castle gate features = %d, want one gate per mirrored castle side", gateCount)
	}
}

func TestTeamBattlePlacesBaseTowersSymmetricallyOnSideCorners(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	positions := map[string][2]float64{}
	for _, objective := range mapValue.Objectives {
		if objective.Type != "tower" {
			continue
		}
		positions[objective.ID] = [2]float64{objective.X / 40, objective.Y / 40}
	}

	// The published map is cropped by five design tiles on each axis.
	if positions["blue-tower-west"] != [2]float64{8.5, 54.5} ||
		positions["blue-tower-east"] != [2]float64{14.5, 62.5} {
		t.Fatalf("blue base towers are not symmetric side corners: west=%v east=%v", positions["blue-tower-west"], positions["blue-tower-east"])
	}
	if positions["red-tower-west"] != [2]float64{54.5, 8.5} ||
		positions["red-tower-east"] != [2]float64{62.5, 14.5} {
		t.Fatalf("red base towers are not the mirrored pair: west=%v east=%v", positions["red-tower-west"], positions["red-tower-east"])
	}
}

func TestTeamBattleAddsLivingMirroredBaseDressing(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	counts := map[string]int{}
	positions := map[[2]int]string{}
	for _, feature := range mapValue.Features {
		if feature.Type != "base_compound" {
			continue
		}
		counts[feature.Type]++
		cell := [2]int{int(feature.X / 40), int(feature.Y / 40)}
		positions[cell] = feature.Type
	}
	if counts["base_compound"] != 2 {
		t.Fatalf("base dressing = %d, want one cohesive compound per team", counts["base_compound"])
	}
	for cell, kind := range positions {
		if positions[[2]int{cell[1], cell[0]}] != kind {
			t.Fatalf("base feature %v (%s) has no diagonal twin", cell, kind)
		}
		blueDistance := math.Hypot(float64(cell[0]-11), float64(cell[1]-58))
		redDistance := math.Hypot(float64(cell[0]-58), float64(cell[1]-11))
		distance := math.Min(blueDistance, redDistance)
		if distance > 1 {
			t.Fatalf("base compound %v (%s) is not centered on the town-hall courtyard: distance %.2f", cell, kind, distance)
		}
	}
}

func TestNorthernTeamBattleRemovesCastleRubbleAndBastions(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	for _, feature := range mapValue.Features {
		if feature.Type == "castle_bastion" {
			t.Fatalf("castle bastion %s should not be generated", feature.ID)
		}
	}
	castleRubbleCells := [][2]int{
		{19, 47}, {31, 47}, {47, 19}, {47, 31},
		{19, 37}, {31, 37}, {37, 19}, {37, 31},
		{21, 48}, {29, 48}, {48, 21}, {48, 29},
		{20, 36}, {30, 36}, {36, 20}, {36, 30},
	}
	for _, wall := range mapValue.Collisions {
		if wall == nil || wall.Type != "building_rubble" {
			continue
		}
		cell := [2]int{int(wall.MinX / 40), int(wall.MinY / 40)}
		for _, castleCell := range castleRubbleCells {
			if cell == castleCell {
				t.Fatalf("castle rubble remains at %v", cell)
			}
		}
	}
}

func TestTeamBattleCityFramesEveryBridgeApproach(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	bridges := [][2]int{{17, 17}, {34, 34}, {52, 52}}
	nearBridge := make(map[[2]int]bool)
	for _, feature := range mapValue.Features {
		if feature.Type != "city_building" && feature.Type != "city_street" && feature.Type != "city_tower" && feature.Type != "city_plaza" {
			continue
		}
		cell := [2]int{int(feature.X / 40), int(feature.Y / 40)}
		for _, bridge := range bridges {
			if math.Hypot(float64(cell[0]-bridge[0]), float64(cell[1]-bridge[1])) <= 14 {
				nearBridge[[2]int{bridge[0], bridge[1]}] = true
			}
		}
	}
	for _, bridge := range bridges {
		if !nearBridge[bridge] {
			t.Fatalf("bridge %v has no city landmark within 14 cells", bridge)
		}
	}
	for _, id := range []string{"city-north-gate", "city-south-ward"} {
		found := false
		for _, feature := range mapValue.Features {
			if feature.ID == id {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing authored city district %q", id)
		}
	}
}

func TestTeamBattleKeepsCastleBastionsOutOfBridgeClearance(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	var bridges []MapFeature
	for _, feature := range mapValue.Features {
		if feature.Type == "river_bridge" {
			bridges = append(bridges, feature)
		}
	}
	for _, feature := range mapValue.Features {
		if feature.Type != "castle_bastion" {
			continue
		}
		for _, bridge := range bridges {
			distance := math.Hypot(feature.X-bridge.X, feature.Y-bridge.Y) / 40
			if distance <= 5 {
				t.Fatalf("castle bastion %s is too close to bridge %s: %.1f tiles", feature.ID, bridge.ID, distance)
			}
		}
	}
}

func TestNorthernTeamBattleKeepsCastleRoadCornersClear(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	for _, cell := range [][2]int{{31, 47}, {47, 31}} {
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type != "building_rubble" {
				continue
			}
			if int(wall.MinX/40) == cell[0] && int(wall.MinY/40) == cell[1] {
				t.Fatalf("castle road corner %v is occupied by brown rubble", cell)
			}
		}
	}
}

func TestNorthernCastleStreetKeepsCentralGateApproachOpen(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	for _, cell := range [][2]int{{25, 47}, {25, 48}, {25, 49}, {25, 50}, {25, 51}} {
		point := &geometry.CircleBody{X: (float64(cell[0]) + .5) * 40, Y: (float64(cell[1]) + .5) * 40, Radius: 14}
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type == "objective" || !geometry.IsBlockingWall(wall.Type) {
				continue
			}
			if geometry.CollidesCircleWithWall(point, wall) {
				t.Fatalf("central castle street cell %v is blocked by %s", cell, wall.Type)
			}
		}
	}
}

func TestTeamBattleCityKeepsDoorsBridgesAndSpawnsPlayable(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	blocking := make(map[[2]int]bool)
	for _, wall := range mapValue.Collisions {
		if wall == nil || !geometry.IsBlockingWall(wall.Type) || wall.Type == "objective" {
			continue
		}
		blocking[[2]int{int(wall.MinX / 40), int(wall.MinY / 40)}] = true
	}
	for _, door := range [][2]int{{7, 47}, {24, 42}, {38, 55}, {47, 7}, {42, 24}, {55, 38}} {
		point := &geometry.CircleBody{X: (float64(door[0]) + .5) * 40, Y: (float64(door[1]) + .5) * 40, Radius: .1}
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type == "objective" || !geometry.IsBlockingWall(wall.Type) {
				continue
			}
			if geometry.CollidesCircleWithWall(point, wall) {
				t.Fatalf("city doorway at %v is blocked by %s bounds=(%.1f,%.1f)-(%.1f,%.1f)", door, wall.Type, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
			}
		}
	}
	for _, bridge := range [][2]int{{17, 17}, {34, 34}, {52, 52}} {
		if blocking[bridge] {
			t.Fatalf("bridge crossing at %v is blocked by city dressing", bridge)
		}
	}
	for team, spawns := range mapValue.TeamSpawners {
		for index, spawn := range spawns {
			if blocking[[2]int{int(spawn.CenterX() / 40), int(spawn.CenterY() / 40)}] {
				t.Fatalf("%s spawn %d overlaps city blocking cell", team, index)
			}
		}
	}
}

func TestTeamBattleCityDistrictCoresStayEnterable(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	for _, core := range [][2]int{{8, 47}, {47, 8}, {25, 42}, {42, 25}, {39, 55}, {55, 39}, {11, 26}, {26, 11}, {44, 59}, {59, 44}} {
		point := &geometry.CircleBody{X: (float64(core[0]) + .5) * 40, Y: (float64(core[1]) + .5) * 40, Radius: .1}
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type == "objective" || !geometry.IsBlockingWall(wall.Type) {
				continue
			}
			if geometry.CollidesCircleWithWall(point, wall) {
				t.Fatalf("city district core %v is sealed by %s bounds=(%.1f,%.1f)-(%.1f,%.1f); expected an enterable fighting courtyard", core, wall.Type, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
			}
		}
	}
}

func TestTeamBattleCityObjectCollidersAreTightAndBlocking(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	count := 0
	for _, wall := range mapValue.Collisions {
		if wall == nil || wall.Type != teamBattleCityObjectCollisionType {
			continue
		}
		count++
		if !geometry.IsBlockingWall(wall.Type) {
			t.Fatalf("city object collider is passable: %+v", wall)
		}
		if wall.MaxX-wall.MinX > 72 || wall.MaxY-wall.MinY > 72 {
			t.Fatalf("city object collider has oversized footprint: %.1fx%.1f", wall.MaxX-wall.MinX, wall.MaxY-wall.MinY)
		}
		if wall.ColliderRadius > 0 && math.Abs((wall.MaxX-wall.MinX)/2-wall.ColliderRadius) > .001 {
			t.Fatalf("city circle collider bounds do not match radius: %+v", wall)
		}
	}
	if count != 294 {
		t.Fatalf("city object colliders = %d, want 294 authored structural building, castle and urban-dressing footprints", count)
	}
}

func TestTeamBattleEveryPhysicalFeatureHasBlockingFootprint(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	features := make(map[string]MapFeature, len(mapValue.Features))
	for _, feature := range mapValue.Features {
		features[feature.ID] = feature
	}

	// Probe the visible ground contact of every remaining feature family that
	// contains a solid gameplay building. Gate centres remain intentionally
	// omitted because they are authored as walkable route space.
	probes := []struct {
		id     string
		localX float64
		localY float64
		label  string
	}{
		{id: "castle-ashen-ward-gate", localX: -1.55, label: "castle gate tower"},
		{id: "city-watchtower", label: "city watchtower"},
	}
	for _, probe := range probes {
		feature, ok := features[probe.id]
		if !ok {
			t.Fatalf("missing physical feature %q", probe.id)
		}
		scale := feature.Scale
		cos, sin := math.Cos(feature.Rotation), math.Sin(feature.Rotation)
		worldX := feature.X + (probe.localX*scale*cos-probe.localY*scale*sin)*40
		worldY := feature.Y + (probe.localX*scale*sin+probe.localY*scale*cos)*40
		body := &geometry.CircleBody{X: worldX, Y: worldY, Radius: .1}
		blocked := false
		for _, wall := range mapValue.Collisions {
			if wall != nil && geometry.IsBlockingWall(wall.Type) && geometry.CollidesCircleWithWall(body, wall) {
				blocked = true
				break
			}
		}
		if !blocked {
			t.Fatalf("%s at (%.0f,%.0f) has no blocking footprint", probe.label, worldX, worldY)
		}
	}
}

func TestTeamBattleVisibleBuildingBodiesAreBlocked(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	features := make(map[string]MapFeature, len(mapValue.Features))
	for _, feature := range mapValue.Features {
		features[feature.ID] = feature
	}

	// These probes sit inside the visible structural mass, not on a roof eave,
	// prop, doorway, market stall, or open courtyard. A player must not be able
	// to walk through the house body and see it as ground.
	probes := []struct {
		featureID string
		localX    float64
		localY    float64
		label     string
	}{
		{featureID: "city-inn", localX: 0, localY: .62, label: "city inn body"},
		{featureID: "city-harbour-row", localX: 0, localY: .42, label: "city harbour row body"},
		{featureID: "castle-ashen-keep", localX: 0, localY: -1.15, label: "castle keep body"},
	}
	for _, probe := range probes {
		feature, ok := features[probe.featureID]
		if !ok {
			t.Fatalf("missing building feature %q", probe.featureID)
		}
		scale := feature.Scale
		cos, sin := math.Cos(feature.Rotation), math.Sin(feature.Rotation)
		worldX := feature.X + (probe.localX*scale*cos-probe.localY*scale*sin)*40
		worldY := feature.Y + (probe.localX*scale*sin+probe.localY*scale*cos)*40
		point := &geometry.CircleBody{X: worldX, Y: worldY, Radius: .1}
		blocked := false
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type != teamBattleCityObjectCollisionType {
				continue
			}
			if geometry.CollidesCircleWithWall(point, wall) {
				blocked = true
				break
			}
		}
		if !blocked {
			t.Fatalf("%s probe at (%.0f,%.0f) is walkable through visible building body", probe.label, worldX, worldY)
		}
	}
}

func TestTeamBattleCityRoofFootprintsAreBlockingWithoutSealingCourtyards(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	for _, roof := range []struct {
		label                   string
		cx, cy, rotation, scale float64
		x, y                    float64
	}{
		{label: "depot roof", cx: 8, cy: 47, rotation: -.08, scale: 1.05, x: -.78, y: .95},
		{label: "apartments roof", cx: 39, cy: 55, rotation: -.18, scale: 1.12, x: -.86, y: .9},
		{label: "forge roof", cx: 44, cy: 59, rotation: .14, scale: .96, x: -.62, y: .52},
	} {
		cos, sin := math.Cos(roof.rotation), math.Sin(roof.rotation)
		worldX := (roof.cx + (roof.x*cos-roof.y*sin)*roof.scale) * 40
		worldY := (roof.cy + (roof.x*sin+roof.y*cos)*roof.scale) * 40
		point := &geometry.CircleBody{X: worldX, Y: worldY, Radius: .1}
		blocked := false
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type != teamBattleCityObjectCollisionType {
				continue
			}
			if geometry.CollidesCircleWithWall(point, wall) {
				blocked = true
				break
			}
		}
		if !blocked {
			t.Fatalf("%s center (%.0f,%.0f) is visually covered but walkable", roof.label, worldX, worldY)
		}
	}
}

func TestNorthernTeamBattleLeavesWideAlternateCastlePassages(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	for _, passage := range []struct {
		label string
		cells [][2]int
	}{
		{label: "outer ward west gate", cells: [][2]int{{15, 42}, {15, 43}, {42, 15}, {43, 15}}},
		{label: "inner keep west gate", cells: [][2]int{{20, 42}, {20, 43}, {42, 20}, {43, 20}}},
	} {
		for _, cell := range passage.cells {
			body := &geometry.CircleBody{X: (float64(cell[0]) + .5) * 40, Y: (float64(cell[1]) + .5) * 40, Radius: 14}
			for _, wall := range mapValue.Collisions {
				if wall == nil || wall.Type == "objective" || !geometry.IsBlockingWall(wall.Type) {
					continue
				}
				if geometry.CollidesCircleWithWall(body, wall) {
					t.Fatalf("%s cell %v is too narrow for a hero: blocked by %s bounds=(%.0f,%.0f)-(%.0f,%.0f)", passage.label, cell, wall.Type, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
				}
			}
		}
	}
}

func TestNorthernTeamBattleLeavesSecondCastleSidePassages(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	for _, cell := range [][2]int{{30, 42}, {30, 43}, {35, 42}, {35, 43}, {42, 30}, {43, 30}, {42, 35}, {43, 35}} {
		body := &geometry.CircleBody{X: (float64(cell[0]) + .5) * 40, Y: (float64(cell[1]) + .5) * 40, Radius: 14}
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type == "objective" || !geometry.IsBlockingWall(wall.Type) {
				continue
			}
			if geometry.CollidesCircleWithWall(body, wall) {
				t.Fatalf("second castle passage cell %v is too narrow for a hero: blocked by %s bounds=(%.0f,%.0f)-(%.0f,%.0f)", cell, wall.Type, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
			}
		}
	}
}

func TestNorthernTeamBattleLeavesWideRubbleBypasses(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	for _, cell := range [][2]int{{21, 48}, {41, 58}, {36, 55}, {8, 24}, {48, 21}, {58, 41}, {55, 36}, {24, 8}} {
		body := &geometry.CircleBody{X: (float64(cell[0]) + .5) * 40, Y: (float64(cell[1]) + .5) * 40, Radius: 14}
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type == "objective" || !geometry.IsBlockingWall(wall.Type) {
				continue
			}
			if geometry.CollidesCircleWithWall(body, wall) {
				t.Fatalf("rubble bypass cell %v is too narrow for a hero: blocked by %s bounds=(%.0f,%.0f)-(%.0f,%.0f)", cell, wall.Type, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
			}
		}
	}
}

func TestNorthernTeamBattleLeavesMoreOuterDistrictBypasses(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	for _, cell := range [][2]int{{5, 45}, {11, 47}, {14, 24}, {41, 53}, {29, 48}, {47, 57}, {45, 5}, {47, 11}, {24, 14}, {53, 41}, {48, 29}, {57, 47}} {
		body := &geometry.CircleBody{X: (float64(cell[0]) + .5) * 40, Y: (float64(cell[1]) + .5) * 40, Radius: 14}
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type == "objective" || !geometry.IsBlockingWall(wall.Type) {
				continue
			}
			if geometry.CollidesCircleWithWall(body, wall) {
				t.Fatalf("district bypass cell %v is too narrow for a hero: blocked by %s bounds=(%.0f,%.0f)-(%.0f,%.0f)", cell, wall.Type, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
			}
		}
	}
}

func TestNorthernTeamBattleLeavesBaseAndBridgeSidePassages(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	for _, cell := range [][2]int{{4, 55}, {5, 55}, {25, 13}, {26, 14}, {29, 40}, {31, 38}, {55, 4}, {55, 5}, {13, 25}, {14, 26}, {40, 29}, {38, 31}} {
		body := &geometry.CircleBody{X: (float64(cell[0]) + .5) * 40, Y: (float64(cell[1]) + .5) * 40, Radius: 14}
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type == "objective" || !geometry.IsBlockingWall(wall.Type) {
				continue
			}
			if geometry.CollidesCircleWithWall(body, wall) {
				t.Fatalf("base/bridge bypass cell %v is too narrow for a hero: blocked by %s bounds=(%.0f,%.0f)-(%.0f,%.0f)", cell, wall.Type, wall.MinX, wall.MinY, wall.MaxX, wall.MaxY)
			}
		}
	}
}

func TestTeamBattleCityLandmarksDoNotOccupyWaterCells(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	for _, feature := range mapValue.Features {
		if feature.Type != "city_plaza" && feature.Type != "city_building" && feature.Type != "city_shrine" && feature.Type != "city_detail" {
			continue
		}
		cell := [2]int{int(feature.X / 40), int(feature.Y / 40)}
		for _, wall := range mapValue.Collisions {
			if wall == nil || int(wall.MinX/40) != cell[0] || int(wall.MinY/40) != cell[1] {
				continue
			}
			if wall.Type == "water" || wall.Type == "river" || wall.Type == "river_bridge" {
				t.Fatalf("city landmark %s at %v overlaps %s collision", feature.ID, cell, wall.Type)
			}
		}
	}
}

func TestTeamBattleDoesNotPlacePropsOrBuildingsOnWater(t *testing.T) {
	allConflicts := []string{}
	for _, variant := range []struct {
		name string
		game *GameMap
	}{
		{name: "classic", game: GenerateTeamBattleClassic(CanonicalTeamBattleSeed)},
		{name: "northern", game: GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)},
	} {
		mapValue := variant.game
		type cell struct{ x, y int }
		conflicts := []string{}
		liquid := make(map[cell]bool)
		for _, wall := range mapValue.Collisions {
			if wall == nil {
				continue
			}
			if wall.Type == "water" || wall.Type == "pond" || wall.Type == "river" {
				liquid[cell{int(wall.MinX / 40), int(wall.MinY / 40)}] = true
			}
		}
		// A pond can be overwritten by a later clearArea call, so reconstruct
		// its authored ellipse from the pond feature as part of the assertion.
		for _, feature := range mapValue.Features {
			if feature.Type != "pond" {
				continue
			}
			cx, cy := int(feature.X/40), int(feature.Y/40)
			mirrorPond := strings.HasSuffix(feature.ID, "-mirror")
			for y := cy - 3; y <= cy+3; y++ {
				for x := cx - 3; x <= cx+3; x++ {
					xRadius, yRadius := 4.1, 2.7
					if mirrorPond {
						xRadius, yRadius = yRadius, xRadius
					}
					dx := float64(x-cx) / xRadius
					dy := float64(y-cy) / yRadius
					if dx*dx+dy*dy <= 1 {
						liquid[cell{x, y}] = true
					}
				}
			}
		}
		for _, wall := range mapValue.Collisions {
			if wall == nil || wall.Type == "water" || wall.Type == "pond" || wall.Type == "river" || wall.Type == "river_bridge" {
				continue
			}
			cell := cell{int(wall.MinX / 40), int(wall.MinY / 40)}
			if liquid[cell] {
				conflicts = append(conflicts, fmt.Sprintf("%s collision=%s@%v", variant.name, wall.Type, cell))
			}
		}
		for _, feature := range mapValue.Features {
			if feature.Type == "pond" || feature.Type == "river" || feature.Type == "river_bridge" {
				continue
			}
			cell := cell{int(feature.X / 40), int(feature.Y / 40)}
			if liquid[cell] {
				conflicts = append(conflicts, fmt.Sprintf("%s feature=%s(%s)@%v", variant.name, feature.Type, feature.ID, cell))
			}
		}
		allConflicts = append(allConflicts, conflicts...)
	}
	if len(allConflicts) > 0 {
		t.Fatalf("liquid placement conflicts: %s", strings.Join(allConflicts, "; "))
	}
}

func TestNorthernTeamBattleKeepsPondsOutsideCastleWardGates(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleNorthernSeed)
	const (
		tile      = 40.0
		pondHalfX = 8.5
		pondHalfY = 6.1
		gateHalfX = 3.5
		gateHalfY = 3.6
	)

	// These are the authored visual bounds in compact map cells. They mirror
	// createPondVisual and createCastleGateVisual: a pond must not be drawn
	// underneath the outer ward gate, even when its collision cells are clear.
	ponds := make([][2]float64, 0, 2)
	gates := make([][2]float64, 0, 2)
	for _, feature := range mapValue.Features {
		position := [2]float64{feature.X / tile, feature.Y / tile}
		switch {
		case feature.Type == "pond":
			ponds = append(ponds, position)
		case strings.HasPrefix(feature.ID, "castle-ashen-ward-gate"):
			gates = append(gates, position)
		}
	}
	for _, pond := range ponds {
		for _, gate := range gates {
			overlapX := math.Abs(pond[0]-gate[0]) < pondHalfX+gateHalfX
			overlapY := math.Abs(pond[1]-gate[1]) < pondHalfY+gateHalfY
			if overlapX && overlapY {
				t.Fatalf("pond at %.1f,%.1f is drawn under castle ward gate at %.1f,%.1f", pond[0], pond[1], gate[0], gate[1])
			}
		}
	}
}

func assertTeamSpawnIsPlayable(t *testing.T, mapValue *GameMap, x, y float64, kind string, index int) {
	for _, wall := range mapValue.Collisions {
		if wall == nil || !geometry.IsBlockingWall(wall.Type) {
			continue
		}
		if x >= wall.MinX && x <= wall.MaxX && y >= wall.MinY && y <= wall.MaxY {
			t.Fatalf("%s spawn %d at (%.0f,%.0f) is inside blocking %s cell", kind, index, x, y, wall.Type)
		}
	}
}

func TestTeamBattleCityObjectCollisionsKeepTheirFeatureOwner(t *testing.T) {
	for _, mapValue := range []*GameMap{
		GenerateTeamBattleClassic(CanonicalTeamBattleSeed),
		GenerateTeamBattle(CanonicalTeamBattleNorthernSeed),
	} {
		features := make(map[string]bool, len(mapValue.Features))
		for _, feature := range mapValue.Features {
			features[feature.ID] = true
		}
		cityObjects := 0
		linkedStructuralCells := 0
		for _, wall := range mapValue.Collisions {
			if wall == nil {
				continue
			}
			if wall.LinkedFeatureID != "" && !features[wall.LinkedFeatureID] {
				t.Fatalf("collision %s has invalid feature owner %q", wall.Type, wall.LinkedFeatureID)
			}
			if wall.Type == teamBattleCityObjectCollisionType {
				cityObjects++
				if wall.LinkedFeatureID == "" {
					t.Fatal("city_object collision has no feature owner")
				}
			}
			if wall.Type == "building_wall" || wall.Type == "building_rubble" {
				if wall.LinkedFeatureID != "" {
					linkedStructuralCells++
				}
			}
		}
		if cityObjects == 0 {
			t.Fatal("team map has no city_object collisions")
		}
		if linkedStructuralCells == 0 {
			t.Fatal("team map has no feature-owned structural cells")
		}
	}
}
