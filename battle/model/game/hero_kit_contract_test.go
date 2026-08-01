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
	shadow := GetHeroByName("Shadow")
	if shadow == nil || shadow.Kit.Super.ID != "hunter_root" || shadow.Kit.Gadget.Prediction != "server" {
		t.Fatalf("unexpected Shadow contract: %#v", shadow)
	}
}
