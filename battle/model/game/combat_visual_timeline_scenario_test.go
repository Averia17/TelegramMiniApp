package game

import (
	"reflect"
	"testing"
)

type visualTimelineTrial struct {
	hero           string
	targetDistance float64
	initialKind    string
	initialPhase   CombatEffectPhase
	initialZone    string
	impactKind     string
	resolveAt      int64
}

func runVisualTimelineTrial(t *testing.T, trial visualTimelineTrial) CombatScenarioReport {
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
	runner := NewCombatScenarioRunner("visual-timeline-"+trial.hero, 670, ModeDeathmatch, state)
	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "visual_timeline"}, func(gs *GameState, _ CombatScenarioInput) {
		gs.playerAbility(attacker.PlayerId, gs.nowMs(), "primary", "visual-timeline")
	}); err != nil {
		t.Fatalf("apply %s visual timeline: %v", trial.hero, err)
	}
	initial := findCombatEffect(state.Effects, trial.initialKind)
	if trial.initialKind != "" && (initial == nil || initial.Phase != trial.initialPhase) {
		t.Fatalf("%s initial effect %q phase=%v, want %v: %#v", trial.hero, trial.initialKind, effectPhaseOf(initial), trial.initialPhase, state.Effects)
	}
	if trial.initialZone != "" && !hasHeroZone(state, attacker.PlayerId, trial.initialZone) {
		t.Fatalf("%s initial zone %q missing: %#v", trial.hero, trial.initialZone, state.HeroZones)
	}
	if err := runner.AdvanceTo(trial.resolveAt); err != nil {
		t.Fatalf("advance %s visual timeline: %v", trial.hero, err)
	}
	impactObserved := 0.0
	if trial.impactKind != "" && findCombatEffect(state.Effects, trial.impactKind) != nil {
		impactObserved = 1
	}
	if trial.impactKind != "" && impactObserved != 1 {
		t.Fatalf("%s impact effect %q was not materialized by %dms: %#v", trial.hero, trial.impactKind, trial.resolveAt, state.Effects)
	}
	if len(state.CombatEvents) != 1 || state.CombatEvents[0].Phase != "accepted" || !state.CombatEvents[0].Accepted {
		t.Fatalf("%s visual timeline command acknowledgement invalid: %#v", trial.hero, state.CombatEvents)
	}
	if err := runner.RecordMetric("impactObserved", impactObserved); err != nil {
		t.Fatalf("record %s impact: %v", trial.hero, err)
	}
	if err := runner.RecordMetric("counterplayWindowMs", float64(trial.resolveAt)); err != nil {
		t.Fatalf("record %s timeline window: %v", trial.hero, err)
	}
	return runner.Report()
}

func effectPhaseOf(effect *BattleEffect) CombatEffectPhase {
	if effect == nil {
		return ""
	}
	return effect.Phase
}

func hasHeroZone(state *GameState, owner, kind string) bool {
	for _, zone := range state.HeroZones {
		if zone != nil && zone.Owner == owner && zone.Kind == kind {
			return true
		}
	}
	return false
}

func TestScenarioPackVisualTimelineCoversEverySuper(t *testing.T) {
	trials := []visualTimelineTrial{
		{hero: "Needle", targetDistance: 220, initialKind: "needle_root_telegraph", initialPhase: EffectPhaseTelegraph, impactKind: "needle_root_pull", resolveAt: 600},
		{hero: "Mandy", targetDistance: 300, initialKind: "mandy_super_charge", initialPhase: EffectPhaseTelegraph, impactKind: "mandy_super_wave", resolveAt: 800},
		{hero: "Fairy Mina", targetDistance: 260, initialKind: "mina_healing_aura", initialPhase: EffectPhaseActive, resolveAt: 1_000},
		{hero: "Brock Zeus", targetDistance: 260, initialKind: "zeus_strike_warning", initialPhase: EffectPhaseTelegraph, impactKind: "zeus_lightning_strike", resolveAt: 700},
		{hero: "Kaze", targetDistance: 220, initialKind: "kaze_dash", initialPhase: EffectPhaseImpact, impactKind: "kaze_dash", resolveAt: 100},
		{hero: "Wukong Mico", targetDistance: 100, initialKind: "mico_staff_spin", initialPhase: EffectPhaseActive, resolveAt: 100},
		{hero: "Persephone Lumi", targetDistance: 220, initialKind: "lumi_roots", initialPhase: EffectPhaseActive, impactKind: "lumi_root_impact", resolveAt: 700},
		{hero: "Katty", targetDistance: 80, initialZone: "katty_paint_puddle", impactKind: "katty_paint_impact", resolveAt: 600},
	}
	run := func() []CombatScenarioReport {
		reports := make([]CombatScenarioReport, 0, len(trials))
		for _, trial := range trials {
			report := runVisualTimelineTrial(t, trial)
			if err := ValidateCombatScenarioReport(report); err != nil {
				t.Fatalf("%s visual report invalid: %v", trial.hero, err)
			}
			reports = append(reports, report)
		}
		return reports
	}
	first, second := run(), run()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("visual timeline reports differ:\nfirst=%#v\nsecond=%#v", first, second)
	}
}

func TestScenarioPackSuperMissPathDoesNotDamageAnyHero(t *testing.T) {
	trials := []visualTimelineTrial{
		{hero: "Needle", targetDistance: 220},
		{hero: "Mandy", targetDistance: 300},
		{hero: "Fairy Mina", targetDistance: 260},
		{hero: "Brock Zeus", targetDistance: 260},
		{hero: "Kaze", targetDistance: 220},
		{hero: "Wukong Mico", targetDistance: 100},
		{hero: "Persephone Lumi", targetDistance: 220},
		{hero: "Katty", targetDistance: 80},
	}
	for _, trial := range trials {
		state := newScenarioSoloState(trial.hero, "Kaze")
		state.Walls = nil
		attacker, target := state.Players["hero"], state.Players["target"]
		attacker.X, attacker.Y = 160, 160
		attacker.Rotation = 0
		attacker.AimDistance = trial.targetDistance
		attacker.SuperCharge = 100
		target.X, target.Y = attacker.X, attacker.Y+340
		target.MaxLives, target.Lives = 100_000, 100_000
		runner := NewCombatScenarioRunner("super-miss-"+trial.hero, 671, ModeDeathmatch, state)
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "super_miss"}, func(gs *GameState, _ CombatScenarioInput) {
			gs.playerAbility(attacker.PlayerId, gs.nowMs(), "primary", "super-miss")
		}); err != nil {
			t.Fatalf("apply %s Super miss: %v", trial.hero, err)
		}
		if err := runner.AdvanceTo(3_000); err != nil {
			t.Fatalf("advance %s Super miss: %v", trial.hero, err)
		}
		if target.Lives != target.MaxLives {
			t.Fatalf("%s Super miss dealt damage=%d", trial.hero, target.MaxLives-target.Lives)
		}
	}
}
