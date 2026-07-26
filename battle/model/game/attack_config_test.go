package game

import "testing"

func TestEveryHeroHasServerAuthoritativeAttackConfig(t *testing.T) {
	if len(Heroes) != 14 {
		t.Fatalf("heroes = %d, want 14", len(Heroes))
	}
	for _, hero := range Heroes {
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
		{"Viper", 0},
		{"Titan", 1},
		{"Shadow", 1},
		{"Spark", 0},
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
