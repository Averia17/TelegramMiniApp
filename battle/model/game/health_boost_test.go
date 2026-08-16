package game

import (
	"battle/model/monster"
	"battle/model/prop"
	"testing"
)

func TestHealthCrateUses500LivesAndDropsGreenHealthBoost(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("attacker", "Attacker", "Needle")
	gs.State = GameStateGame
	attacker := gs.Players["attacker"]
	crate := prop.NewHealthCrate(160, 100)
	gs.Props = append(gs.Props, crate)

	if crate.Lives != 500 || crate.MaxLives != 500 {
		t.Fatalf("health crate lives=%d/%d, want 500/500", crate.Lives, crate.MaxLives)
	}
	if !gs.damageHealthCrate(attacker, crate, 500) {
		t.Fatal("health crate damage was not accepted")
	}

	var reward *prop.Prop
	for _, candidate := range gs.Props {
		if candidate.Type == "health_boost" {
			reward = candidate
			break
		}
	}
	if crate.Active || reward == nil || !reward.Active {
		t.Fatalf("crate/reward state = crate active %v, reward %#v", crate.Active, reward)
	}
}

func TestCollectingHealthBoostAddsFivePercentOfOriginalHealth(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("collector", "Collector", "Mandy")
	gs.State = GameStateGame
	collector := gs.Players["collector"]
	collector.Lives = collector.MaxLives / 2
	reward := prop.NewProp("health_boost", collector.X, collector.Y, 12)
	gs.Props = append(gs.Props, reward)

	baseMaxLives := collector.MaxLives
	baseLives := collector.Lives
	gs.collectPickups(collector)

	wantBonus := int(float64(baseMaxLives)*.05 + .5)
	if collector.MaxLives != baseMaxLives+wantBonus || collector.Lives != baseLives+wantBonus {
		t.Fatalf("collector lives=%d/%d, want %d/%d", collector.Lives, collector.MaxLives, baseLives+wantBonus, baseMaxLives+wantBonus)
	}
	if reward.Active {
		t.Fatal("health boost remained active after collection")
	}
}

func TestMonsterHealthBoostDropChanceBoundaries(t *testing.T) {
	if !shouldDropMonsterHealthBoost(1) || !shouldDropMonsterHealthBoost(MonsterHealthBoostDropChancePercent) {
		t.Fatal("health boost should drop inside the configured chance")
	}
	if shouldDropMonsterHealthBoost(MonsterHealthBoostDropChancePercent + 1) {
		t.Fatal("health boost should not drop above the configured chance")
	}
}

func TestMonsterDeathCanAppendHealthBoostDrop(t *testing.T) {
	gs := newTestGameState()
	gs.PlayerAdd("attacker", "Attacker", "Needle")
	gs.State = GameStateGame
	gs.Players["attacker"].X, gs.Players["attacker"].Y = 100, 100
	target := monster.NewMonster(140, 100, 16, 512, 512, 1)
	target.Tier = 1
	gs.Monsters["bat"] = target

	gs.randomHealthBoostDrop = func() bool { return true }
	if !gs.damageMonster("bat", target, 10) {
		t.Fatal("monster was not killed")
	}

	var reward *prop.Prop
	for _, candidate := range gs.Props {
		if candidate.Type == "health_boost" {
			reward = candidate
			break
		}
	}
	if reward == nil {
		t.Fatal("monster kill did not append a health boost")
	}
}
