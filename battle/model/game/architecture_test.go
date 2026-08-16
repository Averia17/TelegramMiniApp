package game

import (
	"battle/model/gamemap"
	"battle/model/player"
	"testing"
)

type architectureMapProvider struct {
	loadedName string
	mapValue   *gamemap.GameMap
}

func (p *architectureMapProvider) LoadMap(name string) (*gamemap.GameMap, error) {
	p.loadedName = name
	return p.mapValue, nil
}

type architectureHeroCatalog struct {
	hero Hero
}

func (c architectureHeroCatalog) Find(name string) (Hero, bool) {
	if name != c.hero.Name {
		return Hero{}, false
	}
	return c.hero, true
}

func (c architectureHeroCatalog) Random() Hero {
	return c.hero
}

func TestNewGameStateUsesInjectedMapAndHeroDependencies(t *testing.T) {
	mapProvider := &architectureMapProvider{mapValue: &gamemap.GameMap{
		WidthInPixels: 640,
		HeightInPixels: 480,
	}}
	catalog := architectureHeroCatalog{hero: Heroes[0]}

	state := NewGameState(GameConfig{
		RoomName:   "room-1",
		MapName:    "future-map",
		MaxPlayers: 4,
		Mode:       ModeDeathmatch,
		Dependencies: GameDependencies{
			MapProvider:  mapProvider,
			HeroCatalog: catalog,
		},
	})

	if mapProvider.loadedName != "future-map" {
		t.Fatalf("map provider loaded %q, want future-map", mapProvider.loadedName)
	}
	if state.Map != mapProvider.mapValue || state.Walls == nil {
		t.Fatalf("state did not initialize the injected map and collision index")
	}
	state.PlayerAdd("p1", "Player", catalog.hero.Name)
	if state.Players["p1"] == nil || state.Players["p1"].HeroName != catalog.hero.Name {
		t.Fatalf("state did not use the injected hero catalog")
	}
}

func TestModeRulesFactoryKeepsSoloModeAndEncapsulatesTeamAssignment(t *testing.T) {
	if got := NewMatchRules(ModeDeathmatch).Mode(); got != ModeDeathmatch {
		t.Fatalf("deathmatch rules mode = %q", got)
	}
	if got := NewMatchRules(ModeTeamDeathmatch).Mode(); got != ModeTeamDeathmatch {
		t.Fatalf("team rules mode = %q", got)
	}

	state := &GameState{Players: map[string]*player.Player{
		"p1": Heroes[0].CreatePlayer("p1", "One", 0, 0),
		"p2": Heroes[0].CreatePlayer("p2", "Two", 0, 0),
	}}
	NewMatchRules(ModeDeathmatch).AssignTeams(state)
	if state.Players["p1"].Team != "" || state.Players["p2"].Team != "" {
		t.Fatal("solo rules unexpectedly assigned teams")
	}
	NewMatchRules(ModeTeamDeathmatch).AssignTeams(state)
	if state.Players["p1"].Team == "" || state.Players["p2"].Team == "" {
		t.Fatal("team rules did not assign teams")
	}
}
