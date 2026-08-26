package game

import "battle/observability"

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
		SpawnProtectionAvoidances: metrics.SpawnProtectionAvoidances,
		StuckReplans:              metrics.StuckReplans,
		IdleDecisionTicks:         metrics.IdleDecisionTicks,
	})
}
