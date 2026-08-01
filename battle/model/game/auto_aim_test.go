package game

import (
	"battle/model/monster"
	"math"
	"testing"
)

func TestAutoAimFallsBackToTheNearestMonsterWhenNoEnemyHeroIsAvailable(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("source", "Source", "Shadow")
	source := gs.Players["source"]
	source.X, source.Y, source.Rotation = 100, 100, 1.4
	gs.Monsters["bat"] = monster.NewMonster(140, 100, 16, 1024, 768, monster.MonsterLives)

	angle, distance := gs.autoAimTarget("source")

	if math.Abs(worldAngleFromScreen(angle)) > 1e-9 {
		t.Fatalf("monster fallback angle = %.4f, want world angle 0", worldAngleFromScreen(angle))
	}
	if math.Abs(distance-40) > 1e-9 {
		t.Fatalf("monster fallback distance = %.2f, want 40", distance)
	}
}

func TestAutoAimKeepsEnemyHeroesAheadOfNearbyMonsters(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("source", "Source", "Shadow")
	gs.PlayerAdd("enemy", "Enemy", "Colt")
	source, enemy := gs.Players["source"], gs.Players["enemy"]
	source.X, source.Y = 100, 100
	enemy.X, enemy.Y = 300, 100
	gs.Monsters["bat"] = monster.NewMonster(140, 100, 16, 1024, 768, monster.MonsterLives)

	angle, distance := gs.autoAimTarget("source")

	if math.Abs(worldAngleFromScreen(angle)) > 1e-9 || math.Abs(distance-200) > 1e-9 {
		t.Fatalf("hero-priority target = angle %.4f distance %.2f, want angle 0 distance 200", worldAngleFromScreen(angle), distance)
	}
}

func TestAutoAimUsesMovementDirectionOnlyWhenNoEnemyIsInReach(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("source", "Source", "Shadow")
	source := gs.Players["source"]
	source.MoveX, source.MoveY, source.Rotation = 0, 1, 1.4

	angle, distance := gs.autoAimTarget("source")

	if math.Abs(worldAngleFromScreen(angle)-math.Pi/2) > 1e-9 {
		t.Fatalf("movement fallback angle = %.4f, want %.4f", worldAngleFromScreen(angle), math.Pi/2)
	}
	if math.Abs(distance-620) > 1e-9 {
		t.Fatalf("movement fallback distance = %.2f, want 620", distance)
	}
}
