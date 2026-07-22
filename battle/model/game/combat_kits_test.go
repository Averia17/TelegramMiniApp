package game

import (
	"battle/service/geometry"
	"math"
	"testing"
	"time"
)

func TestCombatKitPolymorphismAndAimShapes(t *testing.T) {
	cases := map[string]struct {
		shape string
		reach float64
	}{
		"Shelly": {"cone", 430},
		"Colt":   {"line", 650},
		"Barley": {"lob", 620},
	}
	for hero, expected := range cases {
		kit := CombatKitFor(hero)
		if kit == nil || kit.AimShape() != expected.shape || kit.AttackRange() != expected.reach {
			t.Fatalf("%s kit = %#v, want shape=%s reach=%.0f", hero, kit, expected.shape, expected.reach)
		}
	}
}

func TestShellyAttackCreatesFiveIndependentPelletsInThirtyDegreeCone(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("shelly", "Shelly", "Shelly")
	p := gs.Players["shelly"]
	p.X, p.Y = 1200, 1200

	gs.playerShoot("shelly", 1_000, 0)

	if len(gs.Bullets) != 5 {
		t.Fatalf("Shelly pellets = %d, want 5", len(gs.Bullets))
	}
	spread := gs.Bullets[4].Rotation - gs.Bullets[0].Rotation
	if math.Abs(spread-math.Pi/6) > 1e-9 {
		t.Fatalf("Shelly spread = %.4f rad, want %.4f", spread, math.Pi/6)
	}
	for _, pellet := range gs.Bullets {
		if pellet.Kind != "shell" || pellet.HitPlayers == nil {
			t.Fatalf("invalid independent pellet: %#v", pellet)
		}
	}
}

func TestShellySuperKnocksBackAndDestroysDestructibleWalls(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("shelly", "Shelly", "Shelly")
	p := gs.Players["shelly"]
	p.X, p.Y, p.Rotation, p.SuperCharge = 500, 500, 0, 100
	wall := &geometry.WallTile{MinX: 680, MinY: 480, MaxX: 720, MaxY: 520, Type: "destructible"}
	gs.Map.Collisions = append(gs.Map.Collisions, wall)
	gs.Walls.Insert(wall)

	gs.playerAbility("shelly", 10_000, "primary")

	if p.SuperCharge != 0 || len(gs.Bullets) != 9 {
		t.Fatalf("Shelly Super charge=%d pellets=%d, want 0 and 9", p.SuperCharge, len(gs.Bullets))
	}
	for _, shot := range gs.Bullets {
		if !shot.DestroyWalls || shot.Knockback <= 0 {
			t.Fatalf("Super pellet lacks destruction/knockback: %#v", shot)
		}
	}
	for _, candidate := range gs.Map.Collisions {
		if candidate == wall {
			t.Fatal("Shelly Super did not remove destructible wall from navigation grid")
		}
	}
}

func TestColtBurstSpawnsSixDelayedRoundsFromCurrentPosition(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("colt", "Colt", "Colt")
	p := gs.Players["colt"]
	p.X, p.Y = 900, 900
	now := time.Now().UnixMilli()
	ColtKit{}.Basic(gs, p, now-300, 0, 650)
	p.X = 1050 // Colt moved while the burst was being emitted.

	gs.updateScheduledShots()

	if len(gs.Bullets) != 6 || len(gs.ScheduledShots) != 0 {
		t.Fatalf("Colt bullets=%d pending=%d, want 6 and 0", len(gs.Bullets), len(gs.ScheduledShots))
	}
	for _, shot := range gs.Bullets {
		if shot.Kind != "colt_round" || shot.OriginX <= 1050 {
			t.Fatalf("Colt round did not use current moving origin: %#v", shot)
		}
	}
}

func TestBarleyBottleIgnoresWallsAndCreatesTwoTickZone(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("barley", "Barley", "Barley")
	gs.PlayerAdd("target", "Target", "Shelly")
	source, target := gs.Players["barley"], gs.Players["target"]
	source.X, source.Y = 600, 600
	target.X, target.Y = 800, 600
	wall := &geometry.WallTile{MinX: 680, MinY: 560, MaxX: 720, MaxY: 640, Type: "destructible"}
	gs.Map.Collisions = append(gs.Map.Collisions, wall)
	gs.Walls.Insert(wall)
	now := time.Now().UnixMilli()
	BarleyKit{}.Basic(gs, source, now-700, 0, 200)

	gs.updateBullets()
	if len(gs.DamageZones) != 1 || gs.Bullets[0].Active {
		t.Fatalf("Barley landing zones=%d bulletActive=%v, want 1 and false", len(gs.DamageZones), gs.Bullets[0].Active)
	}
	before := target.Lives
	gs.updateDamageZones()
	zone := gs.DamageZones[0]
	zone.NextTickAt = time.Now().UnixMilli()
	gs.updateDamageZones()
	if got := before - target.Lives; got != source.AttackDmg*2 {
		t.Fatalf("Barley zone damage = %d, want two ticks of %d", got, source.AttackDmg)
	}
}

func TestTapAutoAimSelectsNearestEnemyInsideAttackRange(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("shelly", "Shelly", "Shelly")
	gs.PlayerAdd("near", "Near", "Colt")
	gs.PlayerAdd("far", "Far", "Colt")
	source := gs.Players["shelly"]
	source.X, source.Y = 700, 700
	gs.Players["near"].X, gs.Players["near"].Y = 850, 700
	gs.Players["far"].X, gs.Players["far"].Y = 700, 1000
	gs.PlayerPushAction(Action{PlayerId: "shelly", Type: "shoot", Ts: 1_000, Value: &ShootValue{Angle: math.Pi, AutoAim: true}})

	gs.updatePlayers()

	if len(gs.Bullets) != 5 {
		t.Fatalf("auto-aim attack pellets = %d, want 5", len(gs.Bullets))
	}
	if centerAngle := gs.Bullets[2].Rotation; math.Abs(centerAngle) > 1e-9 {
		t.Fatalf("auto-aim center angle = %.3f, want nearest enemy at angle 0", centerAngle)
	}
}

func TestCoreCombatSuperChargeIsProportionalToActualPvPDamage(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("shelly", "Shelly", "Shelly")
	gs.PlayerAdd("target", "Target", "Shelly")
	source, target := gs.Players["shelly"], gs.Players["target"]
	source.X, source.Y = 1000, 1000
	target.X, target.Y = 1025, 1000

	gs.playerShoot("shelly", 1_000, 0)
	gs.updateBullets()

	dealt := target.MaxLives - target.Lives
	wantCharge := dealt / 40
	if source.SuperCharge != wantCharge {
		t.Fatalf("Super charge = %d after %d actual damage, want %d", source.SuperCharge, dealt, wantCharge)
	}
}
