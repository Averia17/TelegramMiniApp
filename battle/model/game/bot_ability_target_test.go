package game

import (
	"battle/model/gamemap"
	"battle/model/monster"
	"battle/model/player"
	"battle/service/geometry"
	"math"
	"testing"
)

func newBrockAbilityTargetState() (*GameState, *player.Player) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.Map = &gamemap.GameMap{WidthInPixels: 1800, HeightInPixels: 1200}
	gs.Walls = geometry.NewSpatialHash(TileSize)
	gs.PlayerAdd("brock", "Brock", "Brock Zeus")
	bot := gs.Players["brock"]
	gs.Players = map[string]*player.Player{"brock": bot}
	bot.IsBot = true
	bot.X, bot.Y = 100, 100
	return gs, bot
}

func TestBrockSuperTargetPrefersNearestHeroOverMonster(t *testing.T) {
	gs, bot := newBrockAbilityTargetState()
	gs.PlayerAdd("near-hero", "Near hero", "Needle")
	gs.PlayerAdd("far-hero", "Far hero", "Kaze")
	nearHero, farHero := gs.Players["near-hero"], gs.Players["far-hero"]
	gs.Players = map[string]*player.Player{bot.PlayerId: bot, nearHero.PlayerId: nearHero, farHero.PlayerId: farHero}
	nearHero.X, nearHero.Y = 360, 100
	farHero.X, farHero.Y = 600, 100
	gs.Monsters["bat"] = monster.NewMonster(180, 100, 16, 1800, 1200, monster.MonsterLives)

	target := gs.botBrockSuperTarget(bot, 10_000)

	if target == nil || target.player != gs.Players["near-hero"] {
		t.Fatalf("Brock super target = %#v, want nearest visible hero", target)
	}
}

func TestBrockSuperTargetFallsBackToNearestMonster(t *testing.T) {
	gs, bot := newBrockAbilityTargetState()
	gs.Monsters["far-bat"] = monster.NewMonster(420, 100, 16, 1800, 1200, monster.MonsterLives)
	gs.Monsters["near-bat"] = monster.NewMonster(220, 100, 16, 1800, 1200, monster.MonsterLives)

	target := gs.botBrockSuperTarget(bot, 10_000)

	if target == nil || target.monster != gs.Monsters["near-bat"] {
		t.Fatalf("Brock super target = %#v, want nearest visible monster", target)
	}
}

func TestBrockBotUsesRandomSuperPointWithoutVisibleTargets(t *testing.T) {
	gs, bot := newBrockAbilityTargetState()
	bot.SuperCharge = SuperMaxChargePercent

	target := gs.botBrockSuperTarget(bot, 10_000)

	if target == nil || target.kind != "point" {
		t.Fatalf("Brock fallback target = %#v, want a random point", target)
	}
	if distance := math.Hypot(target.x-bot.X, target.y-bot.Y); distance <= 0 || distance > botBrockSuperTargetRange {
		t.Fatalf("Brock fallback point distance = %.1f, want inside ability search radius", distance)
	}

	gs.updateBots()
	if len(gs.LightningStrikes) != 3 {
		t.Fatalf("Brock fallback super strikes = %d, want 3", len(gs.LightningStrikes))
	}
}

func TestBrockSuperTargetIgnoresTargetsOutsideAbilitySearchRadius(t *testing.T) {
	gs, bot := newBrockAbilityTargetState()
	gs.State = GameStateWaiting
	gs.PlayerAdd("far-hero", "Far hero", "Needle")
	gs.State = GameStateGame
	farHero := gs.Players["far-hero"]
	farHero.X, farHero.Y = bot.X+botBrockSuperTargetRange+1, bot.Y

	target := gs.botBrockSuperTarget(bot, 10_000)

	if target == nil || target.kind != "point" {
		t.Fatalf("Brock target = %#v, want local random point when hero is outside search radius", target)
	}
}

func TestBotsCanUseTargetlessGadgetsWhenTheirDefensiveConditionIsMet(t *testing.T) {
	for _, heroName := range []string{"Needle", "Mandy", "Wukong Mico", "Kaze", "Katty"} {
		t.Run(heroName, func(t *testing.T) {
			gs := newTestGameState()
			gs.State = GameStateGame
			gs.PlayerAdd("bot", "Bot", heroName)
			bot := gs.Players["bot"]
			bot.IsBot = true
			bot.GadgetCharges = 1
			bot.Lives = bot.MaxLives / 2

			if !gs.botTryAbility(bot.PlayerId, bot, nil, 10_000) {
				t.Fatalf("%s did not use a defensive gadget without an enemy target", heroName)
			}
			if bot.GadgetCharges != 0 {
				t.Fatalf("%s gadget charges=%d, want one spent charge", heroName, bot.GadgetCharges)
			}
		})
	}
}

func TestFairyMinaUsesRepellingWaveToClearDebuffsWithoutAnEnemyTarget(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("mina", "Mina", "Fairy Mina")
	mina := gs.Players["mina"]
	mina.IsBot = true
	mina.GadgetCharges = 1
	mina.PoisonUntil = 20_000

	if !gs.botTryAbility(mina.PlayerId, mina, nil, 10_000) {
		t.Fatal("Mina did not use repelling wave to clear a debuff without an enemy target")
	}
	if mina.PoisonUntil != 0 || mina.GadgetCharges != 0 {
		t.Fatalf("Mina debuff=%d charges=%d, want cleared debuff and spent charge", mina.PoisonUntil, mina.GadgetCharges)
	}
}

func TestPersephoneLumiUsesFlowerBurstFromOwnSetupWithoutAnEnemyTarget(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("lumi", "Lumi", "Persephone Lumi")
	lumi := gs.Players["lumi"]
	lumi.IsBot = true
	lumi.GadgetCharges = 1
	gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: lumi.PlayerId, Kind: "lumi_flower", X: lumi.X, Y: lumi.Y, Radius: LumiFlowerRadius, ExpiresAt: 20_000})

	if !gs.botTryAbility(lumi.PlayerId, lumi, nil, 10_000) {
		t.Fatal("Lumi did not use flower burst from her own setup without an enemy target")
	}
	if lumi.GadgetCharges != 0 || len(gs.HeroZones) != 0 {
		t.Fatalf("Lumi charges=%d zones=%d, want spent charge and consumed setup", lumi.GadgetCharges, len(gs.HeroZones))
	}
}
