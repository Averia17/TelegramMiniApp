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
