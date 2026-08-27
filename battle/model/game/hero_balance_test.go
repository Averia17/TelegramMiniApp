package game

import "testing"

func TestRangedHeroesTradeSafetyForLowerBaseDamage(t *testing.T) {
	wantDamage := map[string]int{
		"Needle":     60,
		"Fairy Mina": 40,
		"Brock Zeus": 85,
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

func TestHeroConfigsUseCompactCombatValues(t *testing.T) {
	want := map[string]struct {
		health      int
		damage      int
		speed       int
		bulletSpeed int
	}{
		"Needle":          {600, 60, 13, 23},
		"Mandy":           {700, 100, 15, 0},
		"Fairy Mina":      {650, 40, 14, 30},
		"Brock Zeus":      {600, 85, 12, 36},
		"Kaze":            {650, 85, 16, 0},
		"Wukong Mico":     {900, 100, 14, 0},
		"Persephone Lumi": {680, 60, 15, 28},
	}

	for name, expected := range want {
		hero := GetHeroByName(name)
		if hero == nil {
			t.Fatalf("missing hero %q", name)
		}
		if hero.MaxLives != expected.health || hero.AttackDamage != expected.damage || hero.Speed != expected.speed || hero.BulletSpeed != expected.bulletSpeed {
			t.Errorf("%s compact config = health=%d damage=%d speed=%d bulletSpeed=%d, want %d/%d/%d/%d", name, hero.MaxLives, hero.AttackDamage, hero.Speed, hero.BulletSpeed, expected.health, expected.damage, expected.speed, expected.bulletSpeed)
		}
	}
}

func TestFairyMinaHasReducedPassiveRegenerationRate(t *testing.T) {
	hero := GetHeroByName("Fairy Mina")
	if hero == nil {
		t.Fatal("missing Fairy Mina")
	}
	if hero.RegenRate != .008 {
		t.Fatalf("Fairy Mina regen rate = %.3f, want 0.008", hero.RegenRate)
	}
}

func TestCompactSpeedKeepsPreviousRuntimeTempo(t *testing.T) {
	hero := GetHeroByName("Needle")
	p := hero.CreatePlayer("p1", "Alice", 100, 100)
	if p.Speed != float64(hero.Speed)*RuntimeMovementSpeedScale {
		t.Fatalf("runtime speed = %.2f, want %.2f", p.Speed, float64(hero.Speed)*RuntimeMovementSpeedScale)
	}

	gs := newTestGameState()
	shot := gs.spawnAttackBullet(p, 0, "test", 1, p.BulletSpd, 4, 500, 0, false, false)
	if shot.Speed != float64(hero.BulletSpeed)*RuntimeProjectileSpeedScale {
		t.Fatalf("runtime projectile speed = %.2f, want %.2f", shot.Speed, float64(hero.BulletSpeed)*RuntimeProjectileSpeedScale)
	}
	accelerating := gs.spawnAttackBullet(p, 0, "laser", 1, p.BulletSpd, 4, 500, 0, false, false)
	if accelerating.Acceleration != 21*RuntimeProjectileSpeedScale {
		t.Fatalf("runtime projectile acceleration = %.2f, want %.2f", accelerating.Acceleration, 21*RuntimeProjectileSpeedScale)
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
