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
	gs.PlayerAdd("enemy", "Enemy", "Brock Zeus")
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
	gs.PlayerAdd("enemy", "Enemy", "Brock Zeus")
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
	gs.PlayerAdd("enemy", "Enemy", "Brock Zeus")
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
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
	gs.PlayerAdd("wounded", "Wounded", "Needle")
	gs.PlayerAdd("attacker", "Attacker", "Needle")

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

func TestBotJoinsAnAllyAlreadyDamagingTheSameTarget(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
	gs.PlayerAdd("ally", "Ally", "Needle")
	gs.PlayerAdd("focused", "Focused", "Needle")
	gs.PlayerAdd("other", "Other", "Needle")

	bot, ally := gs.Players["bot"], gs.Players["ally"]
	bot.SetTeam("Blue")
	ally.SetTeam("Blue")
	bot.X, bot.Y = 100, 100
	ally.X, ally.Y = 100, 180
	focused := gs.Players["focused"]
	focused.SetTeam("Red")
	focused.X, focused.Y = 300, 100
	focused.LastContactBy, focused.LastContactAt = ally.PlayerId, 9_900
	other := gs.Players["other"]
	other.SetTeam("Red")
	other.X, other.Y = 200, 100

	target := gs.botSelectTarget(bot, 10_000)
	if target == nil || target.id != focused.PlayerId {
		t.Fatalf("bot did not join ally focus fire: chose %q", targetID(target))
	}
}

func TestBotDisengagesWhenLowHealthAndOutnumbered(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
	gs.PlayerAdd("first", "First", "Needle")
	gs.PlayerAdd("second", "Second", "Needle")

	bot := gs.Players["bot"]
	bot.SetTeam("Blue")
	bot.X, bot.Y, bot.Lives = 100, 100, 300
	first := gs.Players["first"]
	first.SetTeam("Red")
	first.X, first.Y = 500, 100
	second := gs.Players["second"]
	second.SetTeam("Red")
	second.X, second.Y = 500, 170
	target := &botTarget{kind: "player", id: first.PlayerId, player: first, x: first.X, y: first.Y, distance: math.Hypot(first.X-bot.X, first.Y-bot.Y)}

	gs.botEngageTarget(bot.PlayerId, bot, target, 10_000)

	if bot.MoveX >= 0 {
		t.Fatalf("low-health bot pushed into a two-player threat: move=(%.2f, %.2f)", bot.MoveX, bot.MoveY)
	}
}

func TestBotKeepsPressureOnCriticallyWoundedTargetDespiteBeingOutnumbered(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
	gs.PlayerAdd("first", "First", "Needle")
	gs.PlayerAdd("second", "Second", "Needle")

	bot := gs.Players["bot"]
	bot.SetTeam("Blue")
	bot.X, bot.Y, bot.Lives = 100, 100, 150
	first := gs.Players["first"]
	first.SetTeam("Red")
	first.X, first.Y, first.Lives = 450, 100, 1
	second := gs.Players["second"]
	second.SetTeam("Red")
	second.X, second.Y = 450, 170
	target := &botTarget{kind: "player", id: first.PlayerId, player: first, x: first.X, y: first.Y, distance: math.Hypot(first.X-bot.X, first.Y-bot.Y)}

	gs.botEngageTarget(bot.PlayerId, bot, target, 10_000)

	if bot.MoveX <= 0 {
		t.Fatalf("bot abandoned a nearly defeated target: move=(%.2f, %.2f)", bot.MoveX, bot.MoveY)
	}
}

func TestBotRetreatsAwayFromTheWholeVisibleThreatGroup(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
	gs.PlayerAdd("first", "First", "Needle")
	gs.PlayerAdd("second", "Second", "Needle")

	bot := gs.Players["bot"]
	bot.X, bot.Y = 300, 300
	first := gs.Players["first"]
	first.X, first.Y = 500, 300
	second := gs.Players["second"]
	second.X, second.Y = 300, 100

	gs.botRetreatFrom(bot.PlayerId, bot, first.X, first.Y, 10_000)

	if bot.MoveX >= 0 || bot.MoveY <= 0 {
		t.Fatalf("bot retreated toward part of the threat group: move=(%.2f, %.2f)", bot.MoveX, bot.MoveY)
	}
}

func TestBotMovementTurnsGraduallyWhenItsIntentChanges(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
	bot := gs.Players["bot"]
	bot.IsBot = true

	gs.playerMove(bot.PlayerId, 10_000, 1, 0)
	gs.playerMove(bot.PlayerId, 10_016, -1, 0)

	if bot.MoveX <= 0 {
		t.Fatalf("bot snapped to the new direction: move=(%.2f, %.2f)", bot.MoveX, bot.MoveY)
	}

	for tick := int64(32); tick <= 128; tick += 16 {
		gs.playerMove(bot.PlayerId, 10_000+tick, -1, 0)
	}
	if bot.MoveX >= 0 {
		t.Fatalf("bot never completed its smooth turn: move=(%.2f, %.2f)", bot.MoveX, bot.MoveY)
	}
}

func TestBotCoastsBrieflyWhenItsIntentStops(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
	bot := gs.Players["bot"]
	bot.IsBot = true

	gs.playerMove(bot.PlayerId, 10_000, 1, 0)
	gs.playerMove(bot.PlayerId, 10_016, 0, 0)

	if bot.MoveX <= 0 {
		t.Fatalf("bot stopped instantaneously after losing its intent: move=(%.2f, %.2f)", bot.MoveX, bot.MoveY)
	}
	if scale := gs.BotMemory[bot.PlayerId].MoveScale; scale <= 0 || scale >= 1 {
		t.Fatalf("bot coast scale = %.2f, want a partial movement scale", scale)
	}

	for tick := int64(32); tick <= 320; tick += 16 {
		gs.playerMove(bot.PlayerId, 10_000+tick, 0, 0)
	}
	if bot.MoveX != 0 || bot.MoveY != 0 || gs.BotMemory[bot.PlayerId].MoveScale != 0 {
		t.Fatalf("bot kept coasting forever: move=(%.2f, %.2f) scale=%.2f", bot.MoveX, bot.MoveY, gs.BotMemory[bot.PlayerId].MoveScale)
	}
}

func targetID(target *botTarget) string {
	if target == nil {
		return ""
	}
	return target.id
}

func TestNeedleBotUsesMoistureReserveForHealthInsteadOfEnemyDistance(t *testing.T) {
	bot := perceptionPlayer("needle", 100, 100)
	bot.HeroName, bot.Lives, bot.MaxLives = "Needle", 60, 100
	distantEnemy := &botTarget{kind: "player", distance: 500, player: perceptionPlayer("enemy", 600, 100)}

	if !botSecondaryUseful(bot, distantEnemy) {
		t.Fatal("wounded Needle bot should use moisture reserve even when the enemy is distant")
	}
	bot.Lives = 100
	if botSecondaryUseful(bot, distantEnemy) {
		t.Fatal("healthy Needle bot should preserve moisture reserve")
	}
}

func TestWoundedBotKitesHealthyPlayerTarget(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.GameEndsAt = time.Now().Add(GameDuration + 10*time.Second).UnixMilli()
	gs.State = GameStateGame
	gs.PlayerAdd("bot", "Bot", "Kaze")
	gs.PlayerAdd("enemy", "Enemy", "Brock Zeus")

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
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
	gs.PlayerAdd("enemy", "Enemy", "Needle")

	bot, enemy := gs.Players["bot"], gs.Players["enemy"]
	bot.X, bot.Y, bot.Ammo = 100, 100, 1
	enemy.X, enemy.Y, enemy.MoveX, enemy.MoveY, enemy.Speed = 300, 100, 0, 1, 100
	target := &botTarget{kind: "player", id: enemy.PlayerId, player: enemy, x: enemy.X, y: enemy.Y, distance: 200}

	gs.botEngageTarget(bot.PlayerId, bot, target, time.Now().UnixMilli())

	if bot.Rotation <= .01 {
		t.Fatalf("bot aimed at current position instead of leading moving target: rotation=%.3f", bot.Rotation)
	}
}

func TestBotLeadUsesProjectileTravelTime(t *testing.T) {
	targetPlayer := perceptionPlayer("enemy", 400, 100)
	targetPlayer.MoveX, targetPlayer.MoveY, targetPlayer.Speed = 0, 1, 12
	target := &botTarget{kind: "player", id: targetPlayer.PlayerId, player: targetPlayer, x: targetPlayer.X, y: targetPlayer.Y, distance: 300}

	slowBot := perceptionPlayer("slow", 100, 100)
	slowBot.BulletSpd = 100
	_, slowLeadY := botTargetAimPoint(slowBot, target)
	fastBot := perceptionPlayer("fast", 100, 100)
	fastBot.BulletSpd = 600
	_, fastLeadY := botTargetAimPoint(fastBot, target)

	if slowLeadY <= fastLeadY || fastLeadY <= targetPlayer.Y {
		t.Fatalf("projectile lead ignored travel time: slow=%.2f fast=%.2f target=%.2f", slowLeadY, fastLeadY, targetPlayer.Y)
	}
}

func TestBotTurnsTowardTargetWithoutInstantLockOn(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	bot, enemy := gs.Players["bot"], gs.Players["enemy"]
	bot.X, bot.Y, bot.Rotation, bot.Ammo = 500, 500, 0, 0
	enemy.X, enemy.Y = 500, 800
	target := &botTarget{kind: "player", id: enemy.PlayerId, player: enemy, x: enemy.X, y: enemy.Y, distance: 300}

	gs.botEngageTarget(bot.PlayerId, bot, target, 10_000)
	wanted := math.Pi / 2
	if bot.Rotation <= 0 || bot.Rotation >= wanted {
		t.Fatalf("bot snapped past the target while turning: rotation=%.3f wanted=%.3f", bot.Rotation, wanted)
	}
	if bot.Rotation >= wanted*.75 {
		t.Fatalf("bot turned too far in one tick: rotation=%.3f wanted=%.3f", bot.Rotation, wanted)
	}
}

func TestBotDoesNotAbandonNearbyEnemyForPowerPickup(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Kaze")
	gs.PlayerAdd("enemy", "Enemy", "Brock Zeus")
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
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	gs.State = GameStateGame
	bot, enemy := gs.Players["bot"], gs.Players["enemy"]
	bot.IsBot, bot.X, bot.Y = true, 100, 100
	bot.SuperCharge, bot.GadgetCharges = 0, 0
	enemy.X, enemy.Y = 180, 100

	gs.updateBots()

	if memory := gs.BotMemory[bot.PlayerId]; memory == nil || memory.TargetID != enemy.PlayerId {
		t.Fatalf("bot ignored a visible enemy for an opening crate: memory=%+v move=(%.2f, %.2f)", memory, bot.MoveX, bot.MoveY)
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
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
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
	gs.PlayerAdd("enemy", "Enemy", "Brock Zeus")
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

func TestBotUsesControlSupersAtTheirActualAbilityRange(t *testing.T) {
	enemy := perceptionPlayer("enemy", 0, 0)
	tests := []struct {
		hero     string
		distance float64
	}{
		{hero: "Needle", distance: 500},
		{hero: "Wukong Mico", distance: 250},
		{hero: "Persephone Lumi", distance: 400},
	}
	for _, test := range tests {
		t.Run(test.hero, func(t *testing.T) {
			bot := perceptionPlayer("bot-"+test.hero, 0, 0)
			bot.HeroName = test.hero
			target := &botTarget{kind: "player", id: enemy.PlayerId, player: enemy, distance: test.distance}
			if !botPrimaryUseful(bot, target) {
				t.Fatalf("%s super was rejected at %.0f distance", test.hero, test.distance)
			}
		})
	}
}

func TestBotCastsPersephoneRootsBeforeBasicAttackRange(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Persephone Lumi")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	bot, enemy := gs.Players["bot"], gs.Players["enemy"]
	bot.X, bot.Y, bot.SuperCharge = 100, 100, 100
	enemy.X, enemy.Y = 500, 100
	target := &botTarget{kind: "player", id: enemy.PlayerId, player: enemy, x: enemy.X, y: enemy.Y, distance: 400}

	gs.botEngageTarget(bot.PlayerId, bot, target, 10_000)
	if bot.SuperPulse != 1 || len(gs.HeroZones) == 0 || gs.HeroZones[len(gs.HeroZones)-1].Kind != "lumi_roots" {
		t.Fatalf("Persephone did not cast roots at ability range: pulses=%d zones=%+v", bot.SuperPulse, gs.HeroZones)
	}
}

func TestBotDoesNotSpendSuperOnObjective(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("bot", "Bot", "Kaze")
	bot := gs.Players["bot"]
	bot.SuperCharge = 100
	objective := &ObjectiveState{ID: "red-tower", Team: "Red", Type: "tower", X: 180, Y: 100, Radius: 44, Lives: 100}
	target := &botTarget{kind: "objective", id: objective.ID, objective: objective, x: objective.X, y: objective.Y, distance: 80}

	if gs.botTryAbility(bot.PlayerId, bot, target, 10_000) {
		t.Fatal("bot spent a player-only super on an objective")
	}
	if bot.SuperPulse != 0 || bot.SuperCharge != 100 {
		t.Fatalf("objective consumed bot super: pulses=%d charge=%d", bot.SuperPulse, bot.SuperCharge)
	}
}

func TestFairyMinaBotFindsWoundedAllyForSuper(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("mina", "Mina", "Fairy Mina")
	gs.PlayerAdd("ally", "Ally", "Kaze")
	mina, ally := gs.Players["mina"], gs.Players["ally"]
	mina.X, mina.Y, mina.Lives = 100, 100, mina.MaxLives
	ally.X, ally.Y, ally.Lives = 250, 100, ally.MaxLives/2

	target := gs.botMinaSuperTarget(mina, 10_000)
	if target != ally {
		t.Fatalf("Mina selected %v as super target, want wounded ally", target)
	}
}

func TestFairyMinaUsesReadySuperForAllyWithoutEnemyTarget(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mina", "Mina", "Fairy Mina")
	gs.PlayerAdd("ally", "Ally", "Kaze")
	mina, ally := gs.Players["mina"], gs.Players["ally"]
	mina.X, mina.Y, mina.SuperCharge = 100, 100, 100
	ally.X, ally.Y, ally.Lives = 250, 100, ally.MaxLives/2

	if !gs.botTryAbility(mina.PlayerId, mina, nil, 10_000) {
		t.Fatal("Mina did not use a ready support super without an enemy target")
	}
	if ally.ShieldHP <= 0 || ally.ShieldUntil <= 10_000 {
		t.Fatalf("Mina support super did not shield ally: shield=%d until=%d", ally.ShieldHP, ally.ShieldUntil)
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

func TestBotProfilesAreDeterministicButNotIdentical(t *testing.T) {
	first := botProfileFor("bot-1")
	repeat := botProfileFor("bot-1")
	other := botProfileFor("bot-2")

	if first != repeat {
		t.Fatalf("bot profile changed between calls: first=%+v repeat=%+v", first, repeat)
	}
	if first == other {
		t.Fatalf("all bots received the same movement profile: first=%+v other=%+v", first, other)
	}
	if first.ReactionDelay < BotReactionDelayMin || first.ReactionDelay > BotReactionDelayMax {
		t.Fatalf("reaction delay=%d outside human range", first.ReactionDelay)
	}
}

func TestBotKeepsCombatTargetDuringShortDecisionWindow(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
	gs.PlayerAdd("first", "First", "Needle")
	gs.PlayerAdd("second", "Second", "Needle")
	bot, first, second := gs.Players["bot"], gs.Players["first"], gs.Players["second"]
	bot.X, bot.Y = 100, 100
	first.X, first.Y = 590, 100
	second.X, second.Y = 250, 100
	second.Lives, second.MaxLives = 1, 100
	first.LastShootAt = 9_900
	gs.rememberBotTarget("bot", first, 10_000)

	selected := gs.botSelectTarget(bot, 10_000)
	if selected == nil || selected.id != "first" {
		t.Fatalf("bot abandoned its current target during a short decision window: got %q", targetID(selected))
	}
}

func TestBotCombatSteeringCommitsToOneStrafeSide(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 1000}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	bot, enemy := gs.Players["bot"], gs.Players["enemy"]
	bot.X, bot.Y, bot.Ammo = 100, 100, 1
	enemy.X, enemy.Y = 400, 100
	target := &botTarget{kind: "player", id: enemy.PlayerId, player: enemy, x: enemy.X, y: enemy.Y, distance: 300}
	now := int64(10_000)
	gs.botEngageTarget(bot.PlayerId, bot, target, now)
	firstSide := math.Copysign(1, bot.MoveY)
	profile := botProfileFor(bot.PlayerId)
	if math.Abs(bot.MoveY) < .1 {
		t.Fatalf("bot did not choose a combat strafe: move=(%.2f, %.2f)", bot.MoveX, bot.MoveY)
	}

	target.x, target.y = enemy.X, enemy.Y
	target.distance = math.Hypot(target.x-bot.X, target.y-bot.Y)
	gs.botEngageTarget(bot.PlayerId, bot, target, now+profile.StrafePeriod/2)
	if math.Copysign(1, bot.MoveY) != firstSide {
		t.Fatalf("bot reversed strafe side before its commitment expired: first=%.2f second=%.2f", firstSide, bot.MoveY)
	}
	if memory := gs.BotMemory[bot.PlayerId]; memory == nil || memory.StrafeUntil <= now+profile.StrafePeriod/2 {
		t.Fatalf("bot strafe commitment was not retained: memory=%+v", memory)
	}
}

func TestBotUsesSmoothDiagonalSteeringInOpenSpace(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 800, HeightInPixels: 800}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	body := &geometry.CircleBody{X: 100, Y: 100, Radius: 16}

	dx, dy := gs.botTravelDirection("bot-open-space", body, 500, 300, 10_000)

	if math.Abs(dx) < .2 || math.Abs(dy) < .2 {
		t.Fatalf("open-space steering fell into a grid staircase: direction=(%.2f, %.2f)", dx, dy)
	}
}

func TestBotDoesNotAlternateAxesAcrossOpenSpaceTicks(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 800}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	gs.State = GameStateGame
	bot, enemy := gs.Players["bot"], gs.Players["enemy"]
	bot.IsBot, bot.X, bot.Y, bot.Ammo = true, 100, 100, 0
	enemy.X, enemy.Y = 700, 400
	target := &botTarget{kind: "player", id: enemy.PlayerId, player: enemy, x: enemy.X, y: enemy.Y, distance: math.Hypot(enemy.X-bot.X, enemy.Y-bot.Y)}

	for tick := 0; tick < 8; tick++ {
		gs.botEngageTarget(bot.PlayerId, bot, target, int64(10_000+tick*16))
		if math.Abs(bot.MoveX) < .15 || math.Abs(bot.MoveY) < .15 {
			t.Fatalf("bot fell back to an axis-alternating command at tick %d: move=(%.2f, %.2f)", tick, bot.MoveX, bot.MoveY)
		}
		gs.updatePlayerMovement(16 * time.Millisecond)
		target.distance = math.Hypot(enemy.X-bot.X, enemy.Y-bot.Y)
	}
}

func TestBotSeparatesFromNearbyAllyWhileEngaging(t *testing.T) {
	gs := newTestGameState()
	gs.Map = &gamemap.GameMap{WidthInPixels: 1000, HeightInPixels: 800}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("bot", "Bot", "Brock Zeus")
	gs.PlayerAdd("ally", "Ally", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Needle")
	bot, ally, enemy := gs.Players["bot"], gs.Players["ally"], gs.Players["enemy"]
	bot.X, bot.Y, bot.Ammo = 100, 100, 0
	ally.X, ally.Y = 112, 100
	enemy.X, enemy.Y = 500, 100
	target := &botTarget{kind: "player", id: enemy.PlayerId, player: enemy, x: enemy.X, y: enemy.Y, distance: 400}

	gs.botEngageTarget(bot.PlayerId, bot, target, 10_000)
	awayX, awayY := bot.X-ally.X, bot.Y-ally.Y
	if bot.MoveX*awayX+bot.MoveY*awayY <= 0 {
		t.Fatalf("bot moved into its ally while engaging: move=(%.2f, %.2f) away=(%.1f, %.1f)", bot.MoveX, bot.MoveY, awayX, awayY)
	}
}
