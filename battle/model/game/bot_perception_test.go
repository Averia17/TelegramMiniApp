package game

import (
	"battle/model/bullet"
	"battle/model/gamemap"
	"battle/model/monster"
	"battle/model/player"
	"battle/model/prop"
	"battle/service/geometry"
	"math"
	"testing"
	"time"
)

func perceptionPlayer(id string, x, y float64) *player.Player {
	return &player.Player{CircleBody: geometry.CircleBody{X: x, Y: y, Radius: 14}, PlayerId: id, Lives: 100, MaxLives: 100}
}

func TestBotCannotSeeDistantPlayerInsideBush(t *testing.T) {
	gs := &GameState{Map: &gamemap.GameMap{Collisions: []*geometry.WallTile{{MinX: 200, MinY: 200, MaxX: 280, MaxY: 280, Type: "bush", BushGroup: 4}}}}
	bot, hidden := perceptionPlayer("bot", 40, 40), perceptionPlayer("hidden", 230, 230)
	if gs.botCanSee(bot, hidden, 10_000) {
		t.Fatal("bot must not read the coordinates of a distant player hidden in grass")
	}
}

func TestBotDoesNotAcquireDistantPlayerFromBattleState(t *testing.T) {
	gs := &GameState{Map: &gamemap.GameMap{}}
	bot := perceptionPlayer("bot", 40, 40)
	target := perceptionPlayer("human", 40+BotVisionRange+1, 40)

	if gs.botCanSee(bot, target, 10_000) {
		t.Fatal("bot must not acquire a distant player merely because battle state contains coordinates")
	}
}

func TestBotCannotSeePlayerThroughBlockingWall(t *testing.T) {
	wall := &geometry.WallTile{MinX: 180, MinY: 0, MaxX: 220, MaxY: 240, Type: "wall"}
	walls := geometry.NewSpatialHash(TileSize)
	walls.Insert(wall)
	gs := &GameState{
		Map:   &gamemap.GameMap{Collisions: []*geometry.WallTile{wall}},
		Walls: walls,
	}

	if gs.botCanSee(perceptionPlayer("bot", 100, 100), perceptionPlayer("human", 300, 100), 10_000) {
		t.Fatal("bot must not see exact player coordinates through a blocking wall")
	}
}

func TestBotCannotTreatMonsterBehindBlockingWallAsThreat(t *testing.T) {
	wall := &geometry.WallTile{MinX: 180, MinY: 0, MaxX: 220, MaxY: 240, Type: "wall"}
	walls := geometry.NewSpatialHash(TileSize)
	walls.Insert(wall)
	gs := &GameState{
		Map:      &gamemap.GameMap{WidthInPixels: 480, HeightInPixels: 480, Collisions: []*geometry.WallTile{wall}},
		Walls:    walls,
		Monsters: map[string]*monster.Monster{},
	}
	threat := monster.NewMonster(300, 100, 16, 480, 480, monster.MonsterLives)
	gs.Monsters["bat"] = threat

	visible, flee := gs.botMonsterThreat(perceptionPlayer("bot", 100, 100))

	if visible != nil || flee {
		t.Fatal("bot must not react to a monster it cannot see through a wall")
	}
}

func TestMeleeBotDoesNotAttackOutsideItsAttackRange(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 480, HeightInPixels: 480}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.GameEndsAt = time.Now().Add(GameDuration + 10*time.Second).UnixMilli()
	gs.PlayerAdd("bot", "Bot", "Kaze")
	gs.PlayerAdd("enemy", "Enemy", "Colt")
	gs.State = GameStateGame
	bot, enemy := gs.Players["bot"], gs.Players["enemy"]
	bot.IsBot = true
	bot.X, bot.Y, bot.Ammo = 100, 100, 1
	bot.LastPrimaryAt = time.Now().UnixMilli()
	enemy.X, enemy.Y = 300, 100

	gs.updateBots()

	if bot.LastShootAt != 0 || bot.AttackPulse != 0 || bot.Ammo != 1 {
		t.Fatalf("melee bot attacked from 200px: lastShoot=%d pulse=%d ammo=%d", bot.LastShootAt, bot.AttackPulse, bot.Ammo)
	}
	if bot.MoveX <= 0 {
		t.Fatalf("melee bot did not close distance: move=(%.2f, %.2f)", bot.MoveX, bot.MoveY)
	}
}

func TestBotRunsTowardStormCenterBeforeEngagingTarget(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.GameEndsAt = time.Now().Add(GameDuration + 10*time.Second).UnixMilli()
	gs.IslandPhase = IslandPhaseCollapse
	gs.StormRadius = 220
	gs.PlayerAdd("bot", "Bot", "Kaze")
	gs.PlayerAdd("enemy", "Enemy", "Colt")
	gs.State = GameStateGame

	bot, enemy := gs.Players["bot"], gs.Players["enemy"]
	bot.IsBot, bot.X, bot.Y = true, 800, 500
	enemy.X, enemy.Y = 900, 500

	gs.updateBots()

	if bot.MoveX >= 0 {
		t.Fatalf("bot did not retreat toward storm center: move=(%.2f, %.2f)", bot.MoveX, bot.MoveY)
	}
}

func TestBotInsideStormSafetyMarginKeepsCombatBehavior(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.GameEndsAt = time.Now().Add(GameDuration + 10*time.Second).UnixMilli()
	gs.IslandPhase = IslandPhaseCollapse
	gs.StormRadius = 500
	gs.PlayerAdd("bot", "Bot", "Kaze")
	gs.PlayerAdd("enemy", "Enemy", "Colt")
	gs.State = GameStateGame

	bot, enemy := gs.Players["bot"], gs.Players["enemy"]
	bot.IsBot, bot.X, bot.Y, bot.Ammo = true, 550, 500, 1
	enemy.X, enemy.Y = 650, 500

	gs.updateBots()

	if bot.MoveX <= 0 {
		t.Fatalf("bot abandoned a visible target inside storm safety margin: move=(%.2f, %.2f)", bot.MoveX, bot.MoveY)
	}
}

func TestBotPrioritizesRecentlyAttackingTargetOverWoundedTarget(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Colt")
	gs.PlayerAdd("wounded", "Wounded", "Shelly")
	gs.PlayerAdd("attacker", "Attacker", "Shelly")

	bot := gs.Players["bot"]
	bot.X, bot.Y = 100, 100
	wounded := gs.Players["wounded"]
	wounded.X, wounded.Y, wounded.Lives, wounded.MaxLives = 250, 100, 10, 100
	attacker := gs.Players["attacker"]
	attacker.X, attacker.Y = 180, 100
	attacker.LastShootAt = time.Now().UnixMilli()

	target := gs.botSelectTarget(bot, time.Now().UnixMilli())
	if target == nil || target.id != "attacker" {
		t.Fatalf("bot chose %q instead of the recently attacking target", targetID(target))
	}
}

func targetID(target *botTarget) string {
	if target == nil {
		return ""
	}
	return target.id
}

func TestWoundedBotKitesHealthyPlayerTarget(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.GameEndsAt = time.Now().Add(GameDuration + 10*time.Second).UnixMilli()
	gs.State = GameStateGame
	gs.PlayerAdd("bot", "Bot", "Kaze")
	gs.PlayerAdd("enemy", "Enemy", "Colt")

	bot, enemy := gs.Players["bot"], gs.Players["enemy"]
	bot.IsBot, bot.X, bot.Y, bot.Lives = true, 100, 100, 80
	enemy.X, enemy.Y = 180, 100

	gs.updateBots()

	if bot.MoveX >= 0 {
		t.Fatalf("wounded bot moved into a healthy target: move=(%.2f, %.2f)", bot.MoveX, bot.MoveY)
	}
}

func TestBotLeadsMovingTargetWhenAiming(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.State = GameStateGame
	gs.PlayerAdd("bot", "Bot", "Colt")
	gs.PlayerAdd("enemy", "Enemy", "Shelly")

	bot, enemy := gs.Players["bot"], gs.Players["enemy"]
	bot.X, bot.Y, bot.Ammo = 100, 100, 1
	enemy.X, enemy.Y, enemy.MoveX, enemy.MoveY, enemy.Speed = 300, 100, 0, 1, 100
	target := &botTarget{kind: "player", id: enemy.PlayerId, player: enemy, x: enemy.X, y: enemy.Y, distance: 200}

	gs.botEngageTarget(bot.PlayerId, bot, target, 0, time.Now().UnixMilli())

	if bot.Rotation <= .01 {
		t.Fatalf("bot aimed at current position instead of leading moving target: rotation=%.3f", bot.Rotation)
	}
}

func TestBotDoesNotAbandonNearbyEnemyForPowerPickup(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Kaze")
	gs.PlayerAdd("enemy", "Enemy", "Colt")
	bot, enemy := gs.Players["bot"], gs.Players["enemy"]
	bot.X, bot.Y = 100, 100
	enemy.X, enemy.Y = 180, 100
	pickup := prop.NewProp("power", 100, 300, 12)

	target := gs.botSelectTarget(bot, time.Now().UnixMilli())
	if gs.botShouldCollectPickup(bot, pickup, target) {
		t.Fatalf("bot chose a distant power pickup while an enemy was nearby")
	}
}

func TestBotEngagesVisibleTargetBeforeOpeningCrates(t *testing.T) {
	crate := &geometry.WallTile{MinX: 80, MinY: 260, MaxX: 120, MaxY: 300, Type: "crates"}
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000, Collisions: []*geometry.WallTile{crate}}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.Walls.Insert(crate)
	gs.GameEndsAt = time.Now().Add(GameDuration + 10*time.Second).UnixMilli()
	gs.State = GameStateGame
	gs.PlayerAdd("bot", "Bot", "Colt")
	gs.PlayerAdd("enemy", "Enemy", "Shelly")
	bot, enemy := gs.Players["bot"], gs.Players["enemy"]
	bot.IsBot, bot.X, bot.Y = true, 100, 100
	enemy.X, enemy.Y = 180, 100

	gs.updateBots()

	if math.Abs(bot.MoveY) >= .1 {
		t.Fatalf("bot ignored a visible enemy for an opening crate: move=(%.2f, %.2f)", bot.MoveX, bot.MoveY)
	}
}

func TestBotCrateApproachPointStaysOutsideBlockingWall(t *testing.T) {
	crate := &geometry.WallTile{MinX: 300, MinY: 100, MaxX: 340, MaxY: 140, Type: "crates"}
	bot := perceptionPlayer("bot", 260, 120)

	x, y := botWallApproachPoint(bot, crate)

	if x >= crate.MinX-bot.Radius-1 || math.Abs(y-120) > 1 {
		t.Fatalf("crate approach point = (%.1f, %.1f), should be outside left edge", x, y)
	}
}

func TestBotSearchesTheMapWhenNoOpponentIsVisible(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 480, HeightInPixels: 480}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Colt")
	gs.State = GameStateGame
	gs.GameEndsAt = time.Now().Add(GameDuration + 10*time.Second).UnixMilli()
	bot := gs.Players["bot"]
	bot.IsBot, bot.X, bot.Y = true, 100, 100

	gs.updateBots()

	if math.Hypot(bot.MoveX, bot.MoveY) <= .01 {
		t.Fatal("bot stood still despite having no visible target")
	}
}

func TestBotUsesReadyPrimaryAgainstVisibleTarget(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 480, HeightInPixels: 480}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Kaze")
	gs.PlayerAdd("enemy", "Enemy", "Colt")
	gs.State = GameStateGame
	gs.GameEndsAt = time.Now().Add(GameDuration + 10*time.Second).UnixMilli()
	bot, enemy := gs.Players["bot"], gs.Players["enemy"]
	bot.IsBot, bot.X, bot.Y = true, 100, 100
	enemy.X, enemy.Y = 180, 100

	gs.updateBots()

	if bot.SuperPulse != 1 || !bot.LastAbilityOK || math.Abs(bot.AimDistance-80) > .01 {
		t.Fatalf("bot did not use a correctly aimed primary: pulses=%d ok=%v aim=%.1f", bot.SuperPulse, bot.LastAbilityOK, bot.AimDistance)
	}
}

func TestBotAttacksVisibleMonsterWithItsSelectedTarget(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 480, HeightInPixels: 480}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Kaze")
	gs.State = GameStateGame
	gs.GameEndsAt = time.Now().Add(GameDuration + 10*time.Second).UnixMilli()
	bot := gs.Players["bot"]
	bot.IsBot, bot.X, bot.Y, bot.Ammo = true, 100, 100, 1
	bot.LastPrimaryAt = time.Now().UnixMilli()
	bot.GadgetCharges = 0
	monsterTarget := monster.NewMonster(180, 100, 16, 480, 480, monster.MonsterLives)
	gs.Monsters["bat"] = monsterTarget
	before := monsterTarget.Lives

	gs.updateBots()

	if monsterTarget.Lives >= before {
		t.Fatalf("bot did not attack its visible monster target: lives=%d before=%d", monsterTarget.Lives, before)
	}
}

func TestBotPrioritizesProjectileDodgeOverVisibleMonster(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 480, HeightInPixels: 480}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Kaze")
	gs.State = GameStateGame
	gs.GameEndsAt = time.Now().Add(GameDuration + 10*time.Second).UnixMilli()
	bot := gs.Players["bot"]
	bot.IsBot, bot.X, bot.Y, bot.Ammo = true, 100, 100, 1
	bot.LastPrimaryAt = time.Now().UnixMilli()
	gs.Monsters["bat"] = monster.NewMonster(180, 100, 16, 480, 480, monster.MonsterLives)
	shot := bullet.NewBullet("human", "", 0, 100, 5, 0, "#fff")
	shot.Speed = 10
	gs.Bullets = append(gs.Bullets, shot)

	gs.updateBots()

	if math.Abs(bot.MoveX) > .1 || bot.MoveY < .5 {
		t.Fatalf("bot did not sidestep the incoming projectile before engaging: move=(%.2f, %.2f)", bot.MoveX, bot.MoveY)
	}
	if bot.LastShootAt != 0 || bot.Ammo != 1 {
		t.Fatalf("bot attacked while dodging: lastShoot=%d ammo=%d", bot.LastShootAt, bot.Ammo)
	}
}

func TestWoundedBotSelectsVisibleHealthPickup(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 480, HeightInPixels: 480}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	bot := perceptionPlayer("bot", 100, 100)
	bot.Lives, bot.MaxLives = 20, 100
	gs.Props = append(gs.Props, prop.NewProp("potion-red", 180, 100, 12))

	if got := gs.botPickupTarget(bot); got == nil || got.Type != "potion-red" {
		t.Fatalf("wounded bot did not choose visible healing pickup: %#v", got)
	}

	bot.Lives = bot.MaxLives
	if got := gs.botPickupTarget(bot); got != nil {
		t.Fatalf("healthy bot should not reserve healing pickup: %#v", got)
	}
}

func TestBotSeesBushPlayerOnlyWhenCloseSameGroupOrRevealed(t *testing.T) {
	gs := &GameState{Map: &gamemap.GameMap{Collisions: []*geometry.WallTile{
		{MinX: 200, MinY: 200, MaxX: 260, MaxY: 260, Type: "bush", BushGroup: 7},
		{MinX: 280, MinY: 200, MaxX: 340, MaxY: 260, Type: "bush", BushGroup: 7},
	}}}
	hidden := perceptionPlayer("hidden", 220, 220)
	if !gs.botCanSee(perceptionPlayer("same", 300, 220), hidden, 10_000) {
		t.Fatal("bot in the same connected grass must see the target")
	}
	closeBot := perceptionPlayer("close", 150, 220)
	if !gs.botCanSee(closeBot, hidden, 10_000) {
		t.Fatal("bot must discover a hidden target at close range")
	}
	farBot := perceptionPlayer("far", 20, 20)
	hidden.LastShootAt = 9_100
	if !gs.botCanSee(farBot, hidden, 10_000) {
		t.Fatal("attacking from grass must briefly reveal the target")
	}
}

func TestBotMemoryStoresOnlyLastVisiblePosition(t *testing.T) {
	gs := &GameState{BotMemory: make(map[string]*BotPerception)}
	target := perceptionPlayer("human", 310, 420)
	memory := gs.rememberBotTarget("bot-1", target, 5_000)
	target.X, target.Y = 800, 900
	if memory.LastSeenX != 310 || memory.LastSeenY != 420 {
		t.Fatalf("memory followed hidden coordinates: got %.0f,%.0f", memory.LastSeenX, memory.LastSeenY)
	}
	if memory.SearchUntil <= 5_000 {
		t.Fatal("bot must search for a recently lost target")
	}
}

func TestBotNavigationTurnsAlongBlockingWall(t *testing.T) {
	walls := geometry.NewSpatialHash(TileSize)
	walls.Insert(&geometry.WallTile{MinX: 100, MinY: 40, MaxX: 140, MaxY: 180, Type: "wall"})
	gs := &GameState{Walls: walls}
	bot := perceptionPlayer("bot-1", 75, 100)

	dx, dy := gs.navigatedDirection(&bot.CircleBody, 1, 0, bot.PlayerId)

	if math.Abs(dy) < .1 {
		t.Fatalf("bot kept pushing straight into the wall: direction=(%.2f, %.2f)", dx, dy)
	}
	probe := bot.CircleBody
	probe.X += dx * BotNavigationProbe
	probe.Y += dy * BotNavigationProbe
	if geometry.CollidesCircleWithBlockingWalls(&probe, walls) {
		t.Fatalf("chosen avoidance direction is still blocked: direction=(%.2f, %.2f)", dx, dy)
	}
}

func TestBotNavigationPlansAroundLongWallTowardGoal(t *testing.T) {
	wall := &geometry.WallTile{MinX: 160, MinY: 0, MaxX: 200, MaxY: 280, Type: "wall"}
	walls := geometry.NewSpatialHash(TileSize)
	walls.Insert(wall)
	gs := &GameState{
		Map:   &gamemap.GameMap{WidthInPixels: 480, HeightInPixels: 480, Collisions: []*geometry.WallTile{wall}},
		Walls: walls,
	}
	bot := perceptionPlayer("bot-1", 100, 120)

	dx, dy := gs.botTravelDirection(bot.PlayerId, &bot.CircleBody, 360, 120)

	if math.Abs(dy) < .2 {
		t.Fatalf("bot did not commit to a route around the long wall: direction=(%.2f, %.2f)", dx, dy)
	}
	probe := bot.CircleBody
	probe.X += dx * BotNavigationProbe
	probe.Y += dy * BotNavigationProbe
	if geometry.CollidesCircleWithBlockingWalls(&probe, walls) {
		t.Fatalf("first path waypoint intersects the wall: direction=(%.2f, %.2f)", dx, dy)
	}
}

func TestBotFightsAttackingMonsterWhenHealthyAndFleesWhenWounded(t *testing.T) {
	bot := perceptionPlayer("bot-1", 100, 100)
	bot.MaxLives, bot.Lives, bot.Ammo = 6000, 6000, 2
	attacker := monster.NewMonster(180, 100, 16, 500, 500, monster.MonsterLives)
	attacker.State = monster.MonsterChase
	attacker.TargetPlayerId = bot.PlayerId
	gs := &GameState{Monsters: map[string]*monster.Monster{"bat": attacker}}

	target, flee := gs.botMonsterThreat(bot)
	if target != attacker || flee {
		t.Fatal("healthy armed bot should turn and fight a monster chasing it")
	}

	bot.Lives = 1200
	target, flee = gs.botMonsterThreat(bot)
	if target != attacker || !flee {
		t.Fatal("badly wounded bot should retreat from a monster chasing it")
	}
}
