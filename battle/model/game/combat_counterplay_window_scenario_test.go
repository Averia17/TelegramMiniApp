package game

import (
	"reflect"
	"testing"
)

type counterplayWindowTrial struct {
	hero           string
	targetDistance float64
	wantWindowMs   int64
	telegraphKind  string
	feedbackKind   string
}

func findCombatEffect(effects []*BattleEffect, kind string) *BattleEffect {
	for _, effect := range effects {
		if effect != nil && effect.Kind == kind {
			return effect
		}
	}
	return nil
}

func runCounterplayWindowTrial(t *testing.T, trial counterplayWindowTrial) CombatScenarioReport {
	t.Helper()
	state := newScenarioSoloState(trial.hero, "Kaze")
	state.Walls = nil
	attacker, target := state.Players["hero"], state.Players["target"]
	attacker.X, attacker.Y = 160, 160
	attacker.Rotation = 0
	attacker.AimDistance = trial.targetDistance
	attacker.SuperCharge = 100
	target.X, target.Y = attacker.X+trial.targetDistance, attacker.Y
	target.MaxLives, target.Lives = 100_000, 100_000
	runner := NewCombatScenarioRunner("counterplay-window-"+trial.hero, 650, ModeDeathmatch, state)
	castAt := runner.CurrentTimeMs()
	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "counterplay_window"}, func(gs *GameState, _ CombatScenarioInput) {
		gs.playerAbility(attacker.PlayerId, gs.nowMs(), "primary", "counterplay-window")
	}); err != nil {
		t.Fatalf("apply %s Super: %v", trial.hero, err)
	}
	// One simulation tick materializes active zone feedback such as Katty's
	// puddle visual while leaving every wind-up timestamp anchored to castAt.
	if err := runner.AdvanceTo(1); err != nil {
		t.Fatalf("materialize %s feedback: %v", trial.hero, err)
	}
	windowMs := int64(0)
	switch trial.hero {
	case "Needle", "Persephone Lumi", "Katty":
		for _, zone := range state.HeroZones {
			if zone != nil && zone.Owner == attacker.PlayerId {
				windowMs = zone.TriggerAt - zone.CreatedAt
				break
			}
		}
	case "Mandy":
		if len(state.PendingMandySupers) > 0 {
			windowMs = state.PendingMandySupers[0].TriggerAt - castAt
		}
	case "Brock Zeus":
		if len(state.LightningStrikes) > 0 {
			windowMs = state.LightningStrikes[0].TriggerAt - castAt
		}
	}
	if windowMs != trial.wantWindowMs {
		t.Fatalf("%s counterplay window=%dms, want %dms", trial.hero, windowMs, trial.wantWindowMs)
	}
	feedback := findCombatEffect(state.Effects, trial.feedbackKind)
	zoneFeedback := false
	if feedback == nil {
		for _, zone := range state.HeroZones {
			if zone != nil && zone.Owner == attacker.PlayerId && zone.Kind == trial.feedbackKind {
				zoneFeedback = true
				break
			}
		}
	}
	if (feedback == nil && !zoneFeedback) || feedback != nil && feedback.Phase == EffectPhaseCast {
		t.Fatalf("%s has no readable feedback effect %q: %#v", trial.hero, trial.feedbackKind, state.Effects)
	}
	telegraphPresent := 0.0
	if trial.telegraphKind != "" {
		telegraph := findCombatEffect(state.Effects, trial.telegraphKind)
		if telegraph == nil || telegraph.Phase != EffectPhaseTelegraph {
			t.Fatalf("%s telegraph %q missing or wrong phase: %#v", trial.hero, trial.telegraphKind, state.Effects)
		}
		telegraphPresent = 1
	}
	if err := runner.RecordMetric("counterplayWindowMs", float64(windowMs)); err != nil {
		t.Fatalf("record %s window: %v", trial.hero, err)
	}
	if err := runner.RecordMetric("telegraphPresent", telegraphPresent); err != nil {
		t.Fatalf("record %s telegraph: %v", trial.hero, err)
	}
	return runner.Report()
}

func TestScenarioPackCounterplayWindowsAreExplicitAndReplayable(t *testing.T) {
	trials := []counterplayWindowTrial{
		{hero: "Needle", targetDistance: 220, wantWindowMs: 300, telegraphKind: "needle_root_telegraph", feedbackKind: "needle_root_telegraph"},
		{hero: "Mandy", targetDistance: 300, wantWindowMs: 800, telegraphKind: "mandy_super_charge", feedbackKind: "mandy_super_charge"},
		{hero: "Fairy Mina", targetDistance: 260, wantWindowMs: 0, feedbackKind: "mina_healing_aura"},
		{hero: "Brock Zeus", targetDistance: 260, wantWindowMs: 700, telegraphKind: "zeus_strike_warning", feedbackKind: "zeus_storm_target"},
		{hero: "Kaze", targetDistance: 220, wantWindowMs: 0, feedbackKind: "kaze_dash"},
		{hero: "Wukong Mico", targetDistance: 100, wantWindowMs: 0, feedbackKind: "mico_staff_spin"},
		{hero: "Persephone Lumi", targetDistance: 220, wantWindowMs: 600, feedbackKind: "lumi_roots"},
		{hero: "Katty", targetDistance: 80, wantWindowMs: 500, feedbackKind: "katty_paint_puddle"},
	}
	run := func() []CombatScenarioReport {
		reports := make([]CombatScenarioReport, 0, len(trials))
		for _, trial := range trials {
			report := runCounterplayWindowTrial(t, trial)
			if err := ValidateCombatScenarioReport(report); err != nil {
				t.Fatalf("%s counterplay report invalid: %v", trial.hero, err)
			}
			reports = append(reports, report)
		}
		return reports
	}
	first, second := run(), run()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("counterplay window reports differ:\nfirst=%#v\nsecond=%#v", first, second)
	}
}
