package game

import "testing"

func TestEveryHeroHasServerAuthoritativeAttackConfig(t *testing.T) {
	expected := []string{"Needle", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico", "Persephone Lumi", "Katty"}
	if len(Heroes) != len(expected) {
		t.Fatalf("heroes = %d, want %d", len(Heroes), len(expected))
	}
	for index, hero := range Heroes {
		if hero.Name != expected[index] {
			t.Fatalf("hero %d = %q, want %q", index, hero.Name, expected[index])
		}
		config := hero.Attack
		if config.Archetype == "" || config.AimShape == "" || config.Range <= 0 {
			t.Fatalf("%s has incomplete attack config: %#v", hero.Name, config)
		}
		kit := BasicCombatKitFor(hero.Name)
		if kit == nil {
			t.Fatalf("%s has no BasicCombatKit", hero.Name)
		}
		if kit.AttackRange() != config.Range || kit.AimShape() != config.AimShape {
			t.Fatalf("%s kit/config mismatch: kit=%s/%.0f config=%s/%.0f",
				hero.Name, kit.AimShape(), kit.AttackRange(), config.AimShape, config.Range)
		}
	}
}

func TestConfiguredHeroesExecuteExpectedBasicAttackArchetype(t *testing.T) {
	cases := []struct {
		hero        string
		wantBullets int
	}{
		{"Needle", 1},
		{"Mandy", 0},
	}
	for _, tc := range cases {
		t.Run(tc.hero, func(t *testing.T) {
			gs := newTestGameState()
			gs.State = GameStateGame
			gs.PlayerAdd("source", tc.hero, tc.hero)
			source := gs.Players["source"]
			source.X, source.Y = 1200, 1200

			gs.playerShoot("source", 10_000, 0, 400)

			active := 0
			for _, shot := range gs.Bullets {
				if shot.Active {
					active++
				}
			}
			if active != tc.wantBullets {
				t.Fatalf("%s active bullets = %d, want %d", tc.hero, active, tc.wantBullets)
			}
		})
	}
}

func TestBasicMeleeAttacksNeverMoveTheAttacker(t *testing.T) {
	for _, hero := range []string{"Mandy", "Kaze", "Wukong Mico"} {
		t.Run(hero, func(t *testing.T) {
			gs := newTestGameState()
			gs.State = GameStateGame
			gs.PlayerAdd("source", hero, hero)
			source := gs.Players["source"]
			source.X, source.Y = 1200, 1200

			gs.playerShoot("source", 10_000, 0, 120)

			if source.X != 1200 || source.Y != 1200 {
				t.Fatalf("%s basic melee moved attacker to (%.1f, %.1f)", hero, source.X, source.Y)
			}
		})
	}
}

func TestEveryMeleeHeroHasItsOwnForwardAttackArea(t *testing.T) {
	expected := map[string]AttackConfig{
		"Mandy":           {Range: 110, HalfArcDegrees: 60},
		"Kaze":            {Range: 125, HalfArcDegrees: 60},
		"Wukong Mico":     {Range: 140, HalfArcDegrees: 60},
		"Persephone Lumi": {Range: 120, HalfArcDegrees: 60},
	}
	for heroName, want := range expected {
		config := heroAttackConfigs[heroName]
		if config.Archetype != AttackMeleeCone || config.AimShape != "cone" {
			t.Fatalf("%s has no melee forward area: %#v", heroName, config)
		}
		if config.Range != want.Range || config.HalfArcDegrees != want.HalfArcDegrees {
			t.Fatalf("%s area = %.0f/%.0f, want %.0f/%.0f",
				heroName, config.Range, config.HalfArcDegrees, want.Range, want.HalfArcDegrees)
		}
	}
}
