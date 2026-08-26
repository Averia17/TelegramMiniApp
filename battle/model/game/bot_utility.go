package game

import (
	"battle/model/player"
	"battle/model/prop"
	"math"
)

// botUtilityAction is the tactical layer between perception and movement. It
// deliberately does not replace hard interrupts such as projectile dodges or
// a bat wind-up; those remain more important than any utility score.
type botUtilityAction string

const (
	botUtilityRoam    botUtilityAction = "roam"
	botUtilityEngage  botUtilityAction = "engage"
	botUtilityRetreat botUtilityAction = "retreat"
	botUtilityCollect botUtilityAction = "collect_pickup"
)

const (
	botUtilityCommitMs     = int64(320)
	botUtilitySwitchMargin = 22.0
)

type botAbilitySlot string

const (
	botAbilitySuper  botAbilitySlot = "super"
	botAbilityGadget botAbilitySlot = "gadget"
)

type botUtilityContext struct {
	HealthFraction       float64
	TargetHealthFraction float64
	TargetDistance       float64
	PickupDistance       float64
	PreferredRange       float64
	AttackRange          float64
	Enemies              int
	Allies               int
	HealthStacks         int
	Ammo                 int
	MaxAmmo              int
	Role                 string
	TargetKind           string
	PickupType           string
	PickupContested      bool
	PickupEnemyDistance  float64
	TargetContested      bool
	HasTarget            bool
	HasPickup            bool
	TargetInAttackRange  bool
	TargetStunned        bool
	TargetRecentlyFired  bool
	TeamMode             bool
}

// scoreBotUtility is pure and deterministic so combat decisions can be
// replayed and tuned without running the whole simulation. Scores are not
// probabilities; they are comparable priorities for this one decision tick.
func scoreBotUtility(ctx botUtilityContext) map[botUtilityAction]float64 {
	scores := map[botUtilityAction]float64{
		botUtilityRoam:    10,
		botUtilityEngage:  math.Inf(-1),
		botUtilityRetreat: math.Inf(-1),
		botUtilityCollect: math.Inf(-1),
	}

	health := clampBotUtilityFraction(ctx.HealthFraction)
	if ctx.HasTarget {
		targetHealth := clampBotUtilityFraction(ctx.TargetHealthFraction)
		engage := 24.0
		engage += (1 - targetHealth) * 34
		if ctx.TargetInAttackRange {
			engage += 18
		}
		if ctx.TargetStunned {
			engage += 16
		}
		if ctx.TargetRecentlyFired {
			engage += 8
		}
		if ctx.TargetDistance > ctx.PreferredRange && ctx.PreferredRange > 0 {
			engage += math.Min(12, (ctx.TargetDistance-ctx.PreferredRange)/20)
		}
		switch ctx.Role {
		case "Assassin":
			// Kaze should recognise a finish window instead of abandoning a
			// close target for a neutral reward.
			engage += 12
			if targetHealth <= .45 || ctx.TargetInAttackRange {
				engage += 14
			}
		case "Tank", "Fighter":
			engage += 8
		case "Sharpshooter":
			if ctx.TargetDistance >= ctx.AttackRange*.75 {
				engage += 9
			}
		case "Support":
			if ctx.TeamMode && ctx.Allies > 0 {
				engage += 4
			}
		case "Controller":
			engage += 5
		}
		if ctx.TargetKind == "monster" {
			// Monsters are useful farm, but never outrank a nearly defeated
			// hero in the same visible fight.
			engage -= 8
			if ctx.TargetContested {
				// A contested bat is a deliberate PvP decision, not background
				// farming. Make the camp worth contesting when it is visible.
				engage += 22
			}
		}
		scores[botUtilityEngage] = engage

		retreat := (1-health)*86 - 18
		if ctx.Enemies > ctx.Allies+1 {
			retreat += float64(ctx.Enemies-ctx.Allies-1) * 24
		}
		if ctx.TargetInAttackRange {
			retreat += 10
		}
		if ctx.MaxAmmo > 0 && ctx.Ammo == 0 && ctx.TargetDistance < 190 {
			retreat += 18
		}
		if ctx.TargetHealthFraction <= .18 {
			// A clear finish is an exception to normal safety behaviour.
			retreat -= 42
		}
		switch ctx.Role {
		case "Sharpshooter", "Support":
			retreat += 8
		case "Tank", "Fighter", "Assassin":
			retreat -= 8
		}
		if health >= .72 && ctx.Enemies <= ctx.Allies+1 {
			retreat -= 20
		}
		if retreat > 18 {
			scores[botUtilityRetreat] = retreat
		}
	}

	if ctx.HasPickup {
		collect := 28.0
		collect += math.Max(0, 1-ctx.PickupDistance/360) * 22
		if ctx.PickupContested {
			// A public cube is a race, not a sightseeing objective. Secure it
			// early when the opponent is close, while still letting combat win
			// when the opponent is already on top of the bot.
			collect += 22
			if ctx.PickupEnemyDistance > 0 && ctx.PickupEnemyDistance < ctx.PickupDistance {
				collect -= 18
			}
		}
		if ctx.PickupType == "health_boost" {
			collect += float64(math.Max(0, float64(5-ctx.HealthStacks))) * 9
			if health < .55 {
				collect += 16
			}
		}
		if ctx.HasTarget {
			if ctx.TargetInAttackRange {
				collect -= 48
			} else if ctx.TargetDistance < 250 {
				collect -= 24
			}
		}
		switch ctx.Role {
		case "Assassin":
			collect -= 8
		case "Support", "Controller":
			collect += 5
		}
		scores[botUtilityCollect] = collect
	}

	return scores
}

// scoreBotAbility ranks a ready ability against the current situation. The
// cast validity rules still live in the authoritative ability handlers; this
// function only prevents a bot from spending a valid ability in a low-value
// window. A negative score means the ability has no useful tactical target.
func scoreBotAbility(ctx botUtilityContext, slot botAbilitySlot) float64 {
	if !ctx.HasTarget {
		if slot == botAbilitySuper && ctx.Role == "Support" && ctx.HealthFraction < .72 {
			return 84
		}
		return math.Inf(-1)
	}
	if ctx.TargetKind == "objective" {
		return math.Inf(-1)
	}
	targetHealth := clampBotUtilityFraction(ctx.TargetHealthFraction)
	health := clampBotUtilityFraction(ctx.HealthFraction)
	score := 24.0
	if slot == botAbilitySuper {
		score += 12
		if ctx.TargetStunned {
			score += 12
		}
		if ctx.Enemies >= ctx.Allies+1 {
			score += 10
		}
		switch ctx.Role {
		case "Assassin":
			score += 18
			if targetHealth <= .5 && ctx.TargetDistance <= 320 {
				score += 20
			}
		case "Controller":
			score += 14
			if !ctx.TargetInAttackRange {
				score += 8
			}
		case "Sharpshooter":
			score += 14
			if ctx.TargetDistance >= ctx.AttackRange*.75 {
				score += 12
			}
		case "Tank", "Fighter":
			score += 12
			if ctx.TargetInAttackRange {
				score += 12
			}
		case "Support":
			if health < .72 {
				score += 20
			}
		}
		if targetHealth <= .2 {
			score += 14
		}
		return score
	}

	// Gadgets are lower-commitment tools: they are attractive for escape,
	// peel, or a close-range conversion, but should not be burned at range.
	score = 14
	if ctx.TargetInAttackRange {
		score += 22
	}
	if health < .5 {
		score += 20
	}
	if ctx.Enemies > ctx.Allies {
		score += 8
	}
	switch ctx.Role {
	case "Support", "Controller":
		score += 8
	case "Assassin":
		if ctx.TargetDistance <= 300 {
			score += 8
		}
	case "Sharpshooter":
		if ctx.TargetDistance < ctx.AttackRange*.55 {
			score += 16
		}
	}
	return score
}

func clampBotUtilityFraction(value float64) float64 {
	return math.Min(1, math.Max(0, value))
}

func chooseBotUtilityAction(scores map[botUtilityAction]float64, current botUtilityAction, until, now int64) botUtilityAction {
	best := botUtilityRoam
	bestScore := scores[best]
	for _, candidate := range []botUtilityAction{botUtilityEngage, botUtilityRetreat, botUtilityCollect} {
		if score, ok := scores[candidate]; ok && (score > bestScore || score == bestScore && candidate < best) {
			best, bestScore = candidate, score
		}
	}
	if now < until {
		if currentScore, ok := scores[current]; ok && currentScore > math.Inf(-1) && best != current && bestScore < currentScore+botUtilitySwitchMargin {
			return current
		}
	}
	return best
}

func botRoleFor(bot *player.Player) string {
	if bot == nil {
		return ""
	}
	if hero := GetHeroByName(bot.HeroName); hero != nil {
		return hero.Role
	}
	return ""
}

func (gs *GameState) botUtilityContextFor(bot *player.Player, target *botTarget, pickup *prop.Prop, now int64) botUtilityContext {
	ctx := botUtilityContext{Role: botRoleFor(bot), TeamMode: gs != nil && gs.Mode == ModeTeamDeathmatch}
	if bot == nil {
		return ctx
	}
	ctx.HealthFraction = float64(bot.Lives) / math.Max(1, float64(bot.MaxLives))
	ctx.AttackRange = botAttackRange(bot)
	ctx.PreferredRange = ctx.AttackRange * botProfileFor(bot.PlayerId).PreferredRangeScale
	ctx.HealthStacks = bot.HealthBoosts
	ctx.Ammo, ctx.MaxAmmo = bot.Ammo, bot.MaxAmmo
	ctx.Enemies, ctx.Allies = gs.botCombatNumbers(bot, now)
	if target != nil {
		ctx.HasTarget = true
		ctx.TargetDistance = target.distance
		ctx.TargetKind = target.kind
		ctx.TargetInAttackRange = target.distance <= ctx.AttackRange+target.radius()
		if target.player != nil {
			ctx.TargetHealthFraction = float64(target.player.Lives) / math.Max(1, float64(target.player.MaxLives))
			ctx.TargetStunned = target.player.StunUntil > now
			ctx.TargetRecentlyFired = target.player.LastShootAt > 0 && now-target.player.LastShootAt <= BotRecentThreatDuration.Milliseconds()
		} else {
			ctx.TargetHealthFraction = 1
			if target.monster != nil {
				ctx.TargetContested = gs.botMonsterContestedByEnemy(bot, target, now)
			}
		}
	}
	if pickup != nil && pickup.Active {
		ctx.HasPickup = true
		ctx.PickupType = pickup.Type
		ctx.PickupDistance = math.Hypot(pickup.X-bot.X, pickup.Y-bot.Y)
		if pickup.Type == "health_boost" {
			ctx.PickupEnemyDistance = math.Inf(1)
			for _, candidate := range gs.Players {
				if candidate == nil || !candidate.IsAlive() || candidate.Team == bot.Team || candidate.PlayerId == bot.PlayerId {
					continue
				}
				distance := math.Hypot(candidate.X-pickup.X, candidate.Y-pickup.Y)
				if distance > 260 || (gs.Walls != nil && segmentHitsBlockingWall(candidate.X, candidate.Y, pickup.X, pickup.Y, 2, gs.Walls)) {
					continue
				}
				if distance < ctx.PickupEnemyDistance {
					ctx.PickupEnemyDistance = distance
				}
			}
			ctx.PickupContested = !math.IsInf(ctx.PickupEnemyDistance, 1)
		}
	}
	return ctx
}

func (gs *GameState) botUtilityActionFor(id string, bot *player.Player, target *botTarget, pickup *prop.Prop, now int64) botUtilityAction {
	if gs.botMetrics.ActionSelections == nil {
		gs.botMetrics.ActionSelections = make(map[string]uint64)
	}
	memory := gs.botMemoryFor(id)
	ctx := gs.botUtilityContextFor(bot, target, pickup, now)
	scores := scoreBotUtility(ctx)
	current := botUtilityAction(memory.UtilityAction)
	selected := chooseBotUtilityAction(scores, current, memory.UtilityActionUntil, now)
	if selected != current {
		memory.UtilityAction = string(selected)
		memory.UtilityActionUntil = now + botUtilityCommitMs
	}
	memory.UtilityScore = scores[selected]
	gs.botMetrics.Decisions++
	gs.botMetrics.ActionSelections[string(selected)]++
	if gs.botMetrics.ActionScoreSums == nil {
		gs.botMetrics.ActionScoreSums = make(map[string]float64)
	}
	if gs.botMetrics.ActionScoreSamples == nil {
		gs.botMetrics.ActionScoreSamples = make(map[string]uint64)
	}
	gs.botMetrics.ActionScoreSums[string(selected)] += scores[selected]
	gs.botMetrics.ActionScoreSamples[string(selected)]++
	if current != "" && selected != current {
		gs.botMetrics.ActionSwitches++
	}
	if selected == botUtilityRetreat {
		gs.botMetrics.RetreatDecisions++
	}
	if (ctx.PickupContested && selected == botUtilityCollect) || (ctx.TargetContested && selected == botUtilityEngage) {
		gs.botMetrics.ResourceContestDecisions++
		if ctx.TargetContested {
			gs.recordBotBatContestResponse(bot)
		}
	}
	// This is a conservative diagnostic, not a gameplay rule: only a decision
	// tick with no visible target/resource and no movement velocity is counted.
	if selected == botUtilityRoam && !ctx.HasTarget && !ctx.HasPickup && memory.MoveScale <= BotMovementStopScale && memory.MoveCommandAt > 0 && now-memory.MoveCommandAt <= 1000 {
		gs.botMetrics.IdleDecisionTicks++
	}
	return selected
}
