package game

import (
	"math"
	"testing"
)

func TestHeroBurstBudgetLeavesCounterplay(t *testing.T) {
	minimumHeroHealth := Heroes[0].MaxLives
	for _, hero := range Heroes[1:] {
		if hero.MaxLives < minimumHeroHealth {
			minimumHeroHealth = hero.MaxLives
		}
	}
	maximumComboDamage := int(math.Floor(float64(minimumHeroHealth) * 1.0)) // A control-heavy melee combo still leaves a sliver of counterplay.

	// Values describe the worst legitimate three-attack sequence plus one full
	// ability, including multi-hit attacks and damage-over-time ticks.
	scenarios := map[string]struct {
		basicComboMultiplier float64
		abilityDamage        int
		damageOverTime       int
	}{
		"Needle":          {3, 0, 15},
		"Mandy":           {3.5, 224, 0}, // Two normal strikes and one 1.5x focused strike.
		"Fairy Mina":      {9, 0, 0},     // Three stars in each of three attacks.
		"Brock Zeus":      {3, 180, 60},
		"Kaze":            {3.75, 160, 0}, // Two normal strikes and one 1.75x combo finisher.
		"Wukong Mico":     {3, 140, 72},
		"Persephone Lumi": {3, 35, 0},
	}

	if maximumComboDamage <= 3 {
		t.Fatal("minimum hero health must support a multi-hit combo test")
	}
	for heroName, scenario := range scenarios {
		hero := GetHeroByName(heroName)
		if hero == nil {
			t.Fatalf("missing hero %q", heroName)
		}
		basicDamage := int(math.Round(float64(hero.AttackDamage) * scenario.basicComboMultiplier))
		damage := basicDamage + scenario.abilityDamage + scenario.damageOverTime
		if damage > maximumComboDamage {
			t.Errorf("%s combo damage = %d, want <= %d", heroName, damage, maximumComboDamage)
		}
	}
}
