package gamemap

import (
	"battle/service/geometry"
	"math"
	"testing"
)

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

func TestTeamBattleFortifiesBothBasesWithAFrontGate(t *testing.T) {
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
	for _, gate := range [][2]int{{15, 53}, {53, 15}} {
		if fortress[gate] {
			t.Fatalf("front gate at %v is blocked", gate)
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
		if wall.Type == "water" {
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
		cell := [2]int{int(wall.MinX / 40), int(wall.MinY / 40)}
		occupied[cell] = true
	}
	for cell := range occupied {
		if cell[0] < 2 || cell[1] < 2 || cell[0] > 77 || cell[1] > 77 {
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
	openings := [][2]int{{22, 22}, {39, 39}, {57, 57}}
	isRiverCell := func(x, y int) bool {
		return math.Abs((float64(x)+.5)-(float64(y)+.5)-teamBattleRiverCenter) <= teamBattleRiverHalfWidth
	}
	waterCells := 0
	for _, wall := range mapValue.Collisions {
		x, y := int(wall.MinX/40), int(wall.MinY/40)
		if x < 1 || y < 1 || x > 78 || y > 78 || !isRiverCell(x, y) {
			continue
		}
		open := false
		for _, center := range openings {
			if absInt(x-center[0]) <= 2 && absInt(y-center[1]) <= 2 {
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

func TestTeamBattleHasCircularImpassableWaterBoundary(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	type cell struct{ x, y int }
	water := make(map[cell]bool)
	for _, wall := range mapValue.Collisions {
		if wall.Type == "water" {
			water[cell{int(wall.MinX / 40), int(wall.MinY / 40)}] = true
		}
	}
	if len(water) < 700 {
		t.Fatalf("outer water ring has only %d cells, want a visible circular boundary", len(water))
	}
	for _, edge := range []cell{{0, 0}, {40, 0}, {79, 0}, {0, 40}, {79, 40}, {0, 79}, {40, 79}, {79, 79}} {
		if !water[edge] {
			t.Fatalf("map edge cell %v is not water", edge)
		}
	}
	for _, land := range []cell{{40, 40}, {16, 63}, {63, 16}} {
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

func TestTeamBattleIsDenseAndMirroredAcrossMainDiagonal(t *testing.T) {
	mapValue := GenerateTeamBattle(CanonicalTeamBattleSeed)
	if len(mapValue.Collisions) < 650 {
		t.Fatalf("team map has only %d collision cells, want a densely dressed arena", len(mapValue.Collisions))
	}

	type cell struct{ x, y int }
	layout := make(map[cell]string, len(mapValue.Collisions))
	for _, wall := range mapValue.Collisions {
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
	if len(mapValue.PickupSpawns) != 8 {
		t.Fatalf("pickup spawns = %d, want 8", len(mapValue.PickupSpawns))
	}

	centerX, centerY := mapValue.WidthInPixels/2, mapValue.HeightInPixels/2
	for index := 0; index < 4; index++ {
		monster, mirror := mapValue.MonsterSpawns[index], mapValue.MonsterSpawns[index+4]
		if monster.X != mirror.Y || monster.Y != mirror.X {
			t.Fatalf("monster pair %d is not mirrored across main diagonal: (%.0f,%.0f) / (%.0f,%.0f)", index, monster.X, monster.Y, mirror.X, mirror.Y)
		}
		pickup, pickupMirror := mapValue.PickupSpawns[index], mapValue.PickupSpawns[index+4]
		if pickup.Type != "potion-red" || pickupMirror.Type != "potion-red" {
			t.Fatalf("pickup pair %d types = %q / %q, want potion-red", index, pickup.Type, pickupMirror.Type)
		}
		if pickup.X+pickupMirror.X != 2*centerX || pickup.Y+pickupMirror.Y != 2*centerY {
			t.Fatalf("pickup pair %d is not mirrored through map center: (%.0f,%.0f) / (%.0f,%.0f)", index, pickup.X, pickup.Y, pickupMirror.X, pickupMirror.Y)
		}
	}
	for index, spawn := range mapValue.MonsterSpawns {
		assertTeamSpawnIsPlayable(t, mapValue, spawn.X, spawn.Y, "monster", index)
	}
	for index, spawn := range mapValue.PickupSpawns {
		assertTeamSpawnIsPlayable(t, mapValue, spawn.X, spawn.Y, "pickup", index)
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
			t.Fatalf("bat spawn %d at (%.0f,%.0f) is not near a ruin lair", index, spawn.X, spawn.Y)
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
