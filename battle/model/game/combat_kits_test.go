package game

import (
	"battle/model/player"
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
		"Mandy":      {"cone", 110},
		"Needle":     {"line", 620},
		"Brock Zeus": {"line", 760},
	}
	for hero, expected := range cases {
		kit := CombatKitFor(hero)
		if kit == nil || kit.AimShape() != expected.shape || kit.AttackRange() != expected.reach {
			t.Fatalf("%s kit = %#v, want shape=%s reach=%.0f", hero, kit, expected.shape, expected.reach)
		}
	}
}

func TestTapAutoAimSelectsNearestEnemyInsideAttackRange(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("source", "Source", "Brock Zeus")
	gs.PlayerAdd("near", "Near", "Needle")
	gs.PlayerAdd("far", "Far", "Needle")
	source := gs.Players["source"]
	source.X, source.Y = 700, 700
	gs.Players["near"].X, gs.Players["near"].Y = 850, 700
	gs.Players["far"].X, gs.Players["far"].Y = 700, 1000
	gs.PlayerPushAction(Action{PlayerId: "source", Type: "shoot", Ts: 1_000, Value: &ShootValue{Angle: math.Pi, AutoAim: true}})

	gs.updatePlayers()

	if len(gs.Bullets) != 1 {
		t.Fatalf("auto-aim projectiles = %d, want 1", len(gs.Bullets))
	}
	if centerAngle := gs.Bullets[0].Rotation; math.Abs(centerAngle) > 1e-9 {
		t.Fatalf("auto-aim center angle = %.3f, want nearest enemy at angle 0", centerAngle)
	}
}

func TestTapAutoAimSelectsAnEnemyTowerWhenNoEnemyHeroIsInRange(t *testing.T) {
	gs := newTeamObjectiveState()
	gs.Map.Collisions = nil
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.Monsters = nil
	source := gs.Players["blue"]
	tower := gs.Objectives["red-tower-east"]
	source.X, source.Y, source.Rotation = tower.X-220, tower.Y-80, math.Pi
	gs.Players["red"].X, gs.Players["red"].Y = 3200, 3200
	gs.Players = map[string]*player.Player{"blue": source, "red": gs.Players["red"]}
	before := tower.Lives

	angle, _ := gs.autoAimTarget(source.PlayerId)
	if !gs.hasAutoAimTarget || math.Hypot(gs.autoAimTargetX-tower.X, gs.autoAimTargetY-tower.Y) > 1 {
		t.Fatalf("auto-aim target=(%.1f,%.1f), want enemy tower=(%.1f,%.1f)", gs.autoAimTargetX, gs.autoAimTargetY, tower.X, tower.Y)
	}
	gs.playerShootWithMode(source.PlayerId, 1_000, angle, "tower-auto-aim", true)
	if len(gs.Bullets) != 1 {
		t.Fatalf("auto-aim projectiles=%d, want one projectile toward the tower", len(gs.Bullets))
	}
	for step := 0; step < 80 && tower.Lives == before; step++ {
		gs.updateBullets()
	}
	if tower.Lives >= before {
		t.Fatal("auto-aim projectile did not damage the selected enemy tower")
	}
}

func TestTapAutoAimTurnsMeleeHeroesAroundToHitAnEnemyBehindThem(t *testing.T) {
	for _, hero := range []string{"Mandy", "Kaze", "Wukong Mico"} {
		t.Run(hero, func(t *testing.T) {
			gs := newTestGameState()
			gs.State = GameStateGame
			gs.PlayerAdd("source", "Source", hero)
			gs.PlayerAdd("target", "Target", "Needle")
			source, target := gs.Players["source"], gs.Players["target"]
			source.X, source.Y, source.Rotation = 500, 500, 0
			target.X, target.Y = 500-CombatKitFor(hero).AttackRange(), 500

			gs.PlayerPushAction(Action{PlayerId: "source", Type: "shoot", Ts: 1_000, Value: &ShootValue{Angle: 0, AutoAim: true}})
			gs.updatePlayers()

			if target.Lives == target.MaxLives {
				t.Fatal("enemy behind the attacker was inside melee reach but was not hit")
			}
			if math.Cos(source.Rotation) > -.99 {
				t.Fatalf("attacker rotation = %.3f, want it turned toward the enemy behind", source.Rotation)
			}
		})
	}
}

func TestTapAutoAimUsesMandyFocusedAttackReach(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("source", "Source", "Mandy")
	gs.PlayerAdd("target", "Target", "Needle")
	source, target := gs.Players["source"], gs.Players["target"]
	source.X, source.Y, source.Rotation, source.FocusCharge = 500, 500, 0, 100
	target.X, target.Y = 410, 500

	gs.PlayerPushAction(Action{PlayerId: "source", Type: "shoot", Ts: 1_000, Value: &ShootValue{Angle: 0, AutoAim: true}})
	gs.updatePlayers()

	if target.Lives == target.MaxLives || math.Cos(source.Rotation) > -.99 {
		t.Fatalf("focused Mandy did not turn and hit at extended reach: rotation=%.3f damage=%d", source.Rotation, target.MaxLives-target.Lives)
	}
}

func TestTapAutoAimSelectsOneLumiFlowerProjectileTarget(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.Map.Collisions = nil
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("lumi", "Lumi", "Persephone Lumi")
	gs.PlayerAdd("near", "Near", "Persephone Lumi")
	gs.PlayerAdd("nearby", "Nearby", "Persephone Lumi")
	source := gs.Players["lumi"]
	source.X, source.Y = 400, 400
	gs.Players["near"].X, gs.Players["near"].Y = 500, 400
	// Lumi's projectile resolves against the selected target only; it no longer
	// gets a hidden melee-area splash from auto-aim.
	gs.Players["nearby"].X, gs.Players["nearby"].Y = 500, 480
	gs.PlayerPushAction(Action{PlayerId: "lumi", Type: "shoot", Ts: 1_000, Value: &ShootValue{Angle: math.Pi, AutoAim: true}})

	gs.updatePlayers()
	for step := 0; step < 240; step++ {
		gs.updateBullets()
	}
	if got := gs.Players["near"].MaxLives - gs.Players["near"].Lives; got != source.AttackDmg {
		t.Fatalf("selected target damage = %d, want one attack damage %d", got, source.AttackDmg)
	}
	if got := gs.Players["nearby"].MaxLives - gs.Players["nearby"].Lives; got != 0 {
		t.Fatalf("nearby target took %d projectile splash damage, want 0", got)
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
	gs.Players["near"].X, gs.Players["near"].Y = 500, 400
	gs.Players["nearby"].X, gs.Players["nearby"].Y = 500, 540

	gs.playerShoot("lumi", 1_000, 0)
	for step := 0; step < 240; step++ {
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
	gs.PlayerAdd("source", "Source", "Brock Zeus")
	gs.PlayerAdd("target", "Target", "Needle")
	source, target := gs.Players["source"], gs.Players["target"]
	source.X, source.Y = 1000, 1000
	target.X, target.Y = 1025, 1000

	source.SuperCharge = 0
	source.LastPrimaryAt = time.Now().UnixMilli()
	gs.playerShoot("source", 1_000, 0)
	gs.updateBullets()

	if source.SuperCharge != 0 {
		t.Fatalf("Super charge = %d after PvP damage, want it to remain time-based", source.SuperCharge)
	}
}

func TestMandyFocusExtendsMeleeConeAfterOneSecondStill(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mandy", "Mandy", "Mandy")
	gs.PlayerAdd("target", "Target", "Needle")
	source, target := gs.Players["mandy"], gs.Players["target"]
	source.X, source.Y = 500, 500
	target.X, target.Y = 635, 500 // Outside 110 base reach, inside 148.5 focused reach.
	source.FocusStartedAt = time.Now().Add(-2100 * time.Millisecond).UnixMilli()

	gs.updateMandyFocus()
	gs.playerShoot("mandy", time.Now().UnixMilli(), 0)

	if source.FocusCharge != 0 {
		t.Fatalf("focus charge = %d, want 0 after empowered strike", source.FocusCharge)
	}
	if target.Lives != target.MaxLives-int(math.Round(float64(source.AttackDmg)*MandyFocusedDamageMultiplier)) || target.StunUntil <= time.Now().UnixMilli() {
		t.Fatalf("focused target lives = %d stun=%d", target.Lives, target.StunUntil)
	}

	source.MoveX = 1
	gs.updateMandyFocus()
	if source.FocusCharge != 0 || source.FocusStartedAt != 0 {
		t.Fatalf("moving focus = (%d, %d), want reset", source.FocusCharge, source.FocusStartedAt)
	}
}

func TestMeleeBasicAttacksForgiveFastMovingTargetsAtTheSwingEdge(t *testing.T) {
	cases := []struct {
		hero           string
		reach          float64
		halfArcDegrees float64
	}{
		{hero: "Mandy", reach: 110, halfArcDegrees: 60},
		{hero: "Kaze", reach: 125, halfArcDegrees: 60},
		{hero: "Wukong Mico", reach: 140, halfArcDegrees: 60},
	}

	for _, tc := range cases {
		t.Run(tc.hero, func(t *testing.T) {
			gs := newTestGameState()
			gs.State = GameStateGame
			gs.PlayerAdd("source", tc.hero, tc.hero)
			gs.PlayerAdd("target", "Target", "Needle")
			source, target := gs.Players["source"], gs.Players["target"]
			source.X, source.Y = 500, 500
			targetAngle := (tc.halfArcDegrees + 12) * math.Pi / 180
			target.X = source.X + math.Cos(targetAngle)*tc.reach
			target.Y = source.Y + math.Sin(targetAngle)*tc.reach
			target.MoveX = 1

			CombatKitFor(tc.hero).Basic(gs, source, time.Now().UnixMilli(), 0, tc.reach)

			if target.Lives == target.MaxLives {
				t.Fatal("fast-moving target at the edge of the melee swing was not hit")
			}

			target.Lives = target.MaxLives
			target.MoveX = 0
			CombatKitFor(tc.hero).Basic(gs, source, time.Now().UnixMilli(), 0, tc.reach)
			if target.Lives != target.MaxLives {
				t.Fatalf("stationary target outside the melee swing took %d damage", target.MaxLives-target.Lives)
			}
		})
	}
}

func TestMandyFocusIsSpentAndNextStrikeNeedsAnotherStillWindow(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mandy", "Mandy", "Mandy")
	gs.PlayerAdd("target", "Target", "Needle")
	source, target := gs.Players["mandy"], gs.Players["target"]
	source.X, source.Y = 500, 500
	target.X, target.Y = 635, 500
	source.FocusCharge = 100
	now := time.Now().UnixMilli()

	MandyKit{}.Basic(gs, source, now, 0, 0)
	firstLives := target.Lives
	if source.FocusCharge != 0 {
		t.Fatalf("focus charge after empowered strike=%d, want 0", source.FocusCharge)
	}
	if firstLives >= target.MaxLives {
		t.Fatal("focused strike did not hit the extended range target")
	}

	target.Lives = target.MaxLives
	MandyKit{}.Basic(gs, source, now+1, 0, 0)
	if target.Lives != target.MaxLives {
		t.Fatalf("unfocused follow-up hit target outside base reach for %d damage", target.MaxLives-target.Lives)
	}
}

func TestMandySuperChargeDoesNotUseSuccessfulSwings(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mandy", "Mandy", "Mandy")
	gs.PlayerAdd("target", "Target", "Needle")
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

func TestMandyGadgetCreatesAWindowForAnEmpoweredCounterHit(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mandy", "Mandy", "Mandy")
	gs.PlayerAdd("one", "One", "Needle")
	gs.PlayerAdd("two", "Two", "Needle")
	source := gs.Players["mandy"]
	source.X, source.Y = 500, 500
	gs.Players["one"].X, gs.Players["one"].Y = 565, 485
	gs.Players["two"].X, gs.Players["two"].Y = 570, 515
	now := time.Now().UnixMilli()

	gs.playerAbility("mandy", now, "secondary")
	if source.ChannelUntil != 0 || source.ShieldUntil != now+1800 || !source.GadgetArmed {
		t.Fatalf("gadget channel=%d shield=%d armed=%v", source.ChannelUntil, source.ShieldUntil, source.GadgetArmed)
	}
	if EffectiveMovementSpeed(source, now) != float64(source.Speed) {
		t.Fatalf("Mandy movement speed changed during gadget")
	}
	gs.playerShoot("mandy", now+200, 0)
	if source.GadgetArmed {
		t.Fatalf("counter-hit window was not consumed by the next attack")
	}
	if gs.Players["one"].SlowUntil <= now+200 {
		t.Fatalf("counter-hit did not slow the target")
	}
	gs.updateNewHeroSystems()
}

func TestMandySuperWaitsForWindupThenHitsFullMapRectangleAndBreaksWalls(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mandy", "Mandy", "Mandy")
	gs.PlayerAdd("inside", "Inside", "Needle")
	gs.PlayerAdd("outside", "Outside", "Needle")
	source := gs.Players["mandy"]
	source.X, source.Y, source.Rotation, source.SuperCharge = 300, 300, math.Pi/4, 100
	gs.Players["inside"].X, gs.Players["inside"].Y = 520, 520
	gs.Players["outside"].X, gs.Players["outside"].Y = 520, 650
	wall := &geometry.WallTile{MinX: 430, MinY: 430, MaxX: 470, MaxY: 470, Type: "destructible"}
	gs.Map.Collisions = append(gs.Map.Collisions, wall)
	gs.Walls.Insert(wall)
	now := time.Now().UnixMilli()

	gs.playerAbility("mandy", now, "primary")
	if len(gs.PendingMandySupers) != 1 || source.CastUntil != now+800 {
		t.Fatalf("pending supers=%d castUntil=%d, want one cast ending at %d", len(gs.PendingMandySupers), source.CastUntil, now+800)
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

func TestWallBreakerRemovesOnlyTheNearestDestructibleCellIncludingDeadTree(t *testing.T) {
	gs := newTestGameState()
	near := &geometry.WallTile{MinX: 480, MinY: 480, MaxX: 520, MaxY: 520, Type: "dead_tree"}
	far := &geometry.WallTile{MinX: 540, MinY: 480, MaxX: 580, MaxY: 520, Type: "destructible"}
	solid := &geometry.WallTile{MinX: 600, MinY: 480, MaxX: 640, MaxY: 520, Type: "wall"}
	gs.Map.Collisions = []*geometry.WallTile{near, far, solid}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.Walls.Insert(near)
	gs.Walls.Insert(far)
	gs.Walls.Insert(solid)

	if !gs.destroyNearestWallAt(500, 500, 8) {
		t.Fatal("wall breaker did not remove the touched tree")
	}
	if len(gs.Map.Collisions) != 2 {
		t.Fatalf("remaining collisions=%d, want 2", len(gs.Map.Collisions))
	}
	for _, wall := range gs.Map.Collisions {
		if wall == near {
			t.Fatal("nearest dead_tree was not removed")
		}
	}
	if !geometry.CollidesCircleWithBlockingWalls(&geometry.CircleBody{X: 550, Y: 500, Radius: 4}, gs.Walls) {
		t.Fatal("far destructible wall disappeared with the nearest cell")
	}
}

func TestHeroWindupsDoNotRunLegacyBeamDamage(t *testing.T) {
	for _, hero := range []string{"Mandy", "Brock Zeus"} {
		gs := newTestGameState()
		gs.State = GameStateGame
		gs.PlayerAdd("caster", "Caster", hero)
		gs.PlayerAdd("target", "Target", "Mandy")
		caster, target := gs.Players["caster"], gs.Players["target"]
		caster.X, caster.Y, caster.Rotation = 500, 500, 0
		target.X, target.Y = 650, 500
		now := time.Now().UnixMilli()

		if !CombatKitFor(hero).Super(gs, caster, now, 0, 150) {
			t.Fatalf("%s Super was rejected", hero)
		}
		livesBefore := target.Lives
		gs.updateActiveAbilities()

		if target.Lives != livesBefore {
			t.Fatalf("%s wind-up dealt legacy beam damage: lives=%d, want %d", hero, target.Lives, livesBefore)
		}
		for _, effect := range gs.Effects {
			if effect.Kind == "beam" {
				t.Fatalf("%s wind-up emitted legacy beam effect", hero)
			}
		}
	}
}

func TestMandyCanMoveButCannotAttackDuringSuperWindup(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.Map.Collisions = nil
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("mandy", "Mandy", "Mandy")
	source := gs.Players["mandy"]
	source.X, source.Y = 500, 500
	now := time.Now().UnixMilli()

	MandyKit{}.Super(gs, source, now, 0, 0)
	gs.playerMove(source.PlayerId, now+1, 1, 0)
	gs.updatePlayerMovement(time.Second)

	if source.X <= 500 {
		t.Fatalf("Mandy did not move during Super wind-up: x=%.1f", source.X)
	}
	ammoBefore := source.Ammo
	gs.playerShoot(source.PlayerId, now+2, 0)
	if source.Ammo != ammoBefore {
		t.Fatalf("Mandy attacked during Super wind-up: ammo=%d, want %d", source.Ammo, ammoBefore)
	}

	gs.PendingMandySupers[0].TriggerAt = time.Now().UnixMilli()
	gs.updatePendingMandySupers()
	wave := gs.Effects[len(gs.Effects)-1]
	if wave.Kind != "mandy_super_wave" || math.Abs(wave.X-source.X) > .01 || math.Abs(wave.Y-source.Y) > .01 {
		t.Fatalf("Mandy wave origin=(%.1f,%.1f), want current position=(%.1f,%.1f)", wave.X, wave.Y, source.X, source.Y)
	}
}

func TestMandySuperChargeVisualFollowsHerDuringWindup(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mandy", "Mandy", "Mandy")
	p := gs.Players["mandy"]
	p.X, p.Y = 400, 400
	now := time.Now().UnixMilli()
	MandyKit{}.Super(gs, p, now, 0, 0)
	p.X, p.Y = 520, 460

	gs.updatePendingMandySupers()

	var charge *BattleEffect
	for _, effect := range gs.Effects {
		if effect.Kind == "mandy_super_charge" {
			charge = effect
		}
	}
	if charge == nil || charge.X != p.X || charge.Y != p.Y {
		t.Fatalf("charge=%#v, want it at Mandy=(%.1f,%.1f)", charge, p.X, p.Y)
	}
}
