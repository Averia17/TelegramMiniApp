package game

import (
	"battle/model/player"
	"battle/service/geometry"
	"math"
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
		gs.recordBotHardInterrupt()
		gs.playerMove(bot.PlayerId, now, dodgeX, dodgeY)
		return true
	}
	if threat, flee := gs.botMonsterThreat(bot); threat != nil && flee {
		gs.recordBotHardInterrupt()
		gs.botRetreatFrom(bot.PlayerId, bot, threat.X, threat.Y, now)
		return true
	}
	return false
}

type battleRoyaleBotStrategy struct{ botStrategyBase }

func (battleRoyaleBotStrategy) Update(gs *GameState) { gs.updateBattleRoyaleBots() }

type teamBotIntentKind string

type teamBotAssignment string

const (
	teamAssignmentFrontline teamBotAssignment = "frontline"
	teamAssignmentSupport   teamBotAssignment = "support"
	teamAssignmentFlank     teamBotAssignment = "flank"
	teamAssignmentAnchor    teamBotAssignment = "anchor"
)

const (
	teamIntentDefend       teamBotIntentKind = "defend"
	teamIntentSupport      teamBotIntentKind = "support"
	teamIntentAttackBase   teamBotIntentKind = "attack_base"
	teamIntentAttackPlayer teamBotIntentKind = "attack_player"
	teamIntentFarmBat      teamBotIntentKind = "farm_bat"
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
	assignment     teamBotAssignment
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
	ally := ctx.gs.allyNeedingSupport(ctx.bot, ctx.now)
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

// allyNeedingSupport is perception-limited and deterministic. Recent damage
// is a stronger peel signal than recent shooting: a support bot must react to
// an ally being focused even when that ally is stunned, reloading, or fleeing.
func (gs *GameState) allyNeedingSupport(bot *player.Player, now int64) *player.Player {
	if gs == nil || bot == nil {
		return nil
	}
	var best *player.Player
	bestScore := math.Inf(-1)
	for _, candidate := range gs.Players {
		if candidate == nil || candidate.PlayerId == bot.PlayerId || !candidate.IsAlive() || candidate.Team != bot.Team {
			continue
		}
		health := float64(candidate.Lives) / math.Max(1, float64(candidate.MaxLives))
		recentDamage := candidate.LastDamageAt > 0 && now-candidate.LastDamageAt <= 1800
		recentFire := candidate.LastShootAt > 0 && now-candidate.LastShootAt <= 2200
		if !recentDamage && !recentFire && health >= .45 {
			continue
		}
		distance := math.Hypot(candidate.X-bot.X, candidate.Y-bot.Y)
		if distance > BotVisionRange*1.15 {
			continue
		}
		score := (1-health)*90 + math.Max(0, 1-distance/(BotVisionRange*1.15))*12
		if recentDamage {
			score += 42
		}
		if recentFire {
			score += 18
		}
		if score > bestScore || score == bestScore && candidate.PlayerId < best.PlayerId {
			best, bestScore = candidate, score
		}
	}
	return best
}

type attackObjectiveBehavior struct{}

func (attackObjectiveBehavior) Decide(ctx *teamBotContext) (teamBotIntent, bool) {
	if ctx.enemyObjective == nil {
		return teamBotIntent{}, false
	}
	if ctx.visibleTarget != nil {
		// Pushing an objective is a fallback, never a higher-priority action
		// than fighting something the bot can currently see. This applies to
		// both enemy heroes and neutral monsters, including when an ally has
		// already reached the objective.
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

// batResourceBehavior gives one role in each team a deliberate neutral-farm
// assignment. It may run when a bat is visible, but never while a hero is
// visible, so a bat route cannot make a bot abandon an active fight. The
// low-health and stack-cap gates keep a wounded or already-maxed bot from
// taking an irrational detour.
type batResourceBehavior struct{}

func (batResourceBehavior) Decide(ctx *teamBotContext) (teamBotIntent, bool) {
	if ctx == nil || ctx.gs == nil || ctx.bot == nil || ctx.gs.Mode != ModeTeamDeathmatch ||
		ctx.assignment != teamAssignmentFlank || ctx.visibleTarget != nil && ctx.visibleTarget.player != nil || !ctx.bot.IsAlive() ||
		ctx.bot.HealthBoosts >= HealthBoostMaxStacks || float64(ctx.bot.Lives)/math.Max(1, float64(ctx.bot.MaxLives)) < .42 {
		return teamBotIntent{}, false
	}
	target := ctx.gs.knownBatTarget(ctx.bot)
	if target == nil {
		return teamBotIntent{}, false
	}
	return teamBotIntent{kind: teamIntentFarmBat, target: target}, true
}

func (gs *GameState) knownBatTarget(bot *player.Player) *botTarget {
	if gs == nil || bot == nil {
		return nil
	}
	var best *botTarget
	for id, candidate := range gs.Monsters {
		if candidate == nil || !candidate.IsAlive() {
			continue
		}
		distance := math.Hypot(candidate.X-bot.X, candidate.Y-bot.Y)
		target := &botTarget{kind: "monster", id: id, monster: candidate, x: candidate.X, y: candidate.Y, distance: distance}
		if best == nil || target.distance < best.distance || target.distance == best.distance && target.id < best.id {
			best = target
		}
	}
	return best
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

type respawnAwarenessBehavior struct{}

func (respawnAwarenessBehavior) Decide(ctx *teamBotContext) (teamBotIntent, bool) {
	if ctx == nil || ctx.visibleTarget != nil || ctx.gs == nil || ctx.gs.Map == nil || ctx.bot == nil {
		return teamBotIntent{}, false
	}
	if ctx.bot.Team == "" || len(ctx.gs.Map.TeamSpawners[ctx.bot.Team]) == 0 {
		return teamBotIntent{}, false
	}
	respawning := false
	for _, ally := range ctx.gs.Players {
		if ally != nil && ally.PlayerId != ctx.bot.PlayerId && ally.Team == ctx.bot.Team && !ally.IsAlive() && ally.RespawnAt > ctx.now && ally.RespawnAt-ctx.now <= 2500 {
			respawning = true
			break
		}
	}
	if !respawning {
		return teamBotIntent{}, false
	}
	var spawn *geometry.RectangleBody
	bestDistance := math.Inf(1)
	for _, candidate := range ctx.gs.Map.TeamSpawners[ctx.bot.Team] {
		if candidate == nil {
			continue
		}
		distance := math.Hypot(candidate.CenterX()-ctx.bot.X, candidate.CenterY()-ctx.bot.Y)
		if distance < bestDistance {
			spawn, bestDistance = candidate, distance
		}
	}
	if spawn == nil || bestDistance <= 180 {
		return teamBotIntent{}, false
	}
	return teamBotIntent{kind: teamIntentRegroup, x: spawn.CenterX(), y: spawn.CenterY()}, true
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
		defendObjectiveBehavior{}, supportAllyBehavior{}, respawnAwarenessBehavior{}, batResourceBehavior{}, attackObjectiveBehavior{}, attackPlayerBehavior{}, regroupBehavior{}, roamBehavior{},
	}}
}

func teamBotAssignmentFor(bot *player.Player, index int) teamBotAssignment {
	if bot == nil {
		return teamAssignmentFrontline
	}
	switch botRoleFor(bot) {
	case "Support":
		return teamAssignmentSupport
	case "Assassin":
		return teamAssignmentFlank
	case "Sharpshooter", "Controller":
		return teamAssignmentAnchor
	case "Tank", "Fighter":
		return teamAssignmentFrontline
	default:
		if index%3 == 1 {
			return teamAssignmentSupport
		}
		if index%3 == 2 {
			return teamAssignmentFlank
		}
		return teamAssignmentFrontline
	}
}

func (s *teamBattleBotStrategy) behaviorsFor(assignment teamBotAssignment) []teamBotBehavior {
	if assignment == teamAssignmentSupport {
		return []teamBotBehavior{supportAllyBehavior{}, defendObjectiveBehavior{}, respawnAwarenessBehavior{}, batResourceBehavior{}, attackPlayerBehavior{}, attackObjectiveBehavior{}, regroupBehavior{}, roamBehavior{}}
	}
	if assignment == teamAssignmentFlank {
		return []teamBotBehavior{batResourceBehavior{}, attackPlayerBehavior{}, supportAllyBehavior{}, defendObjectiveBehavior{}, respawnAwarenessBehavior{}, attackObjectiveBehavior{}, regroupBehavior{}, roamBehavior{}}
	}
	if assignment == teamAssignmentAnchor {
		return []teamBotBehavior{defendObjectiveBehavior{}, supportAllyBehavior{}, respawnAwarenessBehavior{}, batResourceBehavior{}, attackPlayerBehavior{}, attackObjectiveBehavior{}, regroupBehavior{}, roamBehavior{}}
	}
	return s.behaviors
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
	now := gs.nowMs()
	index := 0
	for _, id := range sortedBotIDs(gs.Players) {
		bot := gs.Players[id]
		if s.emergency(gs, bot, now) {
			index++
			continue
		}
		if bot.HeroName == "Brock Zeus" && bot.ChannelUntil > now {
			// Keep the last movement intent during a channel. Movement simulation
			// already pauses the body, and replacing the intent with a zero input
			// would make a fallback hammer cast strand the bot at its spawn.
			index++
			continue
		}
		if centerX, centerY, seekCenter := gs.botStormCenterTarget(bot); seekCenter {
			gs.moveBotTo(id, bot, centerX, centerY, now)
			index++
			continue
		}
		visible := gs.botSelectTarget(bot, now)
		gs.recordBotTargetSelection(bot.PlayerId, visible)
		if visible != nil && visible.player != nil && gs.botHasVisibleContestedMonster(bot, now) {
			// The selected hero is the combat target, but the decision was made
			// in response to a live camp contest. Keep that distinct from a
			// routine neutral-farm decision in bounded telemetry.
			gs.botMetrics.ResourceContestDecisions++
			gs.recordBotBatContestResponse(bot)
		}
		if visible == nil && gs.botTryAbility(id, bot, nil, now) {
			// botTryAbility preserves Brock's roam intent before his hammer
			// channel starts; do not send another movement command this tick.
			index++
			continue
		}
		pickup := gs.botPickupTarget(bot)
		utility := gs.botUtilityActionFor(bot.PlayerId, bot, visible, pickup, now)
		if utility == botUtilityRetreat && visible != nil && visible.player != nil {
			gs.botRetreatFrom(bot.PlayerId, bot, visible.x, visible.y, now)
			index++
			continue
		}
		if utility == botUtilityCollect && pickup != nil {
			gs.moveBotTo(bot.PlayerId, bot, pickup.X, pickup.Y, now)
			index++
			continue
		}
		ctx := &teamBotContext{gs: gs, bot: bot, now: now, index: index, assignment: teamBotAssignmentFor(bot, index), visibleTarget: visible, ownObjective: gs.teamObjective(bot.Team, true), enemyObjective: gs.teamObjective(bot.Team, false)}
		intent := teamBotIntent{}
		for _, behavior := range s.behaviorsFor(ctx.assignment) {
			if candidate, ok := behavior.Decide(ctx); ok {
				intent = candidate
				if candidate.target != nil && candidate.target.kind == "monster" && (visible == nil || visible.player == nil) {
					gs.botMetrics.BatFarmDecisions++
				}
				if candidate.kind == teamIntentSupport && candidate.target != nil {
					gs.botMetrics.PeelDecisions++
				}
				break
			}
		}
		s.execute(gs, bot, intent, index, now)
		index++
	}
}

func (s *teamBattleBotStrategy) execute(gs *GameState, bot *player.Player, intent teamBotIntent, index int, now int64) {
	switch intent.kind {
	case teamIntentDefend, teamIntentSupport, teamIntentAttackPlayer, teamIntentFarmBat, teamIntentAttackBase:
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
		if candidate == nil || !candidate.IsAlive() || candidate.InvulnerableUntil > now || candidate.Team == observer.Team || !gs.botCanSee(observer, candidate, now) {
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
