package game

import (
	"battle/model/gamemap"
	"battle/service/geometry"
	"testing"
	"time"
)

func TestDealPlayerDamageRecordsLastContactWithoutACommandID(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("attacker", "Attacker", "Brock Zeus")
	gs.PlayerAdd("target", "Target", "Kaze")
	attacker, target := gs.Players["attacker"], gs.Players["target"]
	attacker.X, attacker.Y = 100, 100
	target.X, target.Y = 160, 180

	if dealt := gs.dealPlayerDamage(attacker, target, 10); dealt != 10 {
		t.Fatalf("dealt damage = %d, want 10", dealt)
	}
	if target.LastContactBy != attacker.PlayerId || target.LastContactAt <= 0 {
		t.Fatalf("last contact = by %q at %d, want attacker and timestamp", target.LastContactBy, target.LastContactAt)
	}
	if target.LastContactX != target.X || target.LastContactY != target.Y {
		t.Fatalf("last contact position = %.1f,%.1f, want target position %.1f,%.1f", target.LastContactX, target.LastContactY, target.X, target.Y)
	}
	if target.LastContactDirX <= 0 || target.LastContactDirY <= 0 {
		t.Fatalf("last contact direction = %.2f,%.2f, want direction toward target", target.LastContactDirX, target.LastContactDirY)
	}
	if time.Since(time.UnixMilli(target.LastContactAt)) > time.Second {
		t.Fatalf("last contact timestamp is stale: %d", target.LastContactAt)
	}
}

func TestBasicAttackRevealsAConcealedAttackerWithoutChangingOpenFieldReveal(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("attacker", "Attacker", "Needle")
	attacker := gs.Players["attacker"]
	attacker.X, attacker.Y = 120, 120
	gs.Map.Collisions = []*geometry.WallTile{{MinX: 80, MinY: 80, MaxX: 180, MaxY: 180, Type: "bush", BushGroup: 1}}
	attacker.StealthUntil = 5_000

	gs.playerShoot("attacker", 1_000, 0)
	if attacker.StealthUntil != 0 {
		t.Fatalf("attack did not end stealth: %d", attacker.StealthUntil)
	}
	if attacker.RevealedUntil != 2_200 {
		t.Fatalf("bush attack reveal until = %d, want 2200", attacker.RevealedUntil)
	}

	attacker.X, attacker.Y = 300, 300
	attacker.RevealedUntil = 0
	gs.playerShoot("attacker", 2_000, 0)
	if attacker.RevealedUntil != 4_000 {
		t.Fatalf("open-field reveal until = %d, want 4000", attacker.RevealedUntil)
	}
}

func TestMicoSuperUsesAnAimableShortLeapAndStopsAtBlockingCover(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(float64(TileSize))
	gs.WallsSource = gs.Map.Collisions
	gs.PlayerAdd("mico", "Mico", "Wukong Mico")
	mico := gs.Players["mico"]
	mico.X, mico.Y = 100, 300
	now := time.Now().UnixMilli()
	gs.clockNow = func() int64 { return now + 250 }
	WukongMicoKit{}.Super(gs, mico, now, 0, 240)
	gs.updateNewHeroSystems()
	if mico.X <= 100 {
		t.Fatalf("Mico did not leap toward the aimed direction: x=%.1f", mico.X)
	}

	gs.Map.Collisions = []*geometry.WallTile{{MinX: 145, MinY: 240, MaxX: 175, MaxY: 360, Type: "stone"}}
	gs.Walls = geometry.NewSpatialHash(float64(TileSize))
	gs.Walls.Insert(gs.Map.Collisions[0])
	gs.WallsSource = gs.Map.Collisions
	mico.X, mico.Y = 100, 300
	nextCast := now + 500
	gs.clockNow = func() int64 { return nextCast + 250 }
	WukongMicoKit{}.Super(gs, mico, nextCast, 0, 240)
	gs.updateNewHeroSystems()
	if mico.X >= 145 {
		t.Fatalf("Mico leap crossed blocking cover: x=%.1f", mico.X)
	}
}
