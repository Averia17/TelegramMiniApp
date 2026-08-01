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
	"sort"
	"time"
)

func InitGameState(gs *GameState) {
	gs.Players = make(map[string]*player.Player)
	gs.Monsters = make(map[string]*monster.Monster)
	gs.Bullets = make([]*bullet.Bullet, 0)
	gs.Props = make([]*prop.Prop, 0)
	gs.Actions = make([]Action, 0)
	gs.Effects = make([]*BattleEffect, 0)
	gs.DelayedEffects = make([]*DelayedBattleEffect, 0)
	gs.ScheduledShots = make([]*ScheduledShot, 0)
	gs.DamageZones = make([]*DamageZone, 0)
	gs.PendingMandySupers = make([]*PendingMandySuper, 0)
	gs.HeroZones = make([]*HeroZone, 0)
	gs.SporeStacks = make(map[string]int)
	gs.DoomedUntil = make(map[string]int64)
	gs.DamianDebuffs = make(map[string]int)
	gs.LightMarkedUntil = make(map[string]int64)
	gs.AbilityTargets = make(map[string]string)
	gs.LightningStrikes = make([]*LightningStrike, 0)
	gs.Totems = make(map[string]*Totem)
	gs.Skyfalls = make([]*Skyfall, 0)
	gs.TemporaryWalls = make(map[*geometry.WallTile]int64)
	gs.BotMemory = make(map[string]*BotPerception)
	gs.IslandVoiceNextAt = make(map[string]int64)
	gs.IslandVoiceKillClaimed = make(map[string]bool)
	gs.CombatEvents = make([]CombatEvent, 0)
	gs.BeaconHoldStartedAt = make(map[string]int64)
	gs.MapRevision = 0
	gs.botWallCacheRevision = -1
	gs.botWallCache = nil
	gs.botTerrainCacheRevision = -1
	gs.botTerrainCache = nil

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
	gs.updatePlayerMovement()
	gs.updateStatuses()
	gs.updateActiveAbilities()
	gs.updateScheduledShots()
	gs.updateDamageZones()
	gs.updatePendingMandySupers()
	gs.updateNewHeroSystems()
	gs.updateMandyFocus()
	gs.updateDelayedEffects()
	gs.updateTemporaryWalls()
	gs.updateRegeneration()
	gs.updateBots()
	gs.updateMonsters()
	gs.updateBullets()
	gs.expireEffects()
	gs.pruneCombatEvents(time.Now().UnixMilli())
}

func (gs *GameState) emitCombatEvent(event CombatEvent) {
	if event.CommandID == "" {
		return
	}
	gs.NextCombatEventID++
	event.ID = gs.NextCombatEventID
	event.Ts = time.Now().UnixMilli()
	gs.CombatEvents = append(gs.CombatEvents, event)
}

func (gs *GameState) pruneCombatEvents(now int64) {
	kept := gs.CombatEvents[:0]
	for _, event := range gs.CombatEvents {
		if now-event.Ts <= 2000 {
			kept = append(kept, event)
		}
	}
	gs.CombatEvents = kept
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
		if gs.isInConcealment(p) && gs.isConcealed(p) {
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
	var sourceBush *geometry.WallTile
	for _, wall := range gs.Map.Collisions {
		if isConcealmentWall(wall.Type) && source.X >= wall.MinX && source.X <= wall.MaxX && source.Y >= wall.MinY && source.Y <= wall.MaxY {
			sourceBush = wall
			break
		}
	}
	if sourceBush == nil {
		return false
	}
	for _, target := range gs.Players {
		if target == source || !target.IsAlive() || (source.Team != "" && source.Team == target.Team) {
			continue
		}
		sameBushGroup := false
		for _, wall := range gs.Map.Collisions {
			if isConcealmentWall(wall.Type) && wall.BushGroup == sourceBush.BushGroup && target.X >= wall.MinX && target.X <= wall.MaxX && target.Y >= wall.MinY && target.Y <= wall.MaxY {
				sameBushGroup = true
				break
			}
		}
		if sameBushGroup || math.Hypot(target.X-source.X, target.Y-source.Y) <= TileSize*2.5 {
			return false
		}
	}
	return true
}

func (gs *GameState) isInConcealment(source *player.Player) bool {
	if gs.Map == nil || source == nil {
		return false
	}
	for _, wall := range gs.Map.Collisions {
		if isConcealmentWall(wall.Type) && source.X >= wall.MinX && source.X <= wall.MaxX && source.Y >= wall.MinY && source.Y <= wall.MaxY {
			return true
		}
	}
	return false
}

func isConcealmentWall(wallType string) bool {
	return wallType == "bush" || wallType == "half" || wallType == "moon_mist"
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
		gs.updateIsland(time.Now().UnixMilli())
		if gs.finishBattleIfDecided() {
			return
		}
		if gs.GameEndsAt < time.Now().UnixMilli() {
			winner := gs.getTimeoutWinner()
			gs.onGameEnd(&ServerEvent{
				Type:   "timeout",
				Params: map[string]interface{}{"name": winner},
			})
			gs.startFinished()
			return
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
				gs.playerRotate(action.PlayerId, action.Ts, v.Rotation, v.AimDistance)
			}
		case "shoot":
			if v, ok := action.Value.(*ShootValue); ok {
				angle := v.Angle
				if v.AutoAim {
					angle, v.AimDistance = gs.autoAimTarget(action.PlayerId)
				}
				gs.playerShootWithCommand(action.PlayerId, time.Now().UnixMilli(), angle, v.ClientID, v.AimDistance)
			}
		case "ability":
			if v, ok := action.Value.(*AbilityValue); ok {
				gs.playerAbility(action.PlayerId, time.Now().UnixMilli(), v.Slot, v.ClientID, v.TargetID)
			}
		case "aiming":
			if v, ok := action.Value.(*AimingValue); ok {
				if p := gs.Players[action.PlayerId]; p != nil {
					p.Aiming = v.Aiming
				}
			}
		}
	}
}

func (gs *GameState) updateMonsters() {
	now := time.Now().UnixMilli()
	index := 0
	for monsterID, m := range gs.Monsters {
		if m == nil || !m.IsAlive() {
			continue
		}
		var target *player.Player
		closest := math.MaxFloat64
		for _, candidate := range gs.Players {
			if candidate.IsAlive() {
				if distance := math.Hypot(candidate.X-m.X, candidate.Y-m.Y); distance < closest {
					closest, target = distance, candidate
				}
			}
		}
		if target == nil {
			continue
		}
		angle := math.Atan2(target.Y-m.Y, target.X-m.X)
		m.Rotation = angle
		if closest < 430 && closest >= 50 {
			pace := 105 + float64(m.Tier)*15 + float64(index)*2
			dx, dy := gs.navigatedDirection(&m.CircleBody, math.Cos(angle), math.Sin(angle), monsterID)
			m.X += dx * pace / 60
			m.Y += dy * pace / 60
			geometry.CorrectCircleWithBlockingWalls(&m.CircleBody, gs.Walls)
		}
		cooldown := int64(1100)
		if m.Tier == 2 {
			cooldown = 900
		}
		if closest < 56 && now-m.LastAttackAt >= cooldown {
			m.LastAttackAt = now
			gs.applyDamage(target, 62+m.Tier*18)
			if !target.IsAlive() {
				gs.Broadcast("killed", map[string]interface{}{
					"killerName": "A bat",
					"killedName": target.Name,
				})
				if gs.OnPlayerKilled != nil {
					gs.OnPlayerKilled(target.PlayerId, "A bat")
				}
				gs.finishBattleIfDecided()
			}
		}
		index++
	}
}

func (gs *GameState) updateStatuses() {
	now := time.Now().UnixMilli()
	for _, p := range gs.Players {
		gs.reloadAmmo(p, now)
		if p.ShieldStackUntil > 0 && p.ShieldStackUntil <= now {
			p.ShieldStacks, p.ShieldStackUntil = 0, 0
		}
		if p.Heat > 0 && p.HeatUntil > 0 && p.HeatUntil <= now {
			p.Heat--
			p.HeatUntil = now + 500
		}
		if !p.IsAlive() || p.PoisonUntil <= now || p.PoisonTickAt > now {
			continue
		}
		gs.applyDamage(p, 8)
		p.PoisonTickAt = now + 500
		for _, adjacent := range gs.Players {
			if adjacent == p || !adjacent.IsAlive() || math.Hypot(adjacent.X-p.X, adjacent.Y-p.Y) >= 135 {
				continue
			}
			adjacent.PoisonUntil = now + 4000
			adjacent.PoisonBy = p.PoisonBy
			if adjacent.PoisonTickAt == 0 || adjacent.PoisonTickAt > now+500 {
				adjacent.PoisonTickAt = now + 500
			}
		}
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
			gs.finishBattleIfDecided()
		}
	}
}

func (gs *GameState) reloadAmmo(p *player.Player, now int64) {
	if p == nil || !p.IsAlive() || p.MaxAmmo <= 0 || p.Ammo >= p.MaxAmmo {
		if p != nil && p.Ammo >= p.MaxAmmo {
			p.NextAmmoAt = 0
		}
		return
	}
	if p.ReloadTime <= 0 {
		p.ReloadTime = 1500
	}
	if p.NextAmmoAt == 0 {
		p.NextAmmoAt = now + p.ReloadTime
	}
	for p.Ammo < p.MaxAmmo && now >= p.NextAmmoAt {
		p.Ammo++
		p.NextAmmoAt += p.ReloadTime
	}
	if p.Ammo >= p.MaxAmmo {
		p.NextAmmoAt = 0
	}
}

func (gs *GameState) applyDamage(target *player.Player, amount int) bool {
	return gs.applyDamageAmount(target, amount) > 0
}

func (gs *GameState) applyDamageAmount(target *player.Player, amount int) int {
	if gs.State != GameStateGame || target == nil || !target.IsAlive() || target.InvulnerableUntil > time.Now().UnixMilli() {
		return 0
	}
	if target.StealthUntil > time.Now().UnixMilli() && target.Dodges > 0 {
		target.Dodges--
		gs.addEffect("evade", target.X, target.Y, 0, 0, 0, 0, 0, 0, "#ffffff", 0, 450)
		return 0
	}
	if target.ShieldUntil > time.Now().UnixMilli() {
		if target.StoneArmorUntil > time.Now().UnixMilli() {
			target.SuppressedRage += amount
		}
		amount = int(math.Round(float64(amount) * .6))
	}
	if target.ShieldStacks > 0 {
		amount = int(math.Round(float64(amount) * (1 - math.Min(.75, float64(target.ShieldStacks)*.15))))
	}
	livesBefore := target.Lives
	shieldBefore := target.ShieldHP
	target.TakeDamage(amount)
	dealt := livesBefore - target.Lives + shieldBefore - target.ShieldHP
	target.RevealedUntil = time.Now().UnixMilli() + 2000
	gs.addEffect("damage", target.X, target.Y, 0, 0, 0, 0, 0, 0, "#ff6b9f", dealt, 520)
	return dealt
}

func (gs *GameState) dealPlayerDamage(source, target *player.Player, amount int) int {
	if source != nil && gs.DamianDebuffs[source.PlayerId] > 0 {
		amount = int(math.Round(float64(amount) * (1 - .08*float64(gs.DamianDebuffs[source.PlayerId]))))
	}
	if target != nil && gs.DoomedUntil[target.PlayerId] > time.Now().UnixMilli() {
		amount = int(math.Round(float64(amount) * 1.3))
	}
	wasAlive := target != nil && target.IsAlive()
	dealt := gs.applyDamageAmount(target, amount)
	if dealt > 0 && target != nil && gs.activeCommandID != "" {
		sourceID := gs.activeSourceID
		if source != nil {
			sourceID = source.PlayerId
		}
		gs.emitCombatEvent(CombatEvent{
			Kind: "hit", CommandID: gs.activeCommandID, SourceID: sourceID,
			TargetType: "players", TargetID: target.PlayerId, ProjectileID: gs.activeProjectileID, Damage: dealt,
		})
	}
	if dealt > 0 {
		if source != nil && source.HeroName == "Mandy" {
			// Mandy charges by successful staff swings, not proportional damage.
		} else if source != nil && CombatKitFor(source.HeroName) == nil {
			source.SuperCharge = int(math.Min(100, float64(source.SuperCharge+20)))
		} else {
			gs.awardSuperFromDamage(source, dealt)
		}
	}
	if wasAlive && !target.IsAlive() {
		if source != nil && source.HeroName == "Kaze" && gs.DoomedUntil[target.PlayerId] > time.Now().UnixMilli() {
			source.LastPrimaryAt = 0
			source.SuperCharge = 100
		}
		killerName := "Unknown"
		if source != nil {
			killerName = source.Name
			source.Kills++
			if !gs.IslandVoiceKillClaimed[source.PlayerId] {
				gs.IslandVoiceKillClaimed[source.PlayerId] = true
				gs.emitIslandVoice(source.PlayerId, IslandVoiceTriggerKill, time.Now().UnixMilli())
			}
		}
		gs.Broadcast("killed", map[string]interface{}{
			"killerName": killerName,
			"killedName": target.Name,
		})
		if gs.OnPlayerKilled != nil {
			gs.OnPlayerKilled(target.PlayerId, killerName)
		}
		gs.finishBattleIfDecided()
	}
	return dealt
}

func (gs *GameState) updateDelayedEffects() {
	now := time.Now().UnixMilli()
	kept := gs.DelayedEffects[:0]
	for _, delayed := range gs.DelayedEffects {
		if delayed == nil {
			continue
		}
		if delayed.TriggerAt > now {
			kept = append(kept, delayed)
			continue
		}
		source := gs.Players[delayed.Owner]
		if source == nil {
			continue
		}
		gs.pullTargets(source, delayed.X, delayed.Y, 260, 150)
		gs.radialDamage(delayed.Owner, delayed.X, delayed.Y, 150, 65)
		for _, target := range gs.Players {
			if target != source && target.IsAlive() && math.Hypot(target.X-delayed.X, target.Y-delayed.Y) < 180 {
				target.StunUntil = now + 350
			}
		}
		gs.addEffect("collapse", delayed.X, delayed.Y, 0, 0, 150, 0, 0, 0, "#ff7138", 0, 500)
	}
	gs.DelayedEffects = kept
}

func (gs *GameState) addEffect(kind string, x, y, toX, toY, radius, angle, reach, arc float64, color string, damage int, duration int64) {
	now := time.Now().UnixMilli()
	gs.Effects = append(gs.Effects, &BattleEffect{Kind: kind, X: x, Y: y, ToX: toX, ToY: toY, Radius: radius, Angle: angle, Range: reach, Arc: arc, Color: color, Damage: damage, CreatedAt: now, ExpiresAt: now + duration})
}

func (gs *GameState) expireEffects() {
	now := time.Now().UnixMilli()
	kept := gs.Effects[:0]
	for _, effect := range gs.Effects {
		if effect != nil && effect.ExpiresAt > now {
			kept = append(kept, effect)
		}
	}
	gs.Effects = kept
}

func (gs *GameState) updateActiveAbilities() {
	now := time.Now().UnixMilli()
	for _, source := range gs.Players {
		if !source.IsAlive() || now-source.LastAbilityTick < 16 {
			continue
		}
		source.LastAbilityTick = now
		if source.HeroName == "Kaze" && source.KazeComboHits >= 2 {
			if now >= source.KazeComboUntil {
				gs.hitSector(source, source.Rotation, 105, .72, source.AttackDmg*2, false)
				source.KazeComboHits = 0
			}
		}
		if source.ChannelUntil > now {
			gs.addEffect("beam", source.X, source.Y, source.X+math.Cos(source.Rotation)*840, source.Y+math.Sin(source.Rotation)*840, 0, 0, 0, 0, source.Color, 0, 90)
			gs.beamDamage(source, source.Rotation, 840, 15)
		}
		if source.VortexUntil > now && now >= source.VortexTickAt {
			source.VortexTickAt = now + 250
			gs.addEffect("vortex", source.X, source.Y, 0, 0, 125, 0, 0, 0, source.Color, 0, 100)
			gs.radialDamage(source.PlayerId, source.X, source.Y, 125, 4)
			source.Lives = int(math.Min(float64(source.MaxLives), float64(source.Lives+1)))
		}
		if source.VineUntil > now && (source.VineUntil-now)%500 < 20 {
			gs.addEffect("vine", source.X, source.Y, 0, 0, 245, 0, 0, 0, source.Color, 0, 480)
			gs.pullTargets(source, source.X, source.Y, 260, 16)
			gs.radialDamage(source.PlayerId, source.X, source.Y, 245, 18)
		}
		if source.FlyingUntil > now && (source.FlyingUntil-now)%250 < 20 {
			gs.addEffect("acid", source.X, source.Y, 0, 0, 110, 0, 0, 0, "#5f2a72", 0, 2200)
			for _, target := range gs.Players {
				if target != source && target.IsAlive() && math.Hypot(target.X-source.X, target.Y-source.Y) < 110 {
					target.BlindUntil = now + 1200
				}
			}
		}
	}
}

func (gs *GameState) beamDamage(source *player.Player, angle, reach float64, damage int) {
	var best *player.Player
	bestAlong := math.MaxFloat64
	for id, target := range gs.Players {
		if id == source.PlayerId || !target.IsAlive() {
			continue
		}
		dx, dy := target.X-source.X, target.Y-source.Y
		along := dx*math.Cos(angle) + dy*math.Sin(angle)
		across := math.Abs(-dx*math.Sin(angle) + dy*math.Cos(angle))
		if along > 0 && along < reach && across < 27 && along < bestAlong {
			best, bestAlong = target, along
		}
	}
	gs.dealPlayerDamage(source, best, damage)
}

func (gs *GameState) pullTargets(source *player.Player, x, y, radius, distance float64) {
	for id, target := range gs.Players {
		if id == source.PlayerId || !target.IsAlive() {
			continue
		}
		dx, dy := x-target.X, y-target.Y
		d := math.Hypot(dx, dy)
		if d > 0 && d <= radius {
			target.X += dx / d * math.Min(distance, d)
			target.Y += dy / d * math.Min(distance, d)
		}
	}
}

func (gs *GameState) updateBullets() {
	previousCommandID, previousSourceID, previousProjectileID := gs.activeCommandID, gs.activeSourceID, gs.activeProjectileID
	previousPending := gs.commandHasProjectile
	defer func() {
		gs.activeCommandID, gs.activeSourceID, gs.activeProjectileID = previousCommandID, previousSourceID, previousProjectileID
		gs.commandHasProjectile = previousPending
	}()
	for i := 0; i < len(gs.Bullets); i++ {
		b := gs.Bullets[i]
		if b == nil || !b.Active {
			continue
		}
		gs.activeCommandID, gs.activeSourceID, gs.activeProjectileID = b.CommandID, b.PlayerId, b.ID
		if b.Lobbed {
			now := time.Now().UnixMilli()
			duration := math.Max(1, float64(b.LandsAt-b.SpawnedAt))
			progress := math.Max(0, math.Min(1, float64(now-b.SpawnedAt)/duration))
			b.X = b.OriginX + (b.TargetX-b.OriginX)*progress
			b.Y = b.OriginY + (b.TargetY-b.OriginY)*progress
			b.Travelled = math.Hypot(b.X-b.OriginX, b.Y-b.OriginY)
			if progress >= 1 {
				b.Active = false
				gs.DamageZones = append(gs.DamageZones, &DamageZone{
					Owner: b.PlayerId, X: b.TargetX, Y: b.TargetY, Radius: b.ZoneRadius,
					Damage: b.Damage, TicksLeft: b.ZoneTicks, NextTickAt: now,
					Interval: b.ZoneInterval, ExpiresAt: now + int64(b.ZoneTicks)*b.ZoneInterval + 100,
					Kind: "barley_pool", Color: b.Color, Group: b.ZoneGroup,
				})
				gs.addEffect("barley_pool", b.TargetX, b.TargetY, 0, 0, b.ZoneRadius, 0, 0, 0, b.Color, 0, int64(b.ZoneTicks)*b.ZoneInterval+100)
			}
			continue
		}
		previousX, previousY := b.X, b.Y
		if b.Homing && b.TargetID != "" {
			if target := gs.Players[b.TargetID]; target != nil && target.IsAlive() {
				desired := math.Atan2(target.Y-b.Y, target.X-b.X)
				delta := math.Atan2(math.Sin(desired-b.Rotation), math.Cos(desired-b.Rotation))
				b.Rotation += math.Max(-0.12, math.Min(0.12, delta))
			} else {
				b.Homing = false
			}
		}
		b.Move(BulletSpeed)
		if b.Kind == "lumi_orb" {
			now := time.Now().UnixMilli()
			nearTrail := false
			for index := len(gs.HeroZones) - 1; index >= 0 && index >= len(gs.HeroZones)-12; index-- {
				zone := gs.HeroZones[index]
				if zone != nil && zone.Owner == b.PlayerId && zone.Kind == "lumi_trail" && math.Hypot(zone.X-b.X, zone.Y-b.Y) < 60 {
					nearTrail = true
					break
				}
			}
			if !nearTrail {
				gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: b.PlayerId, Kind: "lumi_trail", X: b.X, Y: b.Y, Radius: 60, CreatedAt: now, ExpiresAt: now + 6000, Triggered: map[string]bool{}})
				gs.addEffect("lumi_slow_trail", b.X, b.Y, 0, 0, 60, 0, 0, 0, b.Color, 0, 6000)
			}
		}
		if b.MaxRange > 0 && b.Travelled >= b.MaxRange {
			if b.Returning {
				b.Returning = false
				b.Rotation = math.Atan2(b.OriginY-b.Y, b.OriginX-b.X)
				b.Travelled = 0
			} else {
				gs.finishNewHeroProjectile(b)
				gs.splitProjectile(b)
				b.Active = false
				continue
			}
		}

		for _, p := range gs.Players {
			if b.Kind == "mina_star" && p.IsAlive() && (p.PlayerId == b.PlayerId || (b.Team != "" && p.Team == b.Team)) && segmentHitsCircle(previousX, previousY, b.X, b.Y, p.X, p.Y, p.Radius+b.Radius) {
				p.Lives = int(math.Min(float64(p.MaxLives), float64(p.Lives+2)))
				b.Active = false
				continue
			}
			if !p.CanBulletHurt(b.PlayerId, b.Team) || !segmentHitsCircle(previousX, previousY, b.X, b.Y, p.X, p.Y, p.Radius+b.Radius) {
				continue
			}
			if b.HitPlayers[p.PlayerId] {
				continue
			}
			if p.Deflect > 0 {
				p.Deflect--
				b.PlayerId, b.Team, b.Rotation = p.PlayerId, p.Team, b.Rotation+math.Pi
				b.HitPlayers = make(map[string]bool)
				b.X, b.Y = previousX, previousY
				gs.addEffect("spin", p.X, p.Y, 0, 0, 90, 0, 0, 0, "#e8ffb2", 0, 350)
				continue
			}
			b.HitPlayers[p.PlayerId] = true
			dmg := b.Damage
			if b.Kind == "sniper" {
				progress := math.Min(1, b.Travelled/math.Max(1, b.MaxRange))
				dmg = int(math.Round(float64(dmg) * (1 + progress*.75)))
			}
			if dmg <= 0 {
				dmg = 1
			}
			p.HitImpulseX, p.HitImpulseY = math.Cos(b.Rotation), math.Sin(b.Rotation)
			attacker := gs.Players[b.PlayerId]
			if gs.dealPlayerDamage(attacker, p, dmg) <= 0 {
				continue
			}
			if b.Knockback > 0 {
				geometry.MoveCircleWithBlockingWalls(
					&p.CircleBody,
					gs.Walls,
					math.Cos(b.Rotation)*b.Knockback,
					math.Sin(b.Rotation)*b.Knockback,
				)
				clamped := gs.Map.ClampCircle(&p.CircleBody)
				p.X, p.Y = clamped.X, clamped.Y
			}
			if b.Poison {
				p.PoisonUntil = time.Now().Add(4 * time.Second).UnixMilli()
				p.PoisonTickAt = time.Now().Add(500 * time.Millisecond).UnixMilli()
				p.PoisonBy = b.PlayerId
			}
			if b.Kind == "pellet" && p.Marks < 5 {
				p.Marks++
			}
			if b.Kind == "mina_star" {
				p.Marks = 1
				gs.LightMarkedUntil[p.PlayerId] = time.Now().UnixMilli() + 4000
			}
			if b.Kind == "damian_orb" || b.Kind == "damian_totem_orb" {
				gs.DamianDebuffs[p.PlayerId] = int(math.Min(3, float64(gs.DamianDebuffs[p.PlayerId]+1)))
			}
			if b.Kind == "spore" {
				gs.SporeStacks[p.PlayerId] = gs.SporeStacks[p.PlayerId] + 1
				if gs.SporeStacks[p.PlayerId] >= 3 {
					gs.SporeStacks[p.PlayerId] = 0
					p.SlowUntil = time.Now().UnixMilli() + 2000
					p.SlowMultiplier = .60
					gs.addEffect("shadow_roots", p.X, p.Y, 0, 0, 24, 0, 0, 0, "#75d947", 0, 2000)
				}
			}
			if b.Kind == "spore" || b.Kind == "quantum" {
				gs.radialDamageExcept(b.PlayerId, b.X, b.Y, map[string]float64{"spore": 115, "quantum": 75}[b.Kind], b.Damage, p.PlayerId)
			}
			if b.Splash > 0 && b.Kind != "spore" && b.Kind != "quantum" {
				gs.radialDamageExcept(b.PlayerId, b.X, b.Y, b.Splash, b.Damage, p.PlayerId)
			}
			if b.Chain > 0 {
				gs.chainDamage(b.PlayerId, p, 190, b.Chain, 65)
			}
			if b.Pierce > 0 {
				b.Pierce--
			} else {
				b.Active = false
			}
		}

		for mid, m := range gs.Monsters {
			if m == nil || !m.IsAlive() || !segmentHitsCircle(previousX, previousY, b.X, b.Y, m.X, m.Y, m.Radius+b.Radius) {
				continue
			}
			b.Active = false
			gs.damageMonster(mid, m, int(math.Max(1, float64(b.Damage))))
		}

		for _, pr := range gs.Props {
			if pr == nil || !pr.Active || pr.Type != "lunar_crate" || !segmentHitsCircle(previousX, previousY, b.X, b.Y, pr.X, pr.Y, pr.Radius+b.Radius) {
				continue
			}
			gs.damageLunarCrate(gs.Players[b.PlayerId], pr, b.Damage)
			b.Active = false
			break
		}

		for owner, totem := range gs.Totems {
			source := gs.Players[owner]
			if totem == nil || source == nil || source.PlayerId == b.PlayerId || (source.Team != "" && source.Team == b.Team) {
				continue
			}
			if segmentHitsCircle(previousX, previousY, b.X, b.Y, totem.X, totem.Y, 20+b.Radius) {
				totem.HP -= int(math.Max(1, float64(b.Damage)))
				b.Active = false
				gs.addEffect("damian_totem_hit", totem.X, totem.Y, 0, 0, 28, 0, 0, 0, source.Color, b.Damage, 320)
				break
			}
		}

		if segmentHitsBlockingWall(previousX, previousY, b.X, b.Y, b.Radius, gs.Walls) {
			if b.DestroyWalls {
				gs.destroyWallsInRadius(b.X, b.Y, 55)
				if b.Kind == "colt_super_round" {
					continue
				}
				b.Active = false
				continue
			}
			gs.finishNewHeroProjectile(b)
			if b.Bounces > 0 {
				b.Bounces--
				b.Rotation += math.Pi * .82
				b.X, b.Y = previousX, previousY
				continue
			}
			gs.splitProjectile(b)
			b.Active = false
			continue
		}

		if gs.Map.IsCircleOutside(&b.CircleBody) {
			b.Active = false
		}
	}
}

func segmentHitsCircle(x1, y1, x2, y2, cx, cy, radius float64) bool {
	dx, dy := x2-x1, y2-y1
	lengthSquared := dx*dx + dy*dy
	t := 0.0
	if lengthSquared > 0 {
		t = math.Max(0, math.Min(1, ((cx-x1)*dx+(cy-y1)*dy)/lengthSquared))
	}
	return math.Hypot(cx-(x1+dx*t), cy-(y1+dy*t)) <= radius
}

func segmentHitsBlockingWall(x1, y1, x2, y2, radius float64, walls *geometry.SpatialHash) bool {
	distance := math.Hypot(x2-x1, y2-y1)
	steps := int(math.Max(1, math.Ceil(distance/math.Max(4, radius))))
	for step := 0; step <= steps; step++ {
		t := float64(step) / float64(steps)
		body := geometry.CircleBody{X: x1 + (x2-x1)*t, Y: y1 + (y2-y1)*t, Radius: radius}
		if geometry.CollidesCircleWithBlockingWalls(&body, walls) {
			return true
		}
	}
	return false
}

func (gs *GameState) splitProjectile(parent *bullet.Bullet) {
	if parent == nil || (parent.Kind != "spore" && parent.Kind != "quantum") {
		return
	}
	angles := []float64{}
	kind, damage, speed, size, distance := "spike", 1, 0.3*RuntimeProjectileSpeedScale, 3.5, 240.0
	if parent.Kind == "spore" {
		for i := 0; i < 6; i++ {
			angles = append(angles, float64(i)*math.Pi/3)
		}
	} else {
		kind, damage, speed, size, distance = "quantum_shard", int(math.Max(1, float64(parent.Damage)/2)), 0.275*RuntimeProjectileSpeedScale, 4.5, parent.MaxRange*.5
		angles = []float64{parent.Rotation, parent.Rotation + math.Pi - math.Pi/4, parent.Rotation + math.Pi + math.Pi/4}
	}
	parent.Kind = "spent"
	for _, angle := range angles {
		child := bullet.NewBullet(parent.PlayerId, parent.Team, parent.X, parent.Y, size, angle, parent.Color)
		child.Kind, child.Damage, child.Speed, child.MaxRange, child.CommandID = kind, damage, speed, distance, parent.CommandID
		gs.Bullets = append(gs.Bullets, child)
	}
}

func (gs *GameState) startWaiting() {
	gs.LobbyEndsAt = 0
	gs.GameEndsAt = 0
	gs.MatchStartedAt = 0
	gs.IslandPhase = ""
	gs.PhaseStartedAt = 0
	gs.PhaseEndsAt = 0
	gs.IslandEvent = ""
	gs.IslandVoiceNextAt = make(map[string]int64)
	gs.IslandVoiceKillClaimed = make(map[string]bool)
	gs.StormRadius, gs.StormDamage, gs.StormNextTickAt = 0, 0, 0
	gs.BeaconOpen, gs.BeaconHolder = false, ""
	gs.BeaconHoldStartedAt = make(map[string]int64)
	gs.SuddenDeathStartedAt, gs.SuddenDeathNextTickAt, gs.SuddenDeathDamage = 0, 0, 0
	gs.State = GameStateWaiting
	gs.setPlayersActive(false)
	gs.Broadcast("waiting", map[string]interface{}{})
}

func (gs *GameState) startLobby() {
	gs.removeBots()
	gs.LobbyEndsAt = time.Now().Add(LobbyDuration).UnixMilli()
	gs.GameEndsAt = 0
	gs.State = GameStateLobby
	gs.propsClear()
	gs.lunarCratesAdd(LunarCratesCount)
	// Lobby is a live warm-up arena: connected players can move, rotate and
	// inspect the map while waiting. Combat actions remain gated by StateGame.
	gs.setPlayersActive(true)
}

func (gs *GameState) startFinished() {
	gs.LobbyEndsAt = 0
	gs.GameEndsAt = 0
	gs.State = GameStateFinished
	for _, p := range gs.Players {
		p.MoveX, p.MoveY, p.Aiming = 0, 0, false
	}
}

func (gs *GameState) startGame() {
	gs.LobbyEndsAt = 0
	gs.GameEndsAt = time.Now().Add(GameDuration).UnixMilli()
	gs.MatchStartedAt = time.Now().UnixMilli()
	gs.IslandPhase = IslandPhaseHunt
	gs.PhaseStartedAt = gs.MatchStartedAt
	gs.PhaseEndsAt = gs.MatchStartedAt + OpeningCombatDuration.Milliseconds()
	gs.IslandEvent = ""
	gs.IslandVoiceNextAt = make(map[string]int64)
	gs.IslandVoiceKillClaimed = make(map[string]bool)
	gs.StormRadius, gs.StormDamage, gs.StormNextTickAt = 0, 0, 0
	gs.BeaconOpen, gs.BeaconHolder = false, ""
	gs.BeaconHoldStartedAt = make(map[string]int64)
	gs.SuddenDeathStartedAt, gs.SuddenDeathNextTickAt, gs.SuddenDeathDamage = 0, 0, 0
	gs.State = GameStateGame
	gs.fillMissingBots()

	if gs.Mode == ModeTeamDeathmatch {
		gs.setPlayersTeamsRandomly()
	}
	gs.setBotsPositionAtFreeSpawns()
	gs.setPlayersActive(true)
	spawnProtectionUntil := time.Now().Add(SpawnProtectionDuration).UnixMilli()
	for _, p := range gs.Players {
		p.InvulnerableUntil = spawnProtectionUntil
	}
	if len(gs.Props) == 0 {
		gs.lunarCratesAdd(LunarCratesCount)
	}
	gs.monstersAdd(MonstersCount)
	gs.emitIslandVoiceToAll(IslandVoiceTriggerPhase, gs.MatchStartedAt)
	gs.Broadcast("start", map[string]interface{}{})
}

func (gs *GameState) onGameEnd(event *ServerEvent) {
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
	if event != nil {
		if params, ok := event.Params.(map[string]interface{}); ok {
			params["duration"] = duration
		}
	}
	if gs.OnGameEnd != nil {
		var winner string
		if event != nil {
			if w, ok := event.Params.(map[string]interface{}); ok {
				if n, ok := w["name"].(string); ok {
					winner = n
				}
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
	if p == nil {
		return
	}
	if p.ChannelUntil > ts {
		p.MoveX, p.MoveY, p.Ack = 0, 0, ts
		return
	}
	p.Ack = ts
	if math.Hypot(dirX, dirY) <= .01 {
		p.MoveX, p.MoveY = 0, 0
		return
	}
	p.MoveX, p.MoveY = dirX, dirY
	if p.HeroName == "Mandy" && math.Hypot(dirX, dirY) > .01 {
		p.FocusStartedAt, p.FocusCharge = 0, 0
	}
}

func (gs *GameState) updatePlayerMovement() {
	for _, p := range gs.Players {
		if !p.IsAlive() || p.StunUntil > time.Now().UnixMilli() || p.ChannelUntil > time.Now().UnixMilli() || (p.MoveX == 0 && p.MoveY == 0) {
			continue
		}
		speed := p.Speed / 60
		now := time.Now().UnixMilli()
		if p.HasteUntil > now {
			speed *= 1.22
		}
		if p.LunarSpeedUntil > now {
			speed *= 1.15
		}
		if p.LunarSpeedUntil > now {
			speed *= 1.15
		}
		if p.SlowUntil > now {
			multiplier := p.SlowMultiplier
			if multiplier <= 0 {
				multiplier = .45
			}
			speed *= multiplier
		}
		magnitude := math.Hypot(p.MoveX, p.MoveY)
		geometry.MoveCircleWithBlockingWalls(
			&p.CircleBody,
			gs.Walls,
			p.MoveX/magnitude*speed,
			p.MoveY/magnitude*speed,
		)

		clamped := gs.Map.ClampCircle(&p.CircleBody)
		p.X, p.Y = clamped.X, clamped.Y
		gs.collectPickups(p)
	}
}

func worldAngleFromScreen(angle float64) float64 {
	return math.Atan2(math.Sin(angle)/.66, math.Cos(angle))
}

type CombatEvent struct {
	ID           uint64
	Ts           int64
	Kind         string
	CommandID    string
	SourceID     string
	TargetType   string
	TargetID     string
	ProjectileID uint64
	Damage       int
	Accepted     bool
	Resolved     bool
}

func screenAngleFromWorld(angle float64) float64 {
	return math.Atan2(math.Sin(angle)*.66, math.Cos(angle))
}

const attackDirectionSectors = 32

func quantizeAttackAngle(angle float64) float64 {
	step := 2 * math.Pi / attackDirectionSectors
	normalized := math.Mod(angle+2*math.Pi, 2*math.Pi)
	quantized := math.Mod(math.Round(normalized/step)*step, 2*math.Pi)
	if quantized >= math.Pi {
		quantized -= 2 * math.Pi
	}
	return quantized
}

func (gs *GameState) collectPickups(p *player.Player) {
	if p == nil || !gs.CombatEnabled() {
		return
	}
	now := time.Now().UnixMilli()
	for _, pr := range gs.Props {
		if !pr.Active {
			continue
		}
		if geometry.CircleToCircle(&p.CircleBody, &pr.CircleBody) {
			switch pr.Type {
			case "potion-red":
				if !p.IsFullLives() {
					pr.Active = false
					heal := int(math.Min(80, float64(p.MaxLives-p.Lives)))
					p.Lives += heal
					gs.addEffect("heal", p.X, p.Y, 0, 0, 0, 0, 0, 0, "#65ff9c", heal, 520)
				}
			case "power":
				pr.Active = false
				p.PowerCores++
				p.MaxLives += 35
				p.Lives = int(math.Min(float64(p.MaxLives), float64(p.Lives+90)))
				p.DamageMultiplier = math.Min(1.35, 1+float64(p.PowerCores)*.07)
				// Never let a pickup reduce an assassin's native movement speed.
				p.Speed = math.Max(p.Speed, math.Min(p.Speed*1.012, 14.25))
			case "lunar_speed", "lunar_damage", "lunar_shield", "lunar_cooldown":
				pr.Active = false
				switch pr.Type {
				case "lunar_speed":
					p.LunarSpeedUntil = now + 20_000
				case "lunar_damage":
					p.LunarDamageUntil = now + 15_000
				case "lunar_shield":
					p.LunarShield = true
					p.ShieldHP = 300
				case "lunar_cooldown":
					if p.LastPrimaryAt > 5_000 {
						p.LastPrimaryAt -= 5_000
					} else {
						p.LastPrimaryAt = 0
					}
				}
				gs.addEffect("lunar_pickup", p.X, p.Y, 0, 0, 24, 0, 0, 0, lunarLootColor(pr.LootType), 0, 700)
			}
		}
	}
}

func (gs *GameState) playerAbility(id string, ts int64, slot string, clientID ...string) {
	p := gs.Players[id]
	ackID := ""
	if len(clientID) > 0 {
		ackID = clientID[0]
	}
	if len(clientID) > 1 {
		gs.AbilityTargets[id] = clientID[1]
	}
	if p != nil {
		p.LastAbilityID = ackID
		p.LastAbilityOK = false
	}
	if p == nil || !p.IsAlive() || p.StunUntil > ts || !gs.CombatEnabled() {
		return
	}
	primary := slot == "primary"
	last := p.LastSecondaryAt
	cooldown := AbilityCooldownMs(p.HeroName, "secondary")
	if primary {
		last, cooldown = p.LastPrimaryAt, AbilityCooldownMs(p.HeroName, "primary")
	}
	if last != 0 && ts-last < cooldown {
		return
	}
	if !primary {
		switch p.HeroName {
		case "Shadow", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico", "Damian", "Persephone Lumi":
			p.LastAbilityOK = gs.useNewHeroGadget(p, ts)
			if p.LastAbilityOK {
				p.GadgetPulse++
			}
			return
		}
	}
	if p.HeroName == "Mandy" && !primary {
		if p.GadgetCharges <= 0 || p.GadgetArmed {
			return
		}
		p.GadgetCharges--
		p.ShieldUntil = ts + 3000
		p.ChannelUntil = ts + 3000
		p.GadgetArmed = true
		p.GadgetPulse++
		gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: p.PlayerId, Kind: "mandy_stance", X: p.X, Y: p.Y, Radius: 160, CreatedAt: ts, ExpiresAt: ts + 3000, NextTickAt: ts, Triggered: map[string]bool{}})
		p.LastSecondaryAt = ts
		p.LastAbilityOK = true
		return
	}
	if primary && p.SuperCharge < 100 {
		return
	}
	if primary {
		if kit := CombatKitFor(p.HeroName); kit != nil {
			aimDistance := p.AimDistance
			if aimDistance <= 0 {
				aimDistance = kit.AttackRange()
			}
			if !kit.Super(gs, p, ts, p.Rotation, aimDistance) {
				return
			}
			p.LastPrimaryAt = ts
			p.SuperCharge = 0
			if p.HeroName != "Mandy" {
				p.SuperPulse++
			}
			p.RevealedUntil = time.Now().UnixMilli() + 2000
			p.LastAbilityOK = true
			return
		}
	}
	if primary {
		p.LastPrimaryAt = ts
		p.SuperCharge = 0
		p.SuperPulse++
	} else {
		p.LastSecondaryAt = ts
	}
	p.LastAbilityOK = true

	angle := p.Rotation
	gs.addEffect("burst", p.X, p.Y, 0, 0, 95, angle, 0, 0, p.Color, 0, 420)
	switch p.HeroName {
	case "Viper":
		if primary {
			gs.dashAttack(p, angle, 180, 0, 0)
			gs.radialDamage(p.PlayerId, p.X, p.Y, 210, 120)
			gs.addEffect("collapse", p.X, p.Y, 0, 0, 210, angle, 0, 0, "#ff7138", 0, 650)
			gs.DelayedEffects = append(gs.DelayedEffects, &DelayedBattleEffect{Owner: p.PlayerId, X: p.X, Y: p.Y, TriggerAt: ts + 1500})
		} else {
			p.ShieldUntil = ts + 2200
			gs.addEffect("guard", p.X, p.Y, 0, 0, 72, angle, 0, 0, "#ffb15c", 0, 700)
		}
	case "Titan":
		if primary {
			p.StealthUntil = ts + 3200
			p.Dodges = 2
			p.HasteUntil = ts + 3200
		} else {
			for _, spread := range []float64{-.24, 0, .24} {
				gs.spawnAttackBullet(p, angle+spread, "boomerang", 43, 30.5*RuntimeProjectileSpeedScale, 8, 680, 0, false, false)
			}
			gs.addEffect("prism", p.X, p.Y, 0, 0, 0, angle, 220, .32, "#8ffff1", 0, 420)
		}
	case "Shadow":
		if primary {
			p.VineUntil = ts + 4000
			gs.addEffect("vine", p.X, p.Y, 0, 0, 245, angle, 0, 0, "#75d947", 0, 650)
		} else {
			gs.dashAttack(p, angle, 170, 0, 0)
			gs.radialDamage(p.PlayerId, p.X, p.Y, 90, 65)
			gs.addEffect("spore-jump", p.X, p.Y, 0, 0, 90, angle, 0, 0, "#75d947", 0, 500)
		}
	case "Spark":
		if primary {
			p.VortexUntil = ts + 4000
			p.HasteUntil = ts + 4000
			gs.addEffect("vortex", p.X, p.Y, 0, 0, 125, angle, 0, 0, "#9f73ff", 0, 650)
		} else {
			originX, originY := p.X, p.Y
			gs.dashAttack(p, angle, 145, 0, 0)
			gs.hitSector(p, angle, 105, .9, 48, false)
			gs.addEffect("scythe", originX, originY, p.X, p.Y, 0, angle, 190, .9, "#c895ff", 0, 520)
		}
	}
}

func AbilityCooldownMs(heroName, slot string) int64 {
	if slot == "secondary" {
		return 6500
	}
	switch heroName {
	case "Viper":
		return 5800
	case "Titan":
		return 6000
	case "Shadow":
		return 5600
	case "Spark":
		return 5000
	}
	return 6000
}

func (gs *GameState) playerRotate(id string, ts int64, rotation float64, aimDistance ...float64) {
	p := gs.Players[id]
	if p == nil {
		return
	}
	p.Rotation = quantizeAttackAngle(worldAngleFromScreen(rotation))
	if len(aimDistance) > 0 && aimDistance[0] > 0 {
		p.AimDistance = aimDistance[0]
	}
}

func (gs *GameState) playerShoot(id string, ts int64, screenAngle float64, aimDistance ...float64) {
	gs.playerShootWithCommand(id, ts, screenAngle, "", aimDistance...)
}

func (gs *GameState) playerShootWithCommand(id string, ts int64, screenAngle float64, commandID string, aimDistance ...float64) {
	emitResult := func(accepted, resolved bool) {
		gs.emitCombatEvent(CombatEvent{Kind: "attack", CommandID: commandID, SourceID: id, Accepted: accepted, Resolved: resolved})
	}
	p := gs.Players[id]
	if p == nil || !p.IsAlive() || p.StunUntil > ts || p.ChannelUntil > ts || !gs.CombatEnabled() || p.Ammo <= 0 {
		emitResult(false, true)
		return
	}
	delta := ts - p.LastShootAt
	rate := p.AttackRate
	if rate == 0 {
		rate = BulletRate
	}
	if p.LastShootAt != 0 && delta < rate {
		emitResult(false, true)
		return
	}
	previousCommandID, previousSourceID, previousProjectileID := gs.activeCommandID, gs.activeSourceID, gs.activeProjectileID
	previousPending := gs.commandHasProjectile
	gs.activeCommandID, gs.activeSourceID, gs.activeProjectileID = commandID, id, 0
	gs.commandHasProjectile = false
	defer func() {
		resolved := !gs.commandHasProjectile
		gs.activeCommandID, gs.activeSourceID, gs.activeProjectileID = previousCommandID, previousSourceID, previousProjectileID
		gs.commandHasProjectile = previousPending
		emitResult(true, resolved)
	}()
	p.LastShootAt = ts
	p.Ammo--
	if p.NextAmmoAt == 0 {
		p.NextAmmoAt = ts + p.ReloadTime
	}
	angle := quantizeAttackAngle(worldAngleFromScreen(screenAngle))
	p.Rotation = angle
	p.AttackPulse++
	if p.HeroName == "Kaze" && p.StealthUntil > ts {
		p.KazeCritReady = true
	}
	p.StealthUntil = 0
	p.RevealedUntil = time.Now().UnixMilli() + 2000
	if kit := BasicCombatKitFor(p.HeroName); kit != nil {
		distance := kit.AttackRange()
		if len(aimDistance) > 0 && aimDistance[0] > 0 {
			distance = math.Min(distance, aimDistance[0])
		}
		kit.Basic(gs, p, ts, angle, distance)
		return
	}
	/* Legacy fallback for unknown/custom heroes. All configured heroes return above. */
	switch p.AttackType {
	case "shotgun":
		for _, spread := range []float64{-.28, -.14, 0, .14, .28} {
			gs.spawnAttackBullet(p, angle+spread, "pellet", p.AttackDmg, p.BulletSpd, p.BulletSz, 443, 0, false, false)
		}
	case "burst":
		kind, pierce := "laser", 0
		if p.Heat >= 5 {
			kind, pierce = "firebeam", 2
		}
		for _, spread := range []float64{-.035, -.02, -.008, .008, .02, .035} {
			gs.spawnAttackBullet(p, angle+spread, kind, p.AttackDmg, p.BulletSpd, p.BulletSz, 656, pierce, false, false)
		}
	case "slam":
		gs.addEffect("slam", p.X, p.Y, 0, 0, 145, angle, 0, .72, p.Color, 0, 420)
		hits := gs.hitSector(p, angle, 145, .72, p.AttackDmg, false)
		if hits > 0 {
			p.ShieldStacks = int(math.Min(5, float64(p.ShieldStacks+hits)))
			p.ShieldStackUntil = ts + 4000
		}
		for _, target := range gs.Players {
			if target == p || !target.IsAlive() {
				continue
			}
			dx, dy := target.X-p.X, target.Y-p.Y
			delta := math.Atan2(math.Sin(math.Atan2(dy, dx)-angle), math.Cos(math.Atan2(dy, dx)-angle))
			if math.Hypot(dx, dy) <= 145+target.Radius && math.Abs(delta) <= .72 {
				target.SlowUntil = ts + 1200
			}
		}
		if hits == 0 {
			gs.createTemporaryRock(p.X+math.Cos(angle)*92, p.Y+math.Sin(angle)*92, ts+3500)
		}
	case "boomerang":
		var disc *bullet.Bullet
		for _, candidate := range gs.Bullets {
			if candidate.Active && candidate.PlayerId == p.PlayerId && candidate.Kind == "boomerang" {
				disc = candidate
				break
			}
		}
		if disc != nil {
			p.X, p.Y, disc.Active = disc.X, disc.Y, false
			gs.radialDamage(p.PlayerId, p.X, p.Y, 105, 60)
		} else {
			gs.spawnAttackBullet(p, angle, "boomerang", p.AttackDmg, p.BulletSpd, p.BulletSz, 858, 1, false, false)
		}
	case "spore":
		if len(aimDistance) > 0 && aimDistance[0] > 0 && aimDistance[0] < 54 {
			gs.vaultMove(p, angle, 210)
			gs.addEffect("vine", p.X, p.Y, 0, 0, 88, angle, 0, 0, "#b5ff70", 0, 550)
		} else {
			gs.spawnAttackBullet(p, angle, "spore", p.AttackDmg, p.BulletSpd, p.BulletSz, 518, 0, false, false)
		}
	case "dash":
		originX, originY := p.X, p.Y
		gs.dashAttack(p, angle, 135, 0, 0)
		hits := gs.hitSector(p, angle, 135, .95, p.AttackDmg, false)
		gs.addEffect("scythe", originX, originY, p.X, p.Y, 0, angle, 165, .95, p.Color, 0, 420)
		p.Souls = int(math.Min(3, float64(p.Souls+hits)))
		if p.Souls >= 3 {
			p.Souls = 0
			p.Deflect = 1
			gs.radialDamage(p.PlayerId, p.X, p.Y, 105, 60)
			gs.addEffect("spin", p.X, p.Y, 0, 0, 105, 0, 0, 0, "#d9ff8b", 0, 400)
		}
	case "sniper":
		gs.spawnAttackBullet(p, angle, "sniper", p.AttackDmg, p.BulletSpd, p.BulletSz, 1161, 0, false, false)
	case "double_melee":
		if gs.wallAhead(p, angle, 82) {
			gs.vaultMove(p, angle, 155)
			gs.addEffect("thruster", p.X, p.Y, 0, 0, 75, angle, 0, 0, "#7be8ff", 0, 400)
		} else {
			swing := -.18
			if p.AttackPulse%2 == 0 {
				swing = .18
			}
			gs.addEffect("slash", p.X, p.Y, 0, 0, 0, angle+swing, 92, .82, p.Color, 0, 360)
			gs.hitSector(p, angle+swing, 92, .82, p.AttackDmg, false)
		}
	case "quantum":
		b := gs.spawnAttackBullet(p, angle, "quantum", p.AttackDmg, p.BulletSpd, p.BulletSz, 696, 0, false, false)
		if p.Evolution >= 4 {
			b.Kind, b.Pierce, b.Chain, b.Bounces = "chain", 1, 4, 2
			b.Splash = 75
		}
	case "poison_fan":
		for _, spread := range []float64{-.18, 0, .18} {
			gs.spawnAttackBullet(p, angle+spread, "poison", p.AttackDmg, p.BulletSpd, p.BulletSz, 690, 0, false, true)
		}
	default:
		gs.spawnAttackBullet(p, angle, "bolt", p.AttackDmg, p.BulletSpd, p.BulletSz, 700, 0, false, false)
	}
}

func (gs *GameState) spawnAttackBullet(p *player.Player, angle float64, kind string, damage int, speed, size, maxRange float64, pierce int, returning, poison bool) *bullet.Bullet {
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
	b.Kind, b.Damage, b.Speed, b.MaxRange, b.Pierce, b.Returning, b.Poison = kind, int(math.Round(float64(damage)*gs.damageMultiplier(p))), speed, maxRange, pierce, returning, poison
	b.CommandID = gs.activeCommandID
	if gs.activeCommandID != "" {
		gs.commandHasProjectile = true
	}
	if kind == "laser" || kind == "firebeam" {
		b.Acceleration = 21 * RuntimeProjectileSpeedScale
	}
	if kind == "overcharge" {
		b.Acceleration = 19 * RuntimeProjectileSpeedScale
	}
	return b
}

func (gs *GameState) damageMultiplier(p *player.Player) float64 {
	if p == nil {
		return 1
	}
	multiplier := math.Max(1, p.DamageMultiplier)
	if p.LunarDamageUntil > time.Now().UnixMilli() {
		multiplier *= 1.2
	}
	return multiplier
}

func (gs *GameState) chainDamage(owner string, first *player.Player, radius float64, count, damage int) {
	fromX, fromY := first.X, first.Y
	hit := map[string]bool{first.PlayerId: true, owner: true}
	for step := 0; step < count; step++ {
		var best *player.Player
		var bestMonsterID string
		bestDistance := math.MaxFloat64
		for id, target := range gs.Players {
			if hit[id] || !target.IsAlive() {
				continue
			}
			distance := math.Hypot(target.X-fromX, target.Y-fromY)
			if distance <= radius && distance < bestDistance {
				best, bestDistance = target, distance
			}
		}
		for id, target := range gs.Monsters {
			if hit[id] || target == nil || !target.IsAlive() {
				continue
			}
			distance := math.Hypot(target.X-fromX, target.Y-fromY)
			if distance <= radius && distance < bestDistance {
				best, bestMonsterID, bestDistance = nil, id, distance
			}
		}
		if best == nil && bestMonsterID == "" {
			break
		}
		if best != nil {
			gs.dealPlayerDamage(gs.Players[owner], best, damage)
			gs.addEffect("lightning", fromX, fromY, best.X, best.Y, 0, 0, 0, 0, "#65efff", 0, 260)
			hit[best.PlayerId] = true
			fromX, fromY = best.X, best.Y
			continue
		}
		target := gs.Monsters[bestMonsterID]
		gs.damageMonster(bestMonsterID, target, damage)
		gs.addEffect("lightning", fromX, fromY, target.X, target.Y, 0, 0, 0, 0, "#65efff", 0, 260)
		hit[bestMonsterID] = true
		fromX, fromY = target.X, target.Y
	}
}

func (gs *GameState) damageMonster(id string, target *monster.Monster, damage int) bool {
	if target == nil || !target.IsAlive() || damage <= 0 {
		return false
	}
	target.Hurt(damage)
	if gs.activeCommandID != "" {
		gs.emitCombatEvent(CombatEvent{
			Kind: "hit", CommandID: gs.activeCommandID, SourceID: gs.activeSourceID,
			TargetType: "monsters", TargetID: id, ProjectileID: gs.activeProjectileID, Damage: damage,
		})
	}
	if target.IsAlive() {
		return false
	}
	gs.Props = append(gs.Props, prop.NewProp("potion-red", target.X, target.Y, FlaskSize/2))
	delete(gs.Monsters, id)
	return true
}

func (gs *GameState) hitSector(source *player.Player, angle, reach, halfArc float64, damage int, pull bool) int {
	return gs.hitSectorWithDamage(source, angle, reach, halfArc, damage, pull, false)
}

// rollBasicAttackDamage is the single hook for basic-attack damage rolls.
// Basic attacks currently use their authoritative configured damage unchanged;
// keeping the hook deterministic prevents client prediction drift.
func rollBasicAttackDamage(_ *player.Player, damage int) int {
	return damage
}

func (gs *GameState) hitSectorBasic(source *player.Player, angle, reach, halfArc float64, damage int, pull bool) int {
	return gs.hitSectorWithDamage(source, angle, reach, halfArc, damage, pull, true)
}

func (gs *GameState) hitSectorWithDamage(source *player.Player, angle, reach, halfArc float64, damage int, pull, critical bool) int {
	if critical {
		damage = rollBasicAttackDamage(source, damage)
	}
	damage = int(math.Round(float64(damage) * gs.damageMultiplier(source)))
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
		gs.dealPlayerDamage(source, target, damage)
		hits++
		if pull {
			target.X -= math.Cos(angle) * 16
			target.Y -= math.Sin(angle) * 16
		}
	}
	for id, target := range gs.Monsters {
		if target == nil || !target.IsAlive() {
			continue
		}
		dx, dy := target.X-source.X, target.Y-source.Y
		delta := math.Atan2(math.Sin(math.Atan2(dy, dx)-angle), math.Cos(math.Atan2(dy, dx)-angle))
		if math.Hypot(dx, dy) > reach+target.Radius || math.Abs(delta) > halfArc {
			continue
		}
		gs.damageMonster(id, target, damage)
		hits++
		source.SuperCharge = int(math.Min(100, float64(source.SuperCharge+20)))
		gs.addEffect("damage", target.X, target.Y, 0, 0, 0, 0, 0, 0, "#ffe55c", damage, 520)
	}
	for _, crate := range gs.Props {
		if crate == nil || !crate.Active || crate.Type != "lunar_crate" {
			continue
		}
		dx, dy := crate.X-source.X, crate.Y-source.Y
		delta := math.Atan2(math.Sin(math.Atan2(dy, dx)-angle), math.Cos(math.Atan2(dy, dx)-angle))
		if math.Hypot(dx, dy) > reach+crate.Radius || math.Abs(delta) > halfArc {
			continue
		}
		if gs.damageLunarCrate(source, crate, damage) {
			hits++
		}
	}
	return hits
}

func (gs *GameState) damageLunarCrate(source *player.Player, crate *prop.Prop, damage int) bool {
	if crate == nil || !crate.Active || crate.Type != "lunar_crate" {
		return false
	}
	crate.Lives -= int(math.Max(1, float64(damage)))
	gs.addEffect("crate_hit", crate.X, crate.Y, 0, 0, crate.Radius, 0, 0, 0, lunarLootColor(crate.LootType), damage, 260)
	if crate.Lives > 0 {
		return true
	}
	crate.Lives = 0
	crate.Active = false
	reward := prop.NewProp("lunar_"+crate.LootType, crate.X, crate.Y, 16)
	reward.LootType = crate.LootType
	gs.Props = append(gs.Props, reward)
	gs.addEffect("crate_break", crate.X, crate.Y, 0, 0, 34, 0, 0, 0, lunarLootColor(crate.LootType), 0, 650)
	if source != nil {
		source.SuperCharge = int(math.Min(100, float64(source.SuperCharge+5)))
	}
	return true
}

func lunarLootColor(lootType string) string {
	switch lootType {
	case "speed":
		return "#4ea7ff"
	case "damage":
		return "#ff4e57"
	default:
		return "#ffd34e"
	}
}

func (gs *GameState) radialDamage(owner string, x, y, radius float64, damage int) int {
	return gs.radialDamageExcept(owner, x, y, radius, damage, "")
}

func (gs *GameState) radialDamagePercentMaxHP(owner string, x, y, radius, percent float64) int {
	hits := 0
	source := gs.Players[owner]
	for id, target := range gs.Players {
		if id == owner || !target.IsAlive() || (source != nil && source.Team != "" && source.Team == target.Team) || math.Hypot(target.X-x, target.Y-y) > radius+target.Radius {
			continue
		}
		gs.dealPlayerDamage(source, target, int(math.Round(float64(target.MaxLives)*percent)))
		hits++
	}
	return hits
}

func (gs *GameState) radialDamageExcept(owner string, x, y, radius float64, damage int, excludedPlayerID string) int {
	hits := 0
	source := gs.Players[owner]
	for id, target := range gs.Players {
		if id == owner || id == excludedPlayerID || !target.IsAlive() || (source != nil && source.Team != "" && source.Team == target.Team) {
			continue
		}
		if math.Hypot(target.X-x, target.Y-y) <= radius+target.Radius {
			distance := math.Max(1, math.Hypot(target.X-x, target.Y-y))
			target.HitImpulseX, target.HitImpulseY = (target.X-x)/distance, (target.Y-y)/distance
			gs.dealPlayerDamage(source, target, damage)
			hits++
		}
	}
	for id, target := range gs.Monsters {
		if target == nil || !target.IsAlive() || math.Hypot(target.X-x, target.Y-y) > radius+target.Radius {
			continue
		}
		gs.damageMonster(id, target, damage)
		hits++
	}
	return hits
}

func (gs *GameState) radialDamageOnce(owner string, x, y, radius float64, damage int, hit map[string]bool) int {
	hits := 0
	source := gs.Players[owner]
	for id, target := range gs.Players {
		key := "player:" + id
		if hit[key] || id == owner || !target.IsAlive() || (source != nil && source.Team != "" && source.Team == target.Team) || math.Hypot(target.X-x, target.Y-y) > radius+target.Radius {
			continue
		}
		distance := math.Max(1, math.Hypot(target.X-x, target.Y-y))
		target.HitImpulseX, target.HitImpulseY = (target.X-x)/distance, (target.Y-y)/distance
		if gs.dealPlayerDamage(source, target, damage) > 0 {
			hit[key] = true
			hits++
		}
	}
	for id, target := range gs.Monsters {
		key := "monster:" + id
		if hit[key] || target == nil || !target.IsAlive() || math.Hypot(target.X-x, target.Y-y) > radius+target.Radius {
			continue
		}
		gs.damageMonster(id, target, damage)
		hit[key] = true
		hits++
	}
	return hits
}

func (gs *GameState) awardSuperFromDamage(source *player.Player, damage int) {
	if source == nil || damage <= 0 || source.SuperCharge >= 100 {
		return
	}
	// 4000 actual PvP damage fills the meter. Carry preserves strict
	// proportionality even when individual hits are smaller than one point.
	source.SuperChargeCarry += float64(damage) / 40.0
	gained := int(source.SuperChargeCarry)
	if gained <= 0 {
		return
	}
	source.SuperCharge = int(math.Min(100, float64(source.SuperCharge+gained)))
	source.SuperChargeCarry -= float64(gained)
}

func (gs *GameState) destroyWallsInRadius(x, y, radius float64) int {
	kept := gs.Map.Collisions[:0]
	destroyed := 0
	for _, wall := range gs.Map.Collisions {
		centerX, centerY := (wall.MinX+wall.MaxX)/2, (wall.MinY+wall.MaxY)/2
		if isDestructibleWall(wall.Type) && math.Hypot(centerX-x, centerY-y) <= radius+TileSize*.7 {
			destroyed++
			continue
		}
		kept = append(kept, wall)
	}
	if destroyed > 0 {
		gs.Map.Collisions = kept
		gs.MapRevision++
		gs.Walls = geometry.NewSpatialHash(TileSize)
		for _, wall := range kept {
			gs.Walls.Insert(wall)
		}
	}
	return destroyed
}

func isDestructibleWall(wallType string) bool {
	return wallType == "destructible" || wallType == "dead_tree"
}

func (gs *GameState) createTemporaryRock(x, y float64, expiresAt int64) {
	const size = 38.0
	wall := &geometry.WallTile{MinX: x - size/2, MinY: y - size/2, MaxX: x + size/2, MaxY: y + size/2, Type: "temporary-rock"}
	gs.Map.Collisions = append(gs.Map.Collisions, wall)
	gs.Walls.Insert(wall)
	gs.TemporaryWalls[wall] = expiresAt
	gs.MapRevision++
	gs.addEffect("rock", x, y, 0, 0, 58, 0, 0, 0, "#b87447", 0, 450)
}

func (gs *GameState) updateTemporaryWalls() {
	if len(gs.TemporaryWalls) == 0 {
		return
	}
	now, changed := time.Now().UnixMilli(), false
	for wall, expiresAt := range gs.TemporaryWalls {
		if expiresAt <= now {
			delete(gs.TemporaryWalls, wall)
			changed = true
		}
	}
	if !changed {
		return
	}
	kept := gs.Map.Collisions[:0]
	for _, wall := range gs.Map.Collisions {
		if wall.Type == "temporary-rock" {
			if _, active := gs.TemporaryWalls[wall]; !active {
				continue
			}
		}
		kept = append(kept, wall)
	}
	gs.Map.Collisions = kept
	gs.MapRevision++
	gs.Walls = geometry.NewSpatialHash(TileSize)
	for _, wall := range kept {
		gs.Walls.Insert(wall)
	}
}

func (gs *GameState) dashAttack(p *player.Player, angle, distance, radius float64, damage int) {
	steps := 5
	for step := 0; step < steps; step++ {
		geometry.MoveCircleWithBlockingWalls(
			&p.CircleBody,
			gs.Walls,
			math.Cos(angle)*distance/float64(steps),
			math.Sin(angle)*distance/float64(steps),
		)
		gs.hitSector(p, angle, radius, math.Pi, damage, false)
	}
}

func (gs *GameState) vaultMove(p *player.Player, angle, distance float64) {
	geometry.MoveCircleWithBlockingWalls(
		&p.CircleBody,
		gs.Walls,
		math.Cos(angle)*distance,
		math.Sin(angle)*distance,
	)
	clamped := gs.Map.ClampCircle(&p.CircleBody)
	p.X, p.Y = clamped.X, clamped.Y
}

func (gs *GameState) wallAhead(p *player.Player, angle, distance float64) bool {
	body := geometry.CircleBody{X: p.X + math.Cos(angle)*distance, Y: p.Y + math.Sin(angle)*distance, Radius: p.Radius}
	return geometry.CollidesCircleWithBlockingWalls(&body, gs.Walls)
}

func (gs *GameState) closestWallPoint(p *player.Player, angle, maxDistance float64) (float64, float64, bool) {
	bestDistance := math.MaxFloat64
	bestX, bestY := 0.0, 0.0
	for _, wall := range gs.Map.Collisions {
		if wall == nil || !geometry.IsBlockingWall(wall.Type) {
			continue
		}
		probeX, probeY := p.X+math.Cos(angle)*maxDistance, p.Y+math.Sin(angle)*maxDistance
		x := math.Max(wall.MinX, math.Min(wall.MaxX, probeX))
		y := math.Max(wall.MinY, math.Min(wall.MaxY, probeY))
		distance := math.Hypot(x-p.X, y-p.Y)
		if distance > maxDistance || distance >= bestDistance {
			continue
		}
		bestDistance = distance
		travel := math.Max(0, distance-p.Radius-4)
		bestX, bestY = p.X+math.Cos(angle)*travel, p.Y+math.Sin(angle)*travel
	}
	return bestX, bestY, bestDistance < math.MaxFloat64
}

func (gs *GameState) setPlayersActive(active bool) {
	for _, p := range gs.Players {
		if active {
			p.Lives = p.MaxLives
			p.Kills = 0
			p.SuperCharge = 0
			p.FocusStartedAt, p.FocusCharge = 0, 0
			p.GadgetArmed, p.GadgetCharges = false, 3
			p.Ammo = p.MaxAmmo
			p.NextAmmoAt = 0
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
	// Reserve the first four arena spawns for combatants and the remainder for
	// monsters. Humans are ordered first so reconnects do not reshuffle them.
	sort.SliceStable(players, func(i, j int) bool {
		if players[i].IsBot != players[j].IsBot {
			return !players[i].IsBot
		}
		return players[i].PlayerId < players[j].PlayerId
	})
	for index, p := range players {
		spawner := gs.Map.GetRandomSpawner()
		if index < len(gs.Map.Spawners) && index < 4 {
			spawner = gs.Map.Spawners[index]
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

func (gs *GameState) finishBattleIfDecided() bool {
	if gs.State != GameStateGame || len(gs.Players) <= 1 {
		return false
	}

	winner := ""
	switch gs.Mode {
	case ModeDeathmatch:
		if gs.IslandPhase != IslandPhaseBeacon {
			return false
		}
		if player := gs.beaconWinner(time.Now().UnixMilli()); player != nil {
			winner = player.Name
		}
	case ModeTeamDeathmatch:
		team := gs.getWinningTeam()
		if team == "" {
			return false
		}
		winner = team + " team"
	default:
		return false
	}
	if winner == "" {
		return false
	}

	gs.onGameEnd(&ServerEvent{
		Type:   "won",
		Params: map[string]interface{}{"name": winner},
	})
	gs.startFinished()
	return true
}

func (gs *GameState) getWinningPlayer() *player.Player {
	for _, p := range gs.Players {
		if p.IsAlive() {
			return p
		}
	}
	return nil
}

func (gs *GameState) getTimeoutWinner() string {
	if gs.Mode == ModeTeamDeathmatch {
		teamLives := map[string]int{"Red": 0, "Blue": 0}
		for _, p := range gs.Players {
			teamLives[p.Team] += p.Lives
		}
		if teamLives["Red"] == teamLives["Blue"] {
			return ""
		}
		if teamLives["Red"] > teamLives["Blue"] {
			return "Red team"
		}
		return "Blue team"
	}

	var winner *player.Player
	tied := false
	for _, candidate := range gs.Players {
		if winner == nil || candidate.Lives > winner.Lives {
			winner = candidate
			tied = false
		} else if candidate.Lives == winner.Lives {
			tied = true
		}
	}
	if winner == nil || tied {
		return ""
	}
	return winner.Name
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
	if blueAlive {
		return "Blue"
	}
	return ""
}

func (gs *GameState) monstersAdd(count int) {
	candidates := make([][2]float64, 0, len(gs.Map.Spawners)+1)
	candidates = append(candidates, [2]float64{gs.Map.WidthInPixels / 2, gs.Map.HeightInPixels / 2})
	for _, spawn := range gs.Map.Spawners {
		candidates = append(candidates, [2]float64{spawn.CenterX(), spawn.CenterY()})
	}
	placed := make([][2]float64, 0, count)
	for i := 0; i < count; i++ {
		tier := 1
		if i == 0 {
			tier = 2
		}
		bestIndex, bestDistance := 0, -1.0
		for index, point := range candidates {
			nearest := math.MaxFloat64
			for _, p := range gs.Players {
				if d := math.Hypot(point[0]-p.X, point[1]-p.Y); d < nearest {
					nearest = d
				}
			}
			for _, other := range placed {
				if d := math.Hypot(point[0]-other[0], point[1]-other[1]); d < nearest {
					nearest = d
				}
			}
			if nearest > bestDistance {
				bestIndex, bestDistance = index, nearest
			}
		}
		x, y := candidates[bestIndex][0], candidates[bestIndex][1]
		placed = append(placed, candidates[bestIndex])
		candidates = append(candidates[:bestIndex], candidates[bestIndex+1:]...)
		lives := monster.MonsterLives
		if tier == 2 {
			lives = monster.EliteMonsterLives
		}
		m := monster.NewMonster(x, y, PlayerSize/2, gs.Map.WidthInPixels, gs.Map.HeightInPixels, lives)
		m.Tier, m.MaxLives = tier, lives
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

var lunarLootTypes = []string{"speed", "damage", "shield", "cooldown"}

func (gs *GameState) lunarCratesAdd(count int) {
	if gs.Map == nil {
		return
	}
	for i := 0; i < count; i++ {
		const radius = 22.0
		placed := false
		for attempt := 0; attempt < 80 && !placed; attempt++ {
			x := geometry.GetRandomFloat(float64(TileSize)+radius, gs.Map.WidthInPixels-float64(TileSize)-radius)
			y := geometry.GetRandomFloat(float64(TileSize)+radius, gs.Map.HeightInPixels-float64(TileSize)-radius)
			candidate := &geometry.CircleBody{X: x, Y: y, Radius: radius}
			if geometry.CollidesCircleWithBlockingWalls(candidate, gs.Walls) {
				continue
			}
			tooClose := false
			for _, p := range gs.Players {
				if p != nil && math.Hypot(p.X-x, p.Y-y) < 100 {
					tooClose = true
					break
				}
			}
			if tooClose {
				continue
			}
			for _, existing := range gs.Props {
				if existing != nil && existing.Active && math.Hypot(existing.X-x, existing.Y-y) < radius*3 {
					tooClose = true
					break
				}
			}
			if tooClose {
				continue
			}
			lootType := lunarLootTypes[i%len(lunarLootTypes)]
			if i > 0 {
				lootType = lunarLootTypes[geometry.GetRandomInt(0, len(lunarLootTypes)-1)]
			}
			gs.Props = append(gs.Props, prop.NewLunarCrate(x, y, lootType))
			placed = true
		}
	}
}

func (gs *GameState) propsClear() {
	gs.Props = make([]*prop.Prop, 0)
}
