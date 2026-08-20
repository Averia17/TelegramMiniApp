package game

import (
	"battle/model/gamemap"
	"battle/model/monster"
	"battle/model/prop"
	"battle/service/geometry"
	"testing"
	"time"
)

func TestKattyIsRegisteredWithBalancedCompactStats(t *testing.T) {
	hero := GetHeroByName("Katty")
	if hero == nil {
		t.Fatal("Katty is not registered")
	}
	if hero.MaxLives != 640 || hero.Speed != 14 || hero.AttackDamage != 42 {
		t.Fatalf("Katty stats = health=%d speed=%d damage=%d, want 640/14/42", hero.MaxLives, hero.Speed, hero.AttackDamage)
	}
	if hero.Attack.Range != KattySprayRange || hero.Attack.Archetype != AttackProjectile || hero.Attack.AimShape != "line" || hero.Attack.ProjectileKind != "katty_paint_spray" {
		t.Fatalf("Katty attack config = %#v, want a short paint spray projectile", hero.Attack)
	}
}

func TestKattyBasicSprayCreatesOneShortRangePaintCloudOnHit(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("katty", "Katty", "Katty")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	source, target := gs.Players["katty"], gs.Players["enemy"]
	source.X, source.Y, target.X, target.Y = 400, 400, 520, 400
	now := time.Now().UnixMilli()

	KattyKit{}.Basic(gs, source, now, 0, 0)
	if len(gs.ScheduledShots) != 0 || len(gs.Bullets) != 1 {
		t.Fatalf("scheduled shots=%d bullets=%d, want one immediate spray projectile", len(gs.ScheduledShots), len(gs.Bullets))
	}
	shot := gs.Bullets[0]
	if shot.Kind != "katty_paint_spray" || shot.MaxRange != KattySprayRange {
		t.Fatalf("spray projectile=%#v, want paint spray with range %.0f", shot, KattySprayRange)
	}
	shot.X, shot.Y = target.X-2, target.Y
	gs.updateBullets()
	if got := target.MaxLives - target.Lives; got != source.AttackDmg {
		t.Fatalf("direct spray damage=%d, want %d", got, source.AttackDmg)
	}
	if got := gs.kattyPaintStacks(source.PlayerId, target.PlayerId); got != 1 {
		t.Fatalf("paint stacks=%d, want one direct layer", got)
	}
	if len(gs.HeroZones) != 1 || gs.HeroZones[0].Kind != "katty_paint_cloud" || gs.HeroZones[0].Radius != KattySprayCloudRadius {
		t.Fatalf("paint cloud zones=%#v, want one radius-%.0f cloud", gs.HeroZones, KattySprayCloudRadius)
	}
	if len(gs.DamageZones) != 1 || gs.DamageZones[0].Kind != "katty_paint_cloud" || gs.DamageZones[0].TicksLeft != KattySprayCloudTicks {
		t.Fatalf("paint damage zones=%#v, want %d cloud ticks", gs.DamageZones, KattySprayCloudTicks)
	}

	cloud := gs.HeroZones[0]
	damageZone := gs.DamageZones[0]
	damageZone.NextTickAt = now - 1
	beforeCloudTick := target.Lives
	gs.updateDamageZones()
	if got := beforeCloudTick - target.Lives; got != KattySprayCloudDamage {
		t.Fatalf("cloud tick damage=%d, want %d", got, KattySprayCloudDamage)
	}
	gs.updateNewHeroSystems()
	if target.SlowUntil <= now || target.SlowMultiplier != KattySprayCloudSlow {
		t.Fatalf("cloud slow until=%d multiplier=%.2f, want active slow %.2f", target.SlowUntil, target.SlowMultiplier, KattySprayCloudSlow)
	}

	target.X, target.Y = cloud.X+cloud.Radius+target.Radius+10, cloud.Y
	damageZone.NextTickAt = time.Now().UnixMilli() - 1
	beforeOutsideTick := target.Lives
	gs.updateDamageZones()
	if target.Lives != beforeOutsideTick {
		t.Fatalf("cloud damaged target after leaving zone: lives %d -> %d", beforeOutsideTick, target.Lives)
	}
}

func TestKattyPaintSprayMissDoesNotLeaveACloud(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("katty", "Katty", "Katty")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	katty, enemy := gs.Players["katty"], gs.Players["enemy"]
	katty.X, katty.Y, enemy.X, enemy.Y = 500, 500, 760, 500

	gs.spawnAttackBullet(katty, 0, "katty_paint_spray", katty.AttackDmg, 28*RuntimeProjectileSpeedScale, 10, KattySprayRange, 0, false, false)
	gs.updateBullets()

	if len(gs.HeroZones) != 0 || len(gs.DamageZones) != 0 {
		t.Fatalf("paint spray miss left hero zones=%#v damage zones=%#v", gs.HeroZones, gs.DamageZones)
	}
	if got := gs.kattyPaintStacks(katty.PlayerId, enemy.PlayerId); got != 0 {
		t.Fatalf("paint stacks after miss=%d, want zero", got)
	}
}

func TestKattySuperLandsThenPaintsEachEnemyEnteringThePuddle(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("katty", "Katty", "Katty")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	gs.PlayerAdd("late", "Late", "Needle")
	source, target, late := gs.Players["katty"], gs.Players["enemy"], gs.Players["late"]
	source.X, source.Y, target.X, target.Y, source.SuperCharge = 400, 400, 520, 400, 100
	late.X, late.Y = 900, 900
	now := time.Now().UnixMilli()

	if !(KattyKit{}).Super(gs, source, now, 0, 120) {
		t.Fatal("Katty super was not accepted")
	}
	if target.StunUntil != 0 || target.BlindUntil != 0 {
		t.Fatalf("grenade applied before landing: stun=%d blind=%d", target.StunUntil, target.BlindUntil)
	}
	if len(gs.HeroZones) != 1 || gs.HeroZones[0].Kind != "katty_paint_puddle" || gs.HeroZones[0].Radius != KattySuperRadius {
		t.Fatalf("super zones=%#v, want one radius-220 puddle", gs.HeroZones)
	}
	if got := gs.HeroZones[0].ExpiresAt - now; got != KattySuperDuration.Milliseconds() {
		t.Fatalf("super duration=%dms, want %dms", got, KattySuperDuration.Milliseconds())
	}
	zone := gs.HeroZones[0]
	zone.TriggerAt = time.Now().UnixMilli()
	gs.updateNewHeroSystems()
	if target.StunUntil <= now || target.BlindUntil <= now {
		t.Fatalf("enemy in landed puddle was not painted: stun=%d blind=%d", target.StunUntil, target.BlindUntil)
	}

	late.X, late.Y = zone.X, zone.Y
	gs.updateNewHeroSystems()
	if late.StunUntil <= now || late.BlindUntil <= now {
		t.Fatalf("late entrant was not painted: stun=%d blind=%d", late.StunUntil, late.BlindUntil)
	}
}

func TestKattySuperDealsImpactAndDamageOverTimeToEveryTargetType(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("katty", "Katty", "Katty")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	katty, enemy := gs.Players["katty"], gs.Players["enemy"]
	katty.X, katty.Y, enemy.X, enemy.Y = 400, 400, 620, 400
	gs.Monsters["bat"] = monster.NewMonster(620, 440, 16, gs.Map.WidthInPixels, gs.Map.HeightInPixels, monster.MonsterLives)
	crate := prop.NewLunarCrate(620, 460, "damage")
	gs.Props = append(gs.Props, crate)
	now := time.Now().UnixMilli()

	accepted := (KattyKit{}).Super(gs, katty, now, 0, 220)
	if !accepted {
		t.Fatal("Katty super was not accepted")
	}
	zone := gs.HeroZones[0]
	zone.TriggerAt = now - 1
	enemyBefore := enemy.Lives
	monsterBefore, crateBefore := gs.Monsters["bat"].Lives, crate.Lives

	gs.updateNewHeroSystems()

	if got := enemyBefore - enemy.Lives; got != 83 {
		t.Fatalf("Katty impact dealt %d to enemy, want 83 impact plus paint-break damage", got)
	}
	if got := monsterBefore - gs.Monsters["bat"].Lives; got != 70 {
		t.Fatalf("Katty impact dealt %d to monster, want 70", got)
	}
	if got := crateBefore - crate.Lives; got != 70 {
		t.Fatalf("Katty impact dealt %d to crate, want 70", got)
	}
	if len(gs.DamageZones) != 1 || gs.DamageZones[0].Kind != "katty_paint_puddle" {
		t.Fatalf("puddle damage zones=%#v, want one active puddle damage zone", gs.DamageZones)
	}
	enemyAfterImpact := enemy.Lives
	gs.updateNewHeroSystems()
	if enemy.Lives != enemyAfterImpact {
		t.Fatalf("Katty impact repeated on the next frame: lives %d -> %d", enemyAfterImpact, enemy.Lives)
	}

	damageZone := gs.DamageZones[0]
	damageZone.NextTickAt = time.Now().UnixMilli() - 1
	enemyBefore, monsterBefore, crateBefore = enemy.Lives, gs.Monsters["bat"].Lives, crate.Lives
	gs.updateDamageZones()

	if got := enemyBefore - enemy.Lives; got != 12 {
		t.Fatalf("puddle tick dealt %d to enemy, want 12", got)
	}
	if got := monsterBefore - gs.Monsters["bat"].Lives; got != 12 {
		t.Fatalf("puddle tick dealt %d to monster, want 12", got)
	}
	if got := crateBefore - crate.Lives; got != 12 {
		t.Fatalf("puddle tick dealt %d to crate, want 12", got)
	}
}

func TestKattyGadgetDashesLeavesTrailAndPaintsCrossedEnemy(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("katty", "Katty", "Katty")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	source, target := gs.Players["katty"], gs.Players["enemy"]
	source.X, source.Y, target.X, target.Y = 400, 400, 540, 400
	now := time.Now().UnixMilli()

	if !gs.useNewHeroGadget(source, now) {
		t.Fatal("Katty gadget was not accepted")
	}
	if source.X <= 400 || source.X > 760 {
		t.Fatalf("gadget destination x=%.1f, want a bounded forward dash", source.X)
	}
	if got := gs.kattyPaintStacks(source.PlayerId, target.PlayerId); got != 2 {
		t.Fatalf("paint stacks after crossed enemy=%d, want 2", got)
	}
	if len(gs.HeroZones) != 1 || gs.HeroZones[0].Kind != "katty_paint_trail" {
		t.Fatalf("gadget zones=%#v, want one paint trail", gs.HeroZones)
	}
}

func TestKattyGadgetPhasesThroughWallButNormalMovementDoesNot(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	wall := &geometry.WallTile{MinX: 480, MinY: 320, MaxX: 520, MaxY: 480, Type: "wall"}
	gs.Map = &gamemap.GameMap{WidthInPixels: 1200, HeightInPixels: 800, Collisions: []*geometry.WallTile{wall}}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.Walls.Insert(wall)
	gs.PlayerAdd("katty", "Katty", "Katty")
	source := gs.Players["katty"]
	source.X, source.Y, source.MoveX, source.MoveY, source.Rotation = 400, 400, 1, 0, 0
	for index := 0; index < 10; index++ {
		gs.updatePlayerMovement(100 * time.Millisecond)
	}
	if source.X > wall.MinX-source.Radius+1 {
		t.Fatalf("normal movement crossed wall to x=%.1f", source.X)
	}

	source.X, source.Y, source.MoveX, source.MoveY = 400, 400, 0, 0
	if !gs.useNewHeroGadget(source, time.Now().UnixMilli()) {
		t.Fatal("Katty gadget was not accepted")
	}
	if source.X <= wall.MaxX+source.Radius {
		t.Fatalf("Paint Flight did not phase through wall, x=%.1f", source.X)
	}
}
