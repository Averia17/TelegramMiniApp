package game

import (
	"battle/model/monster"
	"battle/model/player"
	"battle/model/prop"
	"battle/service/geometry"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"time"
)

func sortedBotIDs(players map[string]*player.Player) []string {
	ids := make([]string, 0, len(players))
	for id, candidate := range players {
		if candidate != nil && candidate.IsBot && candidate.IsAlive() {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids
}

func (gs *GameState) setBotsPositionAtFreeSpawns() {
	used := make([]*player.Player, 0, len(gs.Players))
	for _, candidate := range gs.Players {
		if !candidate.IsBot {
			used = append(used, candidate)
		}
	}
	for _, bot := range gs.Players {
		if !bot.IsBot {
			continue
		}
		spawners := gs.Map.Spawners
		if gs.Mode == ModeTeamDeathmatch {
			spawners = gs.Map.TeamSpawners[bot.Team]
			if len(spawners) == 0 {
				continue
			}
		}
		var best *geometry.RectangleBody
		bestDistance := -1.0
		for _, spawn := range spawners {
			nearest := math.MaxFloat64
			for _, other := range used {
				d := math.Hypot(spawn.CenterX()-other.X, spawn.CenterY()-other.Y)
				if d < nearest {
					nearest = d
				}
			}
			if nearest > bestDistance {
				best, bestDistance = spawn, nearest
			}
		}
		if best != nil {
			bot.X, bot.Y = best.CenterX(), best.CenterY()
		}
		used = append(used, bot)
	}
}

func (gs *GameState) fillMissingBots() {
	humans := 0
	bots := make([]string, 0)
	for _, p := range gs.Players {
		if p.IsBot {
			bots = append(bots, p.PlayerId)
		} else {
			humans++
		}
	}
	// Below 50% capacity add at most three bots. At 50% or more the match stays human-only.
	minimumPlayers := (gs.MaxPlayers + 1) / 2
	desiredBots := 0
	if gs.Mode == ModeTeamDeathmatch {
		// Team matchmaking may start with one human after the queue fallback.
		// Fill the complete 3v3 lobby so both sides always have a playable team.
		desiredBots = gs.MaxPlayers - humans
		if desiredBots < 0 {
			desiredBots = 0
		}
	} else if humans < minimumPlayers {
		desiredBots = gs.MaxPlayers - humans
		if desiredBots > MaxBots {
			desiredBots = MaxBots
		}
	}
	for len(bots) > desiredBots {
		id := bots[len(bots)-1]
		delete(gs.Players, id)
		bots = bots[:len(bots)-1]
	}
	usedHeroes := make(map[string]bool, len(gs.Players))
	for _, p := range gs.Players {
		usedHeroes[p.HeroName] = true
	}
	for len(bots) < desiredBots {
		index := len(bots)
		available := make([]Hero, 0, len(Heroes))
		for _, candidate := range Heroes {
			if !usedHeroes[candidate.Name] {
				available = append(available, candidate)
			}
		}
		if len(available) == 0 {
			available = Heroes
		}
		hero := available[rand.Intn(len(available))]
		usedHeroes[hero.Name] = true
		spawner := gs.Map.GetRandomSpawner()
		id := fmt.Sprintf("bot-%d", index+1)
		for gs.Players[id] != nil {
			index++
			id = fmt.Sprintf("bot-%d", index+1)
		}
		bot := hero.CreatePlayer(id, fmt.Sprintf("BOT %02d", index+1), spawner.X+hero.Radius, spawner.Y+hero.Radius)
		bot.IsBot = true
		if gs.Mode == ModeTeamDeathmatch {
			bot.SetTeam(gs.teamWithFewerPlayers())
		}
		bot.Lives = bot.MaxLives
		gs.Players[id] = bot
		bots = append(bots, id)
		gs.Broadcast("joined", map[string]interface{}{"name": bot.Name, "hero": bot.HeroName, "bot": true})
	}
}

func (gs *GameState) teamWithFewerPlayers() string {
	red, blue := 0, 0
	for _, p := range gs.Players {
		if p.Team == "Blue" {
			blue++
		} else if p.Team == "Red" {
			red++
		}
	}
	if blue < red {
		return "Blue"
	}
	return "Red"
}

func (gs *GameState) removeBots() {
	for id, p := range gs.Players {
		if p.IsBot {
			delete(gs.Players, id)
			delete(gs.BotMemory, id)
		}
	}
}

func (gs *GameState) bushGroupAt(x, y float64) (int, bool) {
	if gs.Map == nil {
		return 0, false
	}
	if gs.Walls != nil && sameWallSource(gs.Map.Collisions, gs.WallsSource) {
		wall := gs.Walls.FindPoint(x, y, func(candidate *geometry.WallTile) bool {
			return isConcealmentWall(candidate.Type)
		})
		if wall == nil {
			return 0, false
		}
		return wall.BushGroup, true
	}
	for _, wall := range gs.Map.Collisions {
		if isConcealmentWall(wall.Type) && x >= wall.MinX && x <= wall.MaxX && y >= wall.MinY && y <= wall.MaxY {
			return wall.BushGroup, true
		}
	}
	return 0, false
}

func (gs *GameState) botCanSee(observer, target *player.Player, now int64) bool {
	if observer == nil || target == nil || !target.IsAlive() {
		return false
	}
	distance := math.Hypot(target.X-observer.X, target.Y-observer.Y)
	revealed := (target.LastShootAt > 0 && now-target.LastShootAt <= 2000) ||
		(target.LastDamageAt > 0 && now-target.LastDamageAt <= 2000)
	visionRange := BotVisionRange
	if revealed {
		visionRange = BotRevealRange
	}
	if distance > visionRange {
		return false
	}
	if gs.Walls != nil && segmentHitsBlockingWall(observer.X, observer.Y, target.X, target.Y, 2, gs.Walls) {
		return false
	}
	targetGroup, targetInBush := gs.bushGroupAt(target.X, target.Y)
	if !targetInBush {
		return true
	}
	observerGroup, observerInBush := gs.bushGroupAt(observer.X, observer.Y)
	if observerInBush && observerGroup == targetGroup {
		return true
	}
	if distance <= TileSize*2.5 {
		return true
	}
	// Attacks and received damage briefly reveal a brawler inside grass.
	return revealed
}

func (gs *GameState) botCanSeeMonster(observer *player.Player, target *monster.Monster) bool {
	if observer == nil || target == nil || !target.IsAlive() {
		return false
	}
	distance := math.Hypot(target.X-observer.X, target.Y-observer.Y)
	if distance > BotVisionRange {
		return false
	}
	if gs.Walls != nil && segmentHitsBlockingWall(observer.X, observer.Y, target.X, target.Y, 2, gs.Walls) {
		return false
	}
	targetGroup, targetInBush := gs.bushGroupAt(target.X, target.Y)
	if !targetInBush {
		return true
	}
	observerGroup, observerInBush := gs.bushGroupAt(observer.X, observer.Y)
	return (observerInBush && observerGroup == targetGroup) || distance <= TileSize*2.5
}

func (gs *GameState) rememberBotTarget(botID string, target *player.Player, now int64) *BotPerception {
	memory := gs.botMemoryFor(botID)
	if memory.TargetType != "player" || memory.TargetID != target.PlayerId || now >= memory.DecisionUntil {
		memory.DecisionUntil = now + botProfileFor(botID).ReactionDelay.Milliseconds()
	}
	memory.TargetType = "player"
	memory.TargetID = target.PlayerId
	memory.LastSeenX, memory.LastSeenY = target.X, target.Y
	memory.LastSeenAt = now
	memory.SearchUntil = now + BotSearchDuration.Milliseconds()
	return memory
}

func (gs *GameState) rememberBotMonster(botID, targetID string, target *monster.Monster, now int64) *BotPerception {
	memory := gs.botMemoryFor(botID)
	if memory.TargetType != "monster" || memory.TargetID != targetID || now >= memory.DecisionUntil {
		memory.DecisionUntil = now + botProfileFor(botID).ReactionDelay.Milliseconds()
	}
	memory.TargetType = "monster"
	memory.TargetID = targetID
	memory.LastSeenX, memory.LastSeenY = target.X, target.Y
	memory.LastSeenAt = now
	memory.SearchUntil = now + BotSearchDuration.Milliseconds()
	return memory
}

type botTarget struct {
	kind      string
	id        string
	player    *player.Player
	monster   *monster.Monster
	objective *ObjectiveState
	x, y      float64
	distance  float64
	score     float64
}

// botProfile gives each bot a stable, lightweight "personality". It is
// derived from the id instead of using global randomness so simulations stay
// reproducible while a team avoids moving as one synchronized unit.
type botProfile struct {
	ReactionDelay       time.Duration
	PreferredRangeScale float64
	StrafeStrength      float64
	StrafePeriod        int64
	StrafeSign          float64
	AimTurnRate         float64
}

func botProfileFor(id string) botProfile {
	seed := uint32(2166136261)
	for index := 0; index < len(id); index++ {
		seed ^= uint32(id[index])
		seed *= 16777619
	}
	span := uint32((BotReactionDelayMax - BotReactionDelayMin) / time.Millisecond)
	profile := botProfile{
		ReactionDelay:       BotReactionDelayMin + time.Duration(seed%(span+1))*time.Millisecond,
		PreferredRangeScale: 0.62 + float64((seed>>8)%11)/100,
		StrafeStrength:      0.38 + float64((seed>>13)%25)/100,
		StrafePeriod:        520 + int64((seed>>18)%420),
		StrafeSign:          1,
		AimTurnRate:         0.06 + float64((seed>>23)%21)/1000,
	}
	if seed&1 != 0 {
		profile.StrafeSign = -1
	}
	return profile
}

func (gs *GameState) botMemoryFor(id string) *BotPerception {
	if gs.BotMemory == nil {
		gs.BotMemory = make(map[string]*BotPerception)
	}
	if gs.BotMemory[id] == nil {
		gs.BotMemory[id] = &BotPerception{}
	}
	return gs.BotMemory[id]
}

func (target *botTarget) radius() float64 {
	if target == nil {
		return 0
	}
	if target.player != nil {
		return target.player.Radius
	}
	if target.monster != nil {
		return target.monster.Radius
	}
	if target.objective != nil {
		return target.objective.Radius
	}
	return 0
}

func botProximityScore(distance, maxDistance, weight float64) float64 {
	if maxDistance <= 0 {
		return 0
	}
	return math.Max(0, 1-distance/maxDistance) * weight
}

func (gs *GameState) botTargetScore(bot *player.Player, target *botTarget, now int64) float64 {
	if bot == nil || target == nil {
		return math.Inf(-1)
	}
	score := 0.0
	if target.player != nil {
		score = 20 + botProximityScore(target.distance, BotVisionRange, 35)
		score += (1 - math.Min(1, float64(target.player.Lives)/math.Max(1, float64(target.player.MaxLives)))) * 30
		if target.distance <= botAttackRange(bot)+target.radius() {
			score += 28
		}
		if target.player.LastShootAt > 0 && now-target.player.LastShootAt <= BotRecentThreatDuration.Milliseconds() {
			score += 55
		}
		if memory := gs.BotMemory[bot.PlayerId]; memory != nil && memory.TargetType == "player" &&
			memory.TargetID == target.id && now-memory.LastSeenAt <= BotTargetStickDuration.Milliseconds() {
			score += 18
		}
		if gs.outsideStorm(target.player) {
			score -= 50
		}
		return score
	}
	score = 8 + botProximityScore(target.distance, BotVisionRange, 20)
	if target.distance <= botAttackRange(bot)+target.radius() {
		score += 12
	}
	if memory := gs.BotMemory[bot.PlayerId]; memory != nil && memory.TargetType == "monster" &&
		memory.TargetID == target.id && now-memory.LastSeenAt <= BotTargetStickDuration.Milliseconds() {
		score += 12
	}
	return score
}

func (gs *GameState) botSelectTarget(bot *player.Player, now int64) *botTarget {
	if bot == nil {
		return nil
	}
	var best, sticky *botTarget
	consider := func(candidate *botTarget) {
		memory := gs.BotMemory[bot.PlayerId]
		if memory != nil && memory.TargetType == candidate.kind && memory.TargetID == candidate.id {
			sticky = candidate
		}
		if best == nil || candidate.score > best.score || (candidate.score == best.score && candidate.id < best.id) {
			best = candidate
		}
	}
	for id, candidate := range gs.Players {
		if id == bot.PlayerId || candidate == nil || !candidate.CanBulletHurt(bot.PlayerId, bot.Team) || !gs.botCanSee(bot, candidate, now) {
			continue
		}
		distance := math.Hypot(candidate.X-bot.X, candidate.Y-bot.Y)
		target := &botTarget{kind: "player", id: id, player: candidate, x: candidate.X, y: candidate.Y, distance: distance}
		target.score = gs.botTargetScore(bot, target, now)
		consider(target)
	}
	for id, candidate := range gs.Monsters {
		if candidate == nil || !gs.botCanSeeMonster(bot, candidate) {
			continue
		}
		distance := math.Hypot(candidate.X-bot.X, candidate.Y-bot.Y)
		target := &botTarget{kind: "monster", id: id, monster: candidate, x: candidate.X, y: candidate.Y, distance: distance}
		target.score = gs.botTargetScore(bot, target, now)
		consider(target)
	}
	if memory := gs.BotMemory[bot.PlayerId]; memory != nil && sticky != nil && now < memory.DecisionUntil {
		// Humans usually commit to a fight for a short burst instead of
		// switching to a newly exposed target every simulation tick. A large
		// score advantage can still interrupt that commitment.
		if best == sticky || sticky.score+25 >= best.score {
			return sticky
		}
	}
	return best
}

func botShouldKite(bot *player.Player, target *botTarget) bool {
	if bot == nil || target == nil || target.player == nil || bot.MaxLives <= 0 {
		return false
	}
	healthRatio := float64(bot.Lives) / float64(bot.MaxLives)
	targetHealthRatio := float64(target.player.Lives) / math.Max(1, float64(target.player.MaxLives))
	if healthRatio >= .28 || targetHealthRatio < .2 {
		return false
	}
	dangerDistance := botAttackRange(bot) * .55
	if botIsMelee(bot) {
		dangerDistance = math.Max(180, botAttackRange(bot)*1.5)
	}
	return target.distance <= dangerDistance
}

func botTargetAimPoint(target *botTarget) (float64, float64) {
	if target == nil {
		return 0, 0
	}
	x, y := target.x, target.y
	if target.player == nil || (target.player.MoveX == 0 && target.player.MoveY == 0) {
		return x, y
	}
	moveLength := math.Hypot(target.player.MoveX, target.player.MoveY)
	if moveLength <= .01 {
		return x, y
	}
	lead := math.Min(100, math.Max(0, target.player.Speed*.14))
	return x + target.player.MoveX/moveLength*lead, y + target.player.MoveY/moveLength*lead
}

func (gs *GameState) botAllySeparation(bot *player.Player) (float64, float64) {
	if gs == nil || bot == nil {
		return 0, 0
	}
	separationX, separationY := 0.0, 0.0
	for _, ally := range gs.Players {
		if ally == nil || ally.PlayerId == bot.PlayerId || !ally.IsAlive() || ally.Team != bot.Team {
			continue
		}
		dx, dy := bot.X-ally.X, bot.Y-ally.Y
		distance := math.Hypot(dx, dy)
		separationDistance := bot.Radius + ally.Radius + 72
		if distance >= separationDistance {
			continue
		}
		if distance <= .01 {
			// Perfect overlap has no usable direction. Pick a stable side so
			// the correction remains deterministic instead of jittering.
			dx = botProfileFor(bot.PlayerId).StrafeSign
			dy = 0
			distance = 1
		}
		strength := (separationDistance - distance) / separationDistance
		separationX += dx / distance * strength
		separationY += dy / distance * strength
	}
	return separationX, separationY
}

func botAimAt(id string, bot *player.Player, target *botTarget) (float64, float64, float64) {
	if bot == nil || target == nil {
		return 0, 0, math.Inf(1)
	}
	aimX, aimY := botTargetAimPoint(target)
	desired := math.Atan2(aimY-bot.Y, aimX-bot.X)
	delta := math.Atan2(math.Sin(desired-bot.Rotation), math.Cos(desired-bot.Rotation))
	turn := math.Min(math.Abs(delta), botProfileFor(id).AimTurnRate)
	if delta < 0 {
		turn = -turn
	}
	bot.Rotation += turn
	return aimX, aimY, math.Abs(delta)
}

func (gs *GameState) botPickupTarget(bot *player.Player) *prop.Prop {
	if bot == nil || !bot.IsAlive() {
		return nil
	}
	healthRatio := float64(bot.Lives) / math.Max(1, float64(bot.MaxLives))
	var best *prop.Prop
	bestScore := math.Inf(-1)
	for _, candidate := range gs.Props {
		if candidate == nil || !candidate.Active {
			continue
		}
		switch candidate.Type {
		case "potion-red":
			if healthRatio >= .8 {
				continue
			}
		case "power", "health_boost", "lunar_speed", "lunar_damage", "lunar_shield", "lunar_cooldown":
		default:
			continue
		}
		distance := math.Hypot(candidate.X-bot.X, candidate.Y-bot.Y)
		if distance > BotVisionRange || (gs.Walls != nil && segmentHitsBlockingWall(bot.X, bot.Y, candidate.X, candidate.Y, 2, gs.Walls)) {
			continue
		}
		score := -distance
		if candidate.Type == "potion-red" {
			score += 260 + (1-healthRatio)*180
		}
		if score > bestScore {
			best, bestScore = candidate, score
		}
	}
	return best
}

func (gs *GameState) botShouldCollectPickup(bot *player.Player, pickup *prop.Prop, target *botTarget) bool {
	if bot == nil || pickup == nil || !pickup.Active {
		return false
	}
	if target == nil {
		return true
	}
	if pickup.Type == "potion-red" {
		healthRatio := float64(bot.Lives) / math.Max(1, float64(bot.MaxLives))
		attackDistance := botAttackRange(bot) + target.radius()
		return healthRatio < .35 && target.distance > math.Max(180, attackDistance*1.15)
	}
	return target.distance > BotVisionRange*.72 &&
		math.Hypot(pickup.X-bot.X, pickup.Y-bot.Y) < BotVisionRange*.35
}

func botAttackRange(bot *player.Player) float64 {
	if bot == nil {
		return 0
	}
	if kit := CombatKitFor(bot.HeroName); kit != nil {
		return kit.AttackRange()
	}
	return 180
}

func botIsMelee(bot *player.Player) bool {
	if bot == nil {
		return false
	}
	switch bot.HeroName {
	case "Mandy", "Kaze", "Wukong Mico", "Viper":
		return true
	}
	switch bot.AttackType {
	case "slam", "dash", "double_melee":
		return true
	}
	return botAttackRange(bot) <= 140
}

func (gs *GameState) botStormCenterTarget(bot *player.Player) (float64, float64, bool) {
	if bot == nil || gs.Map == nil || gs.StormRadius <= 0 ||
		(gs.IslandPhase != IslandPhaseCollapse && gs.IslandPhase != IslandPhaseBeacon) {
		return 0, 0, false
	}
	centerX, centerY := gs.Map.WidthInPixels/2, gs.Map.HeightInPixels/2
	distance := math.Hypot(bot.X-centerX, bot.Y-centerY)
	safeRadius := math.Max(0, gs.StormRadius-bot.Radius-BotStormSafetyMargin)
	if distance <= safeRadius {
		return 0, 0, false
	}
	return centerX, centerY, true
}

func (gs *GameState) updateBattleRoyaleBots() {
	if gs.State != GameStateGame {
		return
	}
	now := time.Now().UnixMilli()
	startedAt := gs.GameEndsAt - GameDuration.Milliseconds()
	opening := gs.IslandPhase == IslandPhaseLanding || (startedAt > 0 && now-startedAt < BotCombatGraceDuration.Milliseconds())
	botIndex := 0
	for _, id := range sortedBotIDs(gs.Players) {
		bot := gs.Players[id]
		if dodgeX, dodgeY, threatened := gs.botProjectileDodge(bot); threatened {
			gs.playerMove(id, now, dodgeX, dodgeY)
			botIndex++
			continue
		}
		if centerX, centerY, seekCenter := gs.botStormCenterTarget(bot); seekCenter {
			angle := math.Atan2(centerY-bot.Y, centerX-bot.X)
			bot.Rotation = angle
			dx, dy := gs.botTravelDirection(id, &bot.CircleBody, centerX, centerY, now)
			gs.playerMove(id, now, dx, dy)
			botIndex++
			continue
		}
		if threat, flee := gs.botMonsterThreat(bot); threat != nil {
			if flee {
				gs.botRetreatFrom(id, bot, threat.X, threat.Y, now)
			} else {
				gs.botEngageTarget(id, bot, &botTarget{kind: "monster", id: "threat", monster: threat, x: threat.X, y: threat.Y, distance: math.Hypot(threat.X-bot.X, threat.Y-bot.Y)}, now)
			}
			botIndex++
			continue
		}
		visibleTarget := gs.botSelectTarget(bot, now)
		if pickup := gs.botPickupTarget(bot); gs.botShouldCollectPickup(bot, pickup, visibleTarget) {
			angle := math.Atan2(pickup.Y-bot.Y, pickup.X-bot.X)
			bot.Rotation = angle
			distance := math.Hypot(pickup.X-bot.X, pickup.Y-bot.Y)
			if distance > bot.Radius+pickup.Radius+4 {
				dx, dy := gs.botTravelDirection(id, &bot.CircleBody, pickup.X, pickup.Y, now)
				gs.playerMove(id, now, dx, dy)
			} else {
				gs.playerMove(id, now, 0, 0)
			}
			botIndex++
			continue
		}
		if opening && visibleTarget == nil {
			if crate := gs.closestWallOfType(bot.X, bot.Y, "crates"); crate != nil {
				crateX, crateY := (crate.MinX+crate.MaxX)/2, (crate.MinY+crate.MaxY)/2
				targetX, targetY := botWallApproachPoint(bot, crate)
				angle := math.Atan2(crateY-bot.Y, crateX-bot.X)
				bot.Rotation = angle
				distance := math.Hypot(targetX-bot.X, targetY-bot.Y)
				if distance > 28 {
					dx, dy := gs.botTravelDirection(id, &bot.CircleBody, targetX, targetY, now)
					gs.playerMove(id, now, dx, dy)
				} else {
					gs.playerMove(id, now, 0, 0)
				}
				if math.Hypot(crateX-bot.X, crateY-bot.Y) <= botAttackRange(bot)+TileSize {
					bot.AimDistance = math.Hypot(crateX-bot.X, crateY-bot.Y)
					gs.playerShoot(id, now, screenAngleFromWorld(angle), bot.AimDistance)
				}
				botIndex++
				continue
			}
		}
		target := visibleTarget
		var memory *BotPerception
		targetVisible := target != nil
		if targetVisible {
			if target.player != nil {
				memory = gs.rememberBotTarget(id, target.player, now)
			} else {
				memory = gs.rememberBotMonster(id, target.id, target.monster, now)
			}
		} else {
			memory = gs.BotMemory[id]
			if memory != nil && now < memory.SearchUntil {
				rememberedAlive := false
				if memory.TargetType == "monster" {
					remembered := gs.Monsters[memory.TargetID]
					rememberedAlive = remembered != nil && remembered.IsAlive()
				} else {
					remembered := gs.Players[memory.TargetID]
					rememberedAlive = remembered != nil && remembered.IsAlive()
				}
				if !rememberedAlive {
					memory = nil
					delete(gs.BotMemory, id)
				}
			} else if memory != nil {
				delete(gs.BotMemory, id)
				memory = nil
			}
		}
		if target == nil {
			if memory != nil {
				distance := math.Hypot(memory.LastSeenX-bot.X, memory.LastSeenY-bot.Y)
				if distance > 34 {
					angle := math.Atan2(memory.LastSeenY-bot.Y, memory.LastSeenX-bot.X)
					bot.Rotation = angle
					// A small weave resembles searching instead of perfect tracking.
					searchPhase := math.Sin(float64(now-memory.LastSeenAt)/240+float64(botIndex)) * .28
					intentX := memory.LastSeenX + math.Cos(angle+math.Pi/2)*searchPhase*TileSize
					intentY := memory.LastSeenY + math.Sin(angle+math.Pi/2)*searchPhase*TileSize
					dx, dy := gs.botTravelDirection(id, &bot.CircleBody, intentX, intentY, now)
					gs.playerMove(id, now, dx, dy)
				} else {
					gs.playerMove(id, now, 0, 0)
					memory.SearchUntil = int64(math.Min(float64(memory.SearchUntil), float64(now+650)))
				}
				botIndex++
				continue
			}
			gs.botExplore(id, bot, now)
			continue
		}
		gs.botEngageTarget(id, bot, target, now)
		botIndex++
	}
}

func (gs *GameState) botEngageTarget(id string, bot *player.Player, target *botTarget, now int64) {
	if bot == nil || target == nil {
		return
	}
	aimX, aimY, aimError := botAimAt(id, bot, target)
	angle := math.Atan2(aimY-bot.Y, aimX-bot.X)
	reach := botAttackRange(bot)
	attackDistance := reach + target.radius()
	melee := botIsMelee(bot)
	profile := botProfileFor(id)
	memory := gs.botMemoryFor(id)
	// Profiles make bots more or less eager to close in while staying inside
	// the legacy combat distance envelope.
	preferred := reach * profile.PreferredRangeScale
	if botShouldKite(bot, target) {
		gs.botRetreatFrom(id, bot, target.x, target.y, now)
		bot.Rotation = angle
	} else {
		approach := 0.0
		if target.distance > preferred {
			approach = 1
		} else if !melee && target.distance < reach*.38 {
			approach = -.85
		}
		if memory.StrafeUntil <= now || memory.StrafeSign == 0 {
			memory.StrafeSign = profile.StrafeSign
			memory.StrafeUntil = now + profile.StrafePeriod
		}
		// Commit to a side for a short burst, like a human holding a movement
		// key, instead of switching direction continuously with a sine wave.
		strafe := memory.StrafeSign * profile.StrafeStrength
		if math.Abs(approach)+math.Abs(strafe) < .05 {
			strafe = .45
		}
		desiredX := math.Cos(angle)*approach + math.Cos(angle+math.Pi/2)*strafe
		desiredY := math.Sin(angle)*approach + math.Sin(angle+math.Pi/2)*strafe
		separationX, separationY := gs.botAllySeparation(bot)
		desiredX += separationX * 1.35
		desiredY += separationY * 1.35
		desiredLength := math.Hypot(desiredX, desiredY)
		if desiredLength > .01 {
			desiredX, desiredY = desiredX/desiredLength, desiredY/desiredLength
		}
		// Keep a little movement memory. This removes robotic instant turns
		// when a target makes a small positional change or briefly disappears.
		blend := .3
		if memory.IntentMoveX == 0 && memory.IntentMoveY == 0 {
			blend = 1
		}
		moveIntentX := memory.IntentMoveX*(1-blend) + desiredX*blend
		moveIntentY := memory.IntentMoveY*(1-blend) + desiredY*blend
		moveIntentLength := math.Hypot(moveIntentX, moveIntentY)
		if moveIntentLength > .01 {
			moveIntentX, moveIntentY = moveIntentX/moveIntentLength, moveIntentY/moveIntentLength
		}
		memory.IntentMoveX, memory.IntentMoveY = moveIntentX, moveIntentY
		intentX, intentY := bot.X+moveIntentX*220, bot.Y+moveIntentY*220
		moveX, moveY := gs.botTravelDirection(id, &bot.CircleBody, intentX, intentY, now)
		gs.playerMove(id, now, moveX, moveY)
	}
	if target.distance > attackDistance || !gs.botHasLineOfSight(bot, target) {
		return
	}
	// A human can start moving immediately, but does not fire through a large
	// aim correction. This prevents instant lock-on when a target appears from
	// the side and gives movement/aiming a chance to converge naturally.
	if aimError > .18 {
		return
	}
	bot.AimDistance = target.distance
	if gs.botTryAbility(id, bot, target, now) {
		return
	}
	if bot.Ammo > 0 {
		gs.playerShoot(id, now, screenAngleFromWorld(bot.Rotation), target.distance)
	}
}

func (gs *GameState) botHasLineOfSight(bot *player.Player, target *botTarget) bool {
	if target == nil {
		return false
	}
	if target.player != nil {
		return gs.botCanSee(bot, target.player, time.Now().UnixMilli())
	}
	if target.objective != nil {
		if math.Hypot(target.objective.X-bot.X, target.objective.Y-bot.Y) > BotVisionRange {
			return false
		}
		return gs.Walls == nil || !segmentHitsBlockingWall(bot.X, bot.Y, target.objective.X, target.objective.Y, 2, gs.Walls)
	}
	return gs.botCanSeeMonster(bot, target.monster)
}

func (gs *GameState) botRetreatFrom(id string, bot *player.Player, threatX, threatY float64, now int64) {
	angle := math.Atan2(threatY-bot.Y, threatX-bot.X)
	bot.Rotation = angle
	profile := botProfileFor(id)
	// Retreat diagonally toward a new angle. Straight-line fleeing is easy to
	// predict and keeps the bot in the attacker's firing lane.
	retreatAngle := angle + profile.StrafeSign*math.Pi/2*profile.StrafeStrength*.55
	targetX := bot.X - math.Cos(retreatAngle)*300
	targetY := bot.Y - math.Sin(retreatAngle)*300
	if gs.Map != nil {
		target := gs.Map.ClampCircle(&geometry.CircleBody{X: targetX, Y: targetY, Radius: bot.Radius})
		targetX, targetY = target.X, target.Y
	}
	dx, dy := gs.botTravelDirection(id, &bot.CircleBody, targetX, targetY, now)
	gs.playerMove(id, now, dx, dy)
}

func (gs *GameState) botTryAbility(id string, bot *player.Player, target *botTarget, now int64) bool {
	if bot == nil || target == nil {
		return false
	}
	if SuperChargePercent(bot, now) >= 100 && botPrimaryUseful(bot, target) {
		bot.AimDistance = target.distance
		gs.playerAbility(id, now, "primary")
		if bot.LastAbilityOK {
			return true
		}
	}
	if bot.GadgetCharges <= 0 || now-bot.LastSecondaryAt < AbilityCooldownMs(bot.HeroName, "secondary") || !botSecondaryUseful(bot, target) {
		return false
	}
	bot.AimDistance = target.distance
	gs.playerAbility(id, now, "secondary")
	return bot.LastAbilityOK
}

func botPrimaryUseful(bot *player.Player, target *botTarget) bool {
	if bot == nil || target == nil {
		return false
	}
	if target.kind == "monster" {
		switch bot.HeroName {
		case "Needle", "Kaze":
			return false
		}
	}
	switch bot.HeroName {
	case "Fairy Mina":
		return float64(bot.Lives) < float64(bot.MaxLives)*.72
	case "Mandy":
		// Mandy's super is a long lane attack, not a melee follow-up.
		return target.distance <= BotRevealRange+target.radius()
	case "Brock Zeus":
		return target.distance <= 620+target.radius()
	case "Needle":
		return target.distance <= 600+target.radius()
	case "Kaze":
		return target.distance <= 320+target.radius()
	case "Wukong Mico":
		// The leap covers half the requested distance and the vortex catches
		// targets around the landing point, so it is useful before melee range.
		return target.distance <= 280+target.radius()
	case "Persephone Lumi":
		return target.distance <= 520+target.radius()
	case "Katty":
		return target.distance <= KattySuperRadius+target.radius()
	default:
		return target.distance <= botAttackRange(bot)+target.radius()
	}
}

func botSecondaryUseful(bot *player.Player, target *botTarget) bool {
	if bot == nil || target == nil {
		return false
	}
	if target.kind == "monster" {
		switch bot.HeroName {
		case "Fairy Mina", "Persephone Lumi":
			return false
		}
	}
	switch bot.HeroName {
	case "Needle":
		return bot.Lives*10 <= bot.MaxLives*7
	case "Fairy Mina":
		return target.distance <= 150+target.radius()
	case "Brock Zeus":
		return target.distance <= botAttackRange(bot)+target.radius()
	case "Kaze":
		return target.distance <= 300+target.radius()
	case "Wukong Mico":
		return target.distance <= 190+target.radius() || bot.Lives*2 < bot.MaxLives
	case "Persephone Lumi":
		return target.distance <= 200+target.radius()
	default:
		return target.distance <= botAttackRange(bot)+target.radius()
	}
}

func (gs *GameState) botExplore(id string, bot *player.Player, now int64) {
	if bot == nil || gs.Map == nil {
		return
	}
	if gs.BotMemory == nil {
		gs.BotMemory = make(map[string]*BotPerception)
	}
	memory := gs.BotMemory[id]
	if memory == nil {
		memory = &BotPerception{}
		gs.BotMemory[id] = memory
	}
	if now >= memory.ExploreUntil || math.Hypot(memory.ExploreX-bot.X, memory.ExploreY-bot.Y) < 38 {
		points := make([]geometry.Vector2, 0, len(gs.Map.Spawners)+5)
		for _, spawn := range gs.Map.Spawners {
			points = append(points, geometry.Vector2{X: spawn.CenterX(), Y: spawn.CenterY()})
		}
		margin := TileSize * 1.5
		points = append(points,
			geometry.Vector2{X: gs.Map.WidthInPixels / 2, Y: gs.Map.HeightInPixels / 2},
			geometry.Vector2{X: margin, Y: margin},
			geometry.Vector2{X: gs.Map.WidthInPixels - margin, Y: margin},
			geometry.Vector2{X: margin, Y: gs.Map.HeightInPixels - margin},
			geometry.Vector2{X: gs.Map.WidthInPixels - margin, Y: gs.Map.HeightInPixels - margin},
		)
		if len(points) == 0 {
			return
		}
		memory.ExploreIndex++
		point := points[memory.ExploreIndex%len(points)]
		memory.ExploreX, memory.ExploreY = point.X, point.Y
		memory.ExploreUntil = now + BotExploreDuration.Milliseconds()
	}
	angle := math.Atan2(memory.ExploreY-bot.Y, memory.ExploreX-bot.X)
	bot.Rotation = angle
	dx, dy := gs.botTravelDirection(id, &bot.CircleBody, memory.ExploreX, memory.ExploreY, now)
	gs.playerMove(id, now, dx, dy)
}

func (gs *GameState) moveBot(id string, now int64, dx, dy float64) {
	bot := gs.Players[id]
	if bot == nil {
		return
	}
	dx, dy = gs.navigatedDirection(&bot.CircleBody, dx, dy, id)
	gs.playerMove(id, now, dx, dy)
}

func (gs *GameState) botMonsterThreat(bot *player.Player) (*monster.Monster, bool) {
	if bot == nil || !bot.IsAlive() {
		return nil, false
	}
	var threat *monster.Monster
	closest := math.MaxFloat64
	for _, candidate := range gs.Monsters {
		if candidate == nil || !candidate.IsAlive() {
			continue
		}
		distance := math.Hypot(candidate.X-bot.X, candidate.Y-bot.Y)
		if distance > monster.MonsterSight {
			continue
		}
		if !gs.botCanSeeMonster(bot, candidate) {
			continue
		}
		if distance < closest {
			closest, threat = distance, candidate
		}
	}
	if threat == nil {
		return nil, false
	}
	healthRatio := float64(bot.Lives) / math.Max(1, float64(bot.MaxLives))
	return threat, healthRatio < .35 || (bot.Ammo == 0 && closest < 170)
}

func botWallApproachPoint(bot *player.Player, wall *geometry.WallTile) (float64, float64) {
	if bot == nil || wall == nil {
		return 0, 0
	}
	margin := bot.Radius + 8
	insideX := bot.X >= wall.MinX && bot.X <= wall.MaxX
	insideY := bot.Y >= wall.MinY && bot.Y <= wall.MaxY
	if !insideX {
		x := wall.MinX - margin
		if bot.X > wall.MaxX {
			x = wall.MaxX + margin
		}
		return x, math.Min(wall.MaxY+margin, math.Max(wall.MinY-margin, bot.Y))
	}
	if !insideY {
		y := wall.MinY - margin
		if bot.Y > wall.MaxY {
			y = wall.MaxY + margin
		}
		return math.Min(wall.MaxX+margin, math.Max(wall.MinX-margin, bot.X)), y
	}
	left, right := bot.X-wall.MinX, wall.MaxX-bot.X
	top, bottom := bot.Y-wall.MinY, wall.MaxY-bot.Y
	if left <= right && left <= top && left <= bottom {
		return wall.MinX - margin, bot.Y
	}
	if right <= top && right <= bottom {
		return wall.MaxX + margin, bot.Y
	}
	if top <= bottom {
		return bot.X, wall.MinY - margin
	}
	return bot.X, wall.MaxY + margin
}

func (gs *GameState) botDirectRouteClear(body *geometry.CircleBody, targetX, targetY float64) bool {
	if body == nil || gs.Walls == nil {
		return true
	}
	distance := math.Hypot(targetX-body.X, targetY-body.Y)
	steps := int(math.Max(1, math.Ceil(distance/math.Max(4, body.Radius))))
	probe := geometry.CircleBody{Radius: body.Radius + 2}
	for step := 1; step <= steps; step++ {
		t := float64(step) / float64(steps)
		probe.X = body.X + (targetX-body.X)*t
		probe.Y = body.Y + (targetY-body.Y)*t
		if geometry.CollidesCircleWithBlockingWalls(&probe, gs.Walls) {
			return false
		}
	}
	return true
}

// botTravelDirection follows a short cached grid route. Unlike local wall
// probing, the route has a destination, so an agent chooses the correct end of
// a long obstacle instead of repeatedly pressing into it.
func (gs *GameState) botTravelDirection(agentID string, body *geometry.CircleBody, targetX, targetY float64, nowValue ...int64) (float64, float64) {
	if body == nil || gs.Map == nil {
		return 0, 0
	}
	now := time.Now().UnixMilli()
	if len(nowValue) > 0 {
		now = nowValue[0]
	}
	if gs.BotMemory == nil {
		gs.BotMemory = make(map[string]*BotPerception)
	}
	memory := gs.BotMemory[agentID]
	if memory == nil {
		memory = &BotPerception{}
		gs.BotMemory[agentID] = memory
	}
	if memory.PathLastAt > 0 {
		moved := math.Hypot(body.X-memory.PathLastX, body.Y-memory.PathLastY)
		if now > memory.PathLastAt && moved < BotProgressDistance {
			if memory.PathStuckSince == 0 {
				memory.PathStuckSince = memory.PathLastAt
			}
		} else if moved >= BotProgressDistance {
			memory.PathStuckSince = 0
		}
	}
	memory.PathLastX, memory.PathLastY, memory.PathLastAt = body.X, body.Y, now
	stuckReplanned := false
	if memory.PathStuckSince > 0 && now-memory.PathStuckSince >= BotStuckTimeout.Milliseconds() {
		memory.Path = nil
		memory.PathRefreshAt = 0
		memory.PathStuckSince = 0
		memory.PathReplanCount++
		stuckReplanned = true
	}
	directX, directY := targetX-body.X, targetY-body.Y
	directDistance := math.Hypot(directX, directY)
	if directDistance >= 1 && gs.botDirectRouteClear(body, targetX, targetY) {
		// A 4-connected grid is useful around walls, but using it in open space
		// turns a diagonal into an artificial left-right/up-down staircase.
		memory.Path = nil
		if stuckReplanned {
			memory.PathRefreshAt = now + BotPathRefreshInterval.Milliseconds()
		} else {
			memory.PathRefreshAt = 0
		}
		memory.PathStuckSince = 0
		return gs.navigatedDirection(body, directX/directDistance, directY/directDistance, agentID)
	}
	goalX, goalY := int(targetX/TileSize), int(targetY/TileSize)
	goalChanged := memory.PathGoalX != goalX || memory.PathGoalY != goalY
	pathStale := memory.PathMapRevision != gs.MapRevision
	refreshDue := now >= memory.PathRefreshAt
	if (len(memory.Path) == 0 || goalChanged || pathStale) && (pathStale || refreshDue) {
		memory.Path = gs.findBotPath(body, targetX, targetY)
		memory.PathGoalX, memory.PathGoalY = goalX, goalY
		memory.PathMapRevision = gs.MapRevision
		memory.PathRefreshAt = now + BotPathRefreshInterval.Milliseconds()
	}
	for len(memory.Path) > 0 && math.Hypot(memory.Path[0].X-body.X, memory.Path[0].Y-body.Y) < TileSize*.35 {
		memory.Path = memory.Path[1:]
	}
	waypointX, waypointY := targetX, targetY
	if len(memory.Path) > 0 {
		waypointX, waypointY = memory.Path[0].X, memory.Path[0].Y
	}
	dx, dy := waypointX-body.X, waypointY-body.Y
	length := math.Hypot(dx, dy)
	if length < 1 {
		return 0, 0
	}
	return gs.navigatedDirection(body, dx/length, dy/length, agentID)
}

func (gs *GameState) findBotPath(body *geometry.CircleBody, targetX, targetY float64) []geometry.Vector2 {
	columns := int(math.Ceil(gs.Map.WidthInPixels / TileSize))
	rows := int(math.Ceil(gs.Map.HeightInPixels / TileSize))
	if columns <= 0 || rows <= 0 {
		return nil
	}
	cellCount := columns * rows
	if cap(gs.botPathVisited) < cellCount {
		gs.botPathVisited = make([]uint32, cellCount)
	} else {
		gs.botPathVisited = gs.botPathVisited[:cellCount]
	}
	if cap(gs.botPathParents) < cellCount {
		gs.botPathParents = make([]botPathCell, cellCount)
	} else {
		gs.botPathParents = gs.botPathParents[:cellCount]
	}
	if cap(gs.botPathQueue) < cellCount {
		gs.botPathQueue = make([]botPathCell, 0, cellCount)
	} else {
		gs.botPathQueue = gs.botPathQueue[:0]
	}
	visited := gs.botPathVisited
	parents := gs.botPathParents
	queue := gs.botPathQueue
	nextSearchID := func() uint32 {
		gs.botPathSearchID++
		if gs.botPathSearchID == 0 {
			clear(visited)
			gs.botPathSearchID = 1
		}
		return gs.botPathSearchID
	}
	clampCell := func(value, limit int) int {
		if value < 0 {
			return 0
		}
		if value >= limit {
			return limit - 1
		}
		return value
	}
	start := botPathCell{clampCell(int(body.X/TileSize), columns), clampCell(int(body.Y/TileSize), rows)}
	goal := botPathCell{clampCell(int(targetX/TileSize), columns), clampCell(int(targetY/TileSize), rows)}
	index := func(c botPathCell) int { return c.y*columns + c.x }
	terrain := gs.botTerrain(body.Radius, columns, rows)
	passable := func(c botPathCell) bool { return terrain[index(c)] }
	if !passable(goal) {
		searchID := nextSearchID()
		queue = append(queue, goal)
		visited[index(goal)] = searchID
		foundFallback := false
		for head := 0; head < len(queue) && !foundFallback; head++ {
			current := queue[head]
			if passable(current) {
				goal = current
				foundFallback = true
				break
			}
			for _, delta := range [...]botPathCell{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
				next := botPathCell{current.x + delta.x, current.y + delta.y}
				if next.x < 0 || next.y < 0 || next.x >= columns || next.y >= rows || visited[index(next)] == searchID {
					continue
				}
				visited[index(next)] = searchID
				queue = append(queue, next)
			}
		}
		if !foundFallback {
			gs.botPathQueue = queue
			return nil
		}
	}
	queue = queue[:0]
	searchID := nextSearchID()
	queue = append(queue, start)
	visited[index(start)] = searchID
	found := start == goal
	for head := 0; head < len(queue) && !found; head++ {
		current := queue[head]
		for _, delta := range [...]botPathCell{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
			next := botPathCell{current.x + delta.x, current.y + delta.y}
			if next.x < 0 || next.y < 0 || next.x >= columns || next.y >= rows || visited[index(next)] == searchID || !passable(next) {
				continue
			}
			visited[index(next)] = searchID
			parents[index(next)] = current
			queue = append(queue, next)
			if next == goal {
				found = true
				break
			}
		}
	}
	if !found {
		gs.botPathQueue = queue
		return nil
	}
	pathCapacity := int(math.Abs(float64(goal.x-start.x)) + math.Abs(float64(goal.y-start.y)) + 1)
	path := make([]geometry.Vector2, 0, pathCapacity)
	for current := goal; current != start; current = parents[index(current)] {
		path = append(path, geometry.Vector2{X: (float64(current.x) + .5) * TileSize, Y: (float64(current.y) + .5) * TileSize})
	}
	for left, right := 0, len(path)-1; left < right; left, right = left+1, right-1 {
		path[left], path[right] = path[right], path[left]
	}
	gs.botPathQueue = queue
	return path
}

// botTerrain caches static walkability for each bot radius. Pathfinding still
// runs per destination, but it no longer repeats SpatialHash collision
// queries for every visited grid cell. MapRevision invalidates this cache when
// destructible or temporary walls change.
func (gs *GameState) botTerrain(radius float64, columns, rows int) []bool {
	if gs.Map == nil || columns <= 0 || rows <= 0 {
		return nil
	}
	if gs.botTerrainCache == nil || gs.botTerrainCacheRevision != gs.MapRevision {
		gs.botTerrainCache = make(map[int][]bool)
		gs.botTerrainCacheRevision = gs.MapRevision
	}
	key := int(math.Round(radius * 100))
	if terrain, ok := gs.botTerrainCache[key]; ok {
		return terrain
	}

	terrain := make([]bool, columns*rows)
	for y := 0; y < rows; y++ {
		for x := 0; x < columns; x++ {
			probe := geometry.CircleBody{
				X:      (float64(x) + .5) * TileSize,
				Y:      (float64(y) + .5) * TileSize,
				Radius: radius + 2,
			}
			terrain[y*columns+x] = !gs.Map.IsCircleOutside(&probe) &&
				(gs.Walls == nil || !geometry.CollidesCircleWithBlockingWalls(&probe, gs.Walls))
		}
	}
	gs.botTerrainCache[key] = terrain
	return terrain
}

// navigatedDirection keeps lightweight steering local: bots still pursue their
// target directly in open space, but probe alternating side angles when a wall
// blocks the next few movement ticks.
func (gs *GameState) navigatedDirection(body *geometry.CircleBody, dx, dy float64, agentID string) (float64, float64) {
	if body == nil || gs.Walls == nil || (dx == 0 && dy == 0) {
		return dx, dy
	}
	angle := math.Atan2(dy, dx)
	clear := func(candidate float64) bool {
		probe := *body
		probe.X += math.Cos(candidate) * BotNavigationProbe
		probe.Y += math.Sin(candidate) * BotNavigationProbe
		return !geometry.CollidesCircleWithBlockingWalls(&probe, gs.Walls)
	}
	if clear(angle) {
		return dx, dy
	}
	side := 1.0
	for _, char := range []byte(agentID) {
		if char%2 == 1 {
			side *= -1
		}
	}
	for _, offset := range []float64{math.Pi / 4, math.Pi / 2, 3 * math.Pi / 4, math.Pi} {
		for _, sign := range []float64{side, -side} {
			candidate := angle + offset*sign
			if clear(candidate) {
				return math.Cos(candidate), math.Sin(candidate)
			}
		}
	}
	return 0, 0
}

func (gs *GameState) closestWallOfType(x, y float64, wallType string) *geometry.WallTile {
	if gs.botWallCache == nil || gs.botWallCacheRevision != gs.MapRevision {
		gs.botWallCache = make(map[string][]*geometry.WallTile)
		for _, wall := range gs.Map.Collisions {
			if wall == nil {
				continue
			}
			gs.botWallCache[wall.Type] = append(gs.botWallCache[wall.Type], wall)
		}
		gs.botWallCacheRevision = gs.MapRevision
	}
	var closest *geometry.WallTile
	best := math.MaxFloat64
	for _, wall := range gs.botWallCache[wallType] {
		distance := math.Hypot((wall.MinX+wall.MaxX)/2-x, (wall.MinY+wall.MaxY)/2-y)
		if distance < best {
			closest, best = wall, distance
		}
	}
	return closest
}

func (gs *GameState) botProjectileDodge(bot *player.Player) (float64, float64, bool) {
	bestTime := math.MaxFloat64
	var dodgeX, dodgeY float64
	for _, shot := range gs.Bullets {
		if shot == nil || !shot.Active || shot.PlayerId == bot.PlayerId || (bot.Team != "" && shot.Team == bot.Team) {
			continue
		}
		dirX, dirY := math.Cos(shot.Rotation), math.Sin(shot.Rotation)
		relX, relY := bot.X-shot.X, bot.Y-shot.Y
		forward := relX*dirX + relY*dirY
		if forward < 0 || forward > 230 {
			continue
		}
		lateral := math.Abs(relX*(-dirY) + relY*dirX)
		if lateral > bot.Radius+shot.Radius+20 {
			continue
		}
		timeToHit := forward / math.Max(1, shot.Speed)
		if timeToHit < bestTime {
			bestTime, dodgeX, dodgeY = timeToHit, -dirY, dirX
		}
	}
	return dodgeX, dodgeY, bestTime < math.MaxFloat64
}
