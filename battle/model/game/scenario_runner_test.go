package game

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestCombatStateHashIsStableAcrossMapInsertionOrder(t *testing.T) {
	first := newTestGameState()
	second := newTestGameState()
	first.PlayerAdd("alpha", "Alpha", "Needle")
	first.PlayerAdd("bravo", "Bravo", "Kaze")
	second.PlayerAdd("bravo", "Bravo", "Kaze")
	second.PlayerAdd("alpha", "Alpha", "Needle")
	first.Players["alpha"].X, first.Players["alpha"].Y = 100, 100
	first.Players["bravo"].X, first.Players["bravo"].Y = 200, 200
	second.Players["alpha"].X, second.Players["alpha"].Y = 100, 100
	second.Players["bravo"].X, second.Players["bravo"].Y = 200, 200
	first.Players["alpha"].SuperCharge = 40
	second.Players["alpha"].SuperCharge = 40

	if got, want := HashCombatState(first), HashCombatState(second); got != want {
		t.Fatalf("state hash depends on map insertion order: first=%s second=%s", got, want)
	}

	second.Players["alpha"].SuperCharge++
	if HashCombatState(first) == HashCombatState(second) {
		t.Fatal("state hash did not change after a combat state mutation")
	}
}

func TestCombatScenarioReportKeepsProfileAndCheckpointHashes(t *testing.T) {
	state := newTestGameState()
	state.PlayerAdd("alpha", "Alpha", "Needle")
	runner := NewCombatScenarioRunner("super-charge", 42, ModeDeathmatch, state)
	if err := runner.RecordInput(CombatScenarioInput{AtMs: 200, PlayerID: "alpha", Type: "ability", Value: json.RawMessage(`{"slot":"primary"}`)}); err != nil {
		t.Fatalf("record scenario input: %v", err)
	}

	checkpoint := runner.Checkpoint(1_000)
	if err := runner.RecordMetric("skillAssistedKillRate", .75); err != nil {
		t.Fatalf("record scenario metric: %v", err)
	}
	report := runner.Report()
	if report.ScenarioID != "super-charge" || report.Seed != 42 || report.CombatProfileID != CombatProfileID {
		t.Fatalf("scenario metadata = %#v", report)
	}
	if len(report.Inputs) != 1 || report.Inputs[0].Type != "ability" {
		t.Fatalf("scenario input log = %#v", report.Inputs)
	}
	if len(report.Checkpoints) != 1 || !reflect.DeepEqual(report.Checkpoints[0], checkpoint) {
		t.Fatalf("scenario checkpoints = %#v, want %#v", report.Checkpoints, checkpoint)
	}
	if len(report.Metrics) != 1 || report.Metrics[0].Name != "skillAssistedKillRate" || report.Metrics[0].Value != .75 {
		t.Fatalf("scenario metrics = %#v", report.Metrics)
	}
	if err := ValidateCombatScenarioReport(report); err != nil {
		t.Fatalf("scenario report validation: %v", err)
	}
}

func TestCombatScenarioAccuracyMetricRejectsImpossibleSamples(t *testing.T) {
	runner := NewCombatScenarioRunner("accuracy-validation", 43, ModeDeathmatch, newTestGameState())
	if err := runner.RecordAccuracyMetric("accuracy.100", 0, 0); err == nil {
		t.Fatal("zero-attempt accuracy metric was accepted")
	}
	if err := runner.RecordAccuracyMetric("accuracy.100", 2, 3); err == nil {
		t.Fatal("accuracy metric accepted more hits than attempts")
	}
	if err := runner.RecordAccuracyMetric("accuracy.100", 2, 1); err != nil {
		t.Fatalf("valid accuracy metric rejected: %v", err)
	}
	report := runner.Report()
	if got, ok := scenarioMetric(report, "accuracy.100.accuracy"); !ok || got != .5 {
		t.Fatalf("recorded accuracy = %.3f, present=%v, want .5", got, ok)
	}
}

func TestCombatScenarioCheckpointCapturesAuthoritativeEventIDs(t *testing.T) {
	state := newTestGameState()
	state.CombatEvents = []CombatEvent{{ID: 7}, {ID: 11}}
	runner := NewCombatScenarioRunner("event-timeline", 1, ModeDeathmatch, state)
	checkpoint := runner.Checkpoint(100)
	if len(checkpoint.EventIDs) != 2 || checkpoint.EventIDs[0] != 7 || checkpoint.EventIDs[1] != 11 {
		t.Fatalf("checkpoint event ids = %#v, want [7 11]", checkpoint.EventIDs)
	}
}

func TestCombatScenarioAdvanceUsesInjectedClockAndIsReplayable(t *testing.T) {
	run := func() CombatScenarioReport {
		state := newTestGameState()
		state.PlayerAdd("alpha", "Alpha", "Kaze")
		state.Players["alpha"].X, state.Players["alpha"].Y = 160, 160
		state.State = GameStateGame
		state.GameEndsAt = combatScenarioEpochMs + 10_000
		runner := NewCombatScenarioRunner("clocked-kaze", 77, ModeDeathmatch, state)
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 120, PlayerID: "alpha", Type: "ability", Value: json.RawMessage(`{"slot":"primary"}`)}, func(gs *GameState, _ CombatScenarioInput) {
			gs.emitCombatEvent(CombatEvent{Kind: "ability", CommandID: "clocked-ability", SourceID: "alpha", Phase: "cast", Accepted: true, Resolved: false})
		}); err != nil {
			t.Fatalf("apply deterministic input: %v", err)
		}
		first := runner.Checkpoint(120)
		if len(first.EventIDs) != 1 || state.CombatEvents[0].Ts != combatScenarioEpochMs+120 {
			t.Fatalf("clocked event = %#v, checkpoint = %#v", state.CombatEvents, first)
		}
		if err := runner.AdvanceTo(420); err != nil {
			t.Fatalf("advance deterministic clock: %v", err)
		}
		runner.Checkpoint(420)
		if err := runner.RecordMetric("eventCount", float64(len(state.CombatEvents))); err != nil {
			t.Fatalf("record deterministic metric: %v", err)
		}
		return runner.Report()
	}

	first, second := run(), run()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("deterministic reports differ:\nfirst=%#v\nsecond=%#v", first, second)
	}
	if err := ValidateCombatScenarioReport(first); err != nil {
		t.Fatalf("deterministic report validation: %v", err)
	}
}

func TestKazeAndKattyScenarioInputsAreReplayable(t *testing.T) {
	setup := func(hero, targetHero string) (*GameState, *CombatScenarioRunner) {
		state := newTestGameState()
		state.PlayerAdd("hero", "Hero", hero)
		state.PlayerAdd("target", "Target", targetHero)
		state.Players["hero"].X, state.Players["hero"].Y = 160, 160
		state.Players["target"].X, state.Players["target"].Y = 250, 160
		state.State = GameStateGame
		state.GameEndsAt = combatScenarioEpochMs + 10_000
		return state, NewCombatScenarioRunner(hero+"-parity", 99, ModeDeathmatch, state)
	}

	runKaze := func() CombatScenarioReport {
		state, runner := setup("Kaze", "Katty")
		for index, atMs := range []int64{0, 500, 1_000} {
			input := CombatScenarioInput{AtMs: atMs, PlayerID: "hero", Type: "basic", Value: json.RawMessage(`{"angle":0}`)}
			commandID := "kaze-basic-" + string(rune('1'+index))
			if err := runner.ApplyInput(input, func(gs *GameState, _ CombatScenarioInput) {
				gs.playerShootWithCommand("hero", gs.nowMs(), 0, commandID, 100)
			}); err != nil {
				t.Fatalf("apply Kaze input: %v", err)
			}
			runner.Checkpoint(atMs)
		}
		if err := runner.AdvanceTo(1_200); err != nil {
			t.Fatalf("advance Kaze scenario: %v", err)
		}
		if err := runner.RecordMetric("effectiveDamage", float64(state.Players["target"].MaxLives-state.Players["target"].Lives)); err != nil {
			t.Fatalf("record Kaze damage: %v", err)
		}
		return runner.Report()
	}

	runKatty := func() CombatScenarioReport {
		state, runner := setup("Katty", "Kaze")
		input := CombatScenarioInput{AtMs: 0, PlayerID: "hero", Type: "basic", Value: json.RawMessage(`{"angle":0}`)}
		if err := runner.ApplyInput(input, func(gs *GameState, _ CombatScenarioInput) {
			gs.playerShootWithCommand("hero", gs.nowMs(), 0, "katty-basic-1", 100)
		}); err != nil {
			t.Fatalf("apply Katty input: %v", err)
		}
		if err := runner.AdvanceTo(320); err != nil {
			t.Fatalf("advance Katty scenario: %v", err)
		}
		if got := state.KattyPaintStacksFor("target"); got != 1 {
			t.Fatalf("Katty paint stacks = %d, want one readable setup stack", got)
		}
		if err := runner.RecordMetric("paintStacks", float64(state.KattyPaintStacksFor("target"))); err != nil {
			t.Fatalf("record Katty setup metric: %v", err)
		}
		return runner.Report()
	}

	kazeFirst, kazeSecond := runKaze(), runKaze()
	if !reflect.DeepEqual(kazeFirst, kazeSecond) {
		t.Fatalf("Kaze reports differ:\nfirst=%#v\nsecond=%#v", kazeFirst, kazeSecond)
	}
	kattyFirst, kattySecond := runKatty(), runKatty()
	if !reflect.DeepEqual(kattyFirst, kattySecond) {
		t.Fatalf("Katty reports differ:\nfirst=%#v\nsecond=%#v", kattyFirst, kattySecond)
	}
}
