package game

import "testing"

func TestRoleBenchmarkGivesEveryHeroAReadableTacticalPriority(t *testing.T) {
	tests := []struct {
		hero   string
		setup  func() botUtilityContext
		wanted botUtilityAction
	}{
		{
			hero: "Needle", wanted: botUtilityCollect,
			setup: func() botUtilityContext {
				return botUtilityContext{HealthFraction: .70, PickupDistance: 180, HealthStacks: 1, PickupType: "health_boost", HasPickup: true, Role: "Controller"}
			},
		},
		{
			hero: "Mandy", wanted: botUtilityEngage,
			setup: func() botUtilityContext {
				return botUtilityContext{HealthFraction: .90, TargetHealthFraction: .80, TargetDistance: 80, PreferredRange: 180, AttackRange: 260, Ammo: 2, MaxAmmo: 3, Role: "Fighter", TargetKind: "player", HasTarget: true, TargetInAttackRange: true}
			},
		},
		{
			hero: "Fairy Mina", wanted: botUtilityRetreat,
			setup: func() botUtilityContext {
				return botUtilityContext{HealthFraction: .25, TargetHealthFraction: .80, TargetDistance: 90, PreferredRange: 260, AttackRange: 510, Enemies: 3, Allies: 0, Ammo: 0, MaxAmmo: 3, Role: "Support", TargetKind: "player", HasTarget: true, TargetInAttackRange: true}
			},
		},
		{
			hero: "Brock Zeus", wanted: botUtilityRetreat,
			setup: func() botUtilityContext {
				return botUtilityContext{HealthFraction: .35, TargetHealthFraction: .80, TargetDistance: 90, PreferredRange: 480, AttackRange: 760, Enemies: 3, Allies: 0, Ammo: 0, MaxAmmo: 3, Role: "Sharpshooter", TargetKind: "player", HasTarget: true, TargetInAttackRange: true}
			},
		},
		{
			hero: "Kaze", wanted: botUtilityEngage,
			setup: func() botUtilityContext {
				return botUtilityContext{HealthFraction: .62, TargetHealthFraction: .22, TargetDistance: 110, PreferredRange: 110, AttackRange: 125, Enemies: 2, Allies: 0, Ammo: 1, MaxAmmo: 3, Role: "Assassin", TargetKind: "player", HasTarget: true, TargetInAttackRange: true}
			},
		},
		{
			hero: "Wukong Mico", wanted: botUtilityEngage,
			setup: func() botUtilityContext {
				return botUtilityContext{HealthFraction: .90, TargetHealthFraction: .80, TargetDistance: 100, PreferredRange: 130, AttackRange: 140, Enemies: 1, Allies: 1, Ammo: 2, MaxAmmo: 3, Role: "Tank", TargetKind: "player", HasTarget: true, TargetInAttackRange: true}
			},
		},
		{
			hero: "Persephone Lumi", wanted: botUtilityCollect,
			setup: func() botUtilityContext {
				return botUtilityContext{HealthFraction: .70, PickupDistance: 180, HealthStacks: 1, PickupType: "health_boost", HasPickup: true, Role: "Controller"}
			},
		},
		{
			hero: "Katty", wanted: botUtilityCollect,
			setup: func() botUtilityContext {
				return botUtilityContext{HealthFraction: .70, PickupDistance: 180, HealthStacks: 1, PickupType: "health_boost", HasPickup: true, Role: "Controller"}
			},
		},
	}

	for _, test := range tests {
		t.Run(test.hero, func(t *testing.T) {
			ctx := test.setup()
			scores := scoreBotUtility(ctx)
			got := chooseBotUtilityAction(scores, "", 0, 1_000)
			if got != test.wanted {
				t.Fatalf("role benchmark action=%q, want %q; scores=%#v", got, test.wanted, scores)
			}
		})
	}
}
