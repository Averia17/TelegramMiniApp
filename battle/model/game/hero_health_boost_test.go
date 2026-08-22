package game

import (
	"battle/model/prop"
	"testing"
)

func TestHeroKillDropsHealthBoostVisibleOnlyToKillerInSolo(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("killer", "Killer", "Needle")
	gs.PlayerAdd("other", "Other", "Mandy")
	gs.PlayerAdd("spectator", "Spectator", "Kaze")
	gs.State = GameStateGame
	killer := gs.Players["killer"]
	target := gs.Players["other"]
	target.Lives = 1
	target.X, target.Y = killer.X, killer.Y

	if gs.dealPlayerDamage(killer, target, 1) <= 0 {
		t.Fatal("lethal hero hit was not applied")
	}

	drop := findHeroHealthBoost(gs.Props)
	if drop == nil {
		t.Fatal("hero kill did not create a health boost")
	}
	if drop.VisibilityPlayerID != killer.PlayerId || drop.VisibilityTeam != "" {
		t.Fatalf("solo drop visibility = player %q/team %q, want killer-only", drop.VisibilityPlayerID, drop.VisibilityTeam)
	}
	if drop.HealthBoostKillerID != killer.PlayerId {
		t.Fatalf("hero drop killer = %q, want %q", drop.HealthBoostKillerID, killer.PlayerId)
	}
}

func TestTeamHeroHealthBoostDistributesFivePercentToKillerAndTwoToTeammates(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch
	gs.PlayerAdd("killer", "Killer", "Needle")
	gs.PlayerAdd("ally", "Ally", "Mandy")
	gs.PlayerAdd("enemy", "Enemy", "Kaze")
	gs.State = GameStateGame
	killer, ally, target := gs.Players["killer"], gs.Players["ally"], gs.Players["enemy"]
	killer.SetTeam("Blue")
	ally.SetTeam("Blue")
	target.SetTeam("Red")
	target.Lives = 1
	killer.X, killer.Y = 100, 100
	ally.X, ally.Y = killer.X, killer.Y
	target.X, target.Y = killer.X, killer.Y

	if gs.dealPlayerDamage(killer, target, 1) <= 0 {
		t.Fatal("lethal team hero hit was not applied")
	}
	drop := findHeroHealthBoost(gs.Props)
	if drop == nil || drop.VisibilityTeam != "Blue" || drop.VisibilityPlayerID != "" {
		t.Fatalf("team drop visibility = %#v, want Blue team", drop)
	}

	killerBase, allyBase := killer.MaxLives, ally.MaxLives
	gs.collectPickups(ally)
	killerBonus := int(float64(killerBase)*.05 + .5)
	allyBonus := int(float64(allyBase)*.02 + .5)
	if killer.MaxLives != killerBase+killerBonus {
		t.Fatalf("killer max health = %d, want %d", killer.MaxLives, killerBase+killerBonus)
	}
	if ally.MaxLives != allyBase+allyBonus {
		t.Fatalf("ally max health = %d, want %d", ally.MaxLives, allyBase+allyBonus)
	}
	if drop.Active {
		t.Fatal("team health boost remained active after a valid teammate collected it")
	}
}

func TestEnemyCannotCollectTeamHeroHealthBoost(t *testing.T) {
	gs := newTestGameState()
	gs.Mode = ModeTeamDeathmatch
	gs.PlayerAdd("killer", "Killer", "Needle")
	gs.PlayerAdd("enemy", "Enemy", "Mandy")
	gs.PlayerAdd("enemy2", "Enemy 2", "Kaze")
	gs.State = GameStateGame
	killer, enemy := gs.Players["killer"], gs.Players["enemy"]
	gs.Players["enemy2"].SetTeam("Red")
	killer.SetTeam("Blue")
	enemy.SetTeam("Red")
	enemy.Lives = 1
	killer.X, killer.Y = 100, 100
	enemy.X, enemy.Y = killer.X, killer.Y
	gs.dealPlayerDamage(killer, enemy, 1)

	drop := findHeroHealthBoost(gs.Props)
	gs.collectPickups(enemy)
	if !drop.Active {
		t.Fatal("enemy collected a health boost owned by the killer's team")
	}
}

func findHeroHealthBoost(props []*prop.Prop) *prop.Prop {
	for _, candidate := range props {
		if candidate != nil && candidate.Type == "health_boost" && candidate.HealthBoostKillerID != "" {
			return candidate
		}
	}
	return nil
}
