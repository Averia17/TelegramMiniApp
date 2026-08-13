package game

import (
	"battle/model/gamemap"
	"battle/service/geometry"
	"math"
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
	if hero.Attack.Range != 240 || hero.Attack.HalfArcDegrees != 22.5 || hero.Attack.ProjectileCount != 3 {
		t.Fatalf("Katty attack config = %#v, want three paint projectiles in a 45-degree fan", hero.Attack)
	}
}

func TestKattyBasicSchedulesThreePaintProjectilesAndThirdLayerStuns(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("katty", "Katty", "Katty")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	source, target := gs.Players["katty"], gs.Players["enemy"]
	source.X, source.Y, target.X, target.Y = 400, 400, 520, 400
	now := time.Now().UnixMilli()

	KattyKit{}.Basic(gs, source, now, 0, 0)
	if len(gs.ScheduledShots) != 3 {
		t.Fatalf("scheduled paint shots=%d, want 3", len(gs.ScheduledShots))
	}
	if got := gs.ScheduledShots[1].SpawnAt - gs.ScheduledShots[0].SpawnAt; got != 150 {
		t.Fatalf("paint shot interval=%dms, want 150ms", got)
	}
	if got := gs.ScheduledShots[0].SpawnAt - now; got != 200 {
		t.Fatalf("first shot delay=%dms, want 200ms", got)
	}

	for _, scheduled := range gs.ScheduledShots {
		scheduled.SpawnAt = now - 1
	}
	gs.updateScheduledShots()
	if len(gs.Bullets) != 3 || len(gs.HeroZones) != 0 {
		t.Fatalf("paint bullets=%d zones=%d, want three projectiles and no ground zones", len(gs.Bullets), len(gs.HeroZones))
	}
	for _, shot := range gs.Bullets {
		shot.X, shot.Y = target.X-2, target.Y
		gs.updateBullets()
	}
	if got := target.MaxLives - target.Lives; got != source.AttackDmg*3+int(math.Round(float64(source.AttackDmg)*KattyPaintBonusMultiplier)) {
		t.Fatalf("three-layer paint damage=%d, want base plus %.0f%% bonus", got, KattyPaintBonusMultiplier*100)
	}
	remaining := target.StunUntil - time.Now().UnixMilli()
	if remaining < 500 || remaining > 900 {
		t.Fatalf("third paint layer stun remaining=%dms, want about 800ms", remaining)
	}
}

func TestKattyPaintProjectileDoesNotLeaveASlowSpot(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("katty", "Katty", "Katty")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	katty, enemy := gs.Players["katty"], gs.Players["enemy"]
	katty.X, katty.Y, enemy.X, enemy.Y = 500, 500, 570, 500

	shot := gs.spawnAttackBullet(katty, 0, "katty_paint", katty.AttackDmg, 28*RuntimeProjectileSpeedScale, 7, 240, 0, false, false)
	shot.X, shot.Y = enemy.X-2, enemy.Y
	gs.updateBullets()

	if len(gs.HeroZones) != 0 {
		t.Fatalf("paint projectile left %d hidden slow spots", len(gs.HeroZones))
	}
	if got := gs.kattyPaintStacks(katty.PlayerId, enemy.PlayerId); got != 1 {
		t.Fatalf("paint stacks=%d, want one direct layer", got)
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
