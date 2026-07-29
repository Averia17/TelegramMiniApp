package game

import "testing"

func TestRangedHeroesTradeSafetyForLowerBaseDamage(t *testing.T) {
	wantDamage := map[string]int{
		"Shadow":          650,
		"Fairy Mina":      560,
		"Brock Zeus":      1100,
		"Damian":          950,
		"Persephone Lumi": 850,
	}

	for name, want := range wantDamage {
		hero := GetHeroByName(name)
		if hero == nil {
			t.Fatalf("missing ranged hero %q", name)
		}
		if hero.Attack.Range <= 200 {
			t.Fatalf("%s range = %.0f, want a ranged attack", name, hero.Attack.Range)
		}
		if hero.AttackDamage != want {
			t.Errorf("%s damage = %d, want %d", name, hero.AttackDamage, want)
		}
	}
}

func TestNoBasicAttackCanEliminateAnyHeroInTwoAmmo(t *testing.T) {
	minHealth := Heroes[0].MaxLives
	for _, hero := range Heroes[1:] {
		if hero.MaxLives < minHealth {
			minHealth = hero.MaxLives
		}
	}

	for _, hero := range Heroes {
		packetDamage := hero.AttackDamage
		switch hero.Name {
		case "Fairy Mina":
			packetDamage *= 3
		case "Kaze":
			packetDamage *= 2
		}
		if packetDamage*2 >= minHealth {
			t.Errorf("%s deals up to %d with two ammo, minimum hero health is %d",
				hero.Name, packetDamage*2, minHealth)
		}
	}
}

func TestBrockDirectHitDoesNotApplyExplosionDamageTwice(t *testing.T) {
	gs := newTestGameState()
	gs.State = GameStateGame
	gs.PlayerAdd("brock", "Brock", "Brock Zeus")
	gs.PlayerAdd("target", "Target", "Fairy Mina")
	source, target := gs.Players["brock"], gs.Players["target"]
	source.X, source.Y = 500, 500
	target.X, target.Y = 525, 500

	BrockZeusKit{}.Basic(gs, source, 1_000, 0, 0)
	gs.updateBullets()

	if dealt := target.MaxLives - target.Lives; dealt != source.AttackDmg {
		t.Fatalf("direct hit dealt %d, want one damage instance (%d)", dealt, source.AttackDmg)
	}
}
