package game

import "testing"

func TestCombatRegistryProvidesPolymorphicHeroKits(t *testing.T) {
	registry := NewCombatRegistry()
	for _, hero := range []string{"Needle", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico", "Persephone Lumi", "Katty"} {
		if registry.CombatKitFor(hero) == nil || registry.BasicCombatKitFor(hero) == nil {
			t.Fatalf("missing combat registration for %q", hero)
		}
	}
	if registry.CombatKitFor("unknown") != nil || registry.BasicCombatKitFor("unknown") != nil {
		t.Fatal("unknown hero unexpectedly received a combat kit")
	}
}
