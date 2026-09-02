package game

import "testing"

func TestScenarioPackEveryHeroReentersAfterStunRecovery(t *testing.T) {
	for _, hero := range []string{
		"Needle", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico",
		"Persephone Lumi", "Katty",
	} {
		t.Run(hero, func(t *testing.T) {
			state, attacker, defender := skillOutcomeState(hero, "Kaze", ModeDeathmatch)
			attacker.GadgetCharges = 3
			if hero == "Persephone Lumi" {
				state.HeroZones = append(state.HeroZones, &HeroZone{
					Owner: attacker.PlayerId, Kind: "lumi_flower", X: attacker.X, Y: attacker.Y,
					CreatedAt: combatScenarioEpochMs, ExpiresAt: combatScenarioEpochMs + 5_000,
				})
			}
			defender.X, defender.Y = attacker.X+80, attacker.Y
			runner := NewCombatScenarioRunner("reentry-"+hero, 693, ModeDeathmatch, state)
			attacker.StunUntil = combatScenarioEpochMs + 500
			blockedCommand := "reentry-blocked-" + hero
			if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "stunned_gadget"}, func(gs *GameState, _ CombatScenarioInput) {
				gs.playerAbility(attacker.PlayerId, gs.nowMs(), "secondary", blockedCommand)
			}); err != nil {
				t.Fatalf("apply stunned gadget: %v", err)
			}
			blocked := findAbilityEvent(state.CombatEvents, blockedCommand)
			if blocked == nil || blocked.Accepted || blocked.Reason != "ability_unavailable" || attacker.GadgetCharges != 3 {
				t.Fatalf("stunned gadget outcome=%#v charges=%d, want rejected without spending", blocked, attacker.GadgetCharges)
			}

			if err := runner.AdvanceTo(600); err != nil {
				t.Fatalf("advance %s recovery: %v", hero, err)
			}
			readyCommand := "reentry-ready-" + hero
			if err := runner.ApplyInput(CombatScenarioInput{AtMs: 600, PlayerID: attacker.PlayerId, Type: "recovered_gadget"}, func(gs *GameState, _ CombatScenarioInput) {
				gs.playerAbility(attacker.PlayerId, gs.nowMs(), "secondary", readyCommand)
			}); err != nil {
				t.Fatalf("apply recovered gadget: %v", err)
			}
			ready := findAbilityEvent(state.CombatEvents, readyCommand)
			if ready == nil || !ready.Accepted || ready.Reason != "accepted" || attacker.GadgetCharges != 2 {
				t.Fatalf("recovered gadget outcome=%#v charges=%d, want accepted with one charge spent", ready, attacker.GadgetCharges)
			}

			beforeAmmo := attacker.Ammo
			if err := runner.ApplyInput(CombatScenarioInput{AtMs: 700, PlayerID: attacker.PlayerId, Type: "reentry_basic"}, func(gs *GameState, _ CombatScenarioInput) {
				gs.playerShoot(attacker.PlayerId, gs.nowMs(), screenAngleFromWorld(0), 80)
			}); err != nil {
				t.Fatalf("apply %s re-entry basic: %v", hero, err)
			}
			if attacker.Ammo >= beforeAmmo {
				t.Fatalf("%s did not regain basic control after recovery: ammo=%d before=%d", hero, attacker.Ammo, beforeAmmo)
			}
		})
	}
}

func findAbilityEvent(events []CombatEvent, commandID string) *CombatEvent {
	for index := range events {
		if events[index].Kind == "ability" && events[index].CommandID == commandID {
			return &events[index]
		}
	}
	return nil
}
