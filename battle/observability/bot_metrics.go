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
	ResourceContestByRole     map[string]uint64
	BatFarmDecisions          uint64
	SpawnProtectionAvoidances uint64
	StuckReplans              uint64
	IdleDecisionTicks         uint64
	MLLatencyMicros           uint64
	MLLatencySamples          uint64
	MLUtilityOverrides        uint64
	MLTacticalDecisions       uint64
	MLTacticalBehaviorChanges uint64
	MLActionSelections        map[string]uint64
	MLShadowDecisions         uint64
	MLShadowDisagreements     uint64
	MLShadowFallbacks         uint64
	MLShadowLatencyMicros     uint64
	MLShadowLatencySamples    uint64
	MLShadowActionSelections  map[string]uint64
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
	for role, count := range sample.ResourceContestByRole {
		if count == 0 || !isBotMetricRole(role) {
			continue
		}
		roleLabels := map[string]string{"mode": labels["mode"], "role": role}
		registry.AddCounter("battle_bot_bat_contest_responses_total", "Bot responses to contested bat camps", float64(count), roleLabels)
	}
	registry.AddCounter("battle_bot_bat_farm_decisions_total", "Bot neutral bat farm decisions", float64(sample.BatFarmDecisions), labels)
	registry.AddCounter("battle_bot_spawn_protection_avoids_total", "Bot avoided spawn-protected targets", float64(sample.SpawnProtectionAvoidances), labels)
	registry.AddCounter("battle_bot_stuck_replans_total", "Bot path stuck replans", float64(sample.StuckReplans), labels)
	registry.AddCounter("battle_bot_idle_decision_ticks_total", "Bot decision ticks without target or movement", float64(sample.IdleDecisionTicks), labels)
	registry.AddCounter("battle_bot_ml_utility_overrides_total", "Bot ML decisions that changed the utility action", float64(sample.MLUtilityOverrides), labels)
	registry.AddCounter("battle_bot_ml_tactical_decisions_total", "Bot ML tactical decisions", float64(sample.MLTacticalDecisions), labels)
	registry.AddCounter("battle_bot_ml_tactical_behavior_changes_total", "Bot ML tactical decisions that changed executed behavior", float64(sample.MLTacticalBehaviorChanges), labels)
	registry.AddCounter("battle_bot_ml_shadow_decisions_total", "Bot ML shadow decisions", float64(sample.MLShadowDecisions), labels)
	registry.AddCounter("battle_bot_ml_shadow_disagreements_total", "Bot ML shadow disagreements with utility policy", float64(sample.MLShadowDisagreements), labels)
	registry.AddCounter("battle_bot_ml_shadow_fallbacks_total", "Bot ML shadow invalid/fallback decisions", float64(sample.MLShadowFallbacks), labels)
	for action, count := range sample.MLActionSelections {
		if count > 0 && isBotMetricAction(action) {
			registry.AddCounter("battle_bot_ml_action_total", "Bot ML active actions by prediction", float64(count), map[string]string{"mode": labels["mode"], "action": action})
		}
	}
	for action, count := range sample.MLShadowActionSelections {
		if count > 0 && isBotMetricAction(action) {
			registry.AddCounter("battle_bot_ml_shadow_action_total", "Bot ML shadow actions by prediction", float64(count), map[string]string{"mode": labels["mode"], "action": action})
		}
	}
	if sample.MLLatencySamples > 0 {
		registry.ObserveHistogram("battle_bot_ml_latency_microseconds", "Bot ML inference latency", float64(sample.MLLatencyMicros)/float64(sample.MLLatencySamples), []float64{100, 500, 1000, 5000, 10000}, labels)
	}
	if sample.MLShadowLatencySamples > 0 {
		registry.ObserveHistogram("battle_bot_ml_shadow_latency_microseconds", "Bot ML shadow inference latency", float64(sample.MLShadowLatencyMicros)/float64(sample.MLShadowLatencySamples), []float64{100, 500, 1000, 5000, 10000}, labels)
	}
	for action, mean := range sample.ActionScoreMeans {
		if isBotMetricAction(action) {
			registry.SetGauge("battle_bot_action_score", "Mean bot tactical action score", mean, map[string]string{"mode": labels["mode"], "action": action})
		}
	}
}

// BatLifecycleMetricSample describes bounded world-level neutral-camp events.
// It is emitted once per completed match, alongside bot AI aggregates.
type BatLifecycleMetricSample struct {
	Mode               string
	NoticeStarts       uint64
	NoticeCancels      uint64
	WindupStarts       uint64
	Strikes            uint64
	Rewards            uint64
	Respawns           uint64
	RewardClaims       uint64
	RewardDenials      uint64
	RewardClaimsByRole map[string]uint64
	FirstDamageEvents  uint64
	ContestStarts      uint64
	DamageEvents       uint64
	EffectiveDamage    uint64
	RewardExpiries     uint64
	DamageByRole       map[string]uint64
}

func RecordBatLifecycleMetrics(registry *Registry, sample BatLifecycleMetricSample) {
	if registry == nil {
		return
	}
	labels := map[string]string{"mode": boundedBotMode(sample.Mode)}
	registry.AddCounter("battle_bat_notice_starts_total", "Bat target notice windows started", float64(sample.NoticeStarts), labels)
	registry.AddCounter("battle_bat_notice_cancels_total", "Bat target notice windows canceled", float64(sample.NoticeCancels), labels)
	registry.AddCounter("battle_bat_windup_starts_total", "Bat attack windups started", float64(sample.WindupStarts), labels)
	registry.AddCounter("battle_bat_strikes_total", "Bat attacks that reached the strike frame", float64(sample.Strikes), labels)
	registry.AddCounter("battle_bat_rewards_total", "Bat health boost rewards spawned", float64(sample.Rewards), labels)
	registry.AddCounter("battle_bat_respawns_total", "Bat camp respawns completed", float64(sample.Respawns), labels)
	registry.AddCounter("battle_bat_reward_claims_total", "Bat health boost rewards successfully claimed", float64(sample.RewardClaims), labels)
	registry.AddCounter("battle_bat_reward_denials_total", "Bat health boost reward claim attempts denied", float64(sample.RewardDenials), labels)
	registry.AddCounter("battle_bat_first_damage_events_total", "Bat camps receiving first damage", float64(sample.FirstDamageEvents), labels)
	registry.AddCounter("battle_bat_contest_starts_total", "Bat camps whose damage source changed team", float64(sample.ContestStarts), labels)
	registry.AddCounter("battle_bat_damage_events_total", "Effective bat damage events", float64(sample.DamageEvents), labels)
	registry.AddCounter("battle_bat_effective_damage_total", "Effective damage dealt to bats", float64(sample.EffectiveDamage), labels)
	registry.AddCounter("battle_bat_reward_expiries_total", "Bat rewards that expired unclaimed", float64(sample.RewardExpiries), labels)
	for role, count := range sample.RewardClaimsByRole {
		if count == 0 || !isBotMetricRole(role) {
			continue
		}
		registry.AddCounter("battle_bat_reward_claims_by_role_total", "Bat rewards claimed by combat role", float64(count), map[string]string{"mode": labels["mode"], "role": role})
	}
	for role, damage := range sample.DamageByRole {
		if damage == 0 || !isBotMetricRole(role) {
			continue
		}
		registry.AddCounter("battle_bat_damage_by_role_total", "Effective bat damage by combat role", float64(damage), map[string]string{"mode": labels["mode"], "role": role})
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

func isBotMetricRole(role string) bool {
	switch role {
	case "Support", "Assassin", "Tank", "Fighter", "Controller", "Sharpshooter", "other":
		return true
	default:
		return false
	}
}
