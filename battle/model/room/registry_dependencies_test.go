package room

import (
	"battle/model/game"
	"battle/model/gamemap"
	"testing"
)

type fixtureMapProvider struct{}

func (fixtureMapProvider) LoadMap(string) (*gamemap.GameMap, error) {
	return &gamemap.GameMap{WidthInPixels: 777, HeightInPixels: 555}, nil
}

func TestRoomFactoryPassesMapProviderIntoGameState(t *testing.T) {
	ResetRooms()
	defer ResetRooms()
	profile := NormalizeMatchProfile("deathmatch", "small", 4)
	r := GetOrCreateRoomWithDependencies("fixture-map", "fixture-map", profile, game.GameDependencies{
		MapProvider: fixtureMapProvider{},
	})
	if r.State.Map.WidthInPixels != 777 || r.State.Map.HeightInPixels != 555 {
		t.Fatalf("room ignored injected map provider: %+v", r.State.Map)
	}
}
