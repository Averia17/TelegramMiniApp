package game

import (
	"battle/model/gamemap"
	"battle/service/geometry"
	"testing"
	"time"
)

func TestKattyIsRegisteredWithBalancedCompactStats(t *testing.T) {
	hero := GetHeroByName("Katty")
	if hero == nil {
		t.Fatal("Katty is not registered")
	}
	if hero.MaxLives != 640 || hero.Speed != 14 || hero.AttackDamage != 34 {
		t.Fatalf("Katty stats = health=%d speed=%d damage=%d, want 640/14/34", hero.MaxLives, hero.Speed, hero.AttackDamage)
	}
	if hero.Attack.Range != 240 || hero.Attack.HalfArcDegrees != 22.5 || hero.Attack.ProjectileCount != 3 {
		t.Fatalf("Katty attack config = %#v, want short 3-shot 45-degree burst", hero.Attack)
	}
}

func TestKattyBasicSchedulesThreePaintConesAndThirdLayerStuns(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("katty", "Katty", "Katty")
	gs.PlayerAdd("enemy", "Enemy", "Shelly")
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

	for shot := 0; shot < 3; shot++ {
		if shot > 0 {
			time.Sleep(155 * time.Millisecond)
		}
		if shot == 0 {
			time.Sleep(205 * time.Millisecond)
		}
		gs.updateScheduledShots()
	}
	remaining := target.StunUntil - time.Now().UnixMilli()
	if remaining < 500 || remaining > 900 {
		t.Fatalf("third paint layer stun remaining=%dms, want about 800ms", remaining)
	}
}

func TestKattySuperAppliesThreeLayersAndLeavesPaintPuddle(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("katty", "Katty", "Katty")
	gs.PlayerAdd("enemy", "Enemy", "Shelly")
	source, target := gs.Players["katty"], gs.Players["enemy"]
	source.X, source.Y, target.X, target.Y, source.SuperCharge = 400, 400, 520, 400, 100
	now := time.Now().UnixMilli()

	if !(KattyKit{}).Super(gs, source, now, 0, 120) {
		t.Fatal("Katty super was not accepted")
	}
	if target.StunUntil != now+800 || target.BlindUntil != now+2500 {
		t.Fatalf("super status stun=%d blind=%d, want %d/%d", target.StunUntil, target.BlindUntil, now+800, now+2500)
	}
	if got := gs.kattyPaintStacks(source.PlayerId, target.PlayerId); got != 0 {
		t.Fatalf("paint stacks after super=%d, want reset after trigger", got)
	}
	if len(gs.HeroZones) != 1 || gs.HeroZones[0].Kind != "katty_paint_puddle" || gs.HeroZones[0].Radius != 200 {
		t.Fatalf("super zones=%#v, want one radius-200 puddle", gs.HeroZones)
	}
}

func TestKattyGadgetDashesLeavesTrailAndPaintsCrossedEnemy(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("katty", "Katty", "Katty")
	gs.PlayerAdd("enemy", "Enemy", "Shelly")
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
