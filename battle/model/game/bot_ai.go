package game

import (
	"battle/model/player"
	"math"
	"time"
)

// BotAIStrategy is the mode-level seam for bot decision making. Keeping the
// strategy outside GameState lets each mode evolve without turning the game
// loop into a mode-specific collection of conditionals.
type BotAIStrategy interface {
	Update(*GameState)
}

type botStrategyBase struct{}

func (botStrategyBase) emergency(gs *GameState, bot *player.Player, now int64) bool {
	if dodgeX, dodgeY, threatened := gs.botProjectileDodge(bot); threatened {
		gs.playerMove(bot.PlayerId, now, dodgeX, dodgeY)
		return true
	}
	if threat, flee := gs.botMonsterThreat(bot); threat != nil {
		if flee {
			gs.botRetreatFrom(bot.PlayerId, bot, threat.X, threat.Y, now)
		} else {
			gs.botEngageTarget(bot.PlayerId, bot, &botTarget{kind: "monster", id: "threat", monster: threat, x: threat.X, y: threat.Y, distance: math.Hypot(threat.X-bot.X, threat.Y-bot.Y)}, now)
		}
		return true
	}
	return false
}

type battleRoyaleBotStrategy struct{ botStrategyBase }

func (battleRoyaleBotStrategy) Update(gs *GameState) { gs.updateBattleRoyaleBots() }

type teamBotIntentKind string

const (
	teamIntentDefend       teamBotIntentKind = "defend"
	teamIntentSupport      teamBotIntentKind = "support"
	teamIntentAttackBase   teamBotIntentKind = "attack_base"
	teamIntentAttackPlayer teamBotIntentKind = "attack_player"
	teamIntentRegroup      teamBotIntentKind = "regroup"
	teamIntentRoam         teamBotIntentKind = "roam"
)

type teamBotIntent struct {
	kind   teamBotIntentKind
	target *botTarget
	x, y   float64
}

type teamBotContext struct {
	gs             *GameState
	bot            *player.Player
	now            int64
	index          int
	visibleTarget  *botTarget
	ownObjective   *ObjectiveState
	enemyObjective *ObjectiveState
}

// Team behavior is intentionally represented as independent policies. Their
// order is the priority model: defense wins over support, support over
// pushing, and pushing over regrouping/roaming.
type teamBotBehavior interface {
	Decide(*teamBotContext) (teamBotIntent, bool)
}

type defendObjectiveBehavior struct{}

func (defendObjectiveBehavior) Decide(ctx *teamBotContext) (teamBotIntent, bool) {
	if ctx.ownObjective == nil {
		return teamBotIntent{}, false
	}
	underAttack := ctx.ownObjective.LastDamagedAt > 0 && ctx.now-ctx.ownObjective.LastDamagedAt <= 2500
	enemy := ctx.gs.nearestVisibleEnemyNear(ctx.bot, ctx.ownObjective.X, ctx.ownObjective.Y, 520, ctx.now)
	if !underAttack && enemy == nil {
		return teamBotIntent{}, false
	}
	if enemy != nil {
		return teamBotIntent{kind: teamIntentDefend, target: &botTarget{kind: "player", id: enemy.PlayerId, player: enemy, x: enemy.X, y: enemy.Y, distance: math.Hypot(enemy.X-ctx.bot.X, enemy.Y-ctx.bot.Y)}}, true
	}
	return teamBotIntent{kind: teamIntentDefend, x: ctx.ownObjective.X, y: ctx.ownObjective.Y}, true
}

type supportAllyBehavior struct{}

func (supportAllyBehavior) Decide(ctx *teamBotContext) (teamBotIntent, bool) {
	ally := ctx.gs.combatAllyFor(ctx.bot, ctx.now)
	if ally == nil {
		return teamBotIntent{}, false
	}
	enemy := ctx.gs.nearestVisibleEnemyNear(ctx.bot, ally.X, ally.Y, 440, ctx.now)
	if enemy != nil {
		return teamBotIntent{kind: teamIntentSupport, target: &botTarget{kind: "player", id: enemy.PlayerId, player: enemy, x: enemy.X, y: enemy.Y, distance: math.Hypot(enemy.X-ctx.bot.X, enemy.Y-ctx.bot.Y)}}, true
	}
	if math.Hypot(ally.X-ctx.bot.X, ally.Y-ctx.bot.Y) > 230 {
		return teamBotIntent{kind: teamIntentSupport, x: ally.X, y: ally.Y}, true
	}
	return teamBotIntent{}, false
}

type attackObjectiveBehavior struct{}

func (attackObjectiveBehavior) Decide(ctx *teamBotContext) (teamBotIntent, bool) {
	if ctx.enemyObjective == nil {
		return teamBotIntent{}, false
	}
	if ctx.visibleTarget != nil && ctx.visibleTarget.player != nil {
		// A nearby enemy is an immediate tactical problem. Humans do not keep
		// walking toward an objective while an opponent is already in striking
		// distance, even when an ally is present at the objective.
		interruptDistance := math.Max(180, botAttackRange(ctx.bot)*1.35) + ctx.visibleTarget.radius()
		if ctx.visibleTarget.distance <= interruptDistance {
			return teamBotIntent{}, false
		}
	}
	ally := ctx.gs.allyNearObjective(ctx.bot.Team, ctx.enemyObjective, 360)
	if ally == nil && ctx.visibleTarget != nil {
		return teamBotIntent{}, false
	}
	return teamBotIntent{kind: teamIntentAttackBase, target: &botTarget{kind: "objective", id: ctx.enemyObjective.ID, objective: ctx.enemyObjective, x: ctx.enemyObjective.X, y: ctx.enemyObjective.Y, distance: math.Hypot(ctx.enemyObjective.X-ctx.bot.X, ctx.enemyObjective.Y-ctx.bot.Y)}}, true
}

type attackPlayerBehavior struct{}

func (attackPlayerBehavior) Decide(ctx *teamBotContext) (teamBotIntent, bool) {
	if ctx.visibleTarget == nil {
		return teamBotIntent{}, false
	}
	return teamBotIntent{kind: teamIntentAttackPlayer, target: ctx.visibleTarget}, true
}

type regroupBehavior struct{}

func (regroupBehavior) Decide(ctx *teamBotContext) (teamBotIntent, bool) {
	ally := ctx.gs.nearestAlly(ctx.bot)
	if ally == nil || math.Hypot(ally.X-ctx.bot.X, ally.Y-ctx.bot.Y) <= 250 {
		return teamBotIntent{}, false
	}
	// The offset prevents three agents from occupying one collision point.
	offset := float64((ctx.index%3)-1) * 62
	return teamBotIntent{kind: teamIntentRegroup, x: ally.X + offset, y: ally.Y - offset}, true
}

type roamBehavior struct{}

func (roamBehavior) Decide(*teamBotContext) (teamBotIntent, bool) {
	return teamBotIntent{kind: teamIntentRoam}, true
}

type teamBattleBotStrategy struct {
	botStrategyBase
	behaviors []teamBotBehavior
}

func newTeamBattleBotStrategy() *teamBattleBotStrategy {
	return &teamBattleBotStrategy{behaviors: []teamBotBehavior{
		defendObjectiveBehavior{}, supportAllyBehavior{}, attackObjectiveBehavior{}, attackPlayerBehavior{}, regroupBehavior{}, roamBehavior{},
	}}
}

func newBotAIStrategy(mode GameMode) BotAIStrategy {
	if mode == ModeTeamDeathmatch {
		return newTeamBattleBotStrategy()
	}
	return battleRoyaleBotStrategy{}
}

func (gs *GameState) updateBots() {
	if gs.botAI == nil {
		gs.botAI = newBotAIStrategy(gs.Mode)
	}
	gs.botAI.Update(gs)
}

func (s *teamBattleBotStrategy) Update(gs *GameState) {
	if gs.State != GameStateGame {
		return
	}
	now := time.Now().UnixMilli()
	index := 0
	for _, id := range sortedBotIDs(gs.Players) {
		bot := gs.Players[id]
		if s.emergency(gs, bot, now) {
			index++
			continue
		}
		if centerX, centerY, seekCenter := gs.botStormCenterTarget(bot); seekCenter {
			gs.moveBotTo(id, bot, centerX, centerY, now)
			index++
			continue
		}
		visible := gs.botSelectTarget(bot, now)
		if visible == nil && gs.botTryAbility(id, bot, nil, now) {
			index++
			continue
		}
		ctx := &teamBotContext{gs: gs, bot: bot, now: now, index: index, visibleTarget: visible, ownObjective: gs.teamObjective(bot.Team, true), enemyObjective: gs.teamObjective(bot.Team, false)}
		intent := teamBotIntent{}
		for _, behavior := range s.behaviors {
			if candidate, ok := behavior.Decide(ctx); ok {
				intent = candidate
				break
			}
		}
		s.execute(gs, bot, intent, index, now)
		index++
	}
}

func (s *teamBattleBotStrategy) execute(gs *GameState, bot *player.Player, intent teamBotIntent, index int, now int64) {
	switch intent.kind {
	case teamIntentDefend, teamIntentSupport, teamIntentAttackPlayer, teamIntentAttackBase:
		if intent.target != nil {
			gs.botEngageTarget(bot.PlayerId, bot, intent.target, now)
			return
		}
		gs.moveBotTo(bot.PlayerId, bot, intent.x, intent.y, now)
	case teamIntentRegroup:
		gs.moveBotTo(bot.PlayerId, bot, intent.x, intent.y, now)
	default:
		gs.botExplore(bot.PlayerId, bot, now)
	}
}

func (gs *GameState) moveBotTo(id string, bot *player.Player, x, y float64, now int64) {
	if bot == nil {
		return
	}
	angle := math.Atan2(y-bot.Y, x-bot.X)
	gs.botRotateToward(id, bot, angle)
	dx, dy := gs.botTravelDirection(id, &bot.CircleBody, x, y, now)
	gs.playerMove(id, now, dx, dy)
}

func (gs *GameState) teamObjective(team string, own bool) *ObjectiveState {
	var best *ObjectiveState
	for _, objective := range gs.Objectives {
		if objective == nil || objective.Lives <= 0 || (own && objective.Team != team) || (!own && objective.Team == team) {
			continue
		}
		if best == nil || objective.Type == "tower" && best.Type != "tower" || (objective.Type == best.Type && objective.ID < best.ID) {
			best = objective
		}
	}
	return best
}

func (gs *GameState) nearestEnemyNear(team string, x, y, radius float64) *player.Player {
	var best *player.Player
	bestDistance := math.Inf(1)
	for _, candidate := range gs.Players {
		if candidate == nil || !candidate.IsAlive() || candidate.Team == team {
			continue
		}
		distance := math.Hypot(candidate.X-x, candidate.Y-y)
		if distance <= radius && (distance < bestDistance || distance == bestDistance && candidate.PlayerId < best.PlayerId) {
			best, bestDistance = candidate, distance
		}
	}
	return best
}

func (gs *GameState) nearestVisibleEnemyNear(observer *player.Player, x, y, radius float64, now int64) *player.Player {
	if observer == nil {
		return nil
	}
	var best *player.Player
	bestDistance := math.Inf(1)
	for _, candidate := range gs.Players {
		if candidate == nil || !candidate.IsAlive() || candidate.Team == observer.Team || !gs.botCanSee(observer, candidate, now) {
			continue
		}
		distance := math.Hypot(candidate.X-x, candidate.Y-y)
		if distance <= radius && (distance < bestDistance || distance == bestDistance && candidate.PlayerId < best.PlayerId) {
			best, bestDistance = candidate, distance
		}
	}
	return best
}

func (gs *GameState) nearestAlly(bot *player.Player) *player.Player {
	var best *player.Player
	bestDistance := math.Inf(1)
	for _, candidate := range gs.Players {
		if candidate == nil || candidate.PlayerId == bot.PlayerId || !candidate.IsAlive() || candidate.Team != bot.Team {
			continue
		}
		distance := math.Hypot(candidate.X-bot.X, candidate.Y-bot.Y)
		if distance < bestDistance || distance == bestDistance && candidate.PlayerId < best.PlayerId {
			best, bestDistance = candidate, distance
		}
	}
	return best
}

func (gs *GameState) combatAllyFor(bot *player.Player, now int64) *player.Player {
	var best *player.Player
	bestDistance := math.Inf(1)
	for _, candidate := range gs.Players {
		if candidate == nil || candidate.PlayerId == bot.PlayerId || !candidate.IsAlive() || candidate.Team != bot.Team || candidate.LastShootAt == 0 || now-candidate.LastShootAt > 2200 {
			continue
		}
		distance := math.Hypot(candidate.X-bot.X, candidate.Y-bot.Y)
		if distance < bestDistance {
			best, bestDistance = candidate, distance
		}
	}
	return best
}

func (gs *GameState) allyNearObjective(team string, objective *ObjectiveState, radius float64) *player.Player {
	if objective == nil {
		return nil
	}
	for _, candidate := range gs.Players {
		if candidate != nil && candidate.IsAlive() && candidate.Team == team && math.Hypot(candidate.X-objective.X, candidate.Y-objective.Y) <= radius {
			return candidate
		}
	}
	return nil
}
