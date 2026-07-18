package game

import (
	"battle/model/bullet"
	"battle/model/gamemap"
	"battle/model/monster"
	"battle/model/player"
	"battle/model/prop"
	"battle/service/geometry"
	"fmt"
	"math"
	"math/rand"
	"time"
)

const (
	GameStateWaiting = "waiting"
	GameStateLobby   = "lobby"
	GameStateGame    = "game"

	LobbyDuration = 10 * time.Second
	GameDuration  = 90 * time.Second

	FlasksCount   = 8
	MonstersCount = 8

	PlayerSize = 32.0

	BulletSize  = 8.0
	BulletSpeed = 4.0
	BulletRate  = 800

	FlaskSize = 24.0
	TileSize  = 32.0
	MaxBots   = 3
)

type GameMode string

const (
	ModeDeathmatch     GameMode = "deathmatch"
	ModeTeamDeathmatch GameMode = "team deathmatch"
)

type GameState struct {
	State          string
	RoomName       string
	MapName        string
	MaxPlayers     int
	Mode           GameMode
	LobbyEndsAt    int64
	GameEndsAt     int64
	Map            *gamemap.GameMap
	Walls          *geometry.SpatialHash
	Players        map[string]*player.Player
	Monsters       map[string]*monster.Monster
	Bullets        []*bullet.Bullet
	Props          []*prop.Prop
	Actions        []Action
	Broadcast      func(msgType string, params interface{})
	OnGameEnd      func(players map[string]*player.Player, winner string, duration int64)
	OnPlayerKilled func(playerId, killerName string)
}

func InitGameState(gs *GameState) {
	gs.Players = make(map[string]*player.Player)
	gs.Monsters = make(map[string]*monster.Monster)
	gs.Bullets = make([]*bullet.Bullet, 0)
	gs.Props = make([]*prop.Prop, 0)
	gs.Actions = make([]Action, 0)

	m, err := gamemap.LoadMap(gs.MapName)
	if err != nil {
		fmt.Printf("Error loading map: %v\n", err)
		m = &gamemap.GameMap{WidthInPixels: 512, HeightInPixels: 512}
	}
	gs.Map = m

	gs.Walls = geometry.NewSpatialHash(float64(TileSize))
	for _, wall := range m.Collisions {
		gs.Walls.Insert(wall)
	}

	gs.State = GameStateWaiting
	gs.LobbyEndsAt = 0
}

func (gs *GameState) Update() {
	gs.updateGame()
	gs.updatePlayers()
	gs.updateStatuses()
	gs.updateRegeneration()
	gs.updateBots()
	gs.updateMonsters()
	gs.updateBullets()
}

func (gs *GameState) updateRegeneration() {
	if gs.State != GameStateGame {
		return
	}
	now := time.Now().UnixMilli()
	for _, p := range gs.Players {
		if !p.IsAlive() || p.IsFullLives() || p.RegenRate <= 0 || now-p.LastDamageAt < 3000 {
			continue
		}
		rate := p.RegenRate
		if geometry.CollidesCircleWithWalls(&p.CircleBody, gs.Walls, "half") && gs.isConcealed(p) {
			rate *= 2
		}
		p.RegenCarry += float64(p.MaxLives) * rate / 60
		heal := int(p.RegenCarry)
		if heal > 0 {
			p.Lives = int(math.Min(float64(p.MaxLives), float64(p.Lives+heal)))
			p.RegenCarry -= float64(heal)
		}
	}
}

func (gs *GameState) isConcealed(source *player.Player) bool {
	for _, target := range gs.Players {
		if target == source || !target.IsAlive() || (source.Team != "" && source.Team == target.Team) {
			continue
		}
		if math.Hypot(target.X-source.X, target.Y-source.Y) <= TileSize*2.5 {
			return false
		}
	}
	return true
}

func (gs *GameState) updateGame() {
	switch gs.State {
	case GameStateWaiting:
		if len(gs.Players) >= 1 {
			gs.startLobby()
		}
	case GameStateLobby:
		if len(gs.Players) == 0 {
			gs.startWaiting()
			return
		}
		if gs.LobbyEndsAt < time.Now().UnixMilli() {
			gs.startGame()
		}
	case GameStateGame:
		if len(gs.Players) == 0 {
			gs.onGameEnd(nil)
			gs.startWaiting()
			return
		}
		if gs.GameEndsAt < time.Now().UnixMilli() {
			gs.onGameEnd(&ServerEvent{
				Type:   "timeout",
				Params: map[string]interface{}{},
			})
			gs.startLobby()
			return
		}
		if gs.Mode == ModeDeathmatch {
			if len(gs.Players) > 1 && gs.countActivePlayers() == 1 {
				p := gs.getWinningPlayer()
				if p != nil {
					gs.onGameEnd(&ServerEvent{
						Type:   "won",
						Params: map[string]interface{}{"name": p.Name},
					})
					gs.startLobby()
					return
				}
			}
		}
		if gs.Mode == ModeTeamDeathmatch {
			if len(gs.Players) > 1 {
				team := gs.getWinningTeam()
				if team != "" {
					name := "Red team"
					if team == "Blue" {
						name = "Blue team"
					}
					gs.onGameEnd(&ServerEvent{
						Type:   "won",
						Params: map[string]interface{}{"name": name},
					})
					gs.startLobby()
				}
			}
		}
	}
}

func (gs *GameState) updatePlayers() {
	for len(gs.Actions) > 0 {
		action := gs.Actions[0]
		gs.Actions = gs.Actions[1:]

		switch action.Type {
		case "move":
			if v, ok := action.Value.(*MoveValue); ok {
				gs.playerMove(action.PlayerId, action.Ts, v.X, v.Y)
			}
		case "rotate":
			if v, ok := action.Value.(*RotateValue); ok {
				gs.playerRotate(action.PlayerId, action.Ts, v.Rotation)
			}
		case "shoot":
			if v, ok := action.Value.(*ShootValue); ok {
				gs.playerShoot(action.PlayerId, action.Ts, v.Angle)
			}
		case "ability":
			if v, ok := action.Value.(*AbilityValue); ok {
				gs.playerAbility(action.PlayerId, action.Ts, v.Slot)
			}
		}
	}
}

func (gs *GameState) updateMonsters() {
	for _, m := range gs.Monsters {
		if m == nil || !m.IsAlive() {
			continue
		}
		m.Update(gs.Players)

		for _, p := range gs.Players {
			if !p.IsAlive() || !m.CanAttack() || !geometry.CircleToCircle(&m.CircleBody, &p.CircleBody) {
				continue
			}
			m.Attack()
			p.Hurt()
			if !p.IsAlive() {
				gs.Broadcast("killed", map[string]interface{}{
					"killerName": "A bat",
					"killedName": p.Name,
				})
				if gs.OnPlayerKilled != nil {
					gs.OnPlayerKilled(p.PlayerId, "A bat")
				}
			}
		}
	}
}

func (gs *GameState) updateStatuses() {
	now := time.Now().UnixMilli()
	for _, p := range gs.Players {
		if !p.IsAlive() || p.PoisonUntil <= now || p.PoisonTickAt > now {
			continue
		}
		p.TakeDamage(150)
		p.PoisonTickAt = now + 500
		if !p.IsAlive() {
			killerName := "Poison"
			if killer := gs.Players[p.PoisonBy]; killer != nil {
				killerName = killer.Name
				killer.Kills++
			}
			gs.Broadcast("killed", map[string]interface{}{"killerName": killerName, "killedName": p.Name})
			if gs.OnPlayerKilled != nil {
				gs.OnPlayerKilled(p.PlayerId, killerName)
			}
		}
	}
}

func (gs *GameState) updateBullets() {
	for i := 0; i < len(gs.Bullets); i++ {
		b := gs.Bullets[i]
		if b == nil || !b.Active {
			continue
		}
		b.Move(BulletSpeed)
		if b.MaxRange > 0 && b.Travelled >= b.MaxRange {
			if b.Returning {
				b.Returning = false
				b.Rotation = math.Atan2(b.OriginY-b.Y, b.OriginX-b.X)
				b.Travelled = 0
			} else {
				gs.splitProjectile(b)
				b.Active = false
				continue
			}
		}

		for _, p := range gs.Players {
			if !p.CanBulletHurt(b.PlayerId, b.Team) || !geometry.CircleToCircle(&b.CircleBody, &p.CircleBody) {
				continue
			}
			if b.HitPlayers[p.PlayerId] {
				continue
			}
			b.HitPlayers[p.PlayerId] = true
			dmg := b.Damage
			if b.Kind == "sniper" {
				dmg += int(b.Travelled / 96)
			}
			if dmg <= 0 {
				dmg = 1
			}
			p.TakeDamage(dmg)
			if b.Poison {
				p.PoisonUntil = time.Now().Add(4 * time.Second).UnixMilli()
				p.PoisonTickAt = time.Now().Add(500 * time.Millisecond).UnixMilli()
				p.PoisonBy = b.PlayerId
			}
			if b.Kind == "pellet" && p.Marks < 5 {
				p.Marks++
			}
			if b.Kind == "spore" || b.Kind == "quantum" {
				gs.splitProjectile(b)
			}
			if b.Pierce > 0 {
				b.Pierce--
			} else {
				b.Active = false
			}
			if !p.IsAlive() {
				killer := gs.Players[b.PlayerId]
				killerName := "Unknown"
				if killer != nil {
					killerName = killer.Name
					killer.Kills++
				}
				gs.Broadcast("killed", map[string]interface{}{
					"killerName": killerName,
					"killedName": p.Name,
				})
				if gs.OnPlayerKilled != nil {
					gs.OnPlayerKilled(p.PlayerId, killerName)
				}
			}
		}

		for mid, m := range gs.Monsters {
			if m == nil || !m.IsAlive() || !geometry.CircleToCircle(&b.CircleBody, &m.CircleBody) {
				continue
			}
			b.Active = false
			m.Hurt()
			if !m.IsAlive() {
				delete(gs.Monsters, mid)
			}
		}

		if geometry.CollidesCircleWithWalls(&b.CircleBody, gs.Walls, "half") {
			gs.splitProjectile(b)
			b.Active = false
			continue
		}

		if gs.Map.IsCircleOutside(&b.CircleBody) {
			b.Active = false
		}
	}
}

func (gs *GameState) splitProjectile(parent *bullet.Bullet) {
	if parent == nil || (parent.Kind != "spore" && parent.Kind != "quantum") {
		return
	}
	angles := []float64{}
	kind, damage, speed, size, distance := "spike", 1, 6.0, 3.5, 240.0
	if parent.Kind == "spore" {
		for i := 0; i < 6; i++ {
			angles = append(angles, float64(i)*math.Pi/3)
		}
	} else {
		kind, damage, speed, size, distance = "quantum_shard", int(math.Max(1, float64(parent.Damage)/2)), 5.5, 4.5, parent.MaxRange*.5
		angles = []float64{parent.Rotation, parent.Rotation + math.Pi - math.Pi/4, parent.Rotation + math.Pi + math.Pi/4}
	}
	parent.Kind = "spent"
	for _, angle := range angles {
		child := bullet.NewBullet(parent.PlayerId, parent.Team, parent.X, parent.Y, size, angle, parent.Color)
		child.Kind, child.Damage, child.Speed, child.MaxRange = kind, damage, speed, distance
		gs.Bullets = append(gs.Bullets, child)
	}
}

func (gs *GameState) startWaiting() {
	gs.LobbyEndsAt = 0
	gs.GameEndsAt = 0
	gs.State = GameStateWaiting
	gs.setPlayersActive(false)
	gs.Broadcast("waiting", map[string]interface{}{})
}

func (gs *GameState) startLobby() {
	gs.removeBots()
	gs.LobbyEndsAt = time.Now().Add(LobbyDuration).UnixMilli()
	gs.GameEndsAt = 0
	gs.State = GameStateLobby
	gs.setPlayersActive(false)
}

func (gs *GameState) startGame() {
	gs.LobbyEndsAt = 0
	gs.GameEndsAt = time.Now().Add(GameDuration).UnixMilli()
	gs.State = GameStateGame
	gs.fillMissingBots()

	if gs.Mode == ModeTeamDeathmatch {
		gs.setPlayersTeamsRandomly()
	}
	gs.setPlayersPositionRandomly()
	gs.setPlayersActive(true)
	gs.propsAdd(FlasksCount)
	gs.monstersAdd(MonstersCount)
	gs.Broadcast("start", map[string]interface{}{})
}

func (gs *GameState) onGameEnd(event *ServerEvent) {
	if gs.OnGameEnd != nil {
		var winner string
		if event != nil {
			if w, ok := event.Params.(map[string]interface{}); ok {
				if n, ok := w["name"].(string); ok {
					winner = n
				}
			}
		}
		duration := int64(0)
		if gs.GameEndsAt > 0 {
			remaining := gs.GameEndsAt - time.Now().UnixMilli()
			if remaining < 0 {
				remaining = 0
			}
			duration = GameDuration.Milliseconds() - remaining
			if duration < 0 {
				duration = 0
			}
			if duration > GameDuration.Milliseconds() {
				duration = GameDuration.Milliseconds()
			}
		}
		gs.OnGameEnd(gs.Players, winner, duration)
	}
	if event != nil {
		gs.Broadcast(event.Type, event.Params)
	}
	gs.propsClear()
	gs.monstersClear()
	gs.Broadcast("stop", map[string]interface{}{})
}

func (gs *GameState) PlayerAdd(id, name string, heroName string) {
	var hero Hero
	if h := GetHeroByName(heroName); h != nil {
		hero = *h
	} else {
		hero = RandomHero()
	}
	spawner := gs.Map.GetRandomSpawner()
	p := hero.CreatePlayer(id, name, spawner.X+float64(hero.Radius), spawner.Y+float64(hero.Radius))
	if gs.Mode == ModeTeamDeathmatch {
		p.SetTeam("Red")
	}
	gs.Players[id] = p
	gs.Broadcast("joined", map[string]interface{}{"name": p.Name, "hero": p.HeroName})
	if gs.State == GameStateGame {
		gs.fillMissingBots()
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
		}
	}
}

func (gs *GameState) updateBots() {
	if gs.State != GameStateGame {
		return
	}
	now := time.Now().UnixMilli()
	botIndex := 0
	for id, bot := range gs.Players {
		if !bot.IsBot || !bot.IsAlive() {
			continue
		}
		var target *player.Player
		closest := math.MaxFloat64
		for otherID, candidate := range gs.Players {
			if otherID == id || !candidate.IsAlive() || (bot.Team != "" && candidate.Team == bot.Team) {
				continue
			}
			distance := math.Hypot(candidate.X-bot.X, candidate.Y-bot.Y)
			if distance < closest {
				closest = distance
				target = candidate
			}
		}
		if target == nil {
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
		gs.playerMove(id, now, dx, dy)
		if closest < 520 {
			gs.playerShoot(id, now, angle)
		}
		botIndex++
	}
}

func (gs *GameState) PlayerRemove(id string) {
	p := gs.Players[id]
	if p != nil {
		gs.Broadcast("left", map[string]interface{}{"name": p.Name})
	}
	delete(gs.Players, id)
	if gs.State == GameStateGame && p != nil && !p.IsBot {
		gs.fillMissingBots()
	}
}

func (gs *GameState) PlayerPushAction(action Action) {
	gs.Actions = append(gs.Actions, action)
}

func (gs *GameState) playerMove(id string, ts int64, dirX, dirY float64) {
	p := gs.Players[id]
	if p == nil || (dirX == 0 && dirY == 0) {
		return
	}
	speed := p.Speed
	if p.HasteUntil > ts {
		speed *= 1.32
	}
	if p.SlowUntil > ts {
		speed *= .62
	}
	p.Move(dirX, dirY, speed)

	clamped := gs.Map.ClampCircle(&p.CircleBody)
	p.X = clamped.X
	p.Y = clamped.Y

	geometry.CorrectCircleWithWalls(&p.CircleBody, gs.Walls, "full")

	p.Ack = ts

	if !p.IsAlive() {
		return
	}
	for _, pr := range gs.Props {
		if !pr.Active {
			continue
		}
		if geometry.CircleToCircle(&p.CircleBody, &pr.CircleBody) {
			switch pr.Type {
			case "potion-red":
				if !p.IsFullLives() {
					pr.Active = false
					p.Heal()
				}
			}
		}
	}
}

func (gs *GameState) playerAbility(id string, ts int64, slot string) {
	p := gs.Players[id]
	if p == nil || !p.IsAlive() || gs.State != GameStateGame {
		return
	}
	primary := slot == "primary"
	last := p.LastSecondaryAt
	cooldown := int64(9000)
	if primary {
		last, cooldown = p.LastPrimaryAt, 6500
	}
	if last != 0 && ts-last < cooldown {
		return
	}
	if primary {
		p.LastPrimaryAt = ts
	} else {
		p.LastSecondaryAt = ts
	}

	angle := p.Rotation
	switch p.HeroName {
	case "Blaze":
		if primary {
			for _, target := range gs.Players {
				if target != p && target.IsAlive() && target.Marks > 0 {
					target.TakeDamage(target.Marks * 420)
					target.Marks = 0
				}
			}
		} else {
			gs.dashAttack(p, angle, 105, 20, 450)
			p.ShieldHP += 850
		}
	case "Frost":
		if primary {
			for _, spread := range []float64{-.08, -.04, 0, .04, .08} {
				gs.spawnAttackBullet(p, angle+spread, "overcharge", 520, 8.2, 5, 820, 1, false, false)
			}
		} else {
			p.HasteUntil = ts + 3000
			p.ShieldHP += 700
		}
	case "Viper":
		if primary {
			gs.dashAttack(p, angle, 120, 28, 900)
			gs.hitSector(p, angle, 190, math.Pi, 1700, true)
		} else {
			p.ShieldHP += 2600
		}
	case "Titan":
		if primary {
			p.HasteUntil = ts + 3200
			p.ShieldHP += 650
		} else {
			for _, spread := range []float64{-.22, 0, .22} {
				gs.spawnAttackBullet(p, angle+spread, "boomerang", 1050, 5.8, 11, 520, 20, true, false)
			}
		}
	case "Shadow":
		if primary {
			hits := gs.hitSector(p, angle, 235, math.Pi, 1350, false)
			if hits > 0 {
				for _, target := range gs.Players {
					if target != p && math.Hypot(target.X-p.X, target.Y-p.Y) <= 235 {
						target.SlowUntil = ts + 2200
					}
				}
			}
		} else {
			p.Lives = int(math.Min(float64(p.MaxLives), float64(p.Lives+1450)))
		}
	case "Spark":
		if primary {
			gs.dashAttack(p, angle, 210, 34, 1750)
		} else {
			p.HasteUntil = ts + 2800
			p.ShieldHP += 900
		}
	case "Nova":
		if primary {
			for _, spread := range []float64{-.055, 0, .055} {
				gs.spawnAttackBullet(p, angle+spread, "sniper", 1450, 9.4, 4, 1050, 2, false, false)
			}
		} else {
			gs.dashAttack(p, angle+math.Pi, 150, 18, 0)
			p.ShieldHP += 750
		}
	case "Rex":
		if primary {
			gs.dashAttack(p, angle, 180, 32, 1900)
			p.ShieldHP += 700
		} else {
			p.HasteUntil = ts + 3500
			p.ShieldHP += 1200
		}
	case "Pixel":
		if primary {
			for _, spread := range []float64{-.18, -.09, 0, .09, .18} {
				gs.spawnAttackBullet(p, angle+spread, "quantum", 950, 6.4, 8, 720, 2, false, false)
			}
		} else {
			p.ShieldHP += 1500
			p.HasteUntil = ts + 2200
		}
	case "Boulder":
		if primary {
			for i := -3; i <= 3; i++ {
				gs.spawnAttackBullet(p, angle+float64(i)*.11, "poison", 560, 6.4, 5, 700, 0, false, true)
			}
		} else {
			p.ShieldHP += 1000
			p.HasteUntil = ts + 2600
		}
	}
}

func (gs *GameState) playerRotate(id string, ts int64, rotation float64) {
	p := gs.Players[id]
	if p == nil {
		return
	}
	p.Rotation = rotation
}

func (gs *GameState) playerShoot(id string, ts int64, angle float64) {
	p := gs.Players[id]
	if p == nil || !p.IsAlive() || gs.State != GameStateGame {
		return
	}
	delta := ts - p.LastShootAt
	rate := p.AttackRate
	if rate == 0 {
		rate = BulletRate
	}
	if p.LastShootAt != 0 && delta < rate {
		return
	}
	p.LastShootAt = ts
	p.Rotation = angle
	switch p.AttackType {
	case "shotgun":
		for _, spread := range []float64{-.28, -.14, 0, .14, .28} {
			gs.spawnAttackBullet(p, angle+spread, "pellet", p.AttackDmg, p.BulletSpd, p.BulletSz, 430, 0, false, false)
		}
	case "burst":
		for _, spread := range []float64{-.035, -.02, -.008, .008, .02, .035} {
			gs.spawnAttackBullet(p, angle+spread, "laser", p.AttackDmg, p.BulletSpd, p.BulletSz, 720, 0, false, false)
		}
	case "slam":
		gs.hitSector(p, angle, 145, .72, p.AttackDmg, true)
	case "boomerang":
		gs.spawnAttackBullet(p, angle, "boomerang", p.AttackDmg, p.BulletSpd, p.BulletSz, 420, 20, true, false)
	case "spore":
		gs.spawnAttackBullet(p, angle, "spore", p.AttackDmg, p.BulletSpd, p.BulletSz, 500, 0, false, false)
	case "dash":
		gs.dashAttack(p, angle, 112, 30, p.AttackDmg)
	case "sniper":
		gs.spawnAttackBullet(p, angle, "sniper", p.AttackDmg, p.BulletSpd, p.BulletSz, 960, 0, false, false)
	case "double_melee":
		hits := gs.hitSector(p, angle, 82, .85, p.AttackDmg*2, false)
		p.ShieldHP += hits * p.AttackDmg
	case "quantum":
		gs.spawnAttackBullet(p, angle, "quantum", p.AttackDmg, p.BulletSpd, p.BulletSz, 620, 0, false, false)
	case "poison_fan":
		for _, spread := range []float64{-.18, 0, .18} {
			gs.spawnAttackBullet(p, angle+spread, "poison", p.AttackDmg, p.BulletSpd, p.BulletSz, 620, 0, false, true)
		}
	default:
		gs.spawnAttackBullet(p, angle, "bolt", p.AttackDmg, p.BulletSpd, p.BulletSz, 700, 0, false, false)
	}
}

func (gs *GameState) spawnAttackBullet(p *player.Player, angle float64, kind string, damage int, speed, size, maxRange float64, pierce int, returning, poison bool) {
	if size == 0 {
		size = BulletSize
	}
	if speed == 0 {
		speed = BulletSpeed
	}
	x := p.X + math.Cos(angle)*(p.Radius+4)
	y := p.Y + math.Sin(angle)*(p.Radius+4)
	var b *bullet.Bullet
	for _, candidate := range gs.Bullets {
		if !candidate.Active {
			b = candidate
			b.Reset(p.PlayerId, p.Team, x, y, size, angle, p.Color)
			break
		}
	}
	if b == nil {
		b = bullet.NewBullet(p.PlayerId, p.Team, x, y, size, angle, p.Color)
		gs.Bullets = append(gs.Bullets, b)
	}
	b.Kind, b.Damage, b.Speed, b.MaxRange, b.Pierce, b.Returning, b.Poison = kind, damage, speed, maxRange, pierce, returning, poison
}

func (gs *GameState) hitSector(source *player.Player, angle, reach, halfArc float64, damage int, pull bool) int {
	hits := 0
	for _, target := range gs.Players {
		if !target.CanBulletHurt(source.PlayerId, source.Team) {
			continue
		}
		dx, dy := target.X-source.X, target.Y-source.Y
		delta := math.Atan2(math.Sin(math.Atan2(dy, dx)-angle), math.Cos(math.Atan2(dy, dx)-angle))
		if math.Hypot(dx, dy) > reach+target.Radius || math.Abs(delta) > halfArc {
			continue
		}
		target.TakeDamage(damage)
		hits++
		if pull {
			target.X -= math.Cos(angle) * 16
			target.Y -= math.Sin(angle) * 16
		}
	}
	return hits
}

func (gs *GameState) dashAttack(p *player.Player, angle, distance, radius float64, damage int) {
	steps := 5
	for step := 0; step < steps; step++ {
		p.X += math.Cos(angle) * distance / float64(steps)
		p.Y += math.Sin(angle) * distance / float64(steps)
		geometry.CorrectCircleWithWalls(&p.CircleBody, gs.Walls, "")
		gs.hitSector(p, angle, radius, math.Pi, damage, false)
	}
}

func (gs *GameState) setPlayersActive(active bool) {
	for _, p := range gs.Players {
		if active {
			p.Lives = p.MaxLives
			p.Kills = 0
		} else {
			p.Lives = 0
		}
	}
}

func (gs *GameState) setPlayersPositionRandomly() {
	players := make([]*player.Player, 0, len(gs.Players))
	for _, p := range gs.Players {
		players = append(players, p)
	}
	candidates := append([]*geometry.RectangleBody(nil), gs.Map.Spawners...)
	selected := make([]*geometry.RectangleBody, 0, len(players))
	if len(candidates) > 0 {
		first := geometry.GetRandomInt(0, len(candidates)-1)
		selected = append(selected, candidates[first])
		candidates = append(candidates[:first], candidates[first+1:]...)
	}
	for len(selected) < len(players) && len(candidates) > 0 {
		bestIndex := 0
		bestDistance := -1.0
		for index, candidate := range candidates {
			nearestDistance := math.MaxFloat64
			for _, used := range selected {
				dx, dy := candidate.X-used.X, candidate.Y-used.Y
				if squared := dx*dx + dy*dy; squared < nearestDistance {
					nearestDistance = squared
				}
			}
			if nearestDistance > bestDistance {
				bestDistance = nearestDistance
				bestIndex = index
			}
		}
		selected = append(selected, candidates[bestIndex])
		candidates = append(candidates[:bestIndex], candidates[bestIndex+1:]...)
	}
	for index, p := range players {
		spawner := gs.Map.GetRandomSpawner()
		if index < len(selected) {
			spawner = selected[index]
		}
		p.X = spawner.X + PlayerSize/2
		p.Y = spawner.Y + PlayerSize/2
		p.Ack = 0
	}
}

func (gs *GameState) setPlayersTeamsRandomly() {
	ids := make([]string, 0, len(gs.Players))
	for id := range gs.Players {
		ids = append(ids, id)
	}
	ids = geometry.ShuffleStrings(ids)

	minPerTeam := len(ids) / 2
	rest := len(ids) % 2

	for i, id := range ids {
		p := gs.Players[id]
		if i < minPerTeam+rest {
			p.SetTeam("Blue")
		} else {
			p.SetTeam("Red")
		}
	}
}

func (gs *GameState) countActivePlayers() int {
	count := 0
	for _, p := range gs.Players {
		if p.IsAlive() {
			count++
		}
	}
	return count
}

func (gs *GameState) getWinningPlayer() *player.Player {
	for _, p := range gs.Players {
		if p.IsAlive() {
			return p
		}
	}
	return nil
}

func (gs *GameState) getWinningTeam() string {
	redAlive := false
	blueAlive := false
	for _, p := range gs.Players {
		if p.IsAlive() {
			if p.Team == "Red" {
				redAlive = true
			} else {
				blueAlive = true
			}
		}
	}
	if redAlive && blueAlive {
		return ""
	}
	if redAlive {
		return "Red"
	}
	return "Blue"
}

func (gs *GameState) monstersAdd(count int) {
	for i := 0; i < count; i++ {
		x := geometry.GetRandomFloat(float64(TileSize), gs.Map.WidthInPixels-float64(TileSize))
		y := geometry.GetRandomFloat(float64(TileSize), gs.Map.HeightInPixels-float64(TileSize))
		m := monster.NewMonster(x, y, PlayerSize/2, gs.Map.WidthInPixels, gs.Map.HeightInPixels, monster.MonsterLives)
		gs.Monsters[fmt.Sprintf("%d", geometry.GetRandomInt(0, 1000))] = m
	}
}

func (gs *GameState) monstersClear() {
	gs.Monsters = make(map[string]*monster.Monster)
}

func (gs *GameState) propsAdd(count int) {
	for i := 0; i < count; i++ {
		x := geometry.GetRandomFloat(float64(TileSize), gs.Map.WidthInPixels-float64(TileSize))
		y := geometry.GetRandomFloat(float64(TileSize), gs.Map.HeightInPixels-float64(TileSize))
		pr := prop.NewProp("potion-red", x, y, FlaskSize/2)
		gs.Props = append(gs.Props, pr)
	}
}

func (gs *GameState) propsClear() {
	gs.Props = make([]*prop.Prop, 0)
}
