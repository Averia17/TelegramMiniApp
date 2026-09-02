package game

import (
	"battle/model/player"
	"battle/model/prop"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"sort"
	"strings"
)

// BotMLObservationSchemaVersion changes whenever the feature order or action
// semantics change. A trained checkpoint must record this value alongside its
// weights.
const BotMLObservationSchemaVersion = "bot-ml-observation-v1"

const BotMLObservationSize = 48

const maxBotMLTrajectorySamples = 100_000

type BotMLAction uint8

const (
	BotMLActionRoam BotMLAction = iota
	BotMLActionEngage
	BotMLActionRetreat
	BotMLActionCollectPickup
	BotMLActionCount
)

var botMLActionNames = [...]string{
	"roam", "engage", "retreat", "collect_pickup",
}

// BotMLObservation is the stable, local-information contract between the Go
// simulator and a learned policy. Values are clipped to [-1, 1]; the action
// mask contains only actions that are structurally possible in this state.
type BotMLObservation struct {
	SchemaVersion string    `json:"schemaVersion"`
	Values        []float32 `json:"values"`
	ActionMask    []bool    `json:"actionMask"`
}

// BotMLTrajectorySample is one offline-learning record emitted by the
// authoritative simulation. The action is always the utility teacher label;
// with a policy installed, the observation may come from a model-visited state
// for DAgger-style distribution-shift correction.
type BotMLTrajectorySample struct {
	AtMs        int64            `json:"atMs"`
	EpisodeID   string           `json:"episodeId,omitempty"`
	Seed        int64            `json:"seed,omitempty"`
	BotID       string           `json:"botId"`
	Hero        string           `json:"hero"`
	Policy      string           `json:"policy"`
	Observation BotMLObservation `json:"observation"`
	Action      BotMLAction      `json:"action"`
}

type BotMLPolicy interface {
	Name() string
	Decide(BotMLObservation) BotMLAction
}

// SetBotMLPolicy installs an optional learned tactical policy for this match.
// A nil policy restores the current deterministic utility bot. The policy is
// intentionally match-local so a model cannot leak state between rooms.
func (gs *GameState) SetBotMLPolicy(policy BotMLPolicy) {
	if gs != nil {
		gs.botMLPolicy = policy
	}
}

// SetBotMLShadowPolicy evaluates a model on the tactical cadence while the
// utility policy remains authoritative. Shadow mode is the default path for
// production experiments and records disagreement/latency without gameplay
// risk.
func (gs *GameState) SetBotMLShadowPolicy(policy BotMLPolicy) {
	if gs != nil {
		gs.botMLShadowPolicy = policy
	}
}

// SetBotMLTacticalPolicy installs the multi-head policy used by the optional
// direct executor. The policy is match-local and can be unset to return to the
// existing deterministic/team strategy.
func (gs *GameState) SetBotMLTacticalPolicy(policy BotMLTacticalPolicy) {
	if gs != nil {
		gs.botMLTacticalPolicy = policy
	}
}

func (gs *GameState) SetBotMLTacticalDirect(enabled bool) {
	if gs != nil {
		gs.botMLTacticalDirect = enabled
	}
}

// EnableBotMLTrajectoryRecording toggles bounded expert-trajectory capture.
// Recording is intentionally opt-in because samples contain local gameplay
// state and are meant for offline training/validation, not live snapshots.
func (gs *GameState) EnableBotMLTrajectoryRecording(enabled bool) {
	if gs == nil {
		return
	}
	gs.botMLRecordTrajectory = enabled
	if !enabled {
		gs.botMLTrajectory = nil
	}
}

// BotMLTrajectorySnapshot returns an owned copy safe for JSON encoding or
// writing to a dataset while the game state continues to run.
func (gs *GameState) BotMLTrajectorySnapshot() []BotMLTrajectorySample {
	if gs == nil || len(gs.botMLTrajectory) == 0 {
		return nil
	}
	snapshot := make([]BotMLTrajectorySample, len(gs.botMLTrajectory))
	for index, sample := range gs.botMLTrajectory {
		snapshot[index] = sample
		snapshot[index].Observation.Values = append([]float32(nil), sample.Observation.Values...)
		snapshot[index].Observation.ActionMask = append([]bool(nil), sample.Observation.ActionMask...)
	}
	return snapshot
}

func (gs *GameState) recordBotMLTrajectory(sample BotMLTrajectorySample) {
	if gs == nil || !gs.botMLRecordTrajectory || len(gs.botMLTrajectory) >= maxBotMLTrajectorySamples {
		return
	}
	gs.botMLTrajectory = append(gs.botMLTrajectory, sample)
}

type BotMLPolicyFunc struct {
	PolicyName string
	Fn         func(BotMLObservation) BotMLAction
}

func (p BotMLPolicyFunc) Name() string { return p.PolicyName }

func (p BotMLPolicyFunc) Decide(observation BotMLObservation) BotMLAction {
	if p.Fn == nil {
		return BotMLActionRoam
	}
	return p.Fn(observation)
}

var botMLFeatureNames = []string{
	"health_fraction", "target_health_fraction", "target_distance",
	"pickup_distance", "preferred_range", "attack_range", "visible_enemies",
	"visible_allies", "health_stacks", "ammo_fraction", "target_none",
	"target_player", "target_monster", "target_objective", "pickup_present",
	"pickup_health_boost", "pickup_lunar", "pickup_contested",
	"pickup_enemy_distance", "target_present", "target_in_attack_range",
	"target_stunned", "target_recently_fired", "bot_expected_damage",
	"target_expected_damage", "bot_time_to_kill", "target_time_to_kill",
	"bot_wins_damage_race", "target_wins_damage_race", "target_can_attack",
	"team_mode", "low_health", "empty_ammo", "current_roam",
	"current_engage", "current_retreat", "current_collect", "action_age",
	"target_memory_age", "target_contested", "target_bearing", "pickup_bearing",
	"position_x", "position_y", "storm_pressure", "aim_error",
	"velocity_x", "velocity_y",
}

func BotMLFeatureNames() []string {
	return append([]string(nil), botMLFeatureNames...)
}

func BotMLActionName(action BotMLAction) string { return botMLActionName(action) }

// BotMLSchemaFingerprint is embedded into training artifacts so a checkpoint
// cannot silently consume a reordered feature vector or action vocabulary.
func BotMLSchemaFingerprint() string {
	parts := []string{BotMLObservationSchemaVersion, strings.Join(botMLFeatureNames, "\x00")}
	for action := BotMLAction(0); action < BotMLActionCount; action++ {
		parts = append(parts, botMLActionName(action))
	}
	digest := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(digest[:])
}

func botMLClip(value float64) float32 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return float32(math.Max(-1, math.Min(1, value)))
}

func botMLNormalize(value, scale float64) float64 {
	if scale <= 0 {
		return 0
	}
	return value / scale
}

func botMLBearing(botX, botY, targetX, targetY float64) float64 {
	return math.Atan2(targetY-botY, targetX-botX) / math.Pi
}

func (gs *GameState) BotMLObservationFor(botID string, now int64) (BotMLObservation, error) {
	if gs == nil {
		return BotMLObservation{}, fmt.Errorf("ML observation requires a game state")
	}
	bot := gs.Players[botID]
	if bot == nil {
		return BotMLObservation{}, fmt.Errorf("ML observation bot %q was not found", botID)
	}
	target := gs.botSelectTarget(bot, now)
	pickup := gs.botPickupTarget(bot)
	ctx := gs.botUtilityContextFor(bot, target, pickup, now)
	memory := gs.BotMemory[botID]
	values := make([]float32, BotMLObservationSize)
	put := func(index int, value float64) { values[index] = botMLClip(value) }
	put(0, ctx.HealthFraction)
	put(1, ctx.TargetHealthFraction)
	put(2, botMLNormalize(ctx.TargetDistance, 1000))
	put(3, botMLNormalize(ctx.PickupDistance, 1000))
	put(4, botMLNormalize(ctx.PreferredRange, 800))
	put(5, botMLNormalize(ctx.AttackRange, 800))
	put(6, botMLNormalize(float64(ctx.Enemies), 4))
	put(7, botMLNormalize(float64(ctx.Allies), 4))
	put(8, botMLNormalize(float64(ctx.HealthStacks), math.Max(1, float64(HealthBoostMaxStacks))))
	put(9, botMLNormalize(float64(ctx.Ammo), math.Max(1, float64(ctx.MaxAmmo))))

	if !ctx.HasTarget {
		put(10, 1)
	} else {
		switch ctx.TargetKind {
		case "player":
			put(11, 1)
		case "monster":
			put(12, 1)
		case "objective":
			put(13, 1)
		}
	}
	put(14, boolFloat(ctx.HasPickup))
	if ctx.PickupType == "health_boost" {
		put(15, 1)
	} else if ctx.HasPickup {
		put(16, 1)
	}
	put(17, boolFloat(ctx.PickupContested))
	put(18, botMLNormalize(ctx.PickupEnemyDistance, 1000))
	put(19, boolFloat(ctx.HasTarget))
	put(20, boolFloat(ctx.TargetInAttackRange))
	put(21, boolFloat(ctx.TargetStunned))
	put(22, boolFloat(ctx.TargetRecentlyFired))
	put(23, botMLNormalize(ctx.BotExpectedDamage, 1000))
	put(24, botMLNormalize(ctx.TargetExpectedDamage, 1000))
	put(25, botMLNormalize(float64(ctx.BotTimeToKillMs), 5000))
	put(26, botMLNormalize(float64(ctx.TargetTimeToKillMs), 5000))
	put(27, boolFloat(ctx.BotWinsDamageRace))
	put(28, boolFloat(ctx.TargetWinsDamageRace))
	put(29, boolFloat(ctx.TargetCanAttack))
	put(30, boolFloat(ctx.TeamMode))
	put(31, boolFloat(ctx.HealthFraction < .45))
	put(32, boolFloat(ctx.MaxAmmo > 0 && ctx.Ammo == 0))
	if memory != nil {
		switch botUtilityAction(memory.UtilityAction) {
		case botUtilityRoam:
			put(33, 1)
		case botUtilityEngage:
			put(34, 1)
		case botUtilityRetreat:
			put(35, 1)
		case botUtilityCollect:
			put(36, 1)
		}
		put(37, botMLNormalize(float64(botMLMaxInt64(0, now-memory.UtilityActionUntil+botUtilityCommitMs)), 2000))
		if memory.LastSeenAt > 0 {
			put(38, botMLNormalize(float64(botMLMaxInt64(0, now-memory.LastSeenAt)), 5000))
		} else {
			put(38, 1)
		}
	}
	put(39, boolFloat(ctx.TargetContested))
	if target != nil {
		put(40, botMLBearing(bot.X, bot.Y, target.x, target.y))
	}
	if pickup != nil {
		put(41, botMLBearing(bot.X, bot.Y, pickup.X, pickup.Y))
	}
	if gs.Map != nil {
		put(42, botMLNormalize(bot.X, gs.Map.WidthInPixels))
		put(43, botMLNormalize(bot.Y, gs.Map.HeightInPixels))
		if gs.StormRadius > 0 {
			centerDistance := math.Hypot(bot.X-gs.Map.WidthInPixels/2, bot.Y-gs.Map.HeightInPixels/2)
			put(44, (centerDistance-gs.StormRadius)/math.Max(1, gs.StormRadius))
		}
	}
	if target != nil {
		desired := math.Atan2(target.y-bot.Y, target.x-bot.X)
		delta := math.Atan2(math.Sin(desired-bot.Rotation), math.Cos(desired-bot.Rotation))
		put(45, math.Abs(delta)/math.Pi)
	}
	put(46, bot.MoveX)
	put(47, bot.MoveY)
	mask := botMLActionMask(gs, bot, target, pickup, now)
	return BotMLObservation{
		SchemaVersion: BotMLObservationSchemaVersion,
		Values:        values,
		ActionMask:    mask,
	}, nil
}

func botMLActionMask(gs *GameState, bot *player.Player, target *botTarget, pickup *prop.Prop, now int64) []bool {
	mask := make([]bool, int(BotMLActionCount))
	if gs == nil || bot == nil || !bot.IsAlive() {
		return mask
	}
	mask[BotMLActionRoam] = true
	mask[BotMLActionRetreat] = target != nil || ctxHealthFraction(bot) < .45
	mask[BotMLActionEngage] = target != nil
	mask[BotMLActionCollectPickup] = pickup != nil && pickup.Active
	_ = now
	return mask
}

func ctxHealthFraction(bot *player.Player) float64 {
	if bot == nil {
		return 0
	}
	return float64(bot.Lives) / math.Max(1, float64(bot.MaxLives))
}

func botMLActionName(action BotMLAction) string {
	if int(action) < 0 || int(action) >= len(botMLActionNames) {
		return "invalid"
	}
	return botMLActionNames[action]
}

func botMLActionToUtility(action BotMLAction) (botUtilityAction, bool) {
	switch action {
	case BotMLActionRoam:
		return botUtilityRoam, true
	case BotMLActionEngage:
		return botUtilityEngage, true
	case BotMLActionRetreat:
		return botUtilityRetreat, true
	case BotMLActionCollectPickup:
		return botUtilityCollect, true
	default:
		return "", false
	}
}

func botUtilityToMLAction(action botUtilityAction) (BotMLAction, bool) {
	switch action {
	case botUtilityRoam:
		return BotMLActionRoam, true
	case botUtilityEngage:
		return BotMLActionEngage, true
	case botUtilityRetreat:
		return BotMLActionRetreat, true
	case botUtilityCollect:
		return BotMLActionCollectPickup, true
	default:
		return BotMLAction(0), false
	}
}

func boolFloat(value bool) float64 {
	if value {
		return 1
	}
	return 0
}

func botMLMaxInt64(value, minimum int64) int64 {
	if value < minimum {
		return minimum
	}
	return value
}

type BotMLBenchmarkConfig struct {
	ScenarioID              string
	Seed                    int64
	Mode                    GameMode
	DurationMs              int64
	BaselineState           *GameState
	CandidateState          *GameState
	Candidate               BotMLPolicy
	CandidateCheckpointHash string
}

type BotMLBenchmarkSide struct {
	Policy string               `json:"policy"`
	Report CombatScenarioReport `json:"report"`
}

type BotMLMetricDelta struct {
	Name      string  `json:"name"`
	Baseline  float64 `json:"baseline"`
	Candidate float64 `json:"candidate"`
	Delta     float64 `json:"delta"`
}

type BotMLBenchmarkReport struct {
	SchemaVersion           string             `json:"schemaVersion"`
	SchemaFingerprint       string             `json:"schemaFingerprint"`
	ScenarioID              string             `json:"scenarioId"`
	Seed                    int64              `json:"seed"`
	Mode                    GameMode           `json:"mode"`
	Baseline                BotMLBenchmarkSide `json:"baseline"`
	Candidate               BotMLBenchmarkSide `json:"candidate"`
	CandidateCheckpointHash string             `json:"candidateCheckpointHash,omitempty"`
	Deltas                  []BotMLMetricDelta `json:"deltas"`
}

type BotMLBenchmarkSuiteReport struct {
	SchemaVersion     string                 `json:"schemaVersion"`
	SchemaFingerprint string                 `json:"schemaFingerprint"`
	Episodes          int                    `json:"episodes"`
	Reports           []BotMLBenchmarkReport `json:"reports"`
	MeanDeltas        []BotMLMetricDelta     `json:"meanDeltas"`
}

func RunBotMLBenchmark(config BotMLBenchmarkConfig) (BotMLBenchmarkReport, error) {
	if config.ScenarioID == "" || config.BaselineState == nil || config.CandidateState == nil || config.Candidate == nil {
		return BotMLBenchmarkReport{}, fmt.Errorf("ML benchmark requires scenario, two states and candidate policy")
	}
	if config.DurationMs <= 0 {
		return BotMLBenchmarkReport{}, fmt.Errorf("ML benchmark duration must be positive")
	}
	baseline, err := runBotMLEpisode(config.ScenarioID, config.Seed, config.Mode, config.DurationMs, config.BaselineState, nil)
	if err != nil {
		return BotMLBenchmarkReport{}, fmt.Errorf("baseline episode: %w", err)
	}
	candidate, err := runBotMLEpisode(config.ScenarioID, config.Seed, config.Mode, config.DurationMs, config.CandidateState, config.Candidate)
	if err != nil {
		return BotMLBenchmarkReport{}, fmt.Errorf("candidate episode: %w", err)
	}
	baseMetrics, candidateMetrics := scenarioMetricsMap(baseline), scenarioMetricsMap(candidate)
	names := make([]string, 0, len(baseMetrics))
	for name := range baseMetrics {
		if _, ok := candidateMetrics[name]; ok {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	deltas := make([]BotMLMetricDelta, 0, len(names))
	for _, name := range names {
		base, next := baseMetrics[name], candidateMetrics[name]
		deltas = append(deltas, BotMLMetricDelta{Name: name, Baseline: base, Candidate: next, Delta: next - base})
	}
	report := BotMLBenchmarkReport{
		SchemaVersion: BotMLObservationSchemaVersion, SchemaFingerprint: BotMLSchemaFingerprint(),
		ScenarioID: config.ScenarioID, Seed: config.Seed, Mode: config.Mode,
		Baseline:                BotMLBenchmarkSide{Policy: "utility-v1", Report: baseline},
		Candidate:               BotMLBenchmarkSide{Policy: config.Candidate.Name(), Report: candidate},
		CandidateCheckpointHash: config.CandidateCheckpointHash,
		Deltas:                  deltas,
	}
	return report, ValidateBotMLBenchmark(report)
}

// RunBotMLBenchmarkSuite aggregates independent paired episodes. Callers
// should pass fresh, identically constructed baseline/candidate states for
// every seed; the function deliberately does not clone opaque GameState
// internals. Mean deltas are descriptive and must be judged against the
// holdout thresholds from the ML rollout plan.
func RunBotMLBenchmarkSuite(configs []BotMLBenchmarkConfig) (BotMLBenchmarkSuiteReport, error) {
	if len(configs) == 0 {
		return BotMLBenchmarkSuiteReport{}, fmt.Errorf("ML benchmark suite requires at least one episode")
	}
	reports := make([]BotMLBenchmarkReport, 0, len(configs))
	for index, config := range configs {
		report, err := RunBotMLBenchmark(config)
		if err != nil {
			return BotMLBenchmarkSuiteReport{}, fmt.Errorf("episode %d: %w", index, err)
		}
		reports = append(reports, report)
	}
	type aggregate struct {
		baseline, candidate float64
		count               int
	}
	aggregates := make(map[string]aggregate)
	for _, report := range reports {
		baselineMetrics := scenarioMetricsMap(report.Baseline.Report)
		candidateMetrics := scenarioMetricsMap(report.Candidate.Report)
		for name, baseline := range baselineMetrics {
			candidate, ok := candidateMetrics[name]
			if !ok || math.IsNaN(baseline) || math.IsInf(baseline, 0) || math.IsNaN(candidate) || math.IsInf(candidate, 0) {
				continue
			}
			current := aggregates[name]
			current.baseline += baseline
			current.candidate += candidate
			current.count++
			aggregates[name] = current
		}
	}
	names := make([]string, 0, len(aggregates))
	for name, value := range aggregates {
		if value.count > 0 {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	meanDeltas := make([]BotMLMetricDelta, 0, len(names))
	for _, name := range names {
		value := aggregates[name]
		baseline := value.baseline / float64(value.count)
		candidate := value.candidate / float64(value.count)
		meanDeltas = append(meanDeltas, BotMLMetricDelta{Name: name, Baseline: baseline, Candidate: candidate, Delta: candidate - baseline})
	}
	suite := BotMLBenchmarkSuiteReport{
		SchemaVersion: BotMLObservationSchemaVersion, SchemaFingerprint: BotMLSchemaFingerprint(),
		Episodes: len(reports), Reports: reports, MeanDeltas: meanDeltas,
	}
	return suite, ValidateBotMLBenchmarkSuite(suite)
}

func runBotMLEpisode(scenarioID string, seed int64, mode GameMode, durationMs int64, state *GameState, policy BotMLPolicy) (CombatScenarioReport, error) {
	runner := NewCombatScenarioRunner(scenarioID, seed, mode, state)
	if stateful, ok := policy.(BotMLStatefulPolicy); ok {
		// A benchmark suite may intentionally reuse one loaded checkpoint. Its
		// recurrent memory is match-local and must never leak across paired
		// episodes or scenario ordering.
		for id, bot := range state.Players {
			if bot != nil && bot.IsBot {
				stateful.Reset(id)
			}
		}
	}
	state.botMLPolicy = policy
	if state.GameEndsAt <= runner.CurrentTimeMs() {
		state.GameEndsAt = runner.CurrentTimeMs() + durationMs + 1000
	}
	if err := runner.AdvanceTo(durationMs); err != nil {
		return CombatScenarioReport{}, err
	}
	runner.Checkpoint(durationMs)
	if err := runner.RecordBotAIMetrics("bot"); err != nil {
		return CombatScenarioReport{}, err
	}
	return runner.Report(), nil
}

func scenarioMetricsMap(report CombatScenarioReport) map[string]float64 {
	values := make(map[string]float64, len(report.Metrics))
	for _, metric := range report.Metrics {
		values[metric.Name] = metric.Value
	}
	return values
}

func ValidateBotMLBenchmark(report BotMLBenchmarkReport) error {
	if report.SchemaVersion != BotMLObservationSchemaVersion || report.SchemaFingerprint != BotMLSchemaFingerprint() || report.ScenarioID == "" || report.Baseline.Policy == "" || report.Candidate.Policy == "" || (report.CandidateCheckpointHash != "" && len(report.CandidateCheckpointHash) != 64) {
		return fmt.Errorf("invalid ML benchmark metadata")
	}
	if err := ValidateCombatScenarioReport(report.Baseline.Report); err != nil {
		return fmt.Errorf("invalid baseline report: %w", err)
	}
	if err := ValidateCombatScenarioReport(report.Candidate.Report); err != nil {
		return fmt.Errorf("invalid candidate report: %w", err)
	}
	if report.Baseline.Report.Seed != report.Candidate.Report.Seed || report.Baseline.Report.Mode != report.Candidate.Report.Mode {
		return fmt.Errorf("ML benchmark sides are not paired")
	}
	for _, delta := range report.Deltas {
		if delta.Name == "" || math.IsNaN(delta.Delta) || math.IsInf(delta.Delta, 0) {
			return fmt.Errorf("invalid ML benchmark delta")
		}
	}
	return nil
}

func ValidateBotMLBenchmarkSuite(report BotMLBenchmarkSuiteReport) error {
	if report.SchemaVersion != BotMLObservationSchemaVersion || report.SchemaFingerprint != BotMLSchemaFingerprint() || report.Episodes <= 0 || len(report.Reports) != report.Episodes {
		return fmt.Errorf("invalid ML benchmark suite metadata")
	}
	for _, episode := range report.Reports {
		if err := ValidateBotMLBenchmark(episode); err != nil {
			return err
		}
	}
	for _, delta := range report.MeanDeltas {
		if delta.Name == "" || math.IsNaN(delta.Delta) || math.IsInf(delta.Delta, 0) {
			return fmt.Errorf("invalid ML benchmark suite delta")
		}
	}
	return nil
}
