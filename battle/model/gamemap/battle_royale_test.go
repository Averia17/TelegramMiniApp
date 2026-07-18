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
