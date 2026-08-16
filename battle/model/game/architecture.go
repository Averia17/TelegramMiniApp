package game

import (
	"battle/model/gamemap"
	"math/rand"
	"strings"
)

// MapProvider owns map construction. A mode can select a different provider
// without making the simulation depend on embedded Tiled assets.
type MapProvider interface {
	LoadMap(name string) (*gamemap.GameMap, error)
}

type DefaultMapProvider struct{}

// HeroCatalog is the boundary between match lifecycle code and hero data.
// Concrete catalogs can be backed by static data, a versioned balance set, or
// a test fixture while the combat loop keeps the same contract.
type HeroCatalog interface {
	Find(name string) (Hero, bool)
	Random() Hero
}

type StaticHeroCatalog struct {
	heroes []Hero
	byName map[string]Hero
}

func NewStaticHeroCatalog(heroes []Hero) *StaticHeroCatalog {
	copyHeroes := append([]Hero(nil), heroes...)
	byName := make(map[string]Hero, len(copyHeroes))
	for _, hero := range copyHeroes {
		byName[strings.ToLower(strings.TrimSpace(hero.Name))] = hero
	}
	return &StaticHeroCatalog{heroes: copyHeroes, byName: byName}
}

func (c *StaticHeroCatalog) Find(name string) (Hero, bool) {
	if c == nil {
		return Hero{}, false
	}
	normalized := strings.ToLower(strings.TrimSpace(name))
	if normalized == "shadow" {
		normalized = "needle"
	}
	hero, ok := c.byName[normalized]
	return hero, ok
}

func (c *StaticHeroCatalog) Random() Hero {
	if c == nil || len(c.heroes) == 0 {
		return Hero{}
	}
	return c.heroes[rand.Intn(len(c.heroes))]
}

func DefaultHeroCatalog() HeroCatalog {
	return NewStaticHeroCatalog(Heroes)
}

type GameDependencies struct {
	MapProvider MapProvider
	HeroCatalog HeroCatalog
	Combat      *CombatRegistry
	Rules       MatchRules
}

type GameConfig struct {
	RoomName     string
	MapName      string
	MaxPlayers   int
	Mode         GameMode
	Broadcast    func(msgType string, params interface{})
	SendToPlayer func(playerID, msgType string, params interface{})
	Dependencies GameDependencies
}

func NewGameState(config GameConfig) *GameState {
	state := &GameState{
		RoomName:     config.RoomName,
		MapName:      config.MapName,
		MaxPlayers:   config.MaxPlayers,
		Mode:         NormalizeGameMode(config.Mode),
		Broadcast:    config.Broadcast,
		SendToPlayer: config.SendToPlayer,
	}
	InitGameStateWithDependencies(state, config.Dependencies)
	return state
}

func NormalizeGameMode(mode GameMode) GameMode {
	if defaultMatchRulesRegistry != nil && defaultMatchRulesRegistry.IsRegistered(mode) {
		return GameMode(strings.TrimSpace(strings.ToLower(string(mode))))
	}
	return ModeDeathmatch
}
