package game

import (
	"math"
	"reflect"
	"testing"
)

type rosterOutcomeTrial struct {
	hero           string
	targetDistance float64
}

func runRosterBasicOutcome(t *testing.T, trial rosterOutcomeTrial) CombatScenarioReport {
	t.Helper()
	state := newScenarioSoloState(trial.hero, "Kaze")
	state.Walls = nil
	attacker, target := state.Players["hero"], state.Players["target"]
	attacker.X, attacker.Y = 160, 160
	target.X, target.Y = attacker.X+trial.targetDistance, attacker.Y
	// Use a common 650 HP target so full-ammo deletion is a comparable
	// counterplay check across the roster, rather than an unbounded damage sum.
	target.MaxLives, target.Lives = 650, 650
	attackRate, reloadTime := attacker.AttackRate, attacker.ReloadTime
	attacker.Ammo, attacker.MaxAmmo = 3, 3
	runner := NewCombatScenarioRunner("outcome-basic-"+trial.hero, 640, ModeDeathmatch, state)
	for index := 0; index < attacker.MaxAmmo; index++ {
		atMs := int64(index) * attackRate
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: atMs, PlayerID: attacker.PlayerId, Type: "full_ammo_basic"}, func(gs *GameState, _ CombatScenarioInput) {
			gs.playerShoot(attacker.PlayerId, gs.nowMs(), screenAngleFromWorld(0), trial.targetDistance)
		}); err != nil {
			t.Fatalf("apply %s basic shot %d: %v", trial.hero, index, err)
		}
	}
	windowMs := int64(math.Max(float64(3_000), float64(2*attackRate+reloadTime)))
	if err := runner.AdvanceTo(windowMs); err != nil {
		t.Fatalf("advance %s basic outcome: %v", trial.hero, err)
	}
	damage := 650 - target.Lives
	if err := runner.RecordMetric("basicDamage", float64(damage)); err != nil {
		t.Fatalf("record %s basic damage: %v", trial.hero, err)
	}
	fullAmmoDeleted := 0.0
	if !target.IsAlive() {
		fullAmmoDeleted = 1
	}
	if err := runner.RecordMetric("fullAmmoDeleted", fullAmmoDeleted); err != nil {
		t.Fatalf("record %s full ammo deletion: %v", trial.hero, err)
	}
	if err := runner.RecordMetric("shotsFired", float64(attacker.AttackPulse)); err != nil {
		t.Fatalf("record %s shots: %v", trial.hero, err)
	}
	if err := runner.RecordMetric("attackRateMs", float64(attackRate)); err != nil {
		t.Fatalf("record %s attack rate: %v", trial.hero, err)
	}
	if err := runner.RecordMetric("reloadMs", float64(reloadTime)); err != nil {
		t.Fatalf("record %s reload: %v", trial.hero, err)
	}
	if err := runner.RecordMetric("fullAmmoWindowMs", float64(2*attackRate)); err != nil {
		t.Fatalf("record %s full ammo window: %v", trial.hero, err)
	}
	if err := runner.RecordMetric("basicDamagePerSecond", float64(damage)*1000/float64(windowMs)); err != nil {
		t.Fatalf("record %s basic dps: %v", trial.hero, err)
	}
	return runner.Report()
}

func runRosterBasicTTK(t *testing.T, trial rosterOutcomeTrial) CombatScenarioReport {
	t.Helper()
	state := newScenarioSoloState(trial.hero, "Kaze")
	state.Walls = nil
	attacker, target := state.Players["hero"], state.Players["target"]
	attacker.X, attacker.Y = 160, 160
	target.X, target.Y = attacker.X+trial.targetDistance, attacker.Y
	target.MaxLives, target.Lives = 650, 650
	attackRate := attacker.AttackRate
	if attackRate <= 0 {
		attackRate = 500
	}
	runner := NewCombatScenarioRunner("outcome-ttk-"+trial.hero, 641, ModeDeathmatch, state)
	deathAt := int64(-1)
	nextAt := int64(0)
	for attempt := 0; attempt < 60 && deathAt < 0; attempt++ {
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: nextAt, PlayerID: attacker.PlayerId, Type: "ttk_basic"}, func(gs *GameState, _ CombatScenarioInput) {
			gs.playerShoot(attacker.PlayerId, gs.nowMs(), screenAngleFromWorld(0), trial.targetDistance)
		}); err != nil {
			t.Fatalf("apply %s TTK shot %d: %v", trial.hero, attempt, err)
		}
		if !target.IsAlive() {
			deathAt = nextAt
			break
		}
		resolveAt := nextAt + 220
		if err := runner.AdvanceTo(resolveAt); err != nil {
			t.Fatalf("resolve %s TTK shot %d: %v", trial.hero, attempt, err)
		}
		if !target.IsAlive() {
			deathAt = resolveAt
			break
		}
		nextAt = resolveAt + attackRate
	}
	if deathAt < 0 {
		t.Fatalf("%s did not produce a TTK within the deterministic trial: lives=%d ammo=%d report=%#v", trial.hero, target.Lives, attacker.Ammo, runner.Report())
	}
	if err := runner.RecordMetric("ttkMs", float64(deathAt)); err != nil {
		t.Fatalf("record %s ttk: %v", trial.hero, err)
	}
	if err := runner.RecordMetric("shotsFired", float64(attacker.AttackPulse)); err != nil {
		t.Fatalf("record %s ttk shots: %v", trial.hero, err)
	}
	return runner.Report()
}

func TestScenarioPackRosterBasicOutcomeBaselineIsReplayable(t *testing.T) {
	trials := []rosterOutcomeTrial{
		{hero: "Needle", targetDistance: 120},
		{hero: "Mandy", targetDistance: 60},
		{hero: "Fairy Mina", targetDistance: 120},
		{hero: "Brock Zeus", targetDistance: 120},
		{hero: "Kaze", targetDistance: 60},
		{hero: "Wukong Mico", targetDistance: 70},
		{hero: "Persephone Lumi", targetDistance: 120},
		{hero: "Katty", targetDistance: 120},
	}
	run := func() []CombatScenarioReport {
		reports := make([]CombatScenarioReport, 0, len(trials))
		for _, trial := range trials {
			report := runRosterBasicOutcome(t, trial)
			if err := ValidateCombatScenarioReport(report); err != nil {
				t.Fatalf("%s outcome report invalid: %v", trial.hero, err)
			}
			damage, damageOK := scenarioMetric(report, "basicDamage")
			shots, shotsOK := scenarioMetric(report, "shotsFired")
			cadence, cadenceOK := scenarioMetric(report, "attackRateMs")
			deleted, deletedOK := scenarioMetric(report, "fullAmmoDeleted")
			if !damageOK || damage <= 0 || !shotsOK || shots != 3 || !cadenceOK || cadence <= 0 || !deletedOK || deleted < 0 || deleted > 1 {
				t.Fatalf("%s basic outcome is not readable: damage=%.1f shots=%.1f cadence=%.1f report=%#v", trial.hero, damage, shots, cadence, report)
			}
			reports = append(reports, report)
		}
		return reports
	}
	first, second := run(), run()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("roster outcome reports differ:\nfirst=%#v\nsecond=%#v", first, second)
	}
}

func TestScenarioPackRosterBasicTTKIsFiniteAndReplayable(t *testing.T) {
	trials := []rosterOutcomeTrial{
		{hero: "Needle", targetDistance: 120},
		{hero: "Mandy", targetDistance: 60},
		{hero: "Fairy Mina", targetDistance: 120},
		{hero: "Brock Zeus", targetDistance: 120},
		{hero: "Kaze", targetDistance: 60},
		{hero: "Wukong Mico", targetDistance: 70},
		{hero: "Persephone Lumi", targetDistance: 120},
		{hero: "Katty", targetDistance: 120},
	}
	run := func() []CombatScenarioReport {
		reports := make([]CombatScenarioReport, 0, len(trials))
		for _, trial := range trials {
			report := runRosterBasicTTK(t, trial)
			if err := ValidateCombatScenarioReport(report); err != nil {
				t.Fatalf("%s TTK report invalid: %v", trial.hero, err)
			}
			ttk, ttkOK := scenarioMetric(report, "ttkMs")
			shots, shotsOK := scenarioMetric(report, "shotsFired")
			if !ttkOK || ttk <= 0 || !shotsOK || shots <= 0 {
				t.Fatalf("%s TTK is not finite: ttk=%.1f shots=%.1f report=%#v", trial.hero, ttk, shots, report)
			}
			reports = append(reports, report)
		}
		return reports
	}
	first, second := run(), run()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("roster TTK reports differ:\nfirst=%#v\nsecond=%#v", first, second)
	}
}
