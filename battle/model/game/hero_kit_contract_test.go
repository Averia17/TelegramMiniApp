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

func TestActiveHeroDescriptionsMatchTheirCurrentMechanics(t *testing.T) {
	checks := map[string]string{
		"Needle":      "Спора летит по прямой, снижает лечение цели на 50% на 2 секунды и раскрывается шестью фиксированными шипами.",
		"Kaze":        "Два попадания открывают усиленный третий удар.",
		"Wukong Mico": "Попадания накапливают до 5 зарядов Ярости.",
	}
	for heroName, want := range checks {
		hero := GetHeroByName(heroName)
		if hero == nil || hero.Kit.Basic.Description != want {
			t.Fatalf("%s basic description=%q, want %q", heroName, hero.Kit.Basic.Description, want)
		}
	}
	needle := GetHeroByName("Needle")
	if needle == nil || needle.Kit.Super.Description != "После 300 мс замаха корень наносит 40 урона, притягивает врагов к центру и оставляет на 3 секунды зону с уроном 15 каждые 0,5 секунды и замедлением 60%." {
		t.Fatalf("Needle super description=%q, want the new pull + damage zone", needle.Kit.Super.Description)
	}
}
