package game

import (
	"battle/model/player"
	"math"
)

const botMLTacticalCommitMs int64 = 240

// botMLTacticalControl is the only gameplay entry point for tactical-v2. It
// keeps hard interrupts above the model, caches a decision for a short human
// reaction window, resolves the selected slot against authoritative perception,
// and then calls the same validated movement/ability/shooting primitives as the
// deterministic bot.
func (gs *GameState) botMLTacticalControl(id string, bot *player.Player, now int64) bool {
	if gs == nil || bot == nil || gs.botMLTacticalPolicy == nil || !gs.botMLTacticalDirect || !bot.IsAlive() {
		return false
	}
	memory := gs.botMemoryFor(id)
	if now >= memory.MLTacticalNextAt || memory.MLTacticalIntent == "" {
		observation, err := gs.BotMLTacticalObservationFor(id, now)
		if err != nil {
			return false
		}
		decision := gs.botMLTacticalPolicy.DecideTactical(id, observation)
		if !validBotMLTacticalDecision(decision, observation) {
			return false
		}
		teacherTarget := gs.botSelectTarget(bot, now)
		selectedTarget := gs.botMLTacticalTargetFor(bot, decision.Target, now)
		teacherDecision, teacherErr := gs.BotMLTacticalExpertDecisionFor(id, now)
		if teacherErr == nil {
			if safeDecision, changed := botMLTacticalSafetyFallback(decision, teacherDecision, bot, teacherTarget, selectedTarget); changed {
				decision = safeDecision
				gs.botMetrics.MLTacticalSafetyFallbacks++
				selectedTarget = gs.botMLTacticalTargetFor(bot, decision.Target, now)
			}
		}
		gs.botMetrics.MLTacticalDecisions++
		reward := gs.BotMLTacticalRewardFor(id, decision, selectedTarget)
		if reward.TeamVictory > 0 {
			gs.botMetrics.MLTacticalTeamVictory++
		}
		if reward.FocusFire > 0 {
			gs.botMetrics.MLTacticalFocusFire++
		}
		if reward.AllyHelp > 0 {
			gs.botMetrics.MLTacticalAllyHelp++
		}
		if reward.Cover > 0 {
			gs.botMetrics.MLTacticalCover++
		}
		if reward.SmartRetreat > 0 {
			gs.botMetrics.MLTacticalSmartRetreat++
		}
		if teacherErr == nil && botMLTacticalDecisionChangedBehavior(decision, teacherDecision, teacherTarget, selectedTarget) {
			gs.botMetrics.MLTacticalBehaviorChanges++
		}
		memory.MLTacticalIntent = botMLTacticalIntentName(decision.Intent)
		memory.MLTacticalTarget = botMLTacticalTargetName(decision.Target)
		memory.MLTacticalMovement = botMLTacticalMovementName(decision.Movement)
		memory.MLTacticalAbility = botMLTacticalAbilityName(decision.Ability)
		memory.MLTacticalNextAt = now + botMLTacticalCommitMs
	}
	decision := BotMLTacticalDecision{
		Intent:   botMLTacticalIntentFromName(memory.MLTacticalIntent),
		Target:   botMLTacticalTargetFromName(memory.MLTacticalTarget),
		Movement: botMLTacticalMovementFromName(memory.MLTacticalMovement),
		Ability:  botMLTacticalAbilityFromName(memory.MLTacticalAbility),
	}
	target := gs.botMLTacticalTargetFor(bot, decision.Target, now)
	if decision.Ability != BotMLTacticalAbilityNone && gs.botMLTacticalUseAbility(id, bot, target, decision.Ability, now) {
		return true
	}
	switch decision.Intent {
	case BotMLTacticalIntentRetreat:
		if target != nil {
			gs.botRetreatFrom(id, bot, target.x, target.y, now)
		} else {
			gs.botRetreatFrom(id, bot, bot.X+1, bot.Y, now)
		}
	case BotMLTacticalIntentKite:
		if target != nil {
			gs.botRetreatFrom(id, bot, target.x, target.y, now)
		} else {
			gs.botExplore(id, bot, now)
		}
	case BotMLTacticalIntentChase, BotMLTacticalIntentEngage:
		if target != nil {
			gs.botEngageTarget(id, bot, target, now)
		} else {
			gs.botExplore(id, bot, now)
		}
	case BotMLTacticalIntentTakeCover:
		if gs.botMoveToCover(id, bot, now) {
			return true
		}
		if target != nil {
			gs.botEngageTarget(id, bot, target, now)
		}
	case BotMLTacticalIntentRoam:
		gs.botExplore(id, bot, now)
	case BotMLTacticalIntentUseAbility:
		if target != nil {
			gs.botEngageTarget(id, bot, target, now)
		} else {
			gs.botExplore(id, bot, now)
		}
	default:
		return false
	}
	if decision.Movement == BotMLTacticalMovementCover {
		gs.botMoveToCover(id, bot, now)
	}
	return true
}

func botMLTacticalSafetyFallback(model, teacher BotMLTacticalDecision, bot *player.Player, teacherTarget, modelTarget *botTarget) (BotMLTacticalDecision, bool) {
	if bot == nil {
		return model, false
	}
	result := model
	changed := false
	lowHealth := ctxHealthFraction(bot) < BotLowHealthRetreatFraction
	if teacherTarget != nil && !lowHealth && (model.Intent == BotMLTacticalIntentRoam || model.Intent == BotMLTacticalIntentTakeCover || model.Intent == BotMLTacticalIntentRetreat || model.Intent == BotMLTacticalIntentKite) {
		result.Intent, result.Target, result.Movement = teacher.Intent, teacher.Target, teacher.Movement
		changed = true
	}
	if teacherTarget != nil && modelTarget == nil && (result.Intent == BotMLTacticalIntentEngage || result.Intent == BotMLTacticalIntentChase) {
		result.Target = teacher.Target
		changed = true
	}
	if teacherTarget != nil && modelTarget != nil && (teacherTarget.kind != modelTarget.kind || teacherTarget.id != modelTarget.id) && (result.Intent == BotMLTacticalIntentEngage || result.Intent == BotMLTacticalIntentChase) {
		result.Target = teacher.Target
		changed = true
	}
	if result.Ability != teacher.Ability {
		result.Ability = teacher.Ability
		changed = true
	}
	return result, changed
}

func validBotMLTacticalDecision(decision BotMLTacticalDecision, observation BotMLTacticalObservation) bool {
	return int(decision.Intent) >= 0 && int(decision.Intent) < len(observation.IntentMask) && observation.IntentMask[decision.Intent] &&
		int(decision.Target) >= 0 && int(decision.Target) < len(observation.TargetMask) && observation.TargetMask[decision.Target] &&
		int(decision.Movement) >= 0 && int(decision.Movement) < len(observation.MovementMask) && observation.MovementMask[decision.Movement] &&
		int(decision.Ability) >= 0 && int(decision.Ability) < len(observation.AbilityMask) && observation.AbilityMask[decision.Ability]
}

func botMLTacticalDecisionChangedBehavior(decision, teacherDecision BotMLTacticalDecision, teacher, selected *botTarget) bool {
	if teacher == nil || selected == nil {
		return (teacher == nil) != (selected == nil) || decision.Intent != teacherDecision.Intent || decision.Movement != teacherDecision.Movement || decision.Ability != teacherDecision.Ability
	}
	if teacher.kind != selected.kind || teacher.id != selected.id {
		return true
	}
	return decision.Intent != teacherDecision.Intent || decision.Movement != teacherDecision.Movement || decision.Ability != teacherDecision.Ability
}

func (gs *GameState) botMLTacticalTargetFor(bot *player.Player, slot BotMLTacticalTargetSlot, now int64) *botTarget {
	if bot == nil {
		return nil
	}
	enemies, allies, monsters := gs.botMLTacticalCandidates(bot, now)
	switch slot {
	case BotMLTacticalTargetEnemy0, BotMLTacticalTargetEnemy1, BotMLTacticalTargetEnemy2:
		index := int(slot - BotMLTacticalTargetEnemy0)
		if index < len(enemies) {
			return enemies[index]
		}
	case BotMLTacticalTargetAlly0:
		if len(allies) > 0 {
			return allies[0]
		}
	case BotMLTacticalTargetMonster0:
		if len(monsters) > 0 {
			return monsters[0]
		}
	case BotMLTacticalTargetObjective:
		if objective := gs.teamObjective(bot.Team, false); objective != nil {
			return &botTarget{kind: "objective", id: objective.ID, objective: objective, x: objective.X, y: objective.Y, distance: math.Hypot(objective.X-bot.X, objective.Y-bot.Y)}
		}
	case BotMLTacticalTargetPickup:
		if pickup := gs.botPickupTarget(bot); pickup != nil && pickup.Active {
			return &botTarget{kind: "pickup", id: pickup.Type, x: pickup.X, y: pickup.Y, distance: math.Hypot(pickup.X-bot.X, pickup.Y-bot.Y)}
		}
	}
	return nil
}

func (gs *GameState) BotMLTacticalTargetFor(botID string, slot BotMLTacticalTargetSlot) *botTarget {
	if gs == nil {
		return nil
	}
	return gs.botMLTacticalTargetFor(gs.Players[botID], slot, gs.nowMs())
}

func (gs *GameState) botMLTacticalUseAbility(id string, bot *player.Player, target *botTarget, ability BotMLTacticalAbility, now int64) bool {
	if bot == nil || ability == BotMLTacticalAbilityNone {
		return false
	}
	if target != nil {
		bot.Rotation = math.Atan2(target.y-bot.Y, target.x-bot.X)
		bot.AimDistance = target.distance
	}
	slot := "secondary"
	if ability == BotMLTacticalAbilitySuper {
		slot = "primary"
	}
	gs.playerAbility(id, now, slot, "")
	if bot.LastAbilityOK {
		gs.recordBotAbilityUse()
		return true
	}
	return false
}

func (gs *GameState) botMoveToCover(id string, bot *player.Player, now int64) bool {
	if gs == nil || bot == nil {
		return false
	}
	crate := gs.closestWallOfType(bot.X, bot.Y, "crates")
	if crate == nil {
		return false
	}
	targetX, targetY := botWallApproachPoint(bot, crate)
	gs.moveBotTo(id, bot, targetX, targetY, now)
	return true
}

func botMLTacticalIntentFromName(name string) BotMLTacticalIntent {
	for index, value := range botMLTacticalIntentNames {
		if value == name {
			return BotMLTacticalIntent(index)
		}
	}
	return BotMLTacticalIntentRoam
}
func botMLTacticalTargetFromName(name string) BotMLTacticalTargetSlot {
	for index, value := range botMLTacticalTargetNames {
		if value == name {
			return BotMLTacticalTargetSlot(index)
		}
	}
	return BotMLTacticalTargetNone
}
func botMLTacticalMovementFromName(name string) BotMLTacticalMovement {
	for index, value := range botMLTacticalMovementNames {
		if value == name {
			return BotMLTacticalMovement(index)
		}
	}
	return BotMLTacticalMovementDirect
}
func botMLTacticalAbilityFromName(name string) BotMLTacticalAbility {
	for index, value := range botMLTacticalAbilityNames {
		if value == name {
			return BotMLTacticalAbility(index)
		}
	}
	return BotMLTacticalAbilityNone
}
