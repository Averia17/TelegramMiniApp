package gamemap

import (
	"math"
	"testing"
)

func TestBattleRoyaleLoaderUsesCanonicalArena(t *testing.T) {
	loaded, err := LoadMap("battle-royale")
	if err != nil {
		t.Fatalf("load battle royale: %v", err)
	}
	want := GenerateBattleRoyale(CanonicalBattleRoyaleSeed)
	if len(loaded.Collisions) != len(want.Collisions) {
		t.Fatalf("loaded collisions = %d, want canonical %d", len(loaded.Collisions), len(want.Collisions))
	}
	for index := range want.Collisions {
		gotWall, wantWall := loaded.Collisions[index], want.Collisions[index]
		if gotWall.MinX != wantWall.MinX || gotWall.MinY != wantWall.MinY || gotWall.Type != wantWall.Type {
			t.Fatalf("wall %d = %.0f,%.0f,%s; want %.0f,%.0f,%s", index, gotWall.MinX, gotWall.MinY, gotWall.Type, wantWall.MinX, wantWall.MinY, wantWall.Type)
		}
	}
}

func TestGenerateBattleRoyaleProducesPlayableArena(t *testing.T) {
	gameMap := GenerateBattleRoyale(42)
	if gameMap.WidthInPixels != 2400 || gameMap.HeightInPixels != 2400 {
		t.Fatalf("arena size = %.0fx%.0f, want 2400x2400", gameMap.WidthInPixels, gameMap.HeightInPixels)
	}
	if len(gameMap.Spawners) != 8 {
		t.Fatalf("spawners = %d, want 8", len(gameMap.Spawners))
	}
	if len(gameMap.Collisions) == 0 {
		t.Fatal("procedural arena has no obstacles")
	}
	for _, spawn := range gameMap.Spawners {
		if spawn.X <= 0 || spawn.Y <= 0 || spawn.X >= gameMap.WidthInPixels || spawn.Y >= gameMap.HeightInPixels {
			t.Fatalf("spawn outside arena: %.0f,%.0f", spawn.X, spawn.Y)
		}
	}
}

func TestGenerateBattleRoyaleContainsFirstTrialLandmarks(t *testing.T) {
	gameMap := GenerateBattleRoyale(42)
	seen := make(map[string]bool)
	for _, wall := range gameMap.Collisions {
		seen[wall.Type] = true
	}

	for _, required := range []string{
		"water", "tree", "dead_tree", "shipwreck", "bush", "moon_mist",
		"altar_three_moons", "sacrificial_stone", "menhir", "crates",
	} {
		if !seen[required] {
			t.Fatalf("authored landmark type %q is missing", required)
		}
	}
	if len(gameMap.Spawners) != 8 {
		t.Fatalf("landing pads = %d, want 8 paired pads across four zones", len(gameMap.Spawners))
	}
}

func TestGenerateBattleRoyaleUsesPropSizedColliders(t *testing.T) {
	gameMap := GenerateBattleRoyale(42)
	insets := make(map[string][2]float64)
	for _, wall := range gameMap.Collisions {
		insets[wall.Type] = [2]float64{wall.ColliderInsetX, wall.ColliderInsetY}
	}

	if insets["water"] != [2]float64{} || insets["bush"] != [2]float64{} {
		t.Fatalf("terrain/concealment must keep full authored bounds: water=%v bush=%v", insets["water"], insets["bush"])
	}
	if insets["tree"] == [2]float64{} || insets["crates"] == [2]float64{} {
		t.Fatalf("small props must publish inset colliders: tree=%v crates=%v", insets["tree"], insets["crates"])
	}
	if insets["tree"] == insets["crates"] {
		t.Fatalf("different prop sizes must not share one collider profile: tree=%v crates=%v", insets["tree"], insets["crates"])
	}
}

func TestGenerateBattleRoyaleKeepsLandingSpawnersClear(t *testing.T) {
	gameMap := GenerateBattleRoyale(99)
	for _, spawn := range gameMap.Spawners {
		for _, wall := range gameMap.Collisions {
			overlaps := spawn.X < wall.MaxX && spawn.X+spawn.Width > wall.MinX &&
				spawn.Y < wall.MaxY && spawn.Y+spawn.Height > wall.MinY
			if overlaps && wall.Type != "water" {
				t.Fatalf("spawn at %.0f,%.0f overlaps %s wall %.0f,%.0f", spawn.X, spawn.Y, wall.Type, wall.MinX, wall.MinY)
			}
		}
	}
}

func TestGenerateBattleRoyaleUsesDenseNaturalTerrain(t *testing.T) {
	gameMap := GenerateBattleRoyale(42)
	counts := make(map[string]int)
	for _, wall := range gameMap.Collisions {
		counts[wall.Type]++
	}

	if counts["bush"] < 100 {
		t.Fatalf("grass cover = %d tiles, want at least 100", counts["bush"])
	}
	if counts["bush"] >= 700 {
		t.Fatalf("grass cover = %d tiles, want a readable combat map below 700", counts["bush"])
	}
	if counts["water"] < 1350 {
		t.Fatalf("water = %d tiles, want at least 1350", counts["water"])
	}
	blocking := counts["wall"] + counts["destructible"] + counts["full"] +
		counts["tree"] + counts["dead_tree"] + counts["shipwreck"] + counts["menhir"]
	if blocking < 100 {
		t.Fatalf("blocking cover = %d tiles, want at least 100", blocking)
	}

	// A natural map should not be a perfect four-way mirror. Compare the
	// authored cell types against their vertical reflection and require a
	// meaningful amount of asymmetry.
	type cell struct{ x, y int }
	layout := make(map[cell]string)
	for _, wall := range gameMap.Collisions {
		layout[cell{int(wall.MinX / 40), int(wall.MinY / 40)}] = wall.Type
	}
	asymmetry := 0
	for y := 0; y < 60; y++ {
		for x := 0; x < 30; x++ {
			if layout[cell{x, y}] != layout[cell{59 - x, y}] {
				asymmetry++
			}
		}
	}
	if asymmetry < 40 {
		t.Fatalf("layout asymmetry = %d cells, want at least 40", asymmetry)
	}
}

func TestGenerateBattleRoyaleKeepsTreesAbundantAndOutOfTheCentre(t *testing.T) {
	gameMap := GenerateBattleRoyale(42)
	stones := make(map[[2]int]bool)
	for _, wall := range gameMap.Collisions {
		if wall.Type == "wall" || wall.Type == "destructible" || wall.Type == "menhir" || wall.Type == "sacrificial_stone" {
			stones[[2]int{int(wall.MinX / 40), int(wall.MinY / 40)}] = true
		}
	}
	treeCount := 0
	treesBesideStone := 0
	for _, wall := range gameMap.Collisions {
		if wall.Type != "tree" && wall.Type != "dead_tree" {
			continue
		}
		treeCount++
		x := (wall.MinX + wall.MaxX) / 80
		y := (wall.MinY + wall.MaxY) / 80
		if distance := math.Hypot(x-30, y-30); distance < 9 {
			t.Fatalf("tree at %.1f,%.1f is too close to the open centre", x, y)
		}
		cell := [2]int{int(wall.MinX / 40), int(wall.MinY / 40)}
		besideStone := false
		for offsetY := -1; offsetY <= 1; offsetY++ {
			for offsetX := -1; offsetX <= 1; offsetX++ {
				besideStone = besideStone || stones[[2]int{cell[0] + offsetX, cell[1] + offsetY}]
			}
		}
		if besideStone {
			treesBesideStone++
		}
	}
	if treeCount < 38 {
		t.Fatalf("trees = %d, want at least 38 around the rocky outer lanes", treeCount)
	}
	if treesBesideStone < 28 {
		t.Fatalf("trees beside stone = %d of %d, want at least 28 clustered by rocks", treesBesideStone, treeCount)
	}
}

func TestGenerateBattleRoyaleUsesOneLargeReadableInteriorLake(t *testing.T) {
	gameMap := GenerateBattleRoyale(42)
	water := make(map[[2]int]bool)
	for _, wall := range gameMap.Collisions {
		if wall.Type == "water" {
			water[[2]int{int(wall.MinX / 40), int(wall.MinY / 40)}] = true
		}
	}

	interiorLakes := 0
	visited := make(map[[2]int]bool)
	for start := range water {
		if visited[start] {
			continue
		}
		queue := [][2]int{start}
		visited[start] = true
		touchesShore := false
		size := 0
		for len(queue) > 0 {
			cell := queue[0]
			queue = queue[1:]
			size++
			touchesShore = touchesShore || cell[0] <= 1 || cell[1] <= 1 || cell[0] >= 58 || cell[1] >= 58
			for _, offset := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
				next := [2]int{cell[0] + offset[0], cell[1] + offset[1]}
				if water[next] && !visited[next] {
					visited[next] = true
					queue = append(queue, next)
				}
			}
		}
		if touchesShore {
			continue
		}
		interiorLakes++
		if size < 36 {
			t.Fatalf("interior lake has only %d tiles, want one obvious large obstacle", size)
		}
	}
	if interiorLakes != 1 {
		t.Fatalf("interior lakes = %d, want one large readable lake", interiorLakes)
	}
}

func TestGenerateBattleRoyaleHasNoIsolatedProceduralBlockers(t *testing.T) {
	gameMap := GenerateBattleRoyale(42)
	blockers := make(map[[2]int]string)
	for _, wall := range gameMap.Collisions {
		if wall.Type == "wall" || wall.Type == "destructible" || wall.Type == "tree" || wall.Type == "dead_tree" {
			blockers[[2]int{int(wall.MinX / 40), int(wall.MinY / 40)}] = wall.Type
		}
	}
	for cell, kind := range blockers {
		grouped := false
		for offsetY := -1; offsetY <= 1; offsetY++ {
			for offsetX := -1; offsetX <= 1; offsetX++ {
				if offsetX == 0 && offsetY == 0 {
					continue
				}
				_, grouped = blockers[[2]int{cell[0] + offsetX, cell[1] + offsetY}]
				if grouped {
					break
				}
			}
			if grouped {
				break
			}
		}
		if !grouped {
			t.Fatalf("isolated %s blocker at %d,%d", kind, cell[0], cell[1])
		}
	}
}

func TestGenerateBattleRoyaleKeepsEveryLandingZoneConnectedToTheCentre(t *testing.T) {
	gameMap := GenerateBattleRoyale(42)
	blocked := make(map[[2]int]bool)
	for _, wall := range gameMap.Collisions {
		if wall.Type == "bush" || wall.Type == "half" || wall.Type == "moon_mist" {
			continue
		}
		blocked[[2]int{int(wall.MinX / 40), int(wall.MinY / 40)}] = true
	}

	for _, spawn := range gameMap.Spawners {
		start := [2]int{int(spawn.X / 40), int(spawn.Y / 40)}
		queue := [][2]int{start}
		seen := map[[2]int]bool{start: true}
		for len(queue) > 0 {
			cell := queue[0]
			queue = queue[1:]
			for _, delta := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
				next := [2]int{cell[0] + delta[0], cell[1] + delta[1]}
				if next[0] < 0 || next[1] < 0 || next[0] >= 60 || next[1] >= 60 || seen[next] || blocked[next] {
					continue
				}
				seen[next] = true
				queue = append(queue, next)
			}
		}
		if !seen[[2]int{30, 30}] {
			t.Fatalf("landing zone at %d,%d cannot reach the centre", start[0], start[1])
		}
	}
}
