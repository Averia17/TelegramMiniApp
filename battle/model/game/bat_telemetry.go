package game

import (
	"battle/model/player"
	"battle/model/prop"
	"battle/observability"
)

func (gs *GameState) resetBatLifecycleMetrics() {
	if gs == nil {
		return
	}
	gs.batMetrics = newBatLifecycleMetrics()
	gs.batMetricsFlushed = false
	gs.batDamageTeams = make(map[string]string)
	gs.batDamageSeen = make(map[string]bool)
	gs.batContested = make(map[string]bool)
	gs.batTimeline = make([]BatTimelineEvent, 0, 32)
}

// BatLifecycleTimelineSnapshot returns a detached copy for deterministic
// reports. The timeline is capped so a long match cannot grow state without
// bound.
func (gs *GameState) BatLifecycleTimelineSnapshot() []BatTimelineEvent {
	if gs == nil || len(gs.batTimeline) == 0 {
		return nil
	}
	return append([]BatTimelineEvent(nil), gs.batTimeline...)
}

func (gs *GameState) appendBatTimeline(event BatTimelineEvent) {
	if gs == nil || event.Kind == "" {
		return
	}
	if event.AtMs == 0 {
		event.AtMs = gs.nowMs()
	}
	if len(gs.batTimeline) >= maxBatTimelineEvents {
		copy(gs.batTimeline, gs.batTimeline[1:])
		gs.batTimeline[len(gs.batTimeline)-1] = event
		return
	}
	gs.batTimeline = append(gs.batTimeline, event)
}

// BatLifecycleMetricsSnapshot returns a value copy safe for scenario reports
// and exporters. The counters are not part of the live snapshot or state hash.
func (gs *GameState) BatLifecycleMetricsSnapshot() BatLifecycleMetrics {
	if gs == nil {
		return BatLifecycleMetrics{}
	}
	snapshot := gs.batMetrics
	snapshot.RewardClaimsByRole = make(map[string]uint64, len(gs.batMetrics.RewardClaimsByRole))
	for role, count := range gs.batMetrics.RewardClaimsByRole {
		snapshot.RewardClaimsByRole[role] = count
	}
	snapshot.DamageByRole = make(map[string]uint64, len(gs.batMetrics.DamageByRole))
	for role, damage := range gs.batMetrics.DamageByRole {
		snapshot.DamageByRole[role] = damage
	}
	return snapshot
}

func (gs *GameState) recordBatRewardClaim(collector *player.Player, reward *prop.Prop) {
	if gs == nil {
		return
	}
	gs.batMetrics.RewardClaims++
	if gs.batMetrics.RewardClaimsByRole == nil {
		gs.batMetrics.RewardClaimsByRole = make(map[string]uint64)
	}
	role := botRoleFor(collector)
	if !isBotMetricRole(role) {
		role = "other"
	}
	gs.batMetrics.RewardClaimsByRole[role]++
	event := BatTimelineEvent{BatID: rewardSourceID(reward), Kind: "claim", ClaimantID: collectorID(collector), Role: role}
	if reward != nil {
		event.KillerID, event.Team = reward.HealthBoostKillerID, reward.VisibilityTeam
	}
	gs.appendBatTimeline(event)
}

func (gs *GameState) recordBatRewardDenial(collector *player.Player, reward *prop.Prop) {
	if gs != nil {
		gs.batMetrics.RewardDenials++
		event := BatTimelineEvent{BatID: rewardSourceID(reward), Kind: "denial", ClaimantID: collectorID(collector)}
		if reward != nil {
			event.KillerID, event.Team = reward.HealthBoostKillerID, reward.VisibilityTeam
		}
		gs.appendBatTimeline(event)
	}
}

func (gs *GameState) recordBatDamage(id string, source *player.Player, dealt int) {
	if gs == nil || dealt <= 0 {
		return
	}
	gs.batMetrics.DamageEvents++
	gs.batMetrics.EffectiveDamage += uint64(dealt)
	if gs.batDamageSeen == nil {
		gs.batDamageSeen = make(map[string]bool)
	}
	if !gs.batDamageSeen[id] {
		gs.batDamageSeen[id] = true
		gs.batMetrics.FirstDamageEvents++
		gs.appendBatTimeline(BatTimelineEvent{BatID: id, Kind: "first_damage", SourceID: playerID(source), Team: playerTeam(source), Role: playerRole(source)})
	}
	if gs.batMetrics.DamageByRole == nil {
		gs.batMetrics.DamageByRole = make(map[string]uint64)
	}
	role := botRoleFor(source)
	if !isBotMetricRole(role) {
		role = "other"
	}
	if gs.batDamageTeams == nil {
		gs.batDamageTeams = make(map[string]string)
	}
	if gs.batContested == nil {
		gs.batContested = make(map[string]bool)
	}
	gs.batMetrics.DamageByRole[role] += uint64(dealt)
	if source != nil && source.Team != "" {
		team := source.Team
		if previous := gs.batDamageTeams[id]; previous != "" && previous != team && !gs.batContested[id] {
			gs.batContested[id] = true
			gs.batMetrics.ContestStarts++
			source.BatContests++
			gs.appendBatTimeline(BatTimelineEvent{BatID: id, Kind: "contest", SourceID: source.PlayerId, Team: team, Role: role})
		}
		gs.batDamageTeams[id] = team
	}
	gs.appendBatTimeline(BatTimelineEvent{BatID: id, Kind: "damage", SourceID: playerID(source), Team: playerTeam(source), Role: role, Damage: dealt})
}

func (gs *GameState) recordBatRewardExpiry(reward *prop.Prop) {
	if gs != nil {
		gs.batMetrics.RewardExpiries++
		event := BatTimelineEvent{BatID: rewardSourceID(reward), Kind: "expiry"}
		if reward != nil {
			event.KillerID, event.Team = reward.HealthBoostKillerID, reward.VisibilityTeam
		}
		gs.appendBatTimeline(event)
	}
}

func (gs *GameState) recordBatNoticeStart() {
	if gs != nil {
		gs.batMetrics.NoticeStarts++
	}
}

func (gs *GameState) recordBatNoticeCancel() {
	if gs != nil {
		gs.batMetrics.NoticeCancels++
	}
}

func (gs *GameState) recordBatWindupStart() {
	if gs != nil {
		gs.batMetrics.WindupStarts++
	}
}

func (gs *GameState) recordBatStrike() {
	if gs != nil {
		gs.batMetrics.Strikes++
	}
}

func (gs *GameState) recordBatReward(id string, source *player.Player, reward *prop.Prop) {
	if gs != nil {
		gs.batMetrics.Rewards++
		gs.appendBatTimeline(BatTimelineEvent{
			BatID: id, Kind: "reward", SourceID: playerID(source), KillerID: rewardKillerID(reward),
			Team: rewardTeam(reward), Role: playerRole(source),
		})
	}
}

func rewardKillerID(reward *prop.Prop) string {
	if reward == nil {
		return ""
	}
	return reward.HealthBoostKillerID
}

func rewardTeam(reward *prop.Prop) string {
	if reward == nil {
		return ""
	}
	return reward.VisibilityTeam
}

func rewardSourceID(reward *prop.Prop) string {
	if reward == nil {
		return ""
	}
	return reward.LootSourceID
}

func collectorID(p *player.Player) string {
	if p == nil {
		return ""
	}
	return p.PlayerId
}

func playerID(p *player.Player) string {
	if p == nil {
		return ""
	}
	return p.PlayerId
}

func playerTeam(p *player.Player) string {
	if p == nil {
		return ""
	}
	return p.Team
}

func playerRole(p *player.Player) string {
	if p == nil {
		return "other"
	}
	role := botRoleFor(p)
	if !isBotMetricRole(role) {
		return "other"
	}
	return role
}

func (gs *GameState) recordBatRespawn() {
	if gs != nil {
		gs.batMetrics.Respawns++
	}
}

func (gs *GameState) flushBatLifecycleMetrics() {
	if gs == nil || gs.batMetricsFlushed {
		return
	}
	gs.batMetricsFlushed = true
	metrics := gs.BatLifecycleMetricsSnapshot()
	observability.RecordBatLifecycleMetrics(observability.Default, observability.BatLifecycleMetricSample{
		Mode:               string(gs.Mode),
		NoticeStarts:       metrics.NoticeStarts,
		NoticeCancels:      metrics.NoticeCancels,
		WindupStarts:       metrics.WindupStarts,
		Strikes:            metrics.Strikes,
		Rewards:            metrics.Rewards,
		Respawns:           metrics.Respawns,
		RewardClaims:       metrics.RewardClaims,
		RewardDenials:      metrics.RewardDenials,
		RewardClaimsByRole: metrics.RewardClaimsByRole,
		FirstDamageEvents:  metrics.FirstDamageEvents,
		ContestStarts:      metrics.ContestStarts,
		DamageEvents:       metrics.DamageEvents,
		EffectiveDamage:    metrics.EffectiveDamage,
		RewardExpiries:     metrics.RewardExpiries,
		DamageByRole:       metrics.DamageByRole,
	})
}
