package game

import (
	"strings"
	"sync"
)

// MatchRulesFactory creates the policy object for one authoritative mode.
// New modes register here instead of extending a central switch statement.
type MatchRulesFactory func() MatchRules

type MatchRulesRegistry struct {
	mu        sync.RWMutex
	factories map[GameMode]MatchRulesFactory
}

func NewMatchRulesRegistry() *MatchRulesRegistry {
	registry := &MatchRulesRegistry{factories: make(map[GameMode]MatchRulesFactory)}
	registry.Register(ModeDeathmatch, func() MatchRules { return DeathmatchRules{} })
	registry.Register(ModeTeamDeathmatch, func() MatchRules { return TeamDeathmatchRules{} })
	return registry
}

func (registry *MatchRulesRegistry) Register(mode GameMode, factory MatchRulesFactory) {
	if registry == nil || factory == nil {
		return
	}
	mode = GameMode(strings.TrimSpace(strings.ToLower(string(mode))))
	if mode == "" {
		return
	}
	registry.mu.Lock()
	registry.factories[mode] = factory
	registry.mu.Unlock()
}

func (registry *MatchRulesRegistry) Resolve(mode GameMode) MatchRules {
	if registry == nil {
		return DeathmatchRules{}
	}
	mode = GameMode(strings.TrimSpace(strings.ToLower(string(mode))))
	registry.mu.RLock()
	factory := registry.factories[mode]
	registry.mu.RUnlock()
	if factory == nil {
		return DeathmatchRules{}
	}
	return factory()
}

func (registry *MatchRulesRegistry) IsRegistered(mode GameMode) bool {
	if registry == nil {
		return false
	}
	mode = GameMode(strings.TrimSpace(strings.ToLower(string(mode))))
	registry.mu.RLock()
	_, exists := registry.factories[mode]
	registry.mu.RUnlock()
	return exists
}

var defaultMatchRulesRegistry = NewMatchRulesRegistry()

// RegisterMatchRules extends the process-wide default registry during service
// bootstrap. Tests and isolated matches can use NewMatchRulesRegistry instead.
func RegisterMatchRules(mode GameMode, factory MatchRulesFactory) {
	defaultMatchRulesRegistry.Register(mode, factory)
}
