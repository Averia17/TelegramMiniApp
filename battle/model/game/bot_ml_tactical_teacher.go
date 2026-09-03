package game

import (
	"battle/model/player"
	"fmt"
	"math"
)

// BotMLTacticalExpertDecisionFor exposes the deterministic teacher used to
// warm-start v2. It deliberately reuses authoritative target ranking and
// health/damage-race gates instead of duplicating those rules in Python.
func (gs *GameState) BotMLTacticalExpertDecisionFor(botID string, now int64) (BotMLTacticalDecision, error) {
	bot := gs.Players[botID]
	if bot == nil {
		return BotMLTacticalDecision{}, fmt.Errorf("tactical teacher bot %q was not found", botID)
	}
	target := gs.botSelectTarget(bot, now)
	decision := BotMLTacticalDecision{Intent: BotMLTacticalIntentRoam, Target: BotMLTacticalTargetNone, Movement: BotMLTacticalMovementDirect, Ability: BotMLTacticalAbilityNone}
	if target != nil {
		decision.Target = gs.botMLTacticalSlotFor(bot, target, now)
		decision.Intent = BotMLTacticalIntentEngage
		decision.Movement = BotMLTacticalMovementStrafe
		if target.player != nil {
			if gs.botShouldDisengage(bot, target, now) || botShouldFleeDamageRace(bot, target) {
				decision.Intent = BotMLTacticalIntentRetreat
			} else if botShouldKite(bot, target) {
				decision.Intent = BotMLTacticalIntentKite
				decision.Movement = BotMLTacticalMovementKite
			}
		}
	}
	if target == nil && gs.Mode == ModeTeamDeathmatch {
		if objective := gs.teamObjective(bot.Team, false); objective != nil {
			target = &botTarget{kind: "objective", id: objective.ID, objective: objective, x: objective.X, y: objective.Y, distance: math.Hypot(objective.X-bot.X, objective.Y-bot.Y)}
			decision.Target = BotMLTacticalTargetObjective
			decision.Intent = BotMLTacticalIntentEngage
			decision.Movement = BotMLTacticalMovementDirect
		}
	}
	if target != nil && target.player != nil && bot.SuperCharge >= SuperMaxChargePercent {
		decision.Ability = BotMLTacticalAbilitySuper
	} else if bot.GadgetCharges > 0 && bot.Lives < bot.MaxLives {
		decision.Ability = BotMLTacticalAbilityGadget
	}
	if decision.Intent == BotMLTacticalIntentRoam {
		if available, _, _ := gs.botMLCoverFeatures(bot, now); available > 0 && bot.Lives < bot.MaxLives/2 {
			decision.Intent = BotMLTacticalIntentTakeCover
			decision.Movement = BotMLTacticalMovementCover
		}
	}
	return decision, nil
}

func (gs *GameState) botMLTacticalSlotFor(bot *player.Player, target *botTarget, now int64) BotMLTacticalTargetSlot {
	if target == nil {
		return BotMLTacticalTargetNone
	}
	enemies, allies, monsters := gs.botMLTacticalCandidates(bot, now)
	for index, candidate := range enemies {
		if candidate.kind == target.kind && candidate.id == target.id {
			return BotMLTacticalTargetEnemy0 + BotMLTacticalTargetSlot(index)
		}
	}
	for index, candidate := range allies {
		if candidate.kind == target.kind && candidate.id == target.id && index == 0 {
			return BotMLTacticalTargetAlly0
		}
	}
	for index, candidate := range monsters {
		if candidate.kind == target.kind && candidate.id == target.id && index == 0 {
			return BotMLTacticalTargetMonster0
		}
	}
	if target.kind == "objective" {
		return BotMLTacticalTargetObjective
	}
	return BotMLTacticalTargetNone
}
