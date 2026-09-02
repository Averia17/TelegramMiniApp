package game

import (
	"battle/model/monster"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"time"
)

// combatScenarioEpochMs is deliberately fixed. Scenario timestamps are
// relative to this synthetic epoch, so expiry/cooldown logic sees a normal
// positive clock while reports remain independent from wall-clock time.
const combatScenarioEpochMs int64 = 1_000_000

type CombatScenarioInput struct {
	AtMs     int64           `json:"atMs"`
	PlayerID string          `json:"playerId"`
	Type     string          `json:"type"`
	Value    json.RawMessage `json:"value,omitempty"`
}

type CombatScenarioCheckpoint struct {
	AtMs      int64    `json:"atMs"`
	StateHash string   `json:"stateHash"`
	EventIDs  []uint64 `json:"eventIds,omitempty"`
}

type CombatScenarioMetric struct {
	Name  string  `json:"name"`
	Value float64 `json:"value"`
}

type CombatScenarioReport struct {
	ScenarioID         string                     `json:"scenarioId"`
	Seed               int64                      `json:"seed"`
	CombatProfileID    string                     `json:"combatProfileId"`
	CombatRulesVersion string                     `json:"combatRulesVersion"`
	Mode               GameMode                   `json:"mode"`
	Inputs             []CombatScenarioInput      `json:"inputs"`
	Checkpoints        []CombatScenarioCheckpoint `json:"checkpoints"`
	EventIDs           []uint64                   `json:"eventIds,omitempty"`
	Metrics            []CombatScenarioMetric     `json:"metrics,omitempty"`
	BatTimeline        []BatTimelineEvent         `json:"batTimeline,omitempty"`
}

type CombatScenarioRunner struct {
	scenarioID  string
	seed        int64
	mode        GameMode
	state       *GameState
	inputs      []CombatScenarioInput
	checkpoints []CombatScenarioCheckpoint
	metrics     []CombatScenarioMetric
	epochMs     int64
	atMs        int64
}

func NewCombatScenarioRunner(scenarioID string, seed int64, mode GameMode, state *GameState) *CombatScenarioRunner {
	runner := &CombatScenarioRunner{
		scenarioID:  scenarioID,
		seed:        seed,
		mode:        mode,
		state:       state,
		inputs:      make([]CombatScenarioInput, 0, 32),
		checkpoints: make([]CombatScenarioCheckpoint, 0, 8),
		metrics:     make([]CombatScenarioMetric, 0, 16),
		epochMs:     combatScenarioEpochMs,
	}
	if state != nil {
		state.clockNow = func() int64 { return runner.CurrentTimeMs() }
	}
	return runner
}

// CurrentTimeMs exposes the deterministic clock for scenario setup and
// direct kit calls. It is relative to the report's AtMs values.
func (runner *CombatScenarioRunner) CurrentTimeMs() int64 {
	if runner == nil {
		return combatScenarioEpochMs
	}
	return runner.epochMs + runner.atMs
}

// AdvanceTo moves the authoritative state to a deterministic timestamp and
// runs one simulation interval. Inputs should be applied after advancing to
// their timestamp, matching the server's command ordering.
func (runner *CombatScenarioRunner) AdvanceTo(atMs int64) error {
	if runner == nil {
		return fmt.Errorf("scenario runner is nil")
	}
	if atMs < 0 || atMs < runner.atMs {
		return fmt.Errorf("scenario time must be non-negative and monotonic")
	}
	if runner.state == nil {
		runner.atMs = atMs
		return nil
	}
	// Keep the authoritative systems on simulation-sized steps. Passing a
	// whole 2-second interval to UpdateWithDelta would advance movement once
	// while cooldown/expiry logic sees the final timestamp, which is useful for
	// a room stall but not for a replayable combat timeline.
	for runner.atMs < atMs {
		stepMs := int64(16)
		if remaining := atMs - runner.atMs; remaining < stepMs {
			stepMs = remaining
		}
		runner.atMs += stepMs
		runner.state.UpdateWithDelta(time.Duration(stepMs) * time.Millisecond)
	}
	return nil
}

// ApplyInput records and applies one deterministic input at its timestamp.
// The callback is intentionally supplied by the scenario: the runner owns
// time/order, while the scenario owns the input vocabulary and assertions.
func (runner *CombatScenarioRunner) ApplyInput(input CombatScenarioInput, apply func(*GameState, CombatScenarioInput)) error {
	if err := runner.RecordInput(input); err != nil {
		return err
	}
	if err := runner.AdvanceTo(input.AtMs); err != nil {
		return err
	}
	if apply != nil {
		apply(runner.state, input)
	}
	return nil
}

func (runner *CombatScenarioRunner) RecordInput(input CombatScenarioInput) error {
	if runner == nil {
		return fmt.Errorf("scenario runner is nil")
	}
	if input.AtMs < 0 || input.PlayerID == "" || input.Type == "" {
		return fmt.Errorf("scenario input requires non-negative atMs, playerId and type")
	}
	if len(runner.inputs) > 0 && input.AtMs < runner.inputs[len(runner.inputs)-1].AtMs {
		return fmt.Errorf("scenario input timestamps must be non-decreasing")
	}
	runner.inputs = append(runner.inputs, input)
	return nil
}

func (runner *CombatScenarioRunner) Checkpoint(atMs int64) CombatScenarioCheckpoint {
	checkpoint := CombatScenarioCheckpoint{AtMs: atMs, StateHash: HashCombatState(runner.state)}
	if len(runner.checkpoints) > 0 && atMs < runner.checkpoints[len(runner.checkpoints)-1].AtMs {
		atMs = runner.checkpoints[len(runner.checkpoints)-1].AtMs
		checkpoint.AtMs = atMs
	}
	if runner.state != nil {
		checkpoint.EventIDs = make([]uint64, 0, len(runner.state.CombatEvents))
		for _, event := range runner.state.CombatEvents {
			checkpoint.EventIDs = append(checkpoint.EventIDs, event.ID)
		}
	}
	runner.checkpoints = append(runner.checkpoints, checkpoint)
	return checkpoint
}

func (runner *CombatScenarioRunner) RecordMetric(name string, value float64) error {
	if runner == nil {
		return fmt.Errorf("scenario runner is nil")
	}
	if name == "" {
		return fmt.Errorf("scenario metric requires a name")
	}
	for index := range runner.metrics {
		if runner.metrics[index].Name == name {
			runner.metrics[index].Value = value
			return nil
		}
	}
	runner.metrics = append(runner.metrics, CombatScenarioMetric{Name: name, Value: value})
	sort.Slice(runner.metrics, func(i, j int) bool { return runner.metrics[i].Name < runner.metrics[j].Name })
	return nil
}

// RecordAccuracyMetric stores the measured hit rate for a deterministic trial.
// Keeping attempts and hits beside the ratio makes reports auditable and
// prevents a zero-sample or impossible hit count from becoming a baseline.
func (runner *CombatScenarioRunner) RecordAccuracyMetric(prefix string, attempts, hits uint64) error {
	if runner == nil {
		return fmt.Errorf("scenario runner is nil")
	}
	if prefix == "" {
		return fmt.Errorf("accuracy metric requires a prefix")
	}
	if hits > attempts {
		return fmt.Errorf("accuracy hits cannot exceed attempts")
	}
	if attempts == 0 {
		return fmt.Errorf("accuracy metric requires at least one attempt")
	}
	for name, value := range map[string]float64{
		"attempts": float64(attempts),
		"hits":     float64(hits),
		"accuracy": float64(hits) / float64(attempts),
	} {
		if err := runner.RecordMetric(prefix+"."+name, value); err != nil {
			return err
		}
	}
	return nil
}

// RecordBotAIMetrics copies the bounded match-local AI counters into the
// scenario report. This keeps replay artifacts self-contained without adding
// diagnostics to the live snapshot protocol.
func (runner *CombatScenarioRunner) RecordBotAIMetrics(prefix string) error {
	if runner == nil || runner.state == nil {
		return fmt.Errorf("scenario bot metrics require a state")
	}
	if prefix == "" {
		prefix = "bot"
	}
	metrics := runner.state.BotAIMetricsSnapshot()
	values := map[string]float64{
		"decisions":                 float64(metrics.Decisions),
		"actionSwitches":            float64(metrics.ActionSwitches),
		"targetSwitches":            float64(metrics.TargetSwitches),
		"hardInterrupts":            float64(metrics.HardInterrupts),
		"retreatDecisions":          float64(metrics.RetreatDecisions),
		"abilityUses":               float64(metrics.AbilityUses),
		"attackAttempts":            float64(metrics.AttackAttempts),
		"attackHits":                float64(metrics.AttackHits),
		"peelDecisions":             float64(metrics.PeelDecisions),
		"resourceContestDecisions":  float64(metrics.ResourceContestDecisions),
		"batFarmDecisions":          float64(metrics.BatFarmDecisions),
		"spawnProtectionAvoidances": float64(metrics.SpawnProtectionAvoidances),
		"stuckReplans":              float64(metrics.StuckReplans),
		"idleDecisionTicks":         float64(metrics.IdleDecisionTicks),
		"mlDecisions":               float64(metrics.MLDecisions),
		"mlUtilityOverrides":        float64(metrics.MLUtilityOverrides),
		"mlTacticalDecisions":       float64(metrics.MLTacticalDecisions),
		"mlTacticalBehaviorChanges": float64(metrics.MLTacticalBehaviorChanges),
		"mlFallbacks":               float64(metrics.MLFallbacks),
		"mlLatencyMicros":           float64(metrics.MLLatencyMicros),
		"mlLatencySamples":          float64(metrics.MLLatencySamples),
		"mlShadowDecisions":         float64(metrics.MLShadowDecisions),
		"mlShadowDisagreements":     float64(metrics.MLShadowDisagreements),
		"mlShadowFallbacks":         float64(metrics.MLShadowFallbacks),
		"mlShadowLatencyMicros":     float64(metrics.MLShadowLatencyMicros),
		"mlShadowLatencySamples":    float64(metrics.MLShadowLatencySamples),
	}
	botCount, aliveBots, botDeaths, botKills, botDamage := 0, 0, 0, 0, 0
	for _, bot := range runner.state.Players {
		if bot == nil || !bot.IsBot {
			continue
		}
		botCount++
		if bot.IsAlive() {
			aliveBots++
		}
		botDeaths += bot.Deaths
		botKills += bot.Kills
		botDamage += bot.BasicDamage + bot.SkillDamage
	}
	if botCount > 0 {
		values["botCount"] = float64(botCount)
		values["aliveRate"] = float64(aliveBots) / float64(botCount)
		values["deaths"] = float64(botDeaths)
		values["kills"] = float64(botKills)
		values["damage"] = float64(botDamage)
		values["damagePerLife"] = float64(botDamage) / float64(botDeaths+1)
	}
	if metrics.AttackAttempts > 0 {
		values["accuracy"] = float64(metrics.AttackHits) / float64(metrics.AttackAttempts)
	}
	for action, count := range metrics.ActionSelections {
		values["action."+action] = float64(count)
	}
	for action, count := range metrics.MLActionSelections {
		values["mlAction."+action] = float64(count)
	}
	for action, count := range metrics.MLShadowActionSelections {
		values["mlShadowAction."+action] = float64(count)
	}
	for action, sum := range metrics.ActionScoreSums {
		if samples := metrics.ActionScoreSamples[action]; samples > 0 {
			mean := sum / float64(samples)
			if !math.IsNaN(mean) && !math.IsInf(mean, 0) {
				values["actionScore."+action] = mean
			}
		}
	}
	for role, count := range metrics.ResourceContestByRole {
		values["contestRole."+role] = float64(count)
	}
	keys := make([]string, 0, len(values))
	for name := range values {
		keys = append(keys, name)
	}
	sort.Strings(keys)
	for _, name := range keys {
		if err := runner.RecordMetric(prefix+"."+name, values[name]); err != nil {
			return err
		}
	}
	return nil
}

// RecordBatLifecycleMetrics copies the neutral camp lifecycle counters into a
// scenario report, keeping world telemetry replayable without adding it to the
// live snapshot protocol.
func (runner *CombatScenarioRunner) RecordBatLifecycleMetrics(prefix string) error {
	if runner == nil || runner.state == nil {
		return fmt.Errorf("scenario bat metrics require a state")
	}
	if prefix == "" {
		prefix = "bat"
	}
	metrics := runner.state.BatLifecycleMetricsSnapshot()
	values := map[string]float64{
		"noticeStarts":      float64(metrics.NoticeStarts),
		"noticeCancels":     float64(metrics.NoticeCancels),
		"windupStarts":      float64(metrics.WindupStarts),
		"strikes":           float64(metrics.Strikes),
		"rewards":           float64(metrics.Rewards),
		"respawns":          float64(metrics.Respawns),
		"rewardClaims":      float64(metrics.RewardClaims),
		"rewardDenials":     float64(metrics.RewardDenials),
		"firstDamageEvents": float64(metrics.FirstDamageEvents),
		"contestStarts":     float64(metrics.ContestStarts),
		"damageEvents":      float64(metrics.DamageEvents),
		"effectiveDamage":   float64(metrics.EffectiveDamage),
		"rewardExpiries":    float64(metrics.RewardExpiries),
	}
	if metrics.NoticeStarts > 0 {
		values["noticeToStrikeRate"] = float64(metrics.Strikes) / float64(metrics.NoticeStarts)
	}
	for role, count := range metrics.RewardClaimsByRole {
		values["rewardClaimRole."+role] = float64(count)
	}
	for role, damage := range metrics.DamageByRole {
		values["damageRole."+role] = float64(damage)
	}
	keys := make([]string, 0, len(values))
	for name := range values {
		keys = append(keys, name)
	}
	sort.Strings(keys)
	for _, name := range keys {
		if err := runner.RecordMetric(prefix+"."+name, values[name]); err != nil {
			return err
		}
	}
	return nil
}

func (runner *CombatScenarioRunner) Report() CombatScenarioReport {
	checkpoints := append([]CombatScenarioCheckpoint(nil), runner.checkpoints...)
	inputs := append([]CombatScenarioInput(nil), runner.inputs...)
	metrics := append([]CombatScenarioMetric(nil), runner.metrics...)
	eventIDs := make([]uint64, 0)
	if runner.state != nil {
		eventIDs = make([]uint64, 0, len(runner.state.CombatEvents))
		for _, event := range runner.state.CombatEvents {
			eventIDs = append(eventIDs, event.ID)
		}
	}
	return CombatScenarioReport{
		ScenarioID: runner.scenarioID, Seed: runner.seed,
		CombatProfileID: CombatProfileID, CombatRulesVersion: CombatRulesVersion,
		Mode: runner.mode, Inputs: inputs, Checkpoints: checkpoints, EventIDs: eventIDs,
		Metrics: metrics, BatTimeline: runner.state.BatLifecycleTimelineSnapshot(),
	}
}

// ValidateCombatScenarioReport checks the invariants required before a report
// can be used as a replay/balance baseline. It intentionally does not compare
// gameplay outcomes; callers can then diff the stable hashes and metrics.
func ValidateCombatScenarioReport(report CombatScenarioReport) error {
	if report.ScenarioID == "" || report.CombatProfileID == "" || report.CombatRulesVersion == "" {
		return fmt.Errorf("scenario report requires id, profile and rules version")
	}
	var previousInputAt int64
	for index, input := range report.Inputs {
		if input.PlayerID == "" || input.Type == "" || input.AtMs < 0 {
			return fmt.Errorf("invalid scenario input at index %d", index)
		}
		if index > 0 && input.AtMs < previousInputAt {
			return fmt.Errorf("scenario inputs are not monotonic")
		}
		previousInputAt = input.AtMs
	}
	var previousCheckpointAt int64
	for index, checkpoint := range report.Checkpoints {
		if checkpoint.AtMs < 0 || checkpoint.StateHash == "" {
			return fmt.Errorf("invalid scenario checkpoint at index %d", index)
		}
		if index > 0 && checkpoint.AtMs < previousCheckpointAt {
			return fmt.Errorf("scenario checkpoints are not monotonic")
		}
		previousCheckpointAt = checkpoint.AtMs
	}
	for index, metric := range report.Metrics {
		if metric.Name == "" {
			return fmt.Errorf("scenario metric at index %d has no name", index)
		}
	}
	var previousTimelineAt int64
	for index, event := range report.BatTimeline {
		if event.AtMs < 0 || event.Kind == "" {
			return fmt.Errorf("invalid bat timeline event at index %d", index)
		}
		if index > 0 && event.AtMs < previousTimelineAt {
			return fmt.Errorf("bat timeline is not monotonic")
		}
		previousTimelineAt = event.AtMs
	}
	return nil
}

type combatStateHashPlayer struct {
	ID, Hero, Team             string
	X, Y                       float64
	Lives, MaxLives            int
	Ammo, MaxAmmo              int
	SuperCharge, GadgetCharges int
}

type combatStateHashMonster struct {
	ID              string
	X, Y            float64
	Lives, MaxLives int
	State           monster.MonsterState
	NoticeUntil     int64
	WindupUntil     int64
}

type combatStateHashRespawn struct {
	ID             string
	RespawnAt      int64
	X, Y           float64
	Tier, MaxLives int
}

type combatStateHashObjective struct {
	ID, Type, Team  string
	X, Y            float64
	Lives, MaxLives int
}

type combatStateHashEvent struct {
	ID                                          uint64
	Kind, Phase, SourceID, TargetType, TargetID string
	Damage                                      int
	Accepted, Resolved                          bool
}

type combatStateHashAbilityResolution struct {
	CommandID, SourceID, Slot string
	ResolveAt                 int64
	Hit                       bool
}

type combatStateHashProjection struct {
	State       string
	Mode        GameMode
	Players     []combatStateHashPlayer
	Monsters    []combatStateHashMonster
	Respawns    []combatStateHashRespawn
	Objectives  []combatStateHashObjective
	Events      []combatStateHashEvent
	Resolutions []combatStateHashAbilityResolution
}

// HashCombatState creates a deterministic comparison key for replay checkpoints.
// Map-backed runtime collections are converted to sorted slices so insertion
// order cannot masquerade as a balance or simulation change.
func HashCombatState(state *GameState) string {
	projection := combatStateHashProjection{}
	if state != nil {
		projection.State, projection.Mode = state.State, state.Mode
		playerIDs := make([]string, 0, len(state.Players))
		for id := range state.Players {
			playerIDs = append(playerIDs, id)
		}
		sort.Strings(playerIDs)
		for _, id := range playerIDs {
			p := state.Players[id]
			if p == nil {
				continue
			}
			projection.Players = append(projection.Players, combatStateHashPlayer{
				ID: p.PlayerId, Hero: p.HeroName, Team: p.Team, X: p.X, Y: p.Y,
				Lives: p.Lives, MaxLives: p.MaxLives, Ammo: p.Ammo, MaxAmmo: p.MaxAmmo,
				SuperCharge: p.SuperCharge, GadgetCharges: p.GadgetCharges,
			})
		}
		monsterIDs := make([]string, 0, len(state.Monsters))
		for id := range state.Monsters {
			monsterIDs = append(monsterIDs, id)
		}
		sort.Strings(monsterIDs)
		for _, id := range monsterIDs {
			m := state.Monsters[id]
			if m == nil {
				continue
			}
			projection.Monsters = append(projection.Monsters, combatStateHashMonster{ID: id, X: m.X, Y: m.Y, Lives: m.Lives, MaxLives: m.MaxLives, State: m.State, NoticeUntil: m.NoticeUntil, WindupUntil: m.AttackWindupUntil})
		}
		respawnIDs := make([]string, 0, len(state.MonsterRespawns))
		for id := range state.MonsterRespawns {
			respawnIDs = append(respawnIDs, id)
		}
		sort.Strings(respawnIDs)
		for _, id := range respawnIDs {
			respawn := state.MonsterRespawns[id]
			projection.Respawns = append(projection.Respawns, combatStateHashRespawn{ID: id, RespawnAt: respawn.RespawnAt, X: respawn.X, Y: respawn.Y, Tier: respawn.Tier, MaxLives: respawn.MaxLives})
		}
		objectiveIDs := make([]string, 0, len(state.Objectives))
		for id := range state.Objectives {
			objectiveIDs = append(objectiveIDs, id)
		}
		sort.Strings(objectiveIDs)
		for _, id := range objectiveIDs {
			o := state.Objectives[id]
			if o == nil {
				continue
			}
			projection.Objectives = append(projection.Objectives, combatStateHashObjective{ID: o.ID, Type: o.Type, Team: o.Team, X: o.X, Y: o.Y, Lives: o.Lives, MaxLives: o.MaxLives})
		}
		for _, event := range state.CombatEvents {
			projection.Events = append(projection.Events, combatStateHashEvent{ID: event.ID, Kind: event.Kind, Phase: event.Phase, SourceID: event.SourceID, TargetType: event.TargetType, TargetID: event.TargetID, Damage: event.Damage, Accepted: event.Accepted, Resolved: event.Resolved})
		}
		resolutionIDs := make([]string, 0, len(state.abilityResolutions))
		for commandID := range state.abilityResolutions {
			resolutionIDs = append(resolutionIDs, commandID)
		}
		sort.Strings(resolutionIDs)
		for _, commandID := range resolutionIDs {
			resolution := state.abilityResolutions[commandID]
			if resolution == nil {
				continue
			}
			projection.Resolutions = append(projection.Resolutions, combatStateHashAbilityResolution{
				CommandID: resolution.CommandID, SourceID: resolution.SourceID, Slot: resolution.Slot,
				ResolveAt: resolution.ResolveAt, Hit: resolution.Hit,
			})
		}
	}
	data, _ := json.Marshal(projection)
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}
