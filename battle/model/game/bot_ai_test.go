package game

import (
	"battle/model/monster"
	"battle/model/player"
	"battle/service/geometry"
	"math"
	"testing"
	"time"
)

func TestBotStrategyIsSelectedByMode(t *testing.T) {
	if _, ok := newBotAIStrategy(ModeDeathmatch).(battleRoyaleBotStrategy); !ok {
		t.Fatal("deathmatch must use the battle royale strategy")
	}
	if _, ok := newBotAIStrategy(ModeTeamDeathmatch).(*teamBattleBotStrategy); !ok {
		t.Fatal("team deathmatch must use the team strategy")
	}
}

func TestTeamBotDefendsObjectiveUnderAttack(t *testing.T) {
	state := &GameState{Players: map[string]*player.Player{}, Objectives: map[string]*ObjectiveState{}}
	bot := &player.Player{CircleBody: geometry.CircleBody{X: 120, Y: 120}, PlayerId: "bot", Team: "Blue", Lives: 100, MaxLives: 100, IsBot: true}
	enemy := &player.Player{CircleBody: geometry.CircleBody{X: 205, Y: 190}, PlayerId: "enemy", Team: "Red", Lives: 100, MaxLives: 100}
	state.Players[bot.PlayerId], state.Players[enemy.PlayerId] = bot, enemy
	objective := &ObjectiveState{ID: "blue-tower", Type: "tower", Team: "Blue", X: 180, Y: 180, Radius: 44, Lives: 100, MaxLives: 100, LastDamagedAt: 10_000}
	state.Objectives[objective.ID] = objective
	ctx := &teamBotContext{gs: state, bot: bot, now: 11_000, ownObjective: objective}
	intent, ok := (defendObjectiveBehavior{}).Decide(ctx)
	if !ok || intent.kind != teamIntentDefend || intent.target == nil || intent.target.player != enemy {
		t.Fatalf("defense intent = %#v, want enemy defense target", intent)
	}
}

func TestTeamBotSupportsAllyInCombat(t *testing.T) {
	state := &GameState{Players: map[string]*player.Player{}}
	bot := &player.Player{CircleBody: geometry.CircleBody{X: 100, Y: 100}, PlayerId: "bot", Team: "Blue", Lives: 100, MaxLives: 100}
	ally := &player.Player{CircleBody: geometry.CircleBody{X: 260, Y: 260}, PlayerId: "ally", Team: "Blue", Lives: 100, MaxLives: 100, LastShootAt: 9_500}
	enemy := &player.Player{CircleBody: geometry.CircleBody{X: 310, Y: 270}, PlayerId: "enemy", Team: "Red", Lives: 100, MaxLives: 100}
	state.Players[bot.PlayerId], state.Players[ally.PlayerId], state.Players[enemy.PlayerId] = bot, ally, enemy
	ctx := &teamBotContext{gs: state, bot: bot, now: 10_000}
	intent, ok := (supportAllyBehavior{}).Decide(ctx)
	if !ok || intent.kind != teamIntentSupport || intent.target == nil || intent.target.player != enemy {
		t.Fatalf("support intent = %#v, want enemy near combat ally", intent)
	}
}

func TestTeamBotJoinsAllyAtEnemyObjective(t *testing.T) {
	state := &GameState{Players: map[string]*player.Player{}, Objectives: map[string]*ObjectiveState{}}
	bot := &player.Player{CircleBody: geometry.CircleBody{X: 100, Y: 100}, PlayerId: "bot", Team: "Blue", Lives: 100, MaxLives: 100}
	ally := &player.Player{CircleBody: geometry.CircleBody{X: 900, Y: 900}, PlayerId: "ally", Team: "Blue", Lives: 100, MaxLives: 100}
	state.Players[bot.PlayerId], state.Players[ally.PlayerId] = bot, ally
	objective := &ObjectiveState{ID: "red-tower", Type: "tower", Team: "Red", X: 920, Y: 920, Radius: 44, Lives: 100, MaxLives: 100}
	state.Objectives[objective.ID] = objective
	ctx := &teamBotContext{gs: state, bot: bot, enemyObjective: objective}
	intent, ok := (attackObjectiveBehavior{}).Decide(ctx)
	if !ok || intent.kind != teamIntentAttackBase || intent.target == nil || intent.target.objective != objective {
		t.Fatalf("attack intent = %#v, want enemy objective target", intent)
	}
}

func TestTeamBotInterruptsObjectivePushForNearbyEnemy(t *testing.T) {
	state := &GameState{Players: map[string]*player.Player{}, Objectives: map[string]*ObjectiveState{}}
	bot := &player.Player{CircleBody: geometry.CircleBody{X: 100, Y: 100}, PlayerId: "bot", Team: "Blue", Lives: 100, MaxLives: 100}
	ally := &player.Player{CircleBody: geometry.CircleBody{X: 850, Y: 850}, PlayerId: "ally", Team: "Blue", Lives: 100, MaxLives: 100}
	enemy := &player.Player{CircleBody: geometry.CircleBody{X: 190, Y: 100}, PlayerId: "enemy", Team: "Red", Lives: 100, MaxLives: 100}
	state.Players[bot.PlayerId], state.Players[ally.PlayerId], state.Players[enemy.PlayerId] = bot, ally, enemy
	objective := &ObjectiveState{ID: "red-tower", Type: "tower", Team: "Red", X: 900, Y: 900, Radius: 44, Lives: 100, MaxLives: 100}
	state.Objectives[objective.ID] = objective
	visible := &botTarget{kind: "player", id: enemy.PlayerId, player: enemy, x: enemy.X, y: enemy.Y, distance: 90}
	ctx := &teamBotContext{gs: state, bot: bot, now: 10_000, visibleTarget: visible, enemyObjective: objective}

	intent, ok := (attackObjectiveBehavior{}).Decide(ctx)
	if ok {
		t.Fatalf("objective push ignored a nearby enemy: intent=%#v", intent)
	}
}

func TestTeamBotFarmsVisibleMonsterBeforePushingBase(t *testing.T) {
	state := &GameState{Players: map[string]*player.Player{}, Objectives: map[string]*ObjectiveState{}}
	bot := &player.Player{CircleBody: geometry.CircleBody{X: 100, Y: 100}, PlayerId: "bot", Team: "Blue", Lives: 100, MaxLives: 100}
	ally := &player.Player{CircleBody: geometry.CircleBody{X: 900, Y: 900}, PlayerId: "ally", Team: "Blue", Lives: 100, MaxLives: 100}
	state.Players[bot.PlayerId], state.Players[ally.PlayerId] = bot, ally
	objective := &ObjectiveState{ID: "red-tower", Type: "tower", Team: "Red", X: 900, Y: 900, Radius: 44, Lives: 100, MaxLives: 100}
	state.Objectives[objective.ID] = objective
	visibleMonster := monster.NewMonster(180, 100, 16, 1000, 1000, 100)
	state.Monsters = map[string]*monster.Monster{"bat": visibleMonster}
	ctx := &teamBotContext{
		gs: state, bot: bot, now: 10_000,
		visibleTarget:  &botTarget{kind: "monster", id: "bat", monster: visibleMonster, x: visibleMonster.X, y: visibleMonster.Y, distance: 80},
		enemyObjective: objective,
	}

	intent, ok := (attackObjectiveBehavior{}).Decide(ctx)
	if ok {
		t.Fatalf("bot pushed the base while a visible monster was available: intent=%#v", intent)
	}
}

func TestTeamBotTargetsTowersBeforeTownHall(t *testing.T) {
	state := &GameState{Objectives: map[string]*ObjectiveState{
		"red-town-hall":  {ID: "red-town-hall", Type: "town_hall", Team: "Red", Lives: 2000},
		"red-tower-east": {ID: "red-tower-east", Type: "tower", Team: "Red", Lives: 1000},
		"red-tower-west": {ID: "red-tower-west", Type: "tower", Team: "Red", Lives: 1000},
	}}

	first := state.teamObjective("Blue", false)
	if first == nil || first.Type != "tower" {
		t.Fatalf("bot selected %v before towers were destroyed", first)
	}
	state.Objectives["red-tower-east"].Lives = 0
	state.Objectives["red-tower-west"].Lives = 0
	last := state.teamObjective("Blue", false)
	if last == nil || last.Type != "town_hall" {
		t.Fatalf("bot did not switch to town hall after towers fell: %v", last)
	}
}

func TestTeamBotDoesNotAcquireDefenderThroughWall(t *testing.T) {
	state := &GameState{Players: map[string]*player.Player{}, Objectives: map[string]*ObjectiveState{}, Walls: geometry.NewSpatialHash(TileSize)}
	state.Walls.Insert(&geometry.WallTile{MinX: 140, MinY: 40, MaxX: 180, MaxY: 240, Type: "wall"})
	bot := &player.Player{CircleBody: geometry.CircleBody{X: 100, Y: 100, Radius: 16}, PlayerId: "bot", Team: "Blue", Lives: 100, MaxLives: 100}
	enemy := &player.Player{CircleBody: geometry.CircleBody{X: 220, Y: 100, Radius: 16}, PlayerId: "enemy", Team: "Red", Lives: 100, MaxLives: 100}
	state.Players[bot.PlayerId], state.Players[enemy.PlayerId] = bot, enemy
	objective := &ObjectiveState{ID: "blue-tower", Type: "tower", Team: "Blue", X: 100, Y: 100, Radius: 44, Lives: 100, MaxLives: 100, LastDamagedAt: 10_000}
	state.Objectives[objective.ID] = objective
	ctx := &teamBotContext{gs: state, bot: bot, now: 11_000, ownObjective: objective}

	intent, ok := (defendObjectiveBehavior{}).Decide(ctx)
	if !ok || intent.kind != teamIntentDefend || intent.target != nil {
		t.Fatalf("defender acquired enemy through wall: intent=%#v ok=%v", intent, ok)
	}
}

func TestTeamBotPathReachesEnemyBaseThroughAuthoredBridge(t *testing.T) {
	state := &GameState{Mode: ModeTeamDeathmatch, MapName: "team-battle", MaxPlayers: 6}
	InitGameState(state)

	blueSpawn := state.Map.TeamSpawners["Blue"][0]
	var redTower *ObjectiveState
	for _, objective := range state.Objectives {
		if objective != nil && objective.Team == "Red" && objective.Type == "tower" {
			redTower = objective
			break
		}
	}
	if redTower == nil {
		t.Fatal("team-battle map has no red tower")
	}

	body := &geometry.CircleBody{X: blueSpawn.CenterX(), Y: blueSpawn.CenterY(), Radius: 16}
	path := state.findBotPath(body, redTower.X, redTower.Y)
	if len(path) == 0 {
		t.Fatalf("bot could not find a route from Blue spawn to Red tower at (%.0f, %.0f)", redTower.X, redTower.Y)
	}
	last := path[len(path)-1]
	if math.Hypot(last.X-redTower.X, last.Y-redTower.Y) > TileSize*3 {
		t.Fatalf("bot route ended too far from Red tower: end=(%.0f, %.0f), target=(%.0f, %.0f)", last.X, last.Y, redTower.X, redTower.Y)
	}
}

func TestTeamBotPushesAcrossRiverWhenNoEnemiesRemain(t *testing.T) {
	state := &GameState{Mode: ModeTeamDeathmatch, MapName: "team-battle", MaxPlayers: 1}
	InitGameState(state)
	state.State = GameStateGame
	state.PlayerAdd("bot", "Bot", "Needle")
	bot := state.Players["bot"]
	bot.IsBot = true
	bot.SetTeam("Blue")
	state.Monsters = map[string]*monster.Monster{}
	state.setPlayersPositionForTeams()

	startX, startY := bot.X, bot.Y
	for tick := 0; tick < 1800; tick++ {
		state.updateBots()
		state.updatePlayerMovement(16 * time.Millisecond)
	}

	if bot.X <= bot.Y {
		t.Fatalf("bot stopped before crossing the river: start=(%.0f, %.0f), now=(%.0f, %.0f), move=(%.2f, %.2f)", startX, startY, bot.X, bot.Y, bot.MoveX, bot.MoveY)
	}
}
