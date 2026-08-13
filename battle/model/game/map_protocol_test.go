package game

import (
	"battle/model/gamemap"
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
