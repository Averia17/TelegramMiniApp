package game

// CombatRegistry is the composition boundary for hero mechanics. Adding a
// hero only requires registering its concrete kit; dispatch code does not grow
// another hero switch.
type CombatRegistry struct {
	combat map[string]func() CombatKit
	basic  map[string]func() BasicCombatKit
}

func NewCombatRegistry() *CombatRegistry {
	registry := &CombatRegistry{combat: map[string]func() CombatKit{}, basic: map[string]func() BasicCombatKit{}}
	registry.Register("Needle", func() CombatKit { return NeedleKit{} }, func() BasicCombatKit { return NeedleKit{} })
	registry.Register("Mandy", func() CombatKit { return MandyKit{} }, func() BasicCombatKit { return MandyKit{} })
	registry.Register("Fairy Mina", func() CombatKit { return MinaKit{} }, func() BasicCombatKit { return MinaKit{} })
	registry.Register("Brock Zeus", func() CombatKit { return BrockZeusKit{} }, func() BasicCombatKit { return BrockZeusKit{} })
	registry.Register("Kaze", func() CombatKit { return KazeKit{} }, func() BasicCombatKit { return KazeKit{} })
	registry.Register("Wukong Mico", func() CombatKit { return WukongMicoKit{} }, func() BasicCombatKit { return WukongMicoKit{} })
	registry.Register("Persephone Lumi", func() CombatKit { return PersephoneLumiKit{} }, func() BasicCombatKit { return PersephoneLumiKit{} })
	registry.Register("Katty", func() CombatKit { return KattyKit{} }, func() BasicCombatKit { return KattyKit{} })
	return registry
}

func (r *CombatRegistry) Register(hero string, combat func() CombatKit, basic func() BasicCombatKit) {
	if r == nil || hero == "" {
		return
	}
	if combat != nil {
		r.combat[hero] = combat
	}
	if basic != nil {
		r.basic[hero] = basic
	}
}

func (r *CombatRegistry) CombatKitFor(hero string) CombatKit {
	if r == nil || r.combat[hero] == nil {
		return nil
	}
	return r.combat[hero]()
}

func (r *CombatRegistry) BasicCombatKitFor(hero string) BasicCombatKit {
	if r == nil {
		return nil
	}
	if factory := r.basic[hero]; factory != nil {
		return factory()
	}
	if config, ok := heroAttackConfigs[hero]; ok {
		return ConfiguredBasicKit{Config: config}
	}
	return nil
}

var defaultCombatRegistry = NewCombatRegistry()
