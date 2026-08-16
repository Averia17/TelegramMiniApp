package game

import (
	"battle/model/player"
	"battle/service/geometry"
	"testing"
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
