package game

import "math"

// BotMLTacticalReward is the decomposed reward sent to self-play. Keeping the
// components explicit makes training debuggable: a higher scalar cannot hide
// that a policy won by farming damage while ignoring its team.
type BotMLTacticalReward struct {
	TeamVictory  float64 `json:"teamVictory"`
	FocusFire    float64 `json:"focusFire"`
	AllyHelp     float64 `json:"allyHelp"`
	Cover        float64 `json:"cover"`
	SmartRetreat float64 `json:"smartRetreat"`
	Total        float64 `json:"total"`
}

// BotMLTacticalRewardFor evaluates the decision currently being executed.
// Damage and survival deltas are added by the IPC adapter between decisions;
// these local terms specifically reward the team tactics requested by the
// policy contract.
func (gs *GameState) BotMLTacticalRewardFor(botID string, decision BotMLTacticalDecision, target *botTarget) BotMLTacticalReward {
	if gs == nil {
		return BotMLTacticalReward{}
	}
	bot := gs.Players[botID]
	if bot == nil {
		return BotMLTacticalReward{}
	}
	reward := BotMLTacticalReward{}
	if target != nil && target.player != nil && target.player.Team != bot.Team {
		for _, ally := range gs.Players {
			if ally == nil || ally.PlayerId == botID || ally.Team != bot.Team {
				continue
			}
			memory := gs.BotMemory[ally.PlayerId]
			if memory != nil && memory.TargetType == "player" && memory.TargetID == target.id {
				reward.FocusFire = 0.04
				break
			}
		}
	}
	if target != nil && target.player != nil && target.player.Team == bot.Team {
		health := float64(target.player.Lives) / math.Max(1, float64(target.player.MaxLives))
		if health < .65 && target.player.LastDamageAt > 0 {
			reward.AllyHelp = 0.04
		}
	}
	if decision.Intent == BotMLTacticalIntentTakeCover || decision.Movement == BotMLTacticalMovementCover {
		if available, _, quality := gs.botMLCoverFeatures(bot, gs.nowMs()); available > 0 {
			reward.Cover = 0.03 * quality
		}
	}
	if decision.Intent == BotMLTacticalIntentRetreat || decision.Intent == BotMLTacticalIntentKite {
		if ctxHealthFraction(bot) < BotLowHealthRetreatFraction {
			reward.SmartRetreat = 0.04
		}
	}
	if gs.Mode == ModeTeamDeathmatch {
		if winner, decided := gs.matchRules().EvaluateWinner(gs, gs.nowMs()); decided && winner == bot.Team+" team" {
			reward.TeamVictory = 1
		}
	}
	reward.Total = reward.TeamVictory + reward.FocusFire + reward.AllyHelp + reward.Cover + reward.SmartRetreat
	return reward
}
