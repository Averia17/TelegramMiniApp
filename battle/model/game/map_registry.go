package game

import (
	"battle/model/gamemap"
	"fmt"
	"strings"
	"sync"
)

type MapProviderFactory func() (*gamemap.GameMap, error)

// MapProviderRegistry is the extension point for maps. A map can be added at
// bootstrap without changing room or matchmaking code.
type MapProviderRegistry struct {
	mu        sync.RWMutex
	providers map[string]MapProviderFactory
}

func NewMapProviderRegistry() *MapProviderRegistry {
	registry := &MapProviderRegistry{providers: make(map[string]MapProviderFactory)}
	for _, name := range []string{"small", "huge", "arena", "battle-royale", "team-battle"} {
		mapName := name
		registry.Register(mapName, func() (*gamemap.GameMap, error) { return gamemap.LoadMap(mapName) })
	}
	return registry
}

func (registry *MapProviderRegistry) Register(name string, factory MapProviderFactory) {
	if registry == nil || factory == nil {
		return
	}
	name = normalizeMapName(name)
	if name == "" {
		return
	}
	registry.mu.Lock()
	registry.providers[name] = factory
	registry.mu.Unlock()
}

func (registry *MapProviderRegistry) Supports(name string) bool {
	if registry == nil {
		return false
	}
	registry.mu.RLock()
	_, ok := registry.providers[normalizeMapName(name)]
	registry.mu.RUnlock()
	return ok
}

func (registry *MapProviderRegistry) LoadMap(name string) (*gamemap.GameMap, error) {
	if registry == nil {
		return nil, fmt.Errorf("map registry is nil")
	}
	registry.mu.RLock()
	factory := registry.providers[normalizeMapName(name)]
	registry.mu.RUnlock()
	if factory == nil {
		return nil, fmt.Errorf("unknown map %q", name)
	}
	return factory()
}

func normalizeMapName(name string) string { return strings.ToLower(strings.TrimSpace(name)) }

var defaultMapProviderRegistry = NewMapProviderRegistry()

func (DefaultMapProvider) LoadMap(name string) (*gamemap.GameMap, error) {
	return defaultMapProviderRegistry.LoadMap(name)
}

func RegisterMapProvider(name string, factory MapProviderFactory) {
	defaultMapProviderRegistry.Register(name, factory)
}

func IsKnownMap(name string) bool { return defaultMapProviderRegistry.Supports(name) }
