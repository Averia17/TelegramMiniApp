package game

import (
	"battle/model/gamemap"
	"testing"
)

func TestMapProviderRegistryAllowsAdditiveMaps(t *testing.T) {
	registry := NewMapProviderRegistry()
	registry.Register("team-arena", func() (*gamemap.GameMap, error) {
		return &gamemap.GameMap{WidthInPixels: 1600}, nil
	})
	if !registry.Supports("team-arena") {
		t.Fatal("registered map is not discoverable")
	}
	loaded, err := registry.LoadMap("team-arena")
	if err != nil || loaded.WidthInPixels != 1600 {
		t.Fatalf("custom map provider failed: map=%+v err=%v", loaded, err)
	}
}

func TestDefaultMapProviderRegistrySupportsBothTeamMapVariants(t *testing.T) {
	for _, name := range []string{"team-battle", "team-battle-northern"} {
		if !IsKnownMap(name) {
			t.Fatalf("map registry does not know %q", name)
		}
		mapValue, err := DefaultMapProvider{}.LoadMap(name)
		if err != nil || mapValue == nil || len(mapValue.TeamSpawners["Blue"]) != 3 || len(mapValue.TeamSpawners["Red"]) != 3 {
			t.Fatalf("load %q = map %#v, err %v", name, mapValue, err)
		}
	}
	classic, err := DefaultMapProvider{}.LoadMap("team-battle")
	northern := mustLoadNorthern(t)
	if err != nil || classic == nil || gamemapFeatureTypeCount(classic.Features, "city_building") != 10 || gamemapFeatureTypeCount(classic.Features, "castle_keep") != 0 {
		t.Fatalf("classic provider did not load the classic city variant: err=%v classic=%v", err, classic)
	}
	if gamemapFeatureTypeCount(northern.Features, "castle_keep") != 2 || gamemapFeatureTypeCount(northern.Features, "castle_house") != 8 {
		t.Fatalf("northern provider did not load the collision-building variant: northern=%v", northern)
	}
}

func gamemapFeatureTypeCount(features []gamemap.MapFeature, featureType string) int {
	count := 0
	for _, feature := range features {
		if feature.Type == featureType {
			count++
		}
	}
	return count
}

func mustLoadNorthern(t *testing.T) *gamemap.GameMap {
	t.Helper()
	mapValue, err := DefaultMapProvider{}.LoadMap("team-battle-northern")
	if err != nil || mapValue == nil {
		t.Fatalf("load northern map: map=%#v err=%v", mapValue, err)
	}
	return mapValue
}
