package game

import "testing"

func TestHeroCatalogExposesCompleteSelectionMetadata(t *testing.T) {
	for _, hero := range Heroes {
		if hero.DisplayName == "" || hero.Rarity == "" || hero.Title == "" {
			t.Fatalf("%s has incomplete selection identity: %#v", hero.Name, hero)
		}
		if hero.AttackDescription == "" || hero.SuperDescription == "" || hero.PassiveDescription == "" {
			t.Fatalf("%s has incomplete selection descriptions: %#v", hero.Name, hero)
		}
	}
}
