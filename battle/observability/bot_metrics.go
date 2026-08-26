package observability

// BotAIMetricSample is an aggregate emitted once per completed match. Labels
// are intentionally bounded to mode and the finite action set; player IDs and
// target IDs belong in debug traces, not metric cardinality.
type BotAIMetricSample struct {
	Mode                      string
	ActionSelections          map[string]uint64
	ActionScoreMeans          map[string]float64
	ActionSwitches            uint64
	TargetSwitches            uint64
	HardInterrupts            uint64
	RetreatDecisions          uint64
	AbilityUses               uint64
	AttackAttempts            uint64
	AttackHits                uint64
	PeelDecisions             uint64
	ResourceContestDecisions  uint64
	SpawnProtectionAvoidances uint64
	StuckReplans              uint64
	IdleDecisionTicks         uint64
}

func RecordBotAIMetrics(registry *Registry, sample BotAIMetricSample) {
	if registry == nil {
		return
	}
	labels := map[string]string{"mode": boundedBotMode(sample.Mode)}
	for action, count := range sample.ActionSelections {
		if count == 0 || !isBotMetricAction(action) {
			continue
		}
		actionLabels := map[string]string{"mode": labels["mode"], "action": action}
		registry.AddCounter("battle_bot_action_selections_total", "Bot tactical actions selected", float64(count), actionLabels)
	}
	registry.AddCounter("battle_bot_action_switches_total", "Bot tactical action switches", float64(sample.ActionSwitches), labels)
	registry.AddCounter("battle_bot_target_switches_total", "Bot target switches", float64(sample.TargetSwitches), labels)
	registry.AddCounter("battle_bot_hard_interrupts_total", "Bot hard-interrupt reactions", float64(sample.HardInterrupts), labels)
	registry.AddCounter("battle_bot_retreat_decisions_total", "Bot retreat decisions", float64(sample.RetreatDecisions), labels)
	registry.AddCounter("battle_bot_ability_uses_total", "Bot authoritative ability uses", float64(sample.AbilityUses), labels)
	registry.AddCounter("battle_bot_attack_attempts_total", "Bot basic attack attempts", float64(sample.AttackAttempts), labels)
	registry.AddCounter("battle_bot_attack_hits_total", "Bot confirmed basic attack hits", float64(sample.AttackHits), labels)
	registry.AddCounter("battle_bot_peel_decisions_total", "Bot peel decisions for pressured allies", float64(sample.PeelDecisions), labels)
	registry.AddCounter("battle_bot_resource_contest_decisions_total", "Bot contested resource decisions", float64(sample.ResourceContestDecisions), labels)
	registry.AddCounter("battle_bot_spawn_protection_avoids_total", "Bot avoided spawn-protected targets", float64(sample.SpawnProtectionAvoidances), labels)
	registry.AddCounter("battle_bot_stuck_replans_total", "Bot path stuck replans", float64(sample.StuckReplans), labels)
	registry.AddCounter("battle_bot_idle_decision_ticks_total", "Bot decision ticks without target or movement", float64(sample.IdleDecisionTicks), labels)
	for action, mean := range sample.ActionScoreMeans {
		if isBotMetricAction(action) {
			registry.SetGauge("battle_bot_action_score", "Mean bot tactical action score", mean, map[string]string{"mode": labels["mode"], "action": action})
		}
	}
}

func boundedBotMode(mode string) string {
	if mode == "team deathmatch" {
		return mode
	}
	return "deathmatch"
}

func isBotMetricAction(action string) bool {
	switch action {
	case "roam", "engage", "retreat", "collect_pickup":
		return true
	default:
		return false
	}
}
