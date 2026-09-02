package game

import (
	"math"
	"testing"
)

type pacingAction struct {
	AtMs     int64
	PlayerID string
	Kind     string
}

func acceptedPacingAction(t *testing.T, state *GameState, commandID string) CombatEvent {
	t.Helper()
	for _, event := range state.CombatEvents {
		if event.CommandID == commandID && event.Accepted && (event.Kind == "attack" || event.Kind == "ability") {
			return event
		}
	}
	t.Fatalf("accepted pacing action %q is missing: events=%#v", commandID, state.CombatEvents)
	return CombatEvent{}
}

func TestScenarioPackKazeBrockHasReadableActionRhythm(t *testing.T) {
	state := newScenarioSoloState("Kaze", "Brock Zeus")
	state.Walls = nil
	kaze, brock := state.Players["hero"], state.Players["target"]
	kaze.X, kaze.Y = 160, 160
	brock.X, brock.Y = 420, 160
	kaze.SuperCharge, brock.SuperCharge = 100, 100
	kaze.GadgetCharges = 3
	kaze.MaxLives, kaze.Lives = 1_000, 1_000
	brock.MaxLives, brock.Lives = 1_000, 1_000

	runner := NewCombatScenarioRunner("pacing-kaze-brock", 906, ModeDeathmatch, state)
	actions := []pacingAction{
		{AtMs: 0, PlayerID: kaze.PlayerId, Kind: "commit-super"},
		{AtMs: 600, PlayerID: kaze.PlayerId, Kind: "clash-gadget"},
		{AtMs: 900, PlayerID: kaze.PlayerId, Kind: "poke-basic"},
		{AtMs: 1_500, PlayerID: brock.PlayerId, Kind: "counter-basic"},
		{AtMs: 2_000, PlayerID: brock.PlayerId, Kind: "counter-super"},
		{AtMs: 2_500, PlayerID: kaze.PlayerId, Kind: "reset-basic"},
		{AtMs: 3_000, PlayerID: brock.PlayerId, Kind: "reengage-basic"},
	}
	accepted := make([]CombatEvent, 0, len(actions))
	observedEvents := make([]CombatEvent, 0, len(actions)*2)
	for index, action := range actions {
		commandID := "pacing-" + action.Kind
		input := CombatScenarioInput{AtMs: action.AtMs, PlayerID: action.PlayerID, Type: action.Kind}
		if err := runner.ApplyInput(input, func(gs *GameState, _ CombatScenarioInput) {
			switch action.Kind {
			case "commit-super", "counter-super":
				gs.playerAbility(action.PlayerID, gs.nowMs(), "primary", commandID)
			case "clash-gadget":
				gs.playerAbility(action.PlayerID, gs.nowMs(), "secondary", commandID)
			default:
				player := gs.Players[action.PlayerID]
				target := gs.Players["target"]
				if action.PlayerID == "target" {
					target = gs.Players["hero"]
				}
				angle := math.Atan2(target.Y-player.Y, target.X-player.X)
				gs.playerShootWithCommand(action.PlayerID, gs.nowMs(), screenAngleFromWorld(angle), commandID, math.Hypot(target.X-player.X, target.Y-player.Y))
			}
		}); err != nil {
			t.Fatalf("apply pacing action %d (%s): %v", index, action.Kind, err)
		}
		accepted = append(accepted, acceptedPacingAction(t, state, commandID))
		observedEvents = append(observedEvents, state.CombatEvents...)
	}

	if len(accepted) != len(actions) {
		t.Fatalf("accepted pacing actions=%d, want %d", len(accepted), len(actions))
	}
	maxGapMs := int64(0)
	for index := 1; index < len(accepted); index++ {
		gap := accepted[index].Ts - accepted[index-1].Ts
		if gap > maxGapMs {
			maxGapMs = gap
		}
	}
	if maxGapMs > 3_000 {
		t.Fatalf("pacing gap=%dms, want <=3000ms: actions=%#v", maxGapMs, accepted)
	}
	if err := runner.RecordMetric("meaningfulActionCount", float64(len(accepted))); err != nil {
		t.Fatalf("record meaningful action count: %v", err)
	}
	if err := runner.RecordMetric("maxMeaningfulActionGapMs", float64(maxGapMs)); err != nil {
		t.Fatalf("record meaningful action gap: %v", err)
	}
	fullHealthDelete := 0
	for _, event := range observedEvents {
		if event.Kind == "hit" && event.TargetID == brock.PlayerId && event.TargetLivesBefore == brock.MaxLives && event.TargetLivesAfter <= 0 {
			fullHealthDelete = 1
			break
		}
	}
	if fullHealthDelete != 0 {
		t.Fatalf("untelegraphed full-health delete detected: events=%#v", state.CombatEvents)
	}
	if err := runner.RecordMetric("fullHealthDelete", float64(fullHealthDelete)); err != nil {
		t.Fatalf("record full-health delete metric: %v", err)
	}
	if err := ValidateCombatScenarioReport(runner.Report()); err != nil {
		t.Fatalf("pacing report invalid: %v", err)
	}
}
