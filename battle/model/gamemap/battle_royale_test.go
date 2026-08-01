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
