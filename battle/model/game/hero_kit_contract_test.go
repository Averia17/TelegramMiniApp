package game

import "testing"

func TestEveryHeroExposesCompleteKitContract(t *testing.T) {
	for _, hero := range Heroes {
		if hero.Kit.Basic.ID == "" || hero.Kit.Super.ID == "" || hero.Kit.Gadget.ID == "" {
			t.Fatalf("%s has incomplete kit: %#v", hero.Name, hero.Kit)
		}
		if hero.Kit.Basic.Slot != "basic" || hero.Kit.Super.Slot != "primary" || hero.Kit.Gadget.Slot != "secondary" {
			t.Fatalf("%s has invalid slots: %#v", hero.Name, hero.Kit)
		}
	}
}

func TestHeroKitContractIsIncludedInHeroesPayloadModel(t *testing.T) {
	needle := GetHeroByName("Needle")
	if needle == nil || needle.Kit.Super.ID != "hunter_root" || needle.Kit.Gadget.Prediction != "server" {
		t.Fatalf("unexpected Needle contract: %#v", needle)
	}
}

func TestHitThresholdDescriptionsAreReplacedWithTimedRules(t *testing.T) {
	checks := map[string]string{
		"Needle":      "Споровый шип сразу замедляет поражённых врагов на 2 секунды.",
		"Kaze":        "Косые удары: усиленный удар доступен раз в 3 секунды.",
		"Wukong Mico": "Тяжёлый удар посохом наносит стабильный урон без накопления ярости.",
	}
	for heroName, want := range checks {
		hero := GetHeroByName(heroName)
		if hero == nil || hero.Kit.Basic.Description != want {
			t.Fatalf("%s basic description=%q, want %q", heroName, hero.Kit.Basic.Description, want)
		}
	}
}
