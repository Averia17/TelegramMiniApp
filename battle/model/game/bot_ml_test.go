package game

import (
	"math"
	"testing"
)

type fixedBotMLPolicy struct {
	name   string
	action BotMLAction
}

func (p fixedBotMLPolicy) Name() string { return p.name }

func (p fixedBotMLPolicy) Decide(BotMLObservation) BotMLAction { return p.action }

type resetTrackingBotMLPolicy struct {
	resets []string
}

func (p *resetTrackingBotMLPolicy) Name() string { return "reset-tracking" }

func (p *resetTrackingBotMLPolicy) Decide(BotMLObservation) BotMLAction { return BotMLActionRoam }

func (p *resetTrackingBotMLPolicy) DecideFor(string, BotMLObservation) BotMLAction {
	return BotMLActionRoam
}

func (p *resetTrackingBotMLPolicy) Reset(botID string) { p.resets = append(p.resets, botID) }

func TestBotMLObservationHasStableShapeClippingAndActionMask(t *testing.T) {
	state := newTestGameState()
	state.State = GameStateWaiting
	state.PlayerAdd("bot", "Bot", "Kaze")
	state.Players["bot"].IsBot = true
	state.Players["bot"].Lives = state.Players["bot"].MaxLives * 2

	observation, err := state.BotMLObservationFor("bot", 10_000)
	if err != nil {
		t.Fatalf("build ML observation: %v", err)
	}
	if observation.SchemaVersion != BotMLObservationSchemaVersion {
		t.Fatalf("schema version=%q, want %q", observation.SchemaVersion, BotMLObservationSchemaVersion)
	}
	if BotMLSchemaFingerprint() != "b5d0859ca5d96741d11034c7b19329b6bcf36dbaae9a7310f156ec5996d542e5" || BotMLActionName(BotMLActionRetreat) != "retreat" {
		t.Fatalf("ML schema metadata is incomplete: fingerprint=%q action=%q", BotMLSchemaFingerprint(), BotMLActionName(BotMLActionRetreat))
	}
	if len(observation.Values) != BotMLObservationSize || len(BotMLFeatureNames()) != BotMLObservationSize {
		t.Fatalf("observation shape values=%d names=%d want=%d", len(observation.Values), len(BotMLFeatureNames()), BotMLObservationSize)
	}
	if len(observation.ActionMask) != int(BotMLActionCount) {
		t.Fatalf("action mask size=%d want=%d", len(observation.ActionMask), BotMLActionCount)
	}
	for index, value := range observation.Values {
		if math.IsNaN(float64(value)) || math.IsInf(float64(value), 0) || value < -1 || value > 1 {
			t.Fatalf("feature %d=%v is not clipped to [-1,1]", index, value)
		}
	}
	if observation.ActionMask[BotMLActionEngage] {
		t.Fatal("engage was valid without a visible target")
	}
	if observation.ActionMask[BotMLActionCollectPickup] {
		t.Fatal("collect_pickup was valid without a pickup")
	}
	if !observation.ActionMask[BotMLActionRoam] || observation.ActionMask[BotMLActionRetreat] {
		t.Fatalf("safe fallback actions are not available: %#v", observation.ActionMask)
	}
}

func TestBotMLScenarioMatrixProducesDistinctMaskedDecisions(t *testing.T) {
	seen := make(map[string]bool)
	for index, scenarioID := range BotMLScenarioIDs() {
		state, err := NewBotMLScenarioState(scenarioID, index)
		if err != nil {
			t.Fatalf("build scenario %q: %v", scenarioID, err)
		}
		observation, err := state.BotMLObservationFor("bot", 10_000)
		if err != nil {
			t.Fatalf("observe scenario %q: %v", scenarioID, err)
		}
		if len(observation.ActionMask) != int(BotMLActionCount) {
			t.Fatalf("scenario %q action mask size=%d", scenarioID, len(observation.ActionMask))
		}
		for action, valid := range observation.ActionMask {
			if valid {
				seen[scenarioID+":"+BotMLActionName(BotMLAction(action))] = true
			}
		}
	}
	for _, want := range []string{
		"open_engage:engage",
		"low_health_retreat:retreat",
		"empty_ammo_retreat:retreat",
		"safe_pickup:collect_pickup",
		"contested_pickup:collect_pickup",
	} {
		if !seen[want] {
			t.Fatalf("scenario matrix missing valid action %q", want)
		}
	}
}

func TestBotMLBenchmarkResetsRecurrentStatePerEpisode(t *testing.T) {
	state, err := NewBotMLScenarioState("open_engage", 0)
	if err != nil {
		t.Fatalf("build scenario: %v", err)
	}
	policy := &resetTrackingBotMLPolicy{}
	if _, err := runBotMLEpisode("reset-check", 1, ModeDeathmatch, 16, state, policy); err != nil {
		t.Fatalf("run episode: %v", err)
	}
	if len(policy.resets) != 1 || policy.resets[0] != "bot" {
		t.Fatalf("recurrent resets=%v, want [bot]", policy.resets)
	}
}

func TestBotMLPolicyControlsTacticalIntentAndBenchmarkIsPaired(t *testing.T) {
	build := func() *GameState {
		state := newTestGameState()
		state.Walls = nil
		state.Props = nil
		state.State = GameStateWaiting
		state.PlayerAdd("bot", "Bot", "Needle")
		state.PlayerAdd("enemy", "Enemy", "Kaze")
		state.State = GameStateGame
		state.Players["bot"].IsBot = true
		state.Players["bot"].X, state.Players["bot"].Y = 100, 100
		state.Players["enemy"].X, state.Players["enemy"].Y = 260, 100
		return state
	}

	comparison, err := RunBotMLBenchmark(BotMLBenchmarkConfig{
		ScenarioID:     "ml-intent-paired",
		Seed:           123,
		Mode:           ModeDeathmatch,
		DurationMs:     640,
		BaselineState:  build(),
		CandidateState: build(),
		Candidate:      fixedBotMLPolicy{name: "fixed-retreat", action: BotMLActionRetreat},
	})
	if err != nil {
		t.Fatalf("run paired ML benchmark: %v", err)
	}
	baseline, ok := scenarioMetric(comparison.Baseline.Report, "bot.retreatDecisions")
	if !ok {
		t.Fatal("baseline report has no retreat metric")
	}
	candidate, ok := scenarioMetric(comparison.Candidate.Report, "bot.retreatDecisions")
	if !ok || candidate <= baseline {
		t.Fatalf("candidate did not control retreat intent: baseline=%.0f candidate=%.0f", baseline, candidate)
	}
	if comparison.Candidate.Policy != "fixed-retreat" {
		t.Fatalf("candidate policy=%q", comparison.Candidate.Policy)
	}
	if len(comparison.Deltas) == 0 {
		t.Fatal("paired benchmark produced no metric deltas")
	}
	if err := ValidateBotMLBenchmark(comparison); err != nil {
		t.Fatalf("paired benchmark validation: %v", err)
	}
}

func TestBotMLBenchmarkSuiteAggregatesPairedSeeds(t *testing.T) {
	build := func() *GameState {
		state := newTestGameState()
		state.Walls = nil
		state.State = GameStateWaiting
		state.PlayerAdd("bot", "Bot", "Needle")
		state.PlayerAdd("enemy", "Enemy", "Kaze")
		state.State = GameStateGame
		state.Players["bot"].IsBot = true
		state.Players["bot"].X, state.Players["bot"].Y = 100, 100
		state.Players["enemy"].X, state.Players["enemy"].Y = 260, 100
		return state
	}
	configs := make([]BotMLBenchmarkConfig, 0, 2)
	for _, seed := range []int64{1, 2} {
		configs = append(configs, BotMLBenchmarkConfig{
			ScenarioID: "ml-suite", Seed: seed, Mode: ModeDeathmatch, DurationMs: 320,
			BaselineState: build(), CandidateState: build(),
			Candidate: fixedBotMLPolicy{name: "fixed-engage", action: BotMLActionEngage},
		})
	}
	suite, err := RunBotMLBenchmarkSuite(configs)
	if err != nil {
		t.Fatalf("run ML benchmark suite: %v", err)
	}
	if suite.Episodes != 2 || len(suite.Reports) != 2 || len(suite.MeanDeltas) == 0 {
		t.Fatalf("suite aggregation=%#v", suite)
	}
	if err := ValidateBotMLBenchmarkSuite(suite); err != nil {
		t.Fatalf("validate ML benchmark suite: %v", err)
	}
}

func TestBotMLPolicyRunsOnTacticalCadenceInsteadOfEverySimulationTick(t *testing.T) {
	state := newTestGameState()
	state.Walls = nil
	state.State = GameStateWaiting
	state.PlayerAdd("bot", "Bot", "Needle")
	state.PlayerAdd("enemy", "Enemy", "Kaze")
	state.State = GameStateGame
	state.Players["bot"].IsBot = true
	state.Players["bot"].X, state.Players["bot"].Y = 100, 100
	state.Players["enemy"].X, state.Players["enemy"].Y = 260, 100
	calls := 0
	policy := BotMLPolicyFunc{
		PolicyName: "counting",
		Fn: func(observation BotMLObservation) BotMLAction {
			calls++
			return BotMLActionEngage
		},
	}
	if _, err := runBotMLEpisode("ml-cadence", 8, ModeDeathmatch, 1_000, state, policy); err != nil {
		t.Fatalf("run cadence episode: %v", err)
	}
	if calls < 2 || calls > 4 {
		t.Fatalf("ML policy was called %d times over 1 second; want tactical cadence, not 60 Hz", calls)
	}
}

func TestBotMLExpertTrajectoryRecordsValidatedStateActionPairs(t *testing.T) {
	build := func() *GameState {
		state := newTestGameState()
		state.Walls = nil
		state.Props = nil
		state.State = GameStateWaiting
		state.PlayerAdd("bot", "Bot", "Needle")
		state.PlayerAdd("enemy", "Enemy", "Kaze")
		state.State = GameStateGame
		state.Players["bot"].IsBot = true
		state.Players["bot"].X, state.Players["bot"].Y = 100, 100
		state.Players["enemy"].X, state.Players["enemy"].Y = 260, 100
		state.EnableBotMLTrajectoryRecording(true)
		return state
	}

	first := build()
	if _, err := runBotMLEpisode("ml-expert-trajectory", 42, ModeDeathmatch, 1_000, first, nil); err != nil {
		t.Fatalf("run expert episode: %v", err)
	}
	samples := first.BotMLTrajectorySnapshot()
	if len(samples) < 2 {
		t.Fatalf("expert trajectory contains %d samples; want at least two tactical decisions", len(samples))
	}
	for index, sample := range samples {
		if sample.BotID != "bot" || sample.Hero != "Needle" || sample.Policy != "utility-v1" {
			t.Fatalf("sample %d metadata=%#v", index, sample)
		}
		if sample.Observation.SchemaVersion != BotMLObservationSchemaVersion || len(sample.Observation.Values) != BotMLObservationSize {
			t.Fatalf("sample %d observation metadata/shape=%#v", index, sample.Observation)
		}
		if int(sample.Action) >= int(BotMLActionCount) || !sample.Observation.ActionMask[sample.Action] {
			t.Fatalf("sample %d contains invalid masked action: action=%d mask=%#v", index, sample.Action, sample.Observation.ActionMask)
		}
		if index > 0 && sample.AtMs < samples[index-1].AtMs {
			t.Fatalf("trajectory timestamps are not monotonic: %d then %d", samples[index-1].AtMs, sample.AtMs)
		}
	}

	second := build()
	if _, err := runBotMLEpisode("ml-expert-trajectory", 42, ModeDeathmatch, 1_000, second, nil); err != nil {
		t.Fatalf("replay expert episode: %v", err)
	}
	other := second.BotMLTrajectorySnapshot()
	if len(other) != len(samples) {
		t.Fatalf("replayed trajectory length=%d want=%d", len(other), len(samples))
	}
	for index := range samples {
		if samples[index].AtMs != other[index].AtMs || samples[index].Action != other[index].Action || samples[index].BotID != other[index].BotID {
			t.Fatalf("replayed sample %d differs: first=%#v second=%#v", index, samples[index], other[index])
		}
	}
}

func TestBotMLRecurrentPolicyUsesMaskedActionsAndBotLocalState(t *testing.T) {
	checkpoint := BotMLRecurrentCheckpoint{
		Kind:               "recurrent-ppo-lstm-v1",
		SchemaVersion:      BotMLObservationSchemaVersion,
		SchemaFingerprint:  BotMLSchemaFingerprint(),
		CombatProfileID:    CombatProfileID,
		CombatRulesVersion: CombatRulesVersion,
		InputSize:          BotMLObservationSize,
		HiddenSize:         1,
		ActionSize:         int(BotMLActionCount),
		InputToHidden:      [][]float64{make([]float64, 4), make([]float64, 4), make([]float64, 4), make([]float64, 4)},
		HiddenToHidden:     [][]float64{make([]float64, 1), make([]float64, 1), make([]float64, 1), make([]float64, 1)},
		LSTMBias:           []float64{0, 0, 0, 0},
		ActorWeight:        [][]float64{make([]float64, 1), make([]float64, 1), make([]float64, 1), make([]float64, 1)},
		ActorBias:          []float64{0, 3, 2, 1},
	}
	// The small fixture above intentionally uses a four-value input even though
	// the public observation has 48 values; constructor validation must reject it.
	if _, err := NewBotMLRecurrentPolicy(checkpoint); err == nil {
		t.Fatal("recurrent policy accepted an incompatible input matrix")
	}
	checkpoint.InputToHidden = make([][]float64, 4)
	for gate := range checkpoint.InputToHidden {
		checkpoint.InputToHidden[gate] = make([]float64, BotMLObservationSize)
	}
	policy, err := NewBotMLRecurrentPolicy(checkpoint)
	if err != nil {
		t.Fatalf("create recurrent policy: %v", err)
	}
	observation := BotMLObservation{SchemaVersion: BotMLObservationSchemaVersion, Values: make([]float32, BotMLObservationSize), ActionMask: []bool{true, true, false, false}}
	if got := policy.DecideFor("bot-a", observation); got != BotMLActionEngage {
		t.Fatalf("masked recurrent action=%d want engage", got)
	}
	if got := policy.DecideFor("bot-b", observation); got != BotMLActionEngage {
		t.Fatalf("second bot recurrent action=%d want engage", got)
	}
	observation.ActionMask = []bool{true, false, false, false}
	if got := policy.DecideFor("bot-a", observation); got != BotMLActionRoam {
		t.Fatalf("recurrent policy ignored action mask: got=%d", got)
	}
}

func TestBotMLShadowPolicyDoesNotChangeUtilityAction(t *testing.T) {
	state := newTestGameState()
	state.Walls = nil
	state.Props = nil
	state.State = GameStateWaiting
	state.PlayerAdd("bot", "Bot", "Needle")
	state.PlayerAdd("enemy", "Enemy", "Kaze")
	state.State = GameStateGame
	state.Players["bot"].IsBot = true
	state.Players["bot"].X, state.Players["bot"].Y = 100, 100
	state.Players["enemy"].X, state.Players["enemy"].Y = 260, 100
	state.SetBotMLShadowPolicy(fixedBotMLPolicy{name: "shadow-retreat", action: BotMLActionRetreat})
	if _, err := runBotMLEpisode("ml-shadow", 77, ModeDeathmatch, 640, state, nil); err != nil {
		t.Fatalf("run shadow episode: %v", err)
	}
	metrics := state.BotAIMetricsSnapshot()
	if metrics.MLShadowDecisions == 0 || metrics.MLShadowDisagreements == 0 || metrics.MLShadowFallbacks != 0 {
		t.Fatalf("shadow metrics=%#v", metrics)
	}
	if metrics.ActionSelections[string(botUtilityEngage)] == 0 {
		t.Fatalf("shadow policy changed utility control: actions=%#v", metrics.ActionSelections)
	}
}

func TestBotMLInvalidActiveActionFallsBackToUtility(t *testing.T) {
	state := newTestGameState()
	state.Walls = nil
	state.Props = nil
	state.State = GameStateWaiting
	state.PlayerAdd("bot", "Bot", "Needle")
	state.PlayerAdd("enemy", "Enemy", "Kaze")
	state.State = GameStateGame
	state.Players["bot"].IsBot = true
	state.Players["bot"].X, state.Players["bot"].Y = 100, 100
	state.Players["enemy"].X, state.Players["enemy"].Y = 260, 100
	state.SetBotMLPolicy(BotMLPolicyFunc{PolicyName: "invalid", Fn: func(BotMLObservation) BotMLAction { return BotMLAction(255) }})
	if _, err := runBotMLEpisode("ml-invalid-active", 78, ModeDeathmatch, 640, state, state.botMLPolicy); err != nil {
		t.Fatalf("run invalid active episode: %v", err)
	}
	metrics := state.BotAIMetricsSnapshot()
	if metrics.MLFallbacks == 0 || metrics.MLDecisions == 0 || metrics.ActionSelections[string(botUtilityEngage)] == 0 {
		t.Fatalf("active ML fallback metrics=%#v", metrics)
	}
}

func TestBotMLActivePolicyRecordsEffectiveUtilityOverride(t *testing.T) {
	state := newTestGameState()
	state.Walls = nil
	state.Props = nil
	state.State = GameStateWaiting
	state.PlayerAdd("bot", "Bot", "Needle")
	state.PlayerAdd("enemy", "Enemy", "Kaze")
	state.State = GameStateGame
	state.Players["bot"].IsBot = true
	state.Players["bot"].X, state.Players["bot"].Y = 100, 100
	state.Players["enemy"].X, state.Players["enemy"].Y = 320, 100
	state.SetBotMLPolicy(fixedBotMLPolicy{name: "forced-retreat", action: BotMLActionRetreat})

	state.botUtilityActionFor("bot", state.Players["bot"], &botTarget{
		kind: "player", id: "enemy", player: state.Players["enemy"], x: 320, y: 100, distance: 220,
	}, nil, 10_000)

	metrics := state.BotAIMetricsSnapshot()
	if metrics.MLDecisions != 1 || metrics.MLUtilityOverrides != 1 {
		t.Fatalf("active ML override metrics=%#v", metrics)
	}
}
