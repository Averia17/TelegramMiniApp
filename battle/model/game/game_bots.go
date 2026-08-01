package game

import (
	"battle/model/monster"
	"battle/model/player"
	"battle/service/geometry"
	"fmt"
	"math"
	"math/rand"
	"time"
)

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
		var best *geometry.RectangleBody
		bestDistance := -1.0
		for _, spawn := range gs.Map.Spawners {
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
	if humans < minimumPlayers {
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

func (gs *GameState) rememberBotTarget(botID string, target *player.Player, now int64) *BotPerception {
	memory := gs.BotMemory[botID]
	if memory == nil {
		memory = &BotPerception{}
		gs.BotMemory[botID] = memory
	}
	memory.TargetID = target.PlayerId
	memory.LastSeenX, memory.LastSeenY = target.X, target.Y
	memory.LastSeenAt = now
	memory.SearchUntil = now + 2800
	return memory
}

func (gs *GameState) updateBots() {
	if gs.State != GameStateGame {
		return
	}
	now := time.Now().UnixMilli()
	startedAt := gs.GameEndsAt - GameDuration.Milliseconds()
	opening := gs.IslandPhase == IslandPhaseLanding || (startedAt > 0 && now-startedAt < BotCombatGraceDuration.Milliseconds())
	botIndex := 0
	for id, bot := range gs.Players {
		if !bot.IsBot || !bot.IsAlive() {
			continue
		}
		if threat, flee := gs.botMonsterThreat(bot); threat != nil {
			angle := math.Atan2(threat.Y-bot.Y, threat.X-bot.X)
			bot.Rotation = angle
			distance := math.Hypot(threat.X-bot.X, threat.Y-bot.Y)
			if flee {
				retreatDistance := 300.0
				targetX := bot.X - math.Cos(angle)*retreatDistance
				targetY := bot.Y - math.Sin(angle)*retreatDistance
				if gs.Map != nil {
					target := gs.Map.ClampCircle(&geometry.CircleBody{X: targetX, Y: targetY, Radius: bot.Radius})
					targetX, targetY = target.X, target.Y
				}
				dx, dy := gs.botTravelDirection(id, &bot.CircleBody, targetX, targetY, now)
				gs.playerMove(id, now, dx, dy)
			} else {
				approach := 1.0
				if distance < 135 {
					approach = -.35
				}
				strafe := math.Sin(float64(now)/560+float64(botIndex)*1.9) * .45
				intentX := bot.X + (math.Cos(angle)*approach+math.Cos(angle+math.Pi/2)*strafe)*180
				intentY := bot.Y + (math.Sin(angle)*approach+math.Sin(angle+math.Pi/2)*strafe)*180
				dx, dy := gs.botTravelDirection(id, &bot.CircleBody, intentX, intentY, now)
				gs.playerMove(id, now, dx, dy)
			}
			if bot.Ammo > 0 && distance < 520 {
				gs.playerShoot(id, now, screenAngleFromWorld(angle))
			}
			botIndex++
			continue
		}
		if opening {
			if crate := gs.closestWallOfType(bot.X, bot.Y, "crates"); crate != nil {
				targetX, targetY := (crate.MinX+crate.MaxX)/2, (crate.MinY+crate.MaxY)/2
				angle := math.Atan2(targetY-bot.Y, targetX-bot.X)
				bot.Rotation = angle
				distance := math.Hypot(targetX-bot.X, targetY-bot.Y)
				if distance > 105 {
					dx, dy := gs.botTravelDirection(id, &bot.CircleBody, targetX, targetY, now)
					gs.playerMove(id, now, dx, dy)
				} else {
					gs.playerMove(id, now, 0, 0)
				}
				if distance < 520 {
					gs.playerShoot(id, now, screenAngleFromWorld(angle))
				}
				botIndex++
				continue
			}
		}
		if dodgeX, dodgeY, threatened := gs.botProjectileDodge(bot); threatened {
			gs.playerMove(id, now, dodgeX, dodgeY)
			botIndex++
			continue
		}
		var target *player.Player
		closest, bestScore := math.MaxFloat64, -math.MaxFloat64
		for otherID, candidate := range gs.Players {
			if otherID == id || !candidate.IsAlive() || (bot.Team != "" && candidate.Team == bot.Team) {
				continue
			}
			distance := math.Hypot(candidate.X-bot.X, candidate.Y-bot.Y)
			if !gs.botCanSee(bot, candidate, now) {
				continue
			}
			healthRatio := float64(candidate.Lives) / math.Max(1, float64(candidate.MaxLives))
			score := 700 - distance
			if healthRatio < .3 {
				score += 180
			}
			if score > bestScore {
				closest, bestScore, target = distance, score, candidate
			}
		}
		var memory *BotPerception
		targetVisible := target != nil
		if targetVisible {
			memory = gs.rememberBotTarget(id, target, now)
		} else {
			memory = gs.BotMemory[id]
			if memory != nil && now < memory.SearchUntil {
				if remembered := gs.Players[memory.TargetID]; remembered == nil || !remembered.IsAlive() {
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
			if bush := gs.closestWallOfType(bot.X, bot.Y, "bush"); bush != nil {
				x, y := (bush.MinX+bush.MaxX)/2, (bush.MinY+bush.MaxY)/2
				dx, dy := gs.botTravelDirection(id, &bot.CircleBody, x, y, now)
				gs.playerMove(id, now, dx, dy)
			}
			continue
		}
		angle := math.Atan2(target.Y-bot.Y, target.X-bot.X)
		bot.Rotation = angle
		approach := 0.18
		if closest > 260 {
			approach = 1
		} else if closest < 115 || bot.Lives*3 < bot.MaxLives {
			approach = -0.85
		}
		strafe := math.Sin(float64(now)/620+float64(botIndex)*1.7) * 0.62
		dx := math.Cos(angle)*approach + math.Cos(angle+math.Pi/2)*strafe
		dy := math.Sin(angle)*approach + math.Sin(angle+math.Pi/2)*strafe
		intentX, intentY := bot.X+dx*220, bot.Y+dy*220
		moveX, moveY := gs.botTravelDirection(id, &bot.CircleBody, intentX, intentY, now)
		gs.playerMove(id, now, moveX, moveY)
		if !opening && targetVisible && closest < 520 {
			if bot.SuperCharge >= 100 {
				gs.playerAbility(id, now, "primary")
			} else {
				gs.playerShoot(id, now, screenAngleFromWorld(angle))
			}
		}
		botIndex++
	}
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
		isAttackingBot := candidate.State == monster.MonsterChase && candidate.TargetPlayerId == bot.PlayerId
		if !isAttackingBot && distance > monster.MonsterSight {
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
	type cell struct{ x, y int }
	clampCell := func(value, limit int) int {
		if value < 0 {
			return 0
		}
		if value >= limit {
			return limit - 1
		}
		return value
	}
	start := cell{clampCell(int(body.X/TileSize), columns), clampCell(int(body.Y/TileSize), rows)}
	goal := cell{clampCell(int(targetX/TileSize), columns), clampCell(int(targetY/TileSize), rows)}
	index := func(c cell) int { return c.y*columns + c.x }
	terrain := gs.botTerrain(body.Radius, columns, rows)
	passable := func(c cell) bool { return terrain[index(c)] }
	queue := []cell{start}
	visited := make([]bool, columns*rows)
	parents := make([]cell, columns*rows)
	visited[index(start)] = true
	found := start == goal
	for head := 0; head < len(queue) && !found; head++ {
		current := queue[head]
		for _, delta := range [...]cell{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
			next := cell{current.x + delta.x, current.y + delta.y}
			if next.x < 0 || next.y < 0 || next.x >= columns || next.y >= rows || visited[index(next)] || !passable(next) {
				continue
			}
			visited[index(next)] = true
			parents[index(next)] = current
			queue = append(queue, next)
			if next == goal {
				found = true
				break
			}
		}
	}
	if !found {
		return nil
	}
	reversed := make([]geometry.Vector2, 0)
	for current := goal; current != start; current = parents[index(current)] {
		reversed = append(reversed, geometry.Vector2{X: (float64(current.x) + .5) * TileSize, Y: (float64(current.y) + .5) * TileSize})
	}
	path := make([]geometry.Vector2, len(reversed))
	for i := range reversed {
		path[len(reversed)-1-i] = reversed[i]
	}
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
