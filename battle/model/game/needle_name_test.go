package game

import "testing"

func TestNeedleIsTheCanonicalHeroName(t *testing.T) {
	for _, input := range []string{"Needle", "needle", "shadow"} {
		hero := GetHeroByName(input)
		if hero == nil || hero.Name != "Needle" {
			t.Fatalf("GetHeroByName(%q) = %#v, want canonical Needle", input, hero)
		}
	}
	if got := CanonicalHeroName("unknown"); got != "" {
		t.Fatalf("CanonicalHeroName(unknown) = %q, want empty", got)
	}
	if CombatKitFor("Needle") == nil || BasicCombatKitFor("Needle") == nil {
		t.Fatal("Needle should have both combat kits")
	}
}

func TestDamianIsNotAvailable(t *testing.T) {
	if got := CanonicalHeroName("Damian"); got != "" {
		t.Fatalf("CanonicalHeroName(Damian) = %q, want empty", got)
	}
	if got := GetHeroByName("Damian"); got != nil {
		t.Fatalf("GetHeroByName(Damian) = %#v, want nil", got)
	}
}
