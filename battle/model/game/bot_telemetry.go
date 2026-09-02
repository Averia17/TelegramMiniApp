package game

import (
	"battle/model/player"
	"battle/observability"
)

func (gs *GameState) resetBotAIMetrics() {
	if gs == nil {
		return
	}
	gs.botMetrics = newBotAIMetrics()
	gs.botMetricsFlushed = false
}

func (gs *GameState) recordBotHardInterrupt() {
	if gs != nil {
		gs.botMetrics.HardInterrupts++
	}
}

func (gs *GameState) recordBotAbilityUse() {
	if gs != nil {
		gs.botMetrics.AbilityUses++
	}
}

// recordBotAttackHit measures basic accuracy at command granularity. A
// shotgun, pierce or splash attack can create several damage callbacks, but
// it is still one successful basic attempt for AI telemetry.
func (gs *GameState) recordBotAttackHit() {
	if gs == nil || gs.activeBotAttackID == "" {
		return
	}
	if gs.botMetrics.attackHitKeys == nil {
		gs.botMetrics.attackHitKeys = make(map[string]struct{})
	}
	if _, seen := gs.botMetrics.attackHitKeys[gs.activeBotAttackID]; seen {
		return
	}
	gs.botMetrics.attackHitKeys[gs.activeBotAttackID] = struct{}{}
	gs.botMetrics.AttackHits++
}

// recordBotBatContestResponse attributes a live bat contest response to the
// bot's finite combat role. Player IDs and hero names stay out of metrics.
func (gs *GameState) recordBotBatContestResponse(bot *player.Player) {
	if gs == nil || bot == nil {
		return
	}
	role := botRoleFor(bot)
	if !isBotMetricRole(role) {
		role = "other"
	}
	if gs.botMetrics.ResourceContestByRole == nil {
		gs.botMetrics.ResourceContestByRole = make(map[string]uint64)
	}
	gs.botMetrics.ResourceContestByRole[role]++
}

func isBotMetricRole(role string) bool {
	switch role {
	case "Support", "Assassin", "Tank", "Fighter", "Controller", "Sharpshooter", "other":
		return true
	default:
		return false
	}
}

func (gs *GameState) flushBotAIMetrics() {
	if gs == nil || gs.botMetricsFlushed {
		return
	}
	gs.botMetricsFlushed = true
	metrics := gs.BotAIMetricsSnapshot()
	actionScoreMeans := make(map[string]float64, len(metrics.ActionScoreSums))
	for action, sum := range metrics.ActionScoreSums {
		if samples := metrics.ActionScoreSamples[action]; samples > 0 {
			actionScoreMeans[action] = sum / float64(samples)
		}
	}
	observability.RecordBotAIMetrics(observability.Default, observability.BotAIMetricSample{
		Mode:                      string(gs.Mode),
		ActionSelections:          metrics.ActionSelections,
		ActionScoreMeans:          actionScoreMeans,
		ActionSwitches:            metrics.ActionSwitches,
		TargetSwitches:            metrics.TargetSwitches,
		HardInterrupts:            metrics.HardInterrupts,
		RetreatDecisions:          metrics.RetreatDecisions,
		AbilityUses:               metrics.AbilityUses,
		AttackAttempts:            metrics.AttackAttempts,
		AttackHits:                metrics.AttackHits,
		PeelDecisions:             metrics.PeelDecisions,
		ResourceContestDecisions:  metrics.ResourceContestDecisions,
		ResourceContestByRole:     metrics.ResourceContestByRole,
		BatFarmDecisions:          metrics.BatFarmDecisions,
		SpawnProtectionAvoidances: metrics.SpawnProtectionAvoidances,
		StuckReplans:              metrics.StuckReplans,
		IdleDecisionTicks:         metrics.IdleDecisionTicks,
		MLLatencyMicros:           metrics.MLLatencyMicros,
		MLLatencySamples:          metrics.MLLatencySamples,
		MLUtilityOverrides:        metrics.MLUtilityOverrides,
		MLTacticalDecisions:       metrics.MLTacticalDecisions,
		MLTacticalBehaviorChanges: metrics.MLTacticalBehaviorChanges,
		MLActionSelections:        metrics.MLActionSelections,
		MLShadowDecisions:         metrics.MLShadowDecisions,
		MLShadowDisagreements:     metrics.MLShadowDisagreements,
		MLShadowFallbacks:         metrics.MLShadowFallbacks,
		MLShadowLatencyMicros:     metrics.MLShadowLatencyMicros,
		MLShadowLatencySamples:    metrics.MLShadowLatencySamples,
		MLShadowActionSelections:  metrics.MLShadowActionSelections,
	})
	gs.flushBatLifecycleMetrics()
}
