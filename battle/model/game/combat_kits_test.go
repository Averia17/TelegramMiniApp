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

func TestColtSuperSchedulesTwelvePiercingWallBreakingRounds(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("colt", "Colt", "Colt")
	p := gs.Players["colt"]
	p.X, p.Y, p.Rotation, p.SuperCharge = 500, 500, 0, 100
	now := time.Now().UnixMilli()

	gs.playerAbility("colt", now-700, "primary")
	gs.updateScheduledShots()

	if p.SuperCharge != 0 || len(gs.Bullets) != 12 {
		t.Fatalf("Colt Super charge=%d bullets=%d, want 0 and 12", p.SuperCharge, len(gs.Bullets))
	}
	for _, shot := range gs.Bullets {
		if shot.Kind != "colt_super_round" || shot.MaxRange != 850 || shot.Pierce < 1 || !shot.DestroyWalls {
			t.Fatalf("invalid Colt Super round: %#v", shot)
		}
	}
}

func TestBarleySuperThrowsFiveGroupedFourTickPoolsAtAimDistance(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("barley", "Barley", "Barley")
	p := gs.Players["barley"]
	p.X, p.Y, p.Rotation, p.AimDistance, p.SuperCharge = 600, 600, 0, 240, 100
	now := time.Now().UnixMilli()

	gs.playerAbility("barley", now, "primary")

	if p.SuperCharge != 0 || len(gs.Bullets) != 5 {
		t.Fatalf("Barley Super charge=%d bottles=%d, want 0 and 5", p.SuperCharge, len(gs.Bullets))
	}
	group := gs.Bullets[0].ZoneGroup
	for _, bottle := range gs.Bullets {
		if bottle.Kind != "barley_super_bottle" || bottle.ZoneRadius != 70 || bottle.ZoneTicks != 4 || bottle.ZoneGroup == "" || bottle.ZoneGroup != group {
			t.Fatalf("invalid Barley Super bottle: %#v", bottle)
		}
	}
	if distance := math.Hypot(gs.Bullets[0].TargetX-p.X, gs.Bullets[0].TargetY-p.Y); math.Abs(distance-240) > .01 {
		t.Fatalf("Barley Super target distance=%.2f, want 240", distance)
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

func TestTapAutoAimHitsNearbyEnemiesAroundTheSelectedTarget(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.Map.Collisions = nil
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("lumi", "Lumi", "Persephone Lumi")
	gs.PlayerAdd("near", "Near", "Persephone Lumi")
	gs.PlayerAdd("nearby", "Nearby", "Persephone Lumi")
	source := gs.Players["lumi"]
	source.X, source.Y = 400, 400
	gs.Players["near"].X, gs.Players["near"].Y = 600, 400
	// This target is close to the selected target, but outside the projectile's
	// normal hitbox, so auto-aim must supply the forgiving assist radius.
	gs.Players["nearby"].X, gs.Players["nearby"].Y = 600, 440
	gs.PlayerPushAction(Action{PlayerId: "lumi", Type: "shoot", Ts: 1_000, Value: &ShootValue{Angle: math.Pi, AutoAim: true}})

	gs.updatePlayers()
	for index := 0; index < 30; index++ {
		gs.updateBullets()
	}

	if got := gs.Players["near"].MaxLives - gs.Players["near"].Lives; got != source.AttackDmg {
		t.Fatalf("selected target damage = %d, want one attack damage %d", got, source.AttackDmg)
	}
	if got := gs.Players["nearby"].MaxLives - gs.Players["nearby"].Lives; got != source.AttackDmg {
		t.Fatalf("nearby target damage = %d, want one auto-aim area hit %d", got, source.AttackDmg)
	}
}

func TestManualAimDoesNotGainTheAutoAimArea(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.Map.Collisions = nil
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("lumi", "Lumi", "Persephone Lumi")
	gs.PlayerAdd("near", "Near", "Persephone Lumi")
	gs.PlayerAdd("nearby", "Nearby", "Persephone Lumi")
	source := gs.Players["lumi"]
	source.X, source.Y = 400, 400
	gs.Players["near"].X, gs.Players["near"].Y = 600, 400
	gs.Players["nearby"].X, gs.Players["nearby"].Y = 600, 440

	gs.playerShoot("lumi", 1_000, 0)
	for index := 0; index < 30; index++ {
		gs.updateBullets()
	}

	if got := gs.Players["near"].MaxLives - gs.Players["near"].Lives; got != source.AttackDmg {
		t.Fatalf("manually aimed target damage = %d, want %d", got, source.AttackDmg)
	}
	if got := gs.Players["nearby"].MaxLives - gs.Players["nearby"].Lives; got != 0 {
		t.Fatalf("nearby target took %d manual-aim damage, want 0", got)
	}
}

func TestCoreCombatSuperChargeDoesNotUsePvPDamage(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("shelly", "Shelly", "Shelly")
	gs.PlayerAdd("target", "Target", "Shelly")
	source, target := gs.Players["shelly"], gs.Players["target"]
	source.X, source.Y = 1000, 1000
	target.X, target.Y = 1025, 1000

	source.SuperCharge = 0
	source.LastPrimaryAt = time.Now().UnixMilli()
	gs.playerShoot("shelly", 1_000, 0)
	gs.updateBullets()

	if source.SuperCharge != 0 {
		t.Fatalf("Super charge = %d after PvP damage, want it to remain time-based", source.SuperCharge)
	}
}

func TestMandyFocusExtendsMeleeConeAfterOneSecondStill(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mandy", "Mandy", "Mandy")
	gs.PlayerAdd("target", "Target", "Shelly")
	source, target := gs.Players["mandy"], gs.Players["target"]
	source.X, source.Y = 500, 500
	target.X, target.Y = 585, 500 // Outside 70 base reach, inside 94.5 focused reach.
	source.FocusStartedAt = time.Now().Add(-2100 * time.Millisecond).UnixMilli()

	gs.updateMandyFocus()
	gs.playerShoot("mandy", time.Now().UnixMilli(), 0)

	if source.FocusCharge != 100 {
		t.Fatalf("focus charge = %d, want 100", source.FocusCharge)
	}
	if target.Lives != target.MaxLives-int(float64(source.AttackDmg)*1.4) || target.StunUntil <= time.Now().UnixMilli() {
		t.Fatalf("focused target lives = %d stun=%d", target.Lives, target.StunUntil)
	}

	source.MoveX = 1
	gs.updateMandyFocus()
	if source.FocusCharge != 0 || source.FocusStartedAt != 0 {
		t.Fatalf("moving focus = (%d, %d), want reset", source.FocusCharge, source.FocusStartedAt)
	}
}

func TestMandySuperChargeDoesNotUseSuccessfulSwings(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mandy", "Mandy", "Mandy")
	gs.PlayerAdd("target", "Target", "Viper")
	source, target := gs.Players["mandy"], gs.Players["target"]
	source.X, source.Y, target.X, target.Y = 500, 500, 570, 500
	source.SuperCharge = 0
	source.LastPrimaryAt = time.Now().UnixMilli()

	for swing := 0; swing < 4; swing++ {
		gs.playerShoot("mandy", int64(1000+swing*1000), 0)
		source.Ammo = source.MaxAmmo
		target.Lives = target.MaxLives
	}

	if source.SuperCharge != 0 {
		t.Fatalf("Mandy Super charge = %d after four hits, want it to remain time-based", source.SuperCharge)
	}
}

func TestMandyStanceLocksMovementAndSlowsNearbyEnemies(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mandy", "Mandy", "Mandy")
	gs.PlayerAdd("one", "One", "Shelly")
	gs.PlayerAdd("two", "Two", "Shelly")
	source := gs.Players["mandy"]
	source.X, source.Y = 500, 500
	gs.Players["one"].X, gs.Players["one"].Y = 565, 485
	gs.Players["two"].X, gs.Players["two"].Y = 570, 515
	now := time.Now().UnixMilli()

	gs.playerAbility("mandy", now, "secondary")
	if source.ChannelUntil != now+3000 || source.ShieldUntil != now+3000 {
		t.Fatalf("stance channel=%d shield=%d", source.ChannelUntil, source.ShieldUntil)
	}
	gs.updateNewHeroSystems()
	for _, id := range []string{"one", "two"} {
		if gs.Players[id].SlowUntil <= now {
			t.Fatalf("%s was not slowed by stance", id)
		}
	}
}

func TestMandySuperWaits750msThenHitsFullMapRectangleAndBreaksWalls(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mandy", "Mandy", "Mandy")
	gs.PlayerAdd("inside", "Inside", "Viper")
	gs.PlayerAdd("outside", "Outside", "Viper")
	source := gs.Players["mandy"]
	source.X, source.Y, source.Rotation, source.SuperCharge = 300, 300, math.Pi/4, 100
	gs.Players["inside"].X, gs.Players["inside"].Y = 520, 520
	gs.Players["outside"].X, gs.Players["outside"].Y = 520, 650
	wall := &geometry.WallTile{MinX: 430, MinY: 430, MaxX: 470, MaxY: 470, Type: "destructible"}
	gs.Map.Collisions = append(gs.Map.Collisions, wall)
	gs.Walls.Insert(wall)
	now := time.Now().UnixMilli()

	gs.playerAbility("mandy", now, "primary")
	if len(gs.PendingMandySupers) != 1 || source.ChannelUntil != now+1200 {
		t.Fatalf("pending supers=%d channelUntil=%d, want one cast ending at %d", len(gs.PendingMandySupers), source.ChannelUntil, now+1200)
	}
	if gs.Players["inside"].Lives != gs.Players["inside"].MaxLives {
		t.Fatal("Mandy Super dealt damage before its wind-up finished")
	}

	gs.PendingMandySupers[0].TriggerAt = time.Now().UnixMilli()
	gs.updatePendingMandySupers()

	if got := gs.Players["inside"].MaxLives - gs.Players["inside"].Lives; got <= 0 || got > 224 {
		t.Fatalf("inside damage = %d, want between 1 and 224", got)
	}
	if gs.Players["outside"].Lives != gs.Players["outside"].MaxLives {
		t.Fatal("target outside 2.5-tile rectangle was hit")
	}
	for _, candidate := range gs.Map.Collisions {
		if candidate == wall {
			t.Fatal("Mandy Super did not destroy intersecting wall")
		}
	}
}
