package game

import "testing"

func findAbilityResolutionEvent(events []CombatEvent, commandID, reason string) *CombatEvent {
	for index := range events {
		event := &events[index]
		if event.Kind == "ability" && event.CommandID == commandID && event.Reason == reason {
			return event
		}
	}
	return nil
}

func TestDelayedAbilityMissEmitsResolutionOutcome(t *testing.T) {
	state := newScenarioSoloState("Brock Zeus", "Kaze")
	state.Walls = nil
	attacker, target := state.Players["hero"], state.Players["target"]
	attacker.X, attacker.Y = 160, 160
	attacker.Rotation = 0
	attacker.AimDistance = 260
	attacker.SuperCharge = 100
	target.X, target.Y = attacker.X, attacker.Y+500
	runner := NewCombatScenarioRunner("ability-resolution-miss", 901, ModeDeathmatch, state)

	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "super"}, func(gs *GameState, _ CombatScenarioInput) {
		gs.playerAbility(attacker.PlayerId, gs.nowMs(), "primary", "ability-miss")
	}); err != nil {
		t.Fatalf("apply Super: %v", err)
	}
	if err := runner.AdvanceTo(2_200); err != nil {
		t.Fatalf("advance miss scenario: %v", err)
	}

	event := findAbilityResolutionEvent(state.CombatEvents, "ability-miss", "ability_missed")
	if event == nil || event.Phase != "miss" || event.Accepted || !event.Resolved {
		t.Fatalf("miss resolution = %#v, want rejected resolved miss", event)
	}
}

func TestDelayedAbilityHitEmitsResolutionOutcome(t *testing.T) {
	state := newScenarioSoloState("Needle", "Kaze")
	state.Walls = nil
	attacker, target := state.Players["hero"], state.Players["target"]
	attacker.X, attacker.Y = 160, 160
	attacker.Rotation = 0
	attacker.AimDistance = 220
	attacker.SuperCharge = 100
	target.X, target.Y = attacker.X+220, attacker.Y
	runner := NewCombatScenarioRunner("ability-resolution-hit", 902, ModeDeathmatch, state)

	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "super"}, func(gs *GameState, _ CombatScenarioInput) {
		gs.playerAbility(attacker.PlayerId, gs.nowMs(), "primary", "ability-hit")
	}); err != nil {
		t.Fatalf("apply Super: %v", err)
	}
	if err := runner.AdvanceTo(3_600); err != nil {
		t.Fatalf("advance hit scenario: %v", err)
	}

	event := findAbilityResolutionEvent(state.CombatEvents, "ability-hit", "ability_resolved")
	if event == nil || event.Phase != "impact" || !event.Accepted || !event.Resolved {
		t.Fatalf("hit resolution = %#v, lives=%d/%d events=%#v, want accepted resolved impact", event, target.Lives, target.MaxLives, state.CombatEvents)
	}
}

func TestEveryDamageSuperEmitsOneMissResolution(t *testing.T) {
	trials := []struct {
		hero   string
		window int64
	}{
		{hero: "Needle", window: 3_500},
		{hero: "Mandy", window: 800},
		{hero: "Brock Zeus", window: 1_900},
		{hero: "Kaze", window: 450},
		{hero: "Wukong Mico", window: 2_500},
		{hero: "Persephone Lumi", window: 6_600},
		{hero: "Katty", window: 7_500},
	}
	for _, trial := range trials {
		state := newScenarioSoloState(trial.hero, "Kaze")
		state.Walls = nil
		attacker, target := state.Players["hero"], state.Players["target"]
		attacker.X, attacker.Y = 160, 160
		attacker.Rotation = 0
		attacker.AimDistance = 260
		attacker.SuperCharge = 100
		target.X, target.Y = attacker.X, attacker.Y+500
		commandID := "ability-miss-" + trial.hero
		runner := NewCombatScenarioRunner("ability-resolution-all-miss-"+trial.hero, 903, ModeDeathmatch, state)
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "super"}, func(gs *GameState, _ CombatScenarioInput) {
			gs.playerAbility(attacker.PlayerId, gs.nowMs(), "primary", commandID)
		}); err != nil {
			t.Fatalf("apply %s Super: %v", trial.hero, err)
		}
		if err := runner.AdvanceTo(trial.window + 100); err != nil {
			t.Fatalf("advance %s miss scenario: %v", trial.hero, err)
		}
		misses := 0
		for _, event := range state.CombatEvents {
			if event.CommandID == commandID && event.Reason == "ability_missed" {
				misses++
			}
		}
		if misses != 1 {
			t.Fatalf("%s miss resolution count=%d events=%#v", trial.hero, misses, state.CombatEvents)
		}
	}
}
