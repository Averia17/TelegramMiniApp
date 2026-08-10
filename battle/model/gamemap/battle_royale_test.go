package gamemap

import "testing"

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
	if counts["water"] < 1450 {
		t.Fatalf("water = %d tiles, want at least 1450", counts["water"])
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
