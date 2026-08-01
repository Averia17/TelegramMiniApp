package game

import (
	"math"
	"testing"
)

func TestHeroBurstBudgetLeavesCounterplay(t *testing.T) {
	const basicAttacks = 3
	minimumHeroHealth := Heroes[0].MaxLives
	for _, hero := range Heroes[1:] {
		if hero.MaxLives < minimumHeroHealth {
			minimumHeroHealth = hero.MaxLives
		}
	}
	maximumComboDamage := int(math.Floor(float64(minimumHeroHealth) * .8)) // Leave a reaction window.

	// Values describe the worst legitimate three-attack sequence plus one full
	// ability, including multi-hit attacks and damage-over-time ticks.
	scenarios := map[string]struct {
		hitsPerAttack int
		basicMultiplier float64
		abilityDamage int
		damageOverTime int
 	}{
		"Shadow":          {1, 1, 0, 15},
		"Mandy":           {1, 1.4, 224, 0},
		"Fairy Mina":      {3, 1, 0, 0},
		"Brock Zeus":      {1, 1, 180, 60},
		"Kaze":            {2, 1, 240, 0},
		"Wukong Mico":     {1, 1, 140, 72},
		"Damian":          {1, 1, 120, 0},
		"Persephone Lumi": {1, 1, 35, 0},
	}

	if maximumComboDamage <= basicAttacks {
		t.Fatal("minimum hero health must support a multi-hit combo test")
	}
	for heroName, scenario := range scenarios {
		hero := GetHeroByName(heroName)
		if hero == nil {
			t.Fatalf("missing hero %q", heroName)
		}
		basicDamage := int(math.Round(float64(hero.AttackDamage) * scenario.basicMultiplier))
		damage := basicDamage*scenario.hitsPerAttack*basicAttacks + scenario.abilityDamage + scenario.damageOverTime
		if damage > maximumComboDamage {
			t.Errorf("%s combo damage = %d, want <= %d", heroName, damage, maximumComboDamage)
		}
	}
}
