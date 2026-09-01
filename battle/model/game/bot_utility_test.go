package game

import (
	"battle/model/player"
	"battle/model/prop"
	"testing"
)

func TestBotUtilityRetreatsFromCloseNumericalThreat(t *testing.T) {
	scores := scoreBotUtility(botUtilityContext{
		HealthFraction:       .24,
		TargetHealthFraction: .8,
		TargetDistance:       90,
		PreferredRange:       180,
		AttackRange:          180,
		Enemies:              3,
		Allies:               0,
		Ammo:                 0,
		MaxAmmo:              3,
		Role:                 "Sharpshooter",
		TargetKind:           "player",
		HasTarget:            true,
		TargetInAttackRange:  true,
	})
	if scores[botUtilityRetreat] <= scores[botUtilityEngage] {
		t.Fatalf("retreat score %.1f did not beat engage %.1f: %#v", scores[botUtilityRetreat], scores[botUtilityEngage], scores)
	}
}

func TestBotCombatEvaluationAccountsForDamageRace(t *testing.T) {
	bot := &player.Player{
		Lives: 1000, MaxLives: 1000, AttackDmg: 120, AttackRate: 400,
		ReloadTime: 1000, Ammo: 3, MaxAmmo: 3,
	}
	target := &player.Player{
		Lives: 900, MaxLives: 900, AttackDmg: 300, AttackRate: 400,
		ReloadTime: 1000, Ammo: 3, MaxAmmo: 3,
	}

	evaluation := evaluateBotCombat(bot, &botTarget{
		kind: "player", player: target, distance: 100,
	})

	if evaluation.BotExpectedDamage != 120 || evaluation.TargetExpectedDamage != 300 {
		t.Fatalf("damage evaluation bot=%.1f target=%.1f, want 120/300", evaluation.BotExpectedDamage, evaluation.TargetExpectedDamage)
	}
	if evaluation.BotAttacksToKill != 8 || evaluation.TargetAttacksToKill != 4 {
		t.Fatalf("attack counts bot=%d target=%d, want 8/4", evaluation.BotAttacksToKill, evaluation.TargetAttacksToKill)
	}
	if !evaluation.TargetWinsDamageRace || evaluation.BotWinsDamageRace {
		t.Fatalf("damage race botWins=%v targetWins=%v, want target only", evaluation.BotWinsDamageRace, evaluation.TargetWinsDamageRace)
	}
}

func TestBotUtilityFightsWhenItCanWinTheDamageRace(t *testing.T) {
	scores := scoreBotUtility(botUtilityContext{
		HealthFraction: .75, TargetHealthFraction: .35, TargetDistance: 100,
		PreferredRange: 220, AttackRange: 260, Enemies: 1, Allies: 0,
		Ammo: 2, MaxAmmo: 3, Role: "Fighter", TargetKind: "player",
		HasTarget: true, TargetInAttackRange: true,
		BotExpectedDamage: 180, TargetExpectedDamage: 80,
		BotAttacksToKill: 2, TargetAttacksToKill: 8,
		BotWinsDamageRace: true,
	})

	if scores[botUtilityEngage] <= scores[botUtilityRetreat] {
		t.Fatalf("bot abandoned a favorable damage race: engage=%.1f retreat=%.1f", scores[botUtilityEngage], scores[botUtilityRetreat])
	}
}

func TestBotUtilityRetreatsWhenTargetWinsTheDamageRace(t *testing.T) {
	scores := scoreBotUtility(botUtilityContext{
		HealthFraction: 1, TargetHealthFraction: .9, TargetDistance: 100,
		PreferredRange: 220, AttackRange: 260, Enemies: 1, Allies: 0,
		Ammo: 2, MaxAmmo: 3, Role: "Sharpshooter", TargetKind: "player",
		HasTarget: true, TargetInAttackRange: true, TargetCanAttack: true,
		BotExpectedDamage: 80, TargetExpectedDamage: 300,
		BotAttacksToKill: 12, TargetAttacksToKill: 4,
		BotTimeToKillMs: 4800, TargetTimeToKillMs: 1600,
		TargetWinsDamageRace: true,
	})

	if scores[botUtilityRetreat] <= scores[botUtilityEngage] {
		t.Fatalf("bot ignored a losing damage race: retreat=%.1f engage=%.1f", scores[botUtilityRetreat], scores[botUtilityEngage])
	}
}

func TestBotUtilityCollectsHealthBoostWhenFightIsNotImmediate(t *testing.T) {
	scores := scoreBotUtility(botUtilityContext{
		HealthFraction:       .42,
		TargetHealthFraction: .9,
		TargetDistance:       430,
		PickupDistance:       100,
		PreferredRange:       220,
		AttackRange:          260,
		Enemies:              1,
		Allies:               1,
		HealthStacks:         1,
		Ammo:                 2,
		MaxAmmo:              3,
		Role:                 "Controller",
		TargetKind:           "player",
		PickupType:           "health_boost",
		HasTarget:            true,
		HasPickup:            true,
	})
	if scores[botUtilityCollect] <= scores[botUtilityEngage] {
		t.Fatalf("collect score %.1f did not beat engage %.1f: %#v", scores[botUtilityCollect], scores[botUtilityEngage], scores)
	}
}

func TestBotUtilityAssassinFinishesLowHealthTarget(t *testing.T) {
	scores := scoreBotUtility(botUtilityContext{
		HealthFraction:       .62,
		TargetHealthFraction: .22,
		TargetDistance:       110,
		PreferredRange:       110,
		AttackRange:          150,
		Enemies:              2,
		Allies:               0,
		HealthStacks:         0,
		Ammo:                 1,
		MaxAmmo:              3,
		Role:                 "Assassin",
		TargetKind:           "player",
		HasTarget:            true,
		TargetInAttackRange:  true,
	})
	if scores[botUtilityEngage] <= scores[botUtilityRetreat] {
		t.Fatalf("assassin abandoned finish window: engage=%.1f retreat=%.1f", scores[botUtilityEngage], scores[botUtilityRetreat])
	}
}

func TestBotUtilityHysteresisKeepsCurrentActionForSmallChange(t *testing.T) {
	scores := map[botUtilityAction]float64{
		botUtilityRoam:    10,
		botUtilityEngage:  50,
		botUtilityRetreat: 64,
		botUtilityCollect: 60,
	}
	if got := chooseBotUtilityAction(scores, botUtilityCollect, 2_000, 1_000); got != botUtilityCollect {
		t.Fatalf("small score change interrupted committed collect action: got %q", got)
	}
	if got := chooseBotUtilityAction(scores, botUtilityCollect, 2_000, 2_000); got != botUtilityRetreat {
		t.Fatalf("expired commitment did not choose retreat: got %q", got)
	}
}

func TestBotUtilityRoleBiasesAreMeaningful(t *testing.T) {
	base := botUtilityContext{
		HealthFraction:       .58,
		TargetHealthFraction: .7,
		TargetDistance:       180,
		PickupDistance:       170,
		PreferredRange:       180,
		AttackRange:          220,
		Enemies:              1,
		Allies:               1,
		HealthStacks:         1,
		Ammo:                 2,
		MaxAmmo:              3,
		TargetKind:           "player",
		PickupType:           "health_boost",
		HasTarget:            true,
		HasPickup:            true,
	}
	assassin := base
	assassin.Role = "Assassin"
	sharpshooter := base
	sharpshooter.Role = "Sharpshooter"
	if scoreBotUtility(assassin)[botUtilityEngage] <= scoreBotUtility(sharpshooter)[botUtilityEngage] {
		t.Fatal("assassin role did not receive an engage bias")
	}
	if scoreBotUtility(sharpshooter)[botUtilityRetreat] <= scoreBotUtility(assassin)[botUtilityRetreat] {
		t.Fatal("sharpshooter role did not receive a safety bias")
	}
}

func TestBotAbilityUtilityPrefersAssassinSuperForFinish(t *testing.T) {
	ctx := botUtilityContext{
		HealthFraction:       .65,
		TargetHealthFraction: .2,
		TargetDistance:       140,
		AttackRange:          160,
		Enemies:              1,
		Allies:               0,
		Role:                 "Assassin",
		TargetKind:           "player",
		HasTarget:            true,
		TargetInAttackRange:  true,
	}
	if scoreBotAbility(ctx, botAbilitySuper) <= scoreBotAbility(ctx, botAbilityGadget) {
		t.Fatalf("assassin did not value finish super: super=%.1f gadget=%.1f", scoreBotAbility(ctx, botAbilitySuper), scoreBotAbility(ctx, botAbilityGadget))
	}
}

func TestBotAbilityUtilityPrefersGadgetForLowHealthClosePressure(t *testing.T) {
	ctx := botUtilityContext{
		HealthFraction:       .25,
		TargetHealthFraction: .85,
		TargetDistance:       80,
		AttackRange:          180,
		Enemies:              3,
		Allies:               0,
		Role:                 "Sharpshooter",
		TargetKind:           "player",
		HasTarget:            true,
		TargetInAttackRange:  true,
	}
	if scoreBotAbility(ctx, botAbilityGadget) <= scoreBotAbility(ctx, botAbilitySuper) {
		t.Fatalf("sharpshooter did not value escape gadget: super=%.1f gadget=%.1f", scoreBotAbility(ctx, botAbilitySuper), scoreBotAbility(ctx, botAbilityGadget))
	}
}

func TestBotUtilityValuesContestedHealthBoostAsAResourceRace(t *testing.T) {
	open := scoreBotUtility(botUtilityContext{
		HealthFraction: .7, PickupDistance: 180, HealthStacks: 1,
		PickupType: "health_boost", HasPickup: true,
	})
	contested := scoreBotUtility(botUtilityContext{
		HealthFraction: .7, PickupDistance: 180, PickupEnemyDistance: 240,
		HealthStacks: 1, PickupType: "health_boost", PickupContested: true,
		HasPickup: true,
	})
	if contested[botUtilityCollect] <= open[botUtilityCollect] {
		t.Fatalf("contested cube did not gain race priority: open=%.1f contested=%.1f", open[botUtilityCollect], contested[botUtilityCollect])
	}
}

func TestBotUtilityDecisionRecordsMatchLocalTelemetry(t *testing.T) {
	gs := &GameState{BotMemory: make(map[string]*BotPerception), Players: map[string]*player.Player{}}
	bot := &player.Player{PlayerId: "bot", HeroName: "Kaze", Lives: 500, MaxLives: 650, Ammo: 2, MaxAmmo: 3}
	pickup := prop.NewProp("health_boost", 120, 100, 12)
	bot.X, bot.Y = 100, 100
	gs.botUtilityActionFor(bot.PlayerId, bot, nil, pickup, 10_000)
	metrics := gs.BotAIMetricsSnapshot()
	if metrics.Decisions != 1 || metrics.ActionSelections[string(botUtilityCollect)] != 1 {
		t.Fatalf("utility telemetry = %#v, want one collect decision", metrics)
	}
}
