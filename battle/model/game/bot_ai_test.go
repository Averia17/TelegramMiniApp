package game

import (
	"battle/model/gamemap"
	"battle/model/monster"
	"battle/model/player"
	"battle/model/prop"
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

func TestTeamBotAssignmentsFollowHeroRoles(t *testing.T) {
	cases := []struct {
		hero       string
		assignment teamBotAssignment
	}{
		{hero: "Fairy Mina", assignment: teamAssignmentSupport},
		{hero: "Kaze", assignment: teamAssignmentFlank},
		{hero: "Brock Zeus", assignment: teamAssignmentAnchor},
		{hero: "Wukong Mico", assignment: teamAssignmentFrontline},
	}
	for _, test := range cases {
		bot := GetHeroByName(test.hero).CreatePlayer("bot", "Bot", 0, 0)
		if got := teamBotAssignmentFor(bot, 0); got != test.assignment {
			t.Fatalf("%s assignment=%q, want %q", test.hero, got, test.assignment)
		}
	}
}

func TestTeamBotRegroupsNearRespawningAlly(t *testing.T) {
	state := &GameState{Map: &gamemap.GameMap{TeamSpawners: map[string][]*geometry.RectangleBody{
		"Blue": {{X: 420, Y: 420, Width: 40, Height: 40}},
	}}}
	bot := &player.Player{CircleBody: geometry.CircleBody{X: 100, Y: 100}, PlayerId: "bot", Team: "Blue", Lives: 100, MaxLives: 100}
	ally := &player.Player{CircleBody: geometry.CircleBody{X: 430, Y: 430}, PlayerId: "ally", Team: "Blue", Lives: 0, MaxLives: 100, RespawnAt: 11_500}
	state.Players = map[string]*player.Player{bot.PlayerId: bot, ally.PlayerId: ally}
	ctx := &teamBotContext{gs: state, bot: bot, now: 10_000}
	intent, ok := (respawnAwarenessBehavior{}).Decide(ctx)
	if !ok || intent.kind != teamIntentRegroup || intent.x != 440 || intent.y != 440 {
		t.Fatalf("respawn awareness intent=%#v ok=%v", intent, ok)
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

func TestTeamBotFlankSeeksKnownBatWhenNoHeroIsVisible(t *testing.T) {
	state := &GameState{
		Mode:       ModeTeamDeathmatch,
		Players:    map[string]*player.Player{},
		Monsters:   map[string]*monster.Monster{},
		Objectives: map[string]*ObjectiveState{},
	}
	bot := &player.Player{CircleBody: geometry.CircleBody{X: 100, Y: 100}, PlayerId: "bot", Team: "Blue", Lives: 700, MaxLives: 700, HeroName: "Kaze", IsBot: true}
	state.Players[bot.PlayerId] = bot
	bat := monster.NewMonster(320, 220, 16, 1000, 1000, 100)
	state.Monsters["bat"] = bat
	ctx := &teamBotContext{gs: state, bot: bot, now: 10_000, assignment: teamAssignmentFlank}

	intent, ok := (batResourceBehavior{}).Decide(ctx)
	if !ok || intent.kind != teamIntentFarmBat || intent.target == nil || intent.target.monster != bat {
		t.Fatalf("bat resource intent = %#v ok=%v, want flank bot to farm known bat", intent, ok)
	}
}

func TestTeamBotFlankPrioritizesVisibleBatAsFarmTarget(t *testing.T) {
	state := &GameState{
		Mode:       ModeTeamDeathmatch,
		Players:    map[string]*player.Player{},
		Monsters:   map[string]*monster.Monster{},
		Objectives: map[string]*ObjectiveState{},
	}
	bot := &player.Player{CircleBody: geometry.CircleBody{X: 100, Y: 100}, PlayerId: "bot", Team: "Blue", Lives: 700, MaxLives: 700, HeroName: "Kaze", IsBot: true}
	state.Players[bot.PlayerId] = bot
	bat := monster.NewMonster(180, 100, 16, 1000, 1000, 100)
	state.Monsters["bat"] = bat
	ctx := &teamBotContext{
		gs: state, bot: bot, now: 10_000, assignment: teamAssignmentFlank,
		visibleTarget: &botTarget{kind: "monster", id: "bat", monster: bat, x: bat.X, y: bat.Y, distance: 80},
	}

	intent, ok := (batResourceBehavior{}).Decide(ctx)
	if !ok || intent.target == nil || intent.target.kind != "monster" || intent.target.monster != bat {
		t.Fatalf("visible bat was not selected as flank farm target: intent=%#v ok=%v", intent, ok)
	}
}

func TestTeamBotDoesNotFarmBatWhileCriticallyWounded(t *testing.T) {
	state := &GameState{
		Mode:       ModeTeamDeathmatch,
		Players:    map[string]*player.Player{},
		Monsters:   map[string]*monster.Monster{},
		Objectives: map[string]*ObjectiveState{},
	}
	bot := &player.Player{CircleBody: geometry.CircleBody{X: 100, Y: 100}, PlayerId: "bot", Team: "Blue", Lives: 120, MaxLives: 700, HeroName: "Kaze", IsBot: true}
	state.Players[bot.PlayerId] = bot
	state.Monsters["bat"] = monster.NewMonster(320, 220, 16, 1000, 1000, 100)
	ctx := &teamBotContext{gs: state, bot: bot, now: 10_000, assignment: teamAssignmentFlank}

	if intent, ok := (batResourceBehavior{}).Decide(ctx); ok {
		t.Fatalf("critically wounded bot farmed bat: intent=%#v", intent)
	}
}

func TestTeamBotReportsKnownBatFarmDecision(t *testing.T) {
	state := &GameState{
		Mode:       ModeTeamDeathmatch,
		State:      GameStateGame,
		Players:    map[string]*player.Player{},
		Monsters:   map[string]*monster.Monster{},
		Objectives: map[string]*ObjectiveState{},
		BotMemory:  map[string]*BotPerception{},
		botAI:      newTeamBattleBotStrategy(),
	}
	bot := &player.Player{CircleBody: geometry.CircleBody{X: 100, Y: 100}, PlayerId: "bot", Team: "Blue", Lives: 700, MaxLives: 700, HeroName: "Kaze", IsBot: true}
	state.Players[bot.PlayerId] = bot
	state.Monsters["bat"] = monster.NewMonster(900, 900, 16, 1000, 1000, 100)

	state.updateBots()
	if got := state.BotAIMetricsSnapshot().BatFarmDecisions; got != 1 {
		t.Fatalf("bat farm decisions=%d, want 1", got)
	}
}

func TestTeamBotReportsVisibleBatFarmDecision(t *testing.T) {
	state := &GameState{
		Mode:       ModeTeamDeathmatch,
		State:      GameStateGame,
		Players:    map[string]*player.Player{},
		Monsters:   map[string]*monster.Monster{},
		Objectives: map[string]*ObjectiveState{},
		BotMemory:  map[string]*BotPerception{},
		botAI:      newTeamBattleBotStrategy(),
	}
	bot := &player.Player{CircleBody: geometry.CircleBody{X: 100, Y: 100}, PlayerId: "bot", Team: "Blue", Lives: 700, MaxLives: 700, HeroName: "Kaze", IsBot: true, Ammo: 1, MaxAmmo: 3}
	state.Players[bot.PlayerId] = bot
	state.Monsters["bat"] = monster.NewMonster(180, 100, 16, 1000, 1000, monster.MonsterLives)

	state.updateBots()

	metrics := state.BotAIMetricsSnapshot()
	if metrics.BatFarmDecisions != 1 {
		t.Fatalf("visible bat farm decisions=%d, want one explicit farm decision: %#v", metrics.BatFarmDecisions, metrics)
	}
	if metrics.HardInterrupts != 0 {
		t.Fatalf("healthy visible bat was misclassified as an emergency: %#v", metrics)
	}
	if metrics.ActionSelections["engage"] != 1 || metrics.AttackAttempts != 1 {
		t.Fatalf("visible bat farm did not execute a combat action: %#v", metrics)
	}
}

func TestTeamBotCollectsVisibleHealthBoostThroughSimulation(t *testing.T) {
	state := newTestGameState()
	state.Mode = ModeTeamDeathmatch
	state.State = GameStateWaiting
	state.MatchStartedAt = combatScenarioEpochMs
	state.GameEndsAt = combatScenarioEpochMs + 120_000
	state.botAI = newTeamBattleBotStrategy()
	state.PlayerAdd("bot", "Bot", "Needle")
	state.PlayerAdd("enemy", "Enemy", "Kaze")
	state.State = GameStateGame
	bot := state.Players["bot"]
	enemy := state.Players["enemy"]
	bot.IsBot = true
	bot.SetTeam("Blue")
	bot.X, bot.Y = 100, 100
	enemy.SetTeam("Red")
	enemy.X, enemy.Y = 900, 900
	reward := prop.NewProp("health_boost", 180, 100, 12)
	state.Props = append(state.Props, reward)

	runner := NewCombatScenarioRunner("team-bot-health-boost-collection", 672, ModeTeamDeathmatch, state)
	if err := runner.AdvanceTo(1_500); err != nil {
		t.Fatalf("advance health boost collection: %v", err)
	}
	if bot.HealthBoosts != 1 || bot.CubeClaims != 1 || reward.Active {
		t.Fatalf("team bot did not collect health boost through simulation: state=%v mode=%v stacks=%d claims=%d active=%v position=(%.1f,%.1f) move=(%.2f,%.2f) map=%v", state.State, state.Mode, bot.HealthBoosts, bot.CubeClaims, reward.Active, bot.X, bot.Y, bot.MoveX, bot.MoveY, state.Map != nil)
	}
}

func TestDeathmatchBotEngagesVisibleBatThroughSimulation(t *testing.T) {
	state := newScenarioSoloState("Kaze", "Needle")
	state.Walls = nil
	state.Props = nil
	state.Players["hero"].IsBot = true
	state.Players["hero"].X, state.Players["hero"].Y = 100, 100
	state.Players["target"].X, state.Players["target"].Y = 900, 900
	state.Players["target"].MaxLives, state.Players["target"].Lives = 100_000, 100_000
	state.Monsters = map[string]*monster.Monster{}
	state.Monsters["bat"] = monster.NewMonster(180, 100, 16, 1000, 1000, monster.MonsterLives)
	state.botAI = newBotAIStrategy(ModeDeathmatch)

	runner := NewCombatScenarioRunner("deathmatch-bot-visible-bat", 673, ModeDeathmatch, state)
	if err := runner.AdvanceTo(1_000); err != nil {
		t.Fatalf("advance deathmatch visible bat: %v", err)
	}
	metrics := state.BotAIMetricsSnapshot()
	bat := state.Monsters["bat"]
	if metrics.AttackAttempts == 0 {
		t.Fatalf("deathmatch bot did not attack visible bat: state=%v attempts=%d metrics=%#v", state.State, metrics.AttackAttempts, metrics)
	}
	if bat != nil && bat.Lives >= bat.MaxLives {
		t.Fatalf("deathmatch bot did not damage visible bat: state=%v attempts=%d batLives=%d/%d metrics=%#v", state.State, metrics.AttackAttempts, bat.Lives, bat.MaxLives, metrics)
	}
}

func TestTeamBotReportsContestResponseWhenHeroClaimsBatCamp(t *testing.T) {
	state := &GameState{
		Mode:       ModeTeamDeathmatch,
		State:      GameStateGame,
		Players:    map[string]*player.Player{},
		Monsters:   map[string]*monster.Monster{},
		Objectives: map[string]*ObjectiveState{},
		BotMemory:  map[string]*BotPerception{},
		botAI:      newTeamBattleBotStrategy(),
	}
	bot := &player.Player{CircleBody: geometry.CircleBody{X: 100, Y: 100}, PlayerId: "bot", Team: "Blue", Lives: 700, MaxLives: 700, HeroName: "Kaze", IsBot: true, Ammo: 1, MaxAmmo: 3}
	enemy := &player.Player{CircleBody: geometry.CircleBody{X: 500, Y: 100}, PlayerId: "enemy", Team: "Red", Lives: 700, MaxLives: 700, HeroName: "Needle"}
	state.Players[bot.PlayerId], state.Players[enemy.PlayerId] = bot, enemy
	state.Monsters["bat"] = monster.NewMonster(420, 100, 16, 1000, 1000, monster.MonsterLives)

	state.updateBots()

	if got := state.BotAIMetricsSnapshot().ResourceContestDecisions; got != 1 {
		t.Fatalf("resource contest decisions=%d, want one hero-vs-bat contest response", got)
	}
	if got := state.BotAIMetricsSnapshot().ResourceContestByRole["Assassin"]; got != 1 {
		t.Fatalf("assassin contest responses=%d, want one role-attributed response", got)
	}
}

func TestTeamBotRoutesToVisibleHealthBoostWhenNoImmediateThreatExists(t *testing.T) {
	state := newTestGameState()
	state.Mode = ModeTeamDeathmatch
	// Add the fixture before entering the game state so PlayerAdd does not
	// auto-fill unrelated opponents; this test is specifically about the
	// pickup-vs-no-threat decision.
	state.State = GameStateWaiting
	state.botAI = newTeamBattleBotStrategy()
	state.PlayerAdd("bot", "Bot", "Needle")
	state.State = GameStateGame
	bot := state.Players["bot"]
	bot.IsBot = true
	bot.SetTeam("Blue")
	bot.X, bot.Y = 100, 100
	state.Props = append(state.Props, prop.NewProp("health_boost", 180, 100, 12))

	state.updateBots()

	if bot.MoveX <= 0 || math.Abs(bot.MoveY) > .35 {
		t.Fatalf("team bot ignored safe health boost: move=(%.2f, %.2f)", bot.MoveX, bot.MoveY)
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
