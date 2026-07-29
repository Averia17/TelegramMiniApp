package game

import (
	"battle/model/gamemap"
	"battle/model/monster"
	"battle/model/player"
	"battle/service/geometry"
	"math"
	"testing"
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
