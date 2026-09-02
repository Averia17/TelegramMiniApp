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

const (
	regenerationCooldown              = 3 * time.Second
	regenerationInterval              = 2 * time.Second
	regenerationPulsePercent          = 0.15
	regenerationConcealedPulsePercent = 0.25
	regenerationBaselineRate          = 0.01
	teamBaseRegenerationPercent       = 0.01
	healWindowGap                     = 2 * time.Second
	teamBaseSemicircleRadius          = 10.5 * TileSize
	teamBaseSemicircleEntrance        = 4.5 * TileSize
)

func InitGameState(gs *GameState) {
	InitGameStateWithDependencies(gs, GameDependencies{})
}

func (gs *GameState) nowMs() int64 {
	if gs != nil && gs.clockNow != nil {
		return gs.clockNow()
	}
	return time.Now().UnixMilli()
}

func InitGameStateWithDependencies(gs *GameState, dependencies GameDependencies) {
	if gs == nil {
		return
	}
	gs.Mode = NormalizeGameMode(gs.Mode)
	if dependencies.MapProvider == nil {
		dependencies.MapProvider = DefaultMapProvider{}
	}
	if dependencies.HeroCatalog == nil {
		dependencies.HeroCatalog = DefaultHeroCatalog()
	}
	if dependencies.Combat == nil {
		dependencies.Combat = defaultCombatRegistry
	}
	if dependencies.Rules == nil {
		dependencies.Rules = NewMatchRules(gs.Mode)
	}
	if gs.Broadcast == nil {
		gs.Broadcast = func(string, interface{}) {}
	}
	if gs.SendToPlayer == nil {
		gs.SendToPlayer = func(string, string, interface{}) {}
	}
	gs.mapProvider = dependencies.MapProvider
	gs.heroCatalog = dependencies.HeroCatalog
	gs.combatRegistry = dependencies.Combat
	gs.rules = dependencies.Rules
	gs.Players = make(map[string]*player.Player)
	gs.Monsters = make(map[string]*monster.Monster)
	gs.MonsterRespawns = make(map[string]MonsterRespawn)
	gs.Bullets = make([]*bullet.Bullet, 0)
	gs.Props = make([]*prop.Prop, 0)
	gs.Actions = make([]Action, 0)
	gs.Effects = make([]*BattleEffect, 0)
	gs.DelayedEffects = make([]*DelayedBattleEffect, 0)
	gs.ScheduledShots = make([]*ScheduledShot, 0)
	gs.DamageZones = make([]*DamageZone, 0)
	gs.MonsterZones = make([]*MonsterZone, 0)
	gs.PendingMandySupers = make([]*PendingMandySuper, 0)
	gs.HeroZones = make([]*HeroZone, 0)
	gs.KattyPaintStacks = make(map[string]map[string]int)
	gs.KattyPaintUntil = make(map[string]map[string]int64)
	gs.LightMarkedUntil = make(map[string]int64)
	gs.AbilityTargets = make(map[string]string)
	gs.LightningStrikes = make([]*LightningStrike, 0)
	gs.Skyfalls = make([]*Skyfall, 0)
	gs.TemporaryWalls = make(map[*geometry.WallTile]int64)
	gs.BotMemory = make(map[string]*BotPerception)
	gs.botMLTrajectory = nil
	gs.resetBotAIMetrics()
	gs.resetBatLifecycleMetrics()
	gs.botAI = newBotAIStrategy(gs.Mode)
	gs.IslandVoiceNextAt = make(map[string]int64)
	gs.IslandVoiceKillClaimed = make(map[string]bool)
	gs.CombatEvents = make([]CombatEvent, 0)
	gs.abilityResolutions = make(map[string]*abilityResolution)
	gs.BeaconHoldStartedAt = make(map[string]int64)
	gs.MapRevision = 0
	gs.botWallCacheRevision = -1
	gs.botWallCache = nil
	gs.botTerrainCacheRevision = -1
	gs.botTerrainCache = nil

	m, err := gs.mapProvider.LoadMap(gs.MapName)
	if err != nil {
		fmt.Printf("Error loading map: %v\n", err)
		m = &gamemap.GameMap{WidthInPixels: 512, HeightInPixels: 512}
	}
	gs.Map = m

	gs.Walls = geometry.NewSpatialHash(float64(TileSize))
	for _, wall := range m.Collisions {
		gs.Walls.Insert(wall)
	}
	gs.WallsSource = m.Collisions
	gs.initializeTeamObjectives()

	gs.State = GameStateWaiting
	gs.LobbyEndsAt = 0
}

func (gs *GameState) Update() {
	gs.updateWithDelta(time.Second / 60)
}

// UpdateWithDelta keeps movement tied to elapsed wall-clock time when the
// room loop misses a tick. The rest of the simulation remains on its existing
// 60 Hz cadence, while movement no longer slows down under server load.
func (gs *GameState) UpdateWithDelta(elapsed time.Duration) {
	if elapsed <= 0 {
		elapsed = time.Second / 60
	}
	gs.updateWithDelta(elapsed)
}

func (gs *GameState) updateWithDelta(elapsed time.Duration) {
	wasLobby := gs.State == GameStateLobby
	gs.updateGame()
	if wasLobby && gs.State == GameStateGame {
		// Actions are queued by the transport while the lobby is still live, but
		// updateGame transitions to the battle before updatePlayers consumes that
		// queue. Never replay a pre-start command from the lobby after the player
		// has been teleported to the authoritative team spawn.
		kept := gs.Actions[:0]
		for _, action := range gs.Actions {
			if action.Ts >= gs.MatchStartedAt {
				kept = append(kept, action)
			}
		}
		gs.Actions = kept
	}
	nominalStep := time.Second / 60
	currentStep := elapsed
	if currentStep <= 0 {
		currentStep = nominalStep
	}
	if elapsed > nominalStep {
		// The input actions were received during the delayed interval. Let the
		// direction that was active at the last tick cover the missed time,
		// then apply the newest direction for one normal simulation step. This
		// prevents a fresh turn from being replayed retroactively across the
		// whole server stall.
		gs.updatePlayerMovement(elapsed - nominalStep)
		currentStep = nominalStep
	}
	gs.updatePlayers()
	gs.updatePlayerMovement(currentStep)
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
	gs.updateMonsterZones()
	gs.updateBullets()
	now := gs.nowMs()
	gs.updateAbilityResolutions(now)
	gs.expireProps(now)
	gs.updateTeamObjectivesAt(now)
	gs.updateTeamRespawns(now)
	gs.expireEffects()
	gs.pruneCombatEvents(now)
}

func (gs *GameState) emitCombatEvent(event CombatEvent) {
	if event.CommandID == "" {
		return
	}
	if event.MatchID == "" {
		event.MatchID = gs.MatchID
		if event.MatchID == "" {
			event.MatchID = gs.RoomName
		}
	}
	if event.Hero == "" {
		if source := gs.Players[event.SourceID]; source != nil {
			event.Hero = source.HeroName
		}
	}
	if event.EffectiveDamage == 0 && event.Damage > 0 {
		event.EffectiveDamage = event.Damage
	}
	if event.Distance == 0 {
		if source := gs.Players[event.SourceID]; source != nil {
			var targetX, targetY float64
			found := false
			switch event.TargetType {
			case "players":
				if target := gs.Players[event.TargetID]; target != nil {
					targetX, targetY, found = target.X, target.Y, true
				}
			case "monsters":
				if target := gs.Monsters[event.TargetID]; target != nil {
					targetX, targetY, found = target.X, target.Y, true
				}
			case "objectives":
				if target := gs.Objectives[event.TargetID]; target != nil {
					targetX, targetY, found = target.X, target.Y, true
				}
			}
			if found {
				event.Distance = math.Hypot(targetX-source.X, targetY-source.Y)
			}
		}
	}
	if event.Phase == "" {
		switch event.Kind {
		case "hit":
			event.Phase = "impact"
		case "ability":
			if event.Accepted {
				event.Phase = "accepted"
			} else {
				event.Phase = "rejected"
			}
		default:
			event.Phase = "command"
		}
	}
	gs.NextCombatEventID++
	event.ID = gs.NextCombatEventID
	event.Ts = gs.nowMs()
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
	gs.updateRegenerationAt(gs.nowMs())
}

func (gs *GameState) updateRegenerationAt(now int64) {
	if gs.State != GameStateGame {
		return
	}
	for _, p := range gs.Players {
		if gs.isInOwnBaseSemicircle(p) {
			gs.updateBaseRegenerationAt(p, now)
			continue
		}
		if hasActiveHostileStatus(p, now) {
			p.InterruptRegenerationAt(now)
		}
		if !p.IsAlive() || p.IsFullLives() || p.RegenRate <= 0 || now-p.LastDamageAt < regenerationCooldown.Milliseconds() {
			continue
		}
		if !gs.isInConcealment(p) && gs.isPursued(p, now) {
			continue
		}
		if p.LastRegenAt > 0 && now-p.LastRegenAt < regenerationInterval.Milliseconds() {
			continue
		}
		pulsePercent := heroRegenerationPulsePercent(p, gs.isInConcealment(p) && gs.isConcealed(p))
		p.RegenCarry += float64(p.MaxLives) * pulsePercent
		heal := int(p.RegenCarry)
		if heal > 0 {
			applied := gs.healPlayerAt(p, heal, now)
			p.RegenCarry -= float64(applied)
		}
		p.LastRegenAt = now
	}
}

func heroRegenerationPulsePercent(p *player.Player, concealed bool) float64 {
	if p == nil || p.RegenRate <= 0 {
		return 0
	}
	pulsePercent := regenerationPulsePercent
	if concealed {
		pulsePercent = regenerationConcealedPulsePercent
	}
	return pulsePercent * p.RegenRate / regenerationBaselineRate
}

func (gs *GameState) updateBaseRegenerationAt(p *player.Player, now int64) {
	if p == nil || !p.IsAlive() || p.IsFullLives() {
		return
	}
	if p.LastRegenAt <= 0 {
		p.LastRegenAt = now
		return
	}
	elapsed := now - p.LastRegenAt
	if elapsed <= 0 {
		return
	}
	p.RegenCarry += float64(p.MaxLives) * teamBaseRegenerationPercent * float64(elapsed) / float64(time.Second/time.Millisecond)
	heal := int(p.RegenCarry)
	if heal > 0 {
		applied := gs.healPlayerAt(p, heal, now)
		p.RegenCarry -= float64(applied)
	}
	p.LastRegenAt = now
}

// healPlayerAt is the authoritative healing gate. Abilities and pickups should
// call it instead of writing Lives directly, so anti-heal remains consistent
// across passive regeneration, zones, projectiles and gadgets.
func (gs *GameState) healPlayerAt(target *player.Player, amount int, now int64) int {
	if target == nil || amount <= 0 || !target.IsAlive() || target.Lives >= target.MaxLives {
		return 0
	}
	multiplier := 1.0
	antiHealApplied := false
	if target.AntiHealUntil > now {
		antiHealApplied = true
		multiplier = target.AntiHealMultiplier
		if multiplier <= 0 || multiplier > 1 {
			multiplier = .5
		}
	}
	adjusted := int(math.Floor(float64(amount) * multiplier))
	if adjusted == 0 {
		adjusted = 1
	}
	if antiHealApplied && adjusted < amount {
		target.HealingBlocked += amount - adjusted
	}
	missing := target.MaxLives - target.Lives
	if adjusted > missing {
		adjusted = missing
	}
	target.Lives += adjusted
	if target.LastEffectiveHealAt > 0 && now > target.LastEffectiveHealAt && now-target.LastEffectiveHealAt <= healWindowGap.Milliseconds() {
		target.HealWindowMs += now - target.LastEffectiveHealAt
	}
	target.LastEffectiveHealAt = now
	return adjusted
}

func (gs *GameState) isInOwnBaseSemicircle(source *player.Player) bool {
	if gs == nil || gs.Mode != ModeTeamDeathmatch || gs.Map == nil || source == nil || source.Team == "" {
		return false
	}
	var ownHall, enemyHall *gamemap.MapObjective
	for index := range gs.Map.Objectives {
		objective := &gs.Map.Objectives[index]
		if objective.Type != "town_hall" {
			continue
		}
		if objective.Team == source.Team {
			ownHall = objective
		} else if enemyHall == nil {
			enemyHall = objective
		}
	}
	if ownHall == nil || enemyHall == nil {
		return false
	}
	directionX, directionY := enemyHall.X-ownHall.X, enemyHall.Y-ownHall.Y
	directionLength := math.Hypot(directionX, directionY)
	if directionLength == 0 {
		return false
	}
	directionX, directionY = directionX/directionLength, directionY/directionLength
	relativeX, relativeY := source.X-ownHall.X, source.Y-ownHall.Y
	return math.Hypot(relativeX, relativeY) <= teamBaseSemicircleRadius &&
		relativeX*directionX+relativeY*directionY <= teamBaseSemicircleEntrance
}

func hasActiveHostileStatus(p *player.Player, now int64) bool {
	return p != nil && (p.SlowUntil > now || p.StunUntil > now || p.BlindUntil > now ||
		p.VineUntil > now || p.VortexUntil > now || p.PoisonUntil > now)
}

func (gs *GameState) isConcealed(source *player.Player) bool {
	sourceBushGroup, sourceInBush := gs.bushGroupAt(source.X, source.Y)
	if !sourceInBush {
		return false
	}
	for _, target := range gs.Players {
		if target == source || !target.IsAlive() || (source.Team != "" && source.Team == target.Team) {
			continue
		}
		targetBushGroup, targetInBush := gs.bushGroupAt(target.X, target.Y)
		sameBushGroup := targetInBush && targetBushGroup == sourceBushGroup
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
	_, inConcealment := gs.bushGroupAt(source.X, source.Y)
	return inConcealment
}

func (gs *GameState) isPursued(source *player.Player, now int64) bool {
	if source == nil || !source.IsAlive() {
		return false
	}
	for _, hunter := range gs.Players {
		if hunter == nil || hunter == source || !hunter.IsAlive() ||
			(source.Team != "" && source.Team == hunter.Team) {
			continue
		}
		if gs.botCanSee(hunter, source, now) {
			return true
		}
	}
	return false
}

func sameWallSource(current, indexed []*geometry.WallTile) bool {
	if len(current) != len(indexed) {
		return false
	}
	if len(current) == 0 {
		return true
	}
	return &current[0] == &indexed[0]
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
		if gs.LobbyEndsAt < gs.nowMs() {
			gs.startGame()
		}
	case GameStateGame:
		if len(gs.Players) == 0 {
			gs.onGameEnd(nil)
			gs.startWaiting()
			return
		}
		if gs.Mode != ModeTeamDeathmatch {
			gs.updateIsland(gs.nowMs())
		}
		if gs.finishBattleIfDecided() {
			return
		}
		if gs.GameEndsAt < gs.nowMs() {
			winner := gs.getTimeoutWinner()
			gs.setWinnerPlayerID(winner)
			gs.EndReason = resultReason(gs.matchRules(), gs, winner, true)
			gs.onGameEnd(&ServerEvent{
				Type:   "timeout",
				Params: map[string]interface{}{"name": winner, "winnerId": gs.WinnerPlayerID, "reason": gs.EndReason, "draw": winner == ""},
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
				gs.playerShootWithMode(action.PlayerId, gs.nowMs(), angle, v.ClientID, v.AutoAim, v.AimDistance)
			}
		case "ability":
			if v, ok := action.Value.(*AbilityValue); ok {
				if v.AimProvided {
					gs.playerRotate(action.PlayerId, gs.nowMs(), v.AimAngle, v.AimDistance)
				}
				gs.playerAbility(action.PlayerId, gs.nowMs(), v.Slot, v.ClientID, v.TargetID)
			}
		case "ability_cancel":
			if v, ok := action.Value.(*AbilityCancelValue); ok {
				gs.playerAbilityCancel(action.PlayerId, gs.nowMs(), v.ClientID, v.TargetClientID)
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
	now := gs.nowMs()
	gs.updateMonsterRespawns(now)
	index := 0
	for monsterID, m := range gs.Monsters {
		if m == nil || !m.IsAlive() {
			continue
		}
		if m.ReturningHome {
			gs.moveMonsterHome(monsterID, m)
			continue
		}
		if m.State == monster.MonsterRecovery {
			m.MoveX, m.MoveY, m.MoveScale = 0, 0, 0
			if now < m.RecoveryUntil {
				continue
			}
			m.State = monster.MonsterChase
			m.RecoveryUntil = 0
		}
		if m.State == monster.MonsterNotice {
			target := gs.Players[m.TargetPlayerId]
			chaseDistance := math.Hypot(m.X-m.SpawnX, m.Y-m.SpawnY)
			if target == nil || !target.IsAlive() || !gs.monsterCanSeePlayer(m, target) || chaseDistance > monster.MonsterChaseLeash {
				gs.recordBatNoticeCancel()
				m.State = monster.MonsterIdle
				m.TargetPlayerId = ""
				m.NoticeUntil = 0
				m.ReturningHome = true
				m.IgnorePlayersUntil = now + monster.MonsterLostTargetDelay
				gs.moveMonster(monsterID, m, 0, 0, monster.MonsterChasePace+float64(m.Tier)*12)
				continue
			}
			if now < m.NoticeUntil {
				m.MoveX, m.MoveY, m.MoveScale = 0, 0, 0
				continue
			}
			m.State = monster.MonsterChase
			m.NoticeUntil = 0
		}
		if m.State == monster.MonsterWindup {
			target := gs.Players[m.TargetPlayerId]
			profile := monster.ProfileForKind(m.Kind, m.Tier)
			if target == nil || !target.IsAlive() || !gs.monsterCanSeePlayer(m, target) || (m.Kind == monster.MonsterBat && math.Hypot(target.X-m.X, target.Y-m.Y) > profile.Range+16) {
				m.State = monster.MonsterChase
				m.AttackWindupUntil = 0
				continue
			}
			if now < m.AttackWindupUntil {
				m.MoveX, m.MoveY, m.MoveScale = 0, 0, 0
				continue
			}
			m.State = monster.MonsterChase
			m.AttackWindupUntil = 0
			m.LastAttackAt = now
			if m.Kind == monster.MonsterAshHound {
				gs.resolveAshHoundAttack(monsterID, m, target, profile, now)
				continue
			}
			if m.Kind == monster.MonsterRootGuardian {
				gs.resolveRootGuardianAttack(monsterID, m, target, profile, now)
				continue
			}
			gs.recordBatStrike()
			gs.applyDamage(target, profile.Damage)
			if !target.IsAlive() {
				gs.Broadcast("killed", map[string]interface{}{
					"killerName": monsterDisplayName(m.Kind),
					"killedName": target.Name,
					"killedId":   target.PlayerId,
				})
				if gs.OnPlayerKilled != nil {
					gs.OnPlayerKilled(target.PlayerId, monsterDisplayName(m.Kind))
				}
				gs.finishBattleIfDecided()
			}
			continue
		}
		var target *player.Player
		if m.TargetPlayerId != "" {
			target = gs.Players[m.TargetPlayerId]
			chaseDistance := math.Hypot(m.X-m.SpawnX, m.Y-m.SpawnY)
			if target == nil || !gs.monsterCanSeePlayer(m, target) || chaseDistance > monster.MonsterChaseLeash {
				m.State = monster.MonsterIdle
				m.TargetPlayerId = ""
				m.ReturningHome = true
				m.IgnorePlayersUntil = now + monster.MonsterLostTargetDelay
				gs.moveMonster(monsterID, m, 0, 0, monster.MonsterChasePace+float64(m.Tier)*12)
				continue
			}
		} else if now >= m.IgnorePlayersUntil {
			target = gs.closestVisibleMonsterPlayer(m)
			if target != nil {
				gs.recordBatNoticeStart()
				m.State = monster.MonsterNotice
				m.TargetPlayerId = target.PlayerId
				m.ChaseOriginX, m.ChaseOriginY = m.X, m.Y
				m.NoticeUntil = now + monster.MonsterNoticeDuration
				m.MoveX, m.MoveY, m.MoveScale = 0, 0, 0
				continue
			}
		}
		if target == nil {
			if m.State != monster.MonsterPatrol {
				m.State = monster.MonsterPatrol
				m.LastActionAt = now
				m.Rotation = math.Atan2(m.Y-m.SpawnY, m.X-m.SpawnX) + math.Pi/2
			} else if now-m.LastActionAt >= int64(monster.MonsterPatrolDurationMax) {
				m.LastActionAt = now
				m.Rotation += math.Pi / 2
			}
			gs.moveMonster(monsterID, m, math.Cos(m.Rotation), math.Sin(m.Rotation), monster.MonsterSpeedPatrol*monster.MonsterChasePace)
			continue
		}
		closest := math.Hypot(target.X-m.X, target.Y-m.Y)
		angle := math.Atan2(target.Y-m.Y, target.X-m.X)
		if closest < monster.MonsterSight && closest >= 50 {
			pace := monster.MonsterChasePace + float64(m.Tier)*12 + float64(index)
			gs.moveMonster(monsterID, m, math.Cos(angle), math.Sin(angle), pace)
		} else {
			gs.moveMonster(monsterID, m, 0, 0, monster.MonsterChasePace+float64(m.Tier)*12+float64(index))
		}
		profile := monster.ProfileForKind(m.Kind, m.Tier)
		if closest < profile.Range && now-m.LastAttackAt >= profile.CooldownMs {
			if m.Kind == monster.MonsterBat {
				gs.recordBatWindupStart()
			}
			m.State = monster.MonsterWindup
			m.AttackWindupUntil = now + profile.WindupMs
			m.AttackOriginX, m.AttackOriginY = m.X, m.Y
			m.AttackTargetX, m.AttackTargetY = target.X, target.Y
			m.MoveX, m.MoveY, m.MoveScale = 0, 0, 0
			gs.addMonsterEffect(monsterID, profile.Telegraph, m.X, m.Y, target.X, target.Y, m.Radius+10, profile.Color, profile.WindupMs)
		}
		index++
	}
}

func monsterDisplayName(kind monster.MonsterKind) string {
	switch kind {
	case monster.MonsterAshHound:
		return "An ash hound"
	case monster.MonsterRootGuardian:
		return "A root guardian"
	default:
		return "A bat"
	}
}

func (gs *GameState) addMonsterEffect(sourceID, kind string, x, y, toX, toY, radius float64, color string, duration int64) *BattleEffect {
	effect := gs.addEffect(kind, x, y, toX, toY, radius, 0, math.Hypot(toX-x, toY-y), 0, color, 0, duration)
	effect.SourceID = sourceID
	effect.AbilitySlot = "monster"
	return effect
}

func (gs *GameState) resolveAshHoundAttack(id string, m *monster.Monster, target *player.Player, profile monster.AttackProfile, now int64) {
	hit := distanceToSegment(target.X, target.Y, m.AttackOriginX, m.AttackOriginY, m.AttackTargetX, m.AttackTargetY) <= target.Radius+m.Radius+18
	if hit {
		gs.applyDamage(target, profile.Damage)
		gs.addMonsterEffect(id, profile.Impact, m.AttackOriginX, m.AttackOriginY, m.AttackTargetX, m.AttackTargetY, 28, profile.Color, 360)
	} else {
		m.VulnerableUntil = now + profile.RecoveryMs
		gs.addMonsterEffect(id, "ash_hound_recovery", m.X, m.Y, 0, 0, m.Radius+18, profile.Color, profile.RecoveryMs)
	}
	m.State = monster.MonsterRecovery
	m.RecoveryUntil = now + profile.RecoveryMs
	if !target.IsAlive() {
		gs.Broadcast("killed", map[string]interface{}{"killerName": monsterDisplayName(m.Kind), "killedName": target.Name, "killedId": target.PlayerId})
		if gs.OnPlayerKilled != nil {
			gs.OnPlayerKilled(target.PlayerId, monsterDisplayName(m.Kind))
		}
		gs.finishBattleIfDecided()
	}
}

func (gs *GameState) resolveRootGuardianAttack(id string, m *monster.Monster, target *player.Player, profile monster.AttackProfile, now int64) {
	zoneRadius := 112.0
	zoneDuration := int64(1800)
	gs.MonsterZones = append(gs.MonsterZones, &MonsterZone{
		SourceID: id, Kind: "root_guardian_zone", X: m.AttackTargetX, Y: m.AttackTargetY,
		Radius: zoneRadius, Damage: profile.Damage, TicksLeft: 4, NextTickAt: now + 120,
		Interval: 420, ExpiresAt: now + zoneDuration, Color: profile.Color,
	})
	gs.addMonsterEffect(id, "root_guardian_impact", m.AttackTargetX, m.AttackTargetY, 0, 0, zoneRadius, profile.Color, 360)
	gs.addMonsterEffect(id, "root_guardian_zone", m.AttackTargetX, m.AttackTargetY, 0, 0, zoneRadius, profile.Color, zoneDuration)
	m.State = monster.MonsterRecovery
	m.RecoveryUntil = now + profile.RecoveryMs
	m.VulnerableUntil = now + profile.RecoveryMs
	gs.addMonsterEffect(id, "root_guardian_recovery", m.X, m.Y, 0, 0, m.Radius+18, profile.Color, profile.RecoveryMs)
	_ = target
}

func distanceToSegment(px, py, ax, ay, bx, by float64) float64 {
	dx, dy := bx-ax, by-ay
	lengthSquared := dx*dx + dy*dy
	if lengthSquared <= .0001 {
		return math.Hypot(px-ax, py-ay)
	}
	t := ((px-ax)*dx + (py-ay)*dy) / lengthSquared
	if t < 0 {
		t = 0
	} else if t > 1 {
		t = 1
	}
	return math.Hypot(px-(ax+t*dx), py-(ay+t*dy))
}

func (gs *GameState) steerMonster(m *monster.Monster, desiredX, desiredY float64) (float64, float64) {
	if m == nil {
		return 0, 0
	}
	desiredLength := math.Hypot(desiredX, desiredY)
	currentLength := math.Hypot(m.MoveX, m.MoveY)
	if desiredLength > .01 {
		desiredX, desiredY = desiredX/desiredLength, desiredY/desiredLength
		if currentLength <= .01 {
			m.MoveX, m.MoveY = desiredX, desiredY
			m.MoveScale = math.Max(m.MoveScale, .4)
		} else {
			currentAngle := math.Atan2(m.MoveY, m.MoveX)
			desiredAngle := math.Atan2(desiredY, desiredX)
			delta := math.Atan2(math.Sin(desiredAngle-currentAngle), math.Cos(desiredAngle-currentAngle))
			currentAngle += delta * monster.MonsterMoveTurnBlend
			m.MoveX, m.MoveY = math.Cos(currentAngle), math.Sin(currentAngle)
			m.MoveScale += (1 - m.MoveScale) * monster.MonsterMoveTurnBlend
		}
	} else if currentLength > .01 {
		m.MoveScale *= monster.MonsterMoveRelease
		if m.MoveScale <= monster.MonsterMoveStopScale {
			m.MoveX, m.MoveY, m.MoveScale = 0, 0, 0
		}
	} else {
		m.MoveScale = 0
	}
	return m.MoveX, m.MoveY
}

func (gs *GameState) moveMonster(monsterID string, m *monster.Monster, desiredX, desiredY, pace float64) {
	if m == nil {
		return
	}
	if math.Hypot(desiredX, desiredY) > .01 {
		desiredX, desiredY = gs.navigatedDirection(&m.CircleBody, desiredX, desiredY, monsterID)
	}
	dx, dy := gs.steerMonster(m, desiredX, desiredY)
	if math.Hypot(dx, dy) <= .01 || m.MoveScale <= 0 {
		return
	}
	m.Rotation = math.Atan2(dy, dx)
	m.X += dx * pace * m.MoveScale / 60
	m.Y += dy * pace * m.MoveScale / 60
	geometry.CorrectCircleWithBlockingWalls(&m.CircleBody, gs.Walls)
	if gs.Map != nil {
		clamped := gs.Map.ClampCircle(&m.CircleBody)
		m.X, m.Y = clamped.X, clamped.Y
	}
}

func (gs *GameState) moveMonsterHome(monsterID string, m *monster.Monster) {
	if m == nil {
		return
	}
	dx, dy := m.SpawnX-m.X, m.SpawnY-m.Y
	distance := math.Hypot(dx, dy)
	if distance <= monster.MonsterReturnStopDistance {
		m.X, m.Y = m.SpawnX, m.SpawnY
		m.Rotation = 0
		m.MoveX, m.MoveY, m.MoveScale = 0, 0, 0
		m.ReturningHome = false
		return
	}
	angle := math.Atan2(dy, dx)
	dx, dy = math.Cos(angle), math.Sin(angle)
	pace := monster.MonsterReturnPace + float64(m.Tier)*8
	gs.moveMonster(monsterID, m, dx, dy, pace)
}

func (gs *GameState) closestVisibleMonsterPlayer(m *monster.Monster) *player.Player {
	var target *player.Player
	closest := monster.MonsterSight
	for _, candidate := range gs.Players {
		if !candidate.IsAlive() || !gs.monsterCanSeePlayer(m, candidate) {
			continue
		}
		if distance := math.Hypot(candidate.X-m.X, candidate.Y-m.Y); distance <= closest {
			closest, target = distance, candidate
		}
	}
	return target
}

func (gs *GameState) monsterCanSeePlayer(m *monster.Monster, target *player.Player) bool {
	if m == nil || target == nil || !target.IsAlive() {
		return false
	}
	if math.Hypot(target.X-m.X, target.Y-m.Y) > monster.MonsterSight {
		return false
	}
	targetGroup, targetInBush := gs.bushGroupAt(target.X, target.Y)
	if !targetInBush {
		return true
	}
	observerGroup, observerInBush := gs.bushGroupAt(m.X, m.Y)
	return observerInBush && targetGroup != 0 && observerGroup == targetGroup
}

func (gs *GameState) updateStatuses() {
	now := gs.nowMs()
	for _, p := range gs.Players {
		expirePlayerShieldAt(p, now)
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
				gs.dropHeroHealthBoost(p, killer)
			}
			gs.Broadcast("killed", map[string]interface{}{"killerName": killerName, "killedName": p.Name, "killedId": p.PlayerId})
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

func expirePlayerShieldAt(target *player.Player, now int64) {
	if target == nil || target.ShieldUntil <= 0 || target.ShieldUntil > now {
		return
	}
	target.ShieldUntil = 0
	target.ShieldHP = 0
}

func (gs *GameState) applyDamageAmount(target *player.Player, amount int) int {
	if gs.State != GameStateGame || target == nil || !target.IsAlive() {
		return 0
	}
	now := gs.nowMs()
	expirePlayerShieldAt(target, now)
	incomingAmount := amount
	// A save is a hit that would have removed the remaining health without a
	// defensive layer. Shield points are intentionally not part of this test:
	// spending a shield to preserve the hero is the event the metric describes.
	incomingWouldBeLethal := amount >= target.Lives
	target.InterruptRegenerationAt(now)
	if target.InvulnerableUntil > now {
		target.DamagePrevented += incomingAmount
		if incomingWouldBeLethal {
			target.EscapeSaves++
		}
		return 0
	}
	if target.StealthUntil > now && target.Dodges > 0 {
		target.Dodges--
		target.DamagePrevented += incomingAmount
		if incomingWouldBeLethal {
			target.EscapeSaves++
		}
		gs.addEffect("evade", target.X, target.Y, 0, 0, 0, 0, 0, 0, "#ffffff", 0, 450)
		return 0
	}
	if target.StoneArmorUntil > now {
		target.SuppressedRage = int(math.Min(240, float64(target.SuppressedRage+amount)))
		amount = int(math.Round(float64(amount) * .4))
		if target.SuppressedRage >= 240 {
			target.MicoArmorDetonation = true
			target.StoneArmorUntil = now
		}
	} else if target.ShieldUntil > now {
		amount = int(math.Round(float64(amount) * .6))
	}
	if target.ShieldStacks > 0 {
		amount = int(math.Round(float64(amount) * (1 - math.Min(.75, float64(target.ShieldStacks)*.15))))
	}
	livesBefore := target.Lives
	shieldBefore := target.ShieldHP
	target.TakeDamageAt(amount, now)
	dealt := livesBefore - target.Lives + shieldBefore - target.ShieldHP
	preventable := incomingAmount
	if maxHealth := livesBefore + shieldBefore; preventable > maxHealth {
		preventable = maxHealth
	}
	prevented := preventable - (livesBefore - target.Lives)
	if prevented > 0 {
		target.DamagePrevented += prevented
	}
	if incomingWouldBeLethal && target.IsAlive() && prevented > 0 {
		target.EscapeSaves++
	}
	if livesBefore > 0 && target.Lives <= 0 {
		target.LastDeathAt = now
		target.SuperCharge = 0
		target.Deaths++
		if gs.Mode != ModeTeamDeathmatch && target.Place == 0 {
			if place := gs.countActivePlayers() + 1; place > 1 {
				target.Place = place
			}
		}
		if target.FlyingUntil != 0 {
			// A lethal hit can interrupt flight between movement ticks. Resolve
			// the corpse immediately so the snapshot never places it inside a
			// wall after the aerial state is cleared.
			gs.resolveFlightLanding(target, gs.activeCrateBodies())
		}
		// A dead hero cannot retain traversal state into a later respawn.
		target.FlyingUntil = 0
		target.FlightSpeedMultiplier = 0
	}
	if target.Lives <= 0 && gs.Mode == ModeTeamDeathmatch && target.RespawnAt == 0 {
		target.RespawnAt = now + gs.teamRespawnDelayAt(now).Milliseconds()
	}
	target.RevealedUntil = now + 2000
	gs.addEffect("damage", target.X, target.Y, 0, 0, 0, 0, 0, 0, "#ff6b9f", dealt, 260)
	return dealt
}

func (gs *GameState) dealPlayerDamage(source, target *player.Player, amount int) int {
	if target == nil || amount <= 0 || !gs.canDamagePlayer(source, target) {
		return 0
	}
	wasAlive := target != nil && target.IsAlive()
	targetLivesBefore := target.Lives
	previousContactBy, previousContactAt := target.LastContactBy, target.LastContactAt
	dealt := gs.applyDamageAmount(target, amount)
	if dealt > 0 && target != nil {
		if source != nil {
			if source.IsBot {
				if gs.activeAbilitySlot == "basic" {
					gs.recordBotAttackHit()
				}
			}
			source.PlayerDamage += dealt
			if gs.activeAbilitySlot == "basic" {
				source.BasicDamage += dealt
			} else if gs.activeAbilitySlot != "" {
				source.SkillDamage += dealt
			}
			addSuperChargeFromEffectiveDamage(source, target, dealt)
			now := gs.nowMs()
			if source.CombatFirstContactAt == 0 {
				source.CombatFirstContactAt = now
				if gs.MatchStartedAt > 0 {
					source.TimeToFirstContactMs = maxInt64(0, now-gs.MatchStartedAt)
				}
			}
			if source.LastCombatAt > 0 && now-source.LastCombatAt <= combatActivityWindow.Milliseconds() {
				source.CombatUptimeMs += now - source.LastCombatAt
			}
			source.LastCombatAt = now
		}
		gs.recordLastContact(source, target)
	}
	if dealt > 0 && target != nil && gs.activeCommandID != "" {
		if gs.activeAbilitySlot != "" && gs.activeAbilitySlot != "basic" {
			gs.markAbilityResolutionHit(gs.activeCommandID)
		}
		sourceID := gs.activeSourceID
		if source != nil {
			sourceID = source.PlayerId
		}
		gs.emitCombatEvent(CombatEvent{
			Kind: "hit", CommandID: gs.activeCommandID, SourceID: sourceID,
			TargetType: "players", TargetID: target.PlayerId, ProjectileID: gs.activeProjectileID, Damage: dealt,
			Reaction: func() string {
				if !target.IsAlive() {
					return "defeat"
				}
				return "hit"
			}(),
			HitStopMs: func() int64 {
				if !target.IsAlive() {
					return 110
				}
				return 55
			}(),
			TargetLivesBefore: targetLivesBefore,
			TargetLivesAfter:  target.Lives,
		})
	}
	if wasAlive && !target.IsAlive() {
		killerName := "Unknown"
		if source != nil {
			killerName = source.Name
			source.Kills++
			if previousContactBy != "" && previousContactBy != source.PlayerId && previousContactAt > 0 && gs.nowMs()-previousContactAt <= combatAssistWindow.Milliseconds() {
				if assister := gs.Players[previousContactBy]; assister != nil && assister.PlayerId != source.PlayerId {
					assister.Assists++
				}
			}
			if gs.activeAbilitySlot == "basic" {
				source.BasicOnlyKills++
			} else if gs.activeAbilitySlot != "" {
				source.SkillAssistedKills++
			}
			gs.dropHeroHealthBoost(target, source)
			if !gs.IslandVoiceKillClaimed[source.PlayerId] {
				gs.IslandVoiceKillClaimed[source.PlayerId] = true
				gs.emitIslandVoice(source.PlayerId, IslandVoiceTriggerKill, gs.nowMs())
			}
		}
		gs.Broadcast("killed", map[string]interface{}{
			"killerName": killerName,
			"killedName": target.Name,
			"killedId":   target.PlayerId,
		})
		if gs.OnPlayerKilled != nil {
			gs.OnPlayerKilled(target.PlayerId, killerName)
		}
		gs.finishBattleIfDecided()
	}
	return dealt
}

func (gs *GameState) dropHeroHealthBoost(target, killer *player.Player) {
	if target == nil || killer == nil || killer.PlayerId == "" {
		return
	}
	dropX, dropY := gs.safeHealthBoostDropPosition(target.X, target.Y, 14)
	reward := prop.NewProp("health_boost", dropX, dropY, 14)
	reward.LootType = "hero"
	reward.ExpiresAt = gs.nowMs() + HealthBoostTTL.Milliseconds()
	reward.HealthBoostKillerID = killer.PlayerId
	if gs.Mode == ModeTeamDeathmatch && killer.Team != "" {
		reward.VisibilityTeam = killer.Team
	} else {
		reward.VisibilityPlayerID = killer.PlayerId
	}
	gs.appendHealthBoostReward(reward)
}

func activeHealthBoostCount(gs *GameState) int {
	if gs == nil {
		return 0
	}
	count := 0
	for _, candidate := range gs.Props {
		if candidate != nil && candidate.Active && candidate.Type == "health_boost" {
			count++
		}
	}
	return count
}

func (gs *GameState) appendHealthBoostReward(reward *prop.Prop) bool {
	if gs == nil || reward == nil || activeHealthBoostCount(gs) >= MaxActiveHealthBoosts {
		return false
	}
	gs.Props = append(gs.Props, reward)
	return true
}

func (gs *GameState) safeHealthBoostDropPosition(x, y, radius float64) (float64, float64) {
	valid := func(candidateX, candidateY float64) bool {
		candidate := &geometry.CircleBody{X: candidateX, Y: candidateY, Radius: radius}
		return gs.Walls == nil || !geometry.CollidesCircleWithBlockingWalls(candidate, gs.Walls)
	}
	if valid(x, y) {
		return x, y
	}
	for distance := radius * 2; distance <= radius*10; distance += radius * 2 {
		for index := 0; index < 8; index++ {
			angle := float64(index) * math.Pi / 4
			candidateX, candidateY := x+math.Cos(angle)*distance, y+math.Sin(angle)*distance
			if gs.Map != nil {
				clamped := gs.Map.ClampCircle(&geometry.CircleBody{X: candidateX, Y: candidateY, Radius: radius})
				candidateX, candidateY = clamped.X, clamped.Y
			}
			if valid(candidateX, candidateY) {
				return candidateX, candidateY
			}
		}
	}
	if gs.Map != nil {
		clamped := gs.Map.ClampCircle(&geometry.CircleBody{X: x, Y: y, Radius: radius})
		return clamped.X, clamped.Y
	}
	return x, y
}

// canDamagePlayer is the final server-side friendly-fire gate. Individual
// attacks still filter their candidate lists for efficiency, but damage must
// never depend on every ability remembering to do that filtering correctly.
// Resolve teams from the authoritative GameState so stale attack payloads or
// copied Player values cannot bypass the rule.
func (gs *GameState) canDamagePlayer(source, target *player.Player) bool {
	if target == nil {
		return false
	}
	if source == nil {
		return true
	}
	if gs.Mode != ModeTeamDeathmatch || source.PlayerId == target.PlayerId {
		return source.PlayerId != target.PlayerId
	}
	sourceTeam, targetTeam := source.Team, target.Team
	if authoritative := gs.Players[source.PlayerId]; authoritative != nil {
		sourceTeam = authoritative.Team
	}
	if authoritative := gs.Players[target.PlayerId]; authoritative != nil {
		targetTeam = authoritative.Team
	}
	return sourceTeam == "" || targetTeam == "" || sourceTeam != targetTeam
}

func (gs *GameState) recordLastContact(source, target *player.Player) {
	if source == nil || target == nil {
		return
	}
	dx, dy := target.X-source.X, target.Y-source.Y
	distance := math.Hypot(dx, dy)
	if distance > 0 {
		dx, dy = dx/distance, dy/distance
	}
	target.LastContactAt = gs.nowMs()
	target.LastContactBy = source.PlayerId
	target.LastContactX, target.LastContactY = target.X, target.Y
	target.LastContactDirX, target.LastContactDirY = dx, dy
}

func (gs *GameState) updateDelayedEffects() {
	now := gs.nowMs()
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

func (gs *GameState) addEffect(kind string, x, y, toX, toY, radius, angle, reach, arc float64, color string, damage int, duration int64) *BattleEffect {
	now := gs.nowMs()
	gs.NextCombatEffectID++
	effect := &BattleEffect{
		ID: gs.NextCombatEffectID, Kind: kind, Phase: combatEffectPhase(kind),
		CommandID: gs.activeCommandID, SourceID: gs.activeSourceID, AbilitySlot: gs.activeAbilitySlot,
		X: x, Y: y, ToX: toX, ToY: toY, Radius: radius, Angle: angle, Range: reach, Arc: arc,
		Color: color, Damage: damage, CreatedAt: now, ExpiresAt: now + duration,
	}
	gs.Effects = append(gs.Effects, effect)
	return effect
}

func (gs *GameState) expireEffects() {
	now := gs.nowMs()
	kept := gs.Effects[:0]
	for _, effect := range gs.Effects {
		if effect != nil && effect.ExpiresAt > now {
			kept = append(kept, effect)
		}
	}
	gs.Effects = kept
}

func (gs *GameState) updateActiveAbilities() {
	now := gs.nowMs()
	for _, source := range gs.Players {
		if !source.IsAlive() || now-source.LastAbilityTick < 16 {
			continue
		}
		source.LastAbilityTick = now
		if source.VortexUntil > now && source.VortexReadyAt <= 0 && now >= source.VortexTickAt {
			source.VortexTickAt = now + MicoVortexTickInterval.Milliseconds()
			radius := source.VortexRadius
			if radius <= 0 {
				radius = MicoVortexBaseRadius
			}
			damage := source.VortexDamage
			if damage <= 0 {
				damage = 4
			}
			gs.addEffect("vortex", source.X, source.Y, 0, 0, radius, 0, 0, 0, source.Color, damage, 100)
			gs.radialDamage(source.PlayerId, source.X, source.Y, radius, damage)
			healed := gs.healPlayerAt(source, 1, now)
			addSuperChargeForSupport(source, healed, source.MaxLives)
		}
		if source.VineUntil > now && (source.VineUntil-now)%500 < 20 {
			gs.addEffect("vine", source.X, source.Y, 0, 0, 245, 0, 0, 0, source.Color, 0, 480)
			gs.pullTargets(source, source.X, source.Y, 260, 16)
			gs.radialDamage(source.PlayerId, source.X, source.Y, 245, 18)
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
			gs.movePlayerByCollision(target, dx/d*math.Min(distance, d), dy/d*math.Min(distance, d))
		}
	}
}

func (gs *GameState) updateBullets() {
	previousCommandID, previousSourceID, previousAbilitySlot, previousBotAttackID, previousProjectileID := gs.activeCommandID, gs.activeSourceID, gs.activeAbilitySlot, gs.activeBotAttackID, gs.activeProjectileID
	previousPending := gs.commandHasProjectile
	defer func() {
		gs.activeCommandID, gs.activeSourceID, gs.activeAbilitySlot, gs.activeBotAttackID, gs.activeProjectileID = previousCommandID, previousSourceID, previousAbilitySlot, previousBotAttackID, previousProjectileID
		gs.commandHasProjectile = previousPending
	}()
	for i := 0; i < len(gs.Bullets); i++ {
		b := gs.Bullets[i]
		if b == nil || !b.Active {
			continue
		}
		gs.activeCommandID, gs.activeSourceID, gs.activeAbilitySlot, gs.activeBotAttackID, gs.activeProjectileID = b.CommandID, b.PlayerId, b.AbilitySlot, b.BotAttackID, b.ID
		previousX, previousY := b.X, b.Y
		if b.Homing && b.TargetID != "" {
			if target := gs.Players[b.TargetID]; target != nil && target.IsAlive() {
				desired := math.Atan2(target.Y-b.Y, target.X-b.X)
				// Soft homing: keep the auto-aim feel, but cap the turn so a moving
				// target can juke the projectile instead of being magnetically hit.
				delta := math.Atan2(math.Sin(desired-b.Rotation), math.Cos(desired-b.Rotation))
				b.Rotation += math.Max(-0.025, math.Min(0.025, delta))
			} else {
				b.Homing = false
			}
		}
		b.Move(BulletSpeed)
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
		if gs.Mode == ModeTeamDeathmatch && b.Active {
			attacker := gs.Players[b.PlayerId]
			for _, objective := range gs.Objectives {
				if objective == nil || objective.Lives <= 0 || attacker == nil || attacker.Team == objective.Team {
					continue
				}
				if segmentHitsCircle(previousX, previousY, b.X, b.Y, objective.X, objective.Y, objective.Radius) {
					if gs.damageObjective(attacker, objective, b.Damage) {
						b.Active = false
					}
					break
				}
			}
		}
		if !b.Active {
			continue
		}

		for _, p := range gs.Players {
			ownerLaunchOverlap := false
			if b.Kind == "mina_star" && p.PlayerId == b.PlayerId {
				ownerLaunchOverlap = b.Travelled <= p.Radius+b.Radius+4
			}
			if b.Kind == "mina_star" && !ownerLaunchOverlap && p.IsAlive() && (p.PlayerId == b.PlayerId || (b.Team != "" && p.Team == b.Team)) && segmentHitsCircle(previousX, previousY, b.X, b.Y, p.X, p.Y, p.Radius+b.Radius) {
				healed := gs.healPlayerAt(p, 2, gs.nowMs())
				if source := gs.Players[b.PlayerId]; source != nil {
					addSuperChargeForSupport(source, healed, source.MaxLives)
				}
				b.Active = false
				continue
			}
			playerHitRadius := p.Radius + b.Radius
			if b.Splash <= 0 && b.Kind != "spore" && b.Kind != "quantum" {
				playerHitRadius += b.HitRadius
			}
			if !p.CanBulletHurt(b.PlayerId, b.Team) || !segmentHitsCircle(previousX, previousY, b.X, b.Y, p.X, p.Y, playerHitRadius) {
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
			if b.Kind == "katty_paint_spray" {
				gs.resolveKattyPaintSprayImpact(b)
				b.Active = false
				break
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
			if b.HitRadius > 0 && b.Splash <= 0 && b.Kind != "spore" && b.Kind != "quantum" {
				gs.radialDamageExcept(b.PlayerId, p.X, p.Y, b.HitRadius, dmg, p.PlayerId)
				b.HitRadius = 0
			}
			if b.Knockback > 0 {
				geometry.MoveCircleWithBlockingWallsAndCircles(
					&p.CircleBody,
					gs.Walls,
					gs.activeCrateBodies(),
					math.Cos(b.Rotation)*b.Knockback,
					math.Sin(b.Rotation)*b.Knockback,
				)
				clamped := gs.Map.ClampCircle(&p.CircleBody)
				p.X, p.Y = clamped.X, clamped.Y
			}
			if b.Poison {
				p.PoisonUntil = gs.nowMs() + (4 * time.Second).Milliseconds()
				p.PoisonTickAt = gs.nowMs() + (500 * time.Millisecond).Milliseconds()
				p.PoisonBy = b.PlayerId
			}
			if b.Kind == "pellet" && p.Marks < 5 {
				p.Marks++
			}
			if b.Kind == "mina_star" {
				now := gs.nowMs()
				if attacker != nil {
					healed := gs.healPlayerAt(attacker, MinaStarSelfHeal, now)
					addSuperChargeForSupport(attacker, healed, attacker.MaxLives)
				}
				if gs.LightMarkedUntil[p.PlayerId] > now {
					p.Marks++
					if p.Marks >= 3 {
						gs.radialDamageExcept(b.PlayerId, p.X, p.Y, MinaMarkBurstRadius, MinaMarkBurstDamage, "")
						gs.LightMarkedUntil[p.PlayerId] = 0
						p.Marks = 0
						p.SlowUntil = now + 1000
						p.SlowMultiplier = .60
						gs.addEffect("mina_mark_burst", p.X, p.Y, 0, 0, MinaMarkBurstRadius, 0, 0, 0, "#ffb5f2", MinaMarkBurstDamage, 420)
					}
				} else {
					p.Marks = 1
					gs.LightMarkedUntil[p.PlayerId] = now + 4000
				}
			}
			if b.Kind == "spore" {
				now := gs.nowMs()
				slowUntil := now + cappedSkillDuration(NeedleSporeSlowDuration)
				p.SlowUntil = slowUntil
				p.SlowMultiplier = .60
				p.AntiHealUntil = now + 2*time.Second.Milliseconds()
				p.AntiHealMultiplier = .50
				gs.addEffect("needle_spores", p.X, p.Y, 0, 0, 24, 0, 0, 0, "#75d947", 0, cappedSkillDuration(NeedleSporeSlowDuration))
				gs.addEffect("needle_anti_heal", p.X, p.Y, 0, 0, p.Radius+10, 0, 0, 0, "#b7ff75", 0, 420)
			}
			if b.Kind == "katty_paint" {
				now := gs.nowMs()
				gs.applyKattyPaint(attacker, p, now, 1, false)
			}
			if b.Kind == "lumi_orb" {
				gs.finishNewHeroProjectile(b)
			}
			if b.Kind == "quantum" {
				gs.radialDamageExcept(b.PlayerId, b.X, b.Y, 75, b.Damage, p.PlayerId)
			}
			if b.Kind == "spore" {
				gs.splitProjectile(b)
			}
			if b.Splash > 0 && b.Kind != "spore" && b.Kind != "quantum" && b.Kind != "katty_paint_spray" {
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
		if b.Kind == "katty_paint_spray" && !b.Active {
			continue
		}
		if b.Kind != "tower_shot" {
			// Tower shots are player-only defensive fire. They still reach the
			// wall collision below, so cover can stop a shot after it is fired.
			for mid, m := range gs.Monsters {
				if m == nil || !m.IsAlive() {
					continue
				}
				monsterHitRadius := m.Radius + b.Radius
				if b.Splash <= 0 && b.Kind != "spore" && b.Kind != "quantum" {
					monsterHitRadius += b.HitRadius
				}
				if !segmentHitsCircle(previousX, previousY, b.X, b.Y, m.X, m.Y, monsterHitRadius) {
					continue
				}
				if b.Kind == "katty_paint_spray" {
					gs.resolveKattyPaintSprayImpact(b)
					b.Active = false
					break
				}
				b.Active = false
				gs.finishNewHeroProjectile(b)
				gs.damageMonster(mid, m, int(math.Max(1, float64(b.Damage))))
			}
			if b.Kind == "katty_paint_spray" && !b.Active {
				continue
			}

			for _, pr := range gs.Props {
				if pr == nil || !pr.Active || !isBreakableCrate(pr) || !segmentHitsCircle(previousX, previousY, b.X, b.Y, pr.X, pr.Y, pr.Radius+b.Radius) {
					continue
				}
				if b.Kind == "katty_paint_spray" {
					gs.resolveKattyPaintSprayImpact(b)
					b.Active = false
					break
				}
				gs.damageCrate(gs.Players[b.PlayerId], pr, b.Damage)
				gs.finishNewHeroProjectile(b)
				b.Active = false
				break
			}
		}

		if segmentHitsBlockingWall(previousX, previousY, b.X, b.Y, b.Radius, gs.Walls) {
			if b.Kind == "tower_shot" {
				gs.addEffect("tower_shot_blocked", b.X, b.Y, 0, 0, b.Radius+18, b.Rotation, 0, 0, b.Color, 0, 260)
			}
			if b.DestroyWalls {
				if gs.destroyNearestWallAt(b.X, b.Y, b.Radius) {
					gs.addEffect("wall_break", b.X, b.Y, 0, 0, 42, b.Rotation, 0, 0, b.Color, 0, 520)
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
	return segmentHitsBlockingWallExcept(x1, y1, x2, y2, radius, walls, "")
}

func segmentHitsBlockingWallExcept(x1, y1, x2, y2, radius float64, walls *geometry.SpatialHash, ignoredType string) bool {
	distance := math.Hypot(x2-x1, y2-y1)
	steps := int(math.Max(1, math.Ceil(distance/math.Max(4, radius))))
	for step := 0; step <= steps; step++ {
		t := float64(step) / float64(steps)
		body := geometry.CircleBody{X: x1 + (x2-x1)*t, Y: y1 + (y2-y1)*t, Radius: radius}
		if collidesCircleWithProjectileBlockingWallsExcept(&body, walls, ignoredType) {
			return true
		}
	}
	return false
}

func collidesCircleWithProjectileBlockingWalls(body *geometry.CircleBody, walls *geometry.SpatialHash) bool {
	return collidesCircleWithProjectileBlockingWallsExcept(body, walls, "")
}

func collidesCircleWithProjectileBlockingWallsExcept(body *geometry.CircleBody, walls *geometry.SpatialHash, ignoredType string) bool {
	collides := false
	walls.VisitRect(body.Left(), body.Top(), body.Right(), body.Bottom(), func(wall *geometry.WallTile) bool {
		// River blocks movement but projectiles fly over it.
		if wall.Type == "river" || wall.Type == ignoredType || !geometry.IsBlockingWall(wall.Type) {
			return true
		}
		if geometry.CollidesCircleWithWall(body, wall) {
			collides = true
			return false
		}
		return true
	})
	return collides
}

func (gs *GameState) splitProjectile(parent *bullet.Bullet) {
	if parent == nil || (parent.Kind != "spore" && parent.Kind != "quantum") {
		return
	}
	angles := []float64{}
	kind, damage, speed, size, distance := "spike", 1, 0.3*RuntimeProjectileSpeedScale, 3.5, 240.0
	if parent.Kind == "spore" {
		damage = int(math.Max(2, math.Round(float64(parent.Damage)*.25)))
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
	gs.EndReason = ""
	gs.WinnerPlayerID = ""
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
	gs.LobbyEndsAt = gs.nowMs() + LobbyDuration.Milliseconds()
	gs.GameEndsAt = 0
	gs.WinnerPlayerID = ""
	gs.State = GameStateLobby
	gs.resetMatchMap()
	gs.propsClear()
	gs.resetMatchAbilityRuntime()
	// Lobby is a live warm-up arena: connected players can move, rotate and
	// inspect the map while waiting. Combat actions remain gated by StateGame.
	gs.setPlayersActive(true)
}

func (gs *GameState) startFinished() {
	gs.flushBotAIMetrics()
	gs.LobbyEndsAt = 0
	gs.GameEndsAt = 0
	gs.State = GameStateFinished
	for _, p := range gs.Players {
		if p.FlyingUntil != 0 {
			gs.resolveFlightLanding(p, gs.activeCrateBodies())
		}
		p.FlyingUntil, p.FlightSpeedMultiplier = 0, 0
		p.MoveX, p.MoveY, p.Aiming = 0, 0, false
	}
}

func (gs *GameState) startGame() {
	gs.LobbyEndsAt = 0
	gs.MatchStartedAt = gs.nowMs()
	gs.GameEndsAt = gs.MatchStartedAt + gs.matchDuration().Milliseconds()
	gs.WinnerPlayerID = ""
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
	gs.State = GameStateGame
	gs.resetMatchMap()
	gs.resetMatchAbilityRuntime()
	gs.propsClear()
	gs.monstersClear()
	gs.initializeTeamObjectives()
	gs.fillMissingBots()

	gs.matchRules().AssignTeams(gs)
	if gs.Mode == ModeTeamDeathmatch {
		gs.setPlayersPositionForTeams()
	}
	gs.setBotsPositionAtFreeSpawns()
	gs.setPlayersActive(true)
	spawnProtectionUntil := gs.nowMs() + SpawnProtectionDuration.Milliseconds()
	for _, p := range gs.Players {
		p.InvulnerableUntil = spawnProtectionUntil
	}
	gs.monstersAdd(MonstersCount)
	if gs.Mode != ModeTeamDeathmatch {
		gs.IslandPhase = IslandPhaseHunt
		gs.PhaseStartedAt = gs.MatchStartedAt
		gs.PhaseEndsAt = gs.MatchStartedAt + OpeningCombatDuration.Milliseconds()
		gs.emitIslandVoiceToAll(IslandVoiceTriggerPhase, gs.MatchStartedAt)
	}
	gs.Broadcast("start", map[string]interface{}{})
}

func (gs *GameState) onGameEnd(event *ServerEvent) {
	duration := int64(0)
	if gs.GameEndsAt > 0 {
		matchDuration := gs.matchDuration()
		remaining := gs.GameEndsAt - gs.nowMs()
		if remaining < 0 {
			remaining = 0
		}
		duration = matchDuration.Milliseconds() - remaining
		if duration < 0 {
			duration = 0
		}
		if duration > matchDuration.Milliseconds() {
			duration = matchDuration.Milliseconds()
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
		gs.finalizeBattlePlaces(winner)
		gs.OnGameEnd(gs.Players, winner, duration)
	}
	if event != nil {
		gs.Broadcast(event.Type, event.Params)
	}
	gs.propsClear()
	gs.monstersClear()
	gs.Broadcast("stop", map[string]interface{}{})
}

func (gs *GameState) finalizeBattlePlaces(winner string) {
	if gs == nil || gs.Mode == ModeTeamDeathmatch || winner == "" {
		return
	}
	for _, candidate := range gs.Players {
		isWinner := candidate != nil && candidate.IsAlive() && candidate.Name == winner
		if gs.WinnerPlayerID != "" {
			isWinner = candidate != nil && candidate.PlayerId == gs.WinnerPlayerID
		}
		if isWinner && candidate.Place == 0 {
			candidate.Place = 1
		}
	}
}

func (gs *GameState) setWinnerPlayerID(winner string) {
	if gs == nil {
		return
	}
	gs.WinnerPlayerID = ""
	if gs.Mode == ModeTeamDeathmatch || winner == "" {
		return
	}
	for _, candidate := range gs.Players {
		if candidate != nil && candidate.IsAlive() && candidate.Name == winner {
			gs.WinnerPlayerID = candidate.PlayerId
			return
		}
	}
}

func (gs *GameState) PlayerAdd(id, name string, heroName string) {
	catalog := gs.heroCatalog
	if catalog == nil {
		catalog = DefaultHeroCatalog()
	}
	hero, ok := catalog.Find(heroName)
	if !ok {
		hero = catalog.Random()
	}
	spawner := gs.Map.GetRandomSpawner()
	p := hero.CreatePlayer(id, name, spawner.X+float64(hero.Radius), spawner.Y+float64(hero.Radius))
	if gs.Mode == ModeTeamDeathmatch {
		p.SetTeam("Red")
		p.TeamLocked = false
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
	moving := math.Hypot(dirX, dirY) > .01
	if p.ChannelUntil > ts {
		p.MoveX, p.MoveY, p.Ack = 0, 0, ts
		gs.recordMovementPacing(p, false)
		return
	}
	p.Ack = ts
	if p.IsBot {
		dirX, dirY = gs.smoothBotMove(id, ts, dirX, dirY)
	} else if !moving {
		p.MoveX, p.MoveY = 0, 0
		gs.recordMovementPacing(p, false)
		return
	}
	p.MoveX, p.MoveY = dirX, dirY
	gs.recordMovementPacing(p, moving)
	if p.HeroName == "Mandy" && math.Hypot(dirX, dirY) > .01 {
		p.FocusStartedAt, p.FocusCharge = 0, 0
	}
}

// recordMovementPacing measures consecutive movement-input time while the
// player has not recently dealt combat damage. It is intentionally a bounded
// input-based estimate, not a claim that every travelled pixel was productive.
func (gs *GameState) recordMovementPacing(p *player.Player, moving bool) {
	if gs == nil || p == nil || !moving {
		if p != nil {
			p.LastMovementAt = 0
		}
		return
	}
	now := gs.nowMs()
	lastCombat := p.LastCombatAt
	if p.LastDamageAt > lastCombat {
		lastCombat = p.LastDamageAt
	}
	if p.LastMovementAt > 0 && now > p.LastMovementAt && now-p.LastMovementAt <= time.Second.Milliseconds() && (lastCombat == 0 || now-lastCombat > combatActivityWindow.Milliseconds()) {
		p.UncontestedTravelMs += now - p.LastMovementAt
	}
	p.LastMovementAt = now
}

// EffectiveMovementSpeed is the single movement-speed contract shared by the
// simulation and the state snapshot. Keeping the modifiers here prevents the
// client prediction from drifting when a temporary combat effect is active.
func EffectiveMovementSpeed(p *player.Player, now int64) float64 {
	if p == nil || p.StunUntil > now || p.ChannelUntil > now {
		return 0
	}
	speed := p.Speed
	if isPlayerFlying(p, now) {
		multiplier := p.FlightSpeedMultiplier
		if multiplier <= 0 {
			multiplier = 1
		}
		speed *= multiplier
	}
	if p.HasteUntil > now {
		speed *= 1.22
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
	return speed
}

// TerrainMovementMultiplier is the deterministic map-side movement modifier.
// Vines are deliberately queried by the hero's centre point: the same simple
// footprint is used by the server and client prediction, so entering and
// leaving a clump never creates a hidden collision-sized buffer.
const vineTerrainSpeedMultiplier = .55

func TerrainMovementMultiplier(mapValue *gamemap.GameMap, x, y float64) float64 {
	if mapValue == nil {
		return 1
	}
	for _, wall := range mapValue.Collisions {
		if wall == nil || (wall.Type != "vine" && wall.Type != "thorn_vine") || x < wall.MinX || x > wall.MaxX || y < wall.MinY || y > wall.MaxY {
			continue
		}
		return vineTerrainSpeedMultiplier
	}
	return 1
}

func EffectiveMovementSpeedAt(p *player.Player, now int64, mapValue *gamemap.GameMap, x, y float64) float64 {
	speed := EffectiveMovementSpeed(p, now)
	if p == nil || isPlayerFlying(p, now) {
		return speed
	}
	return speed * TerrainMovementMultiplier(mapValue, x, y)
}

func (gs *GameState) updatePlayerMovement(elapsed ...time.Duration) {
	now := gs.nowMs()
	step := (time.Second / 60).Seconds()
	if len(elapsed) > 0 && elapsed[0] > 0 {
		// A long pause should not teleport players across the arena after a
		// suspended process resumes, but normal missed ticks must be paid back.
		step = math.Min(elapsed[0].Seconds(), 100*time.Millisecond.Seconds())
	}
	blockingCrates := gs.activeCrateBodies()
	for _, p := range gs.Players {
		gs.expirePlayerFlight(p, now, blockingCrates)
		if !p.IsAlive() {
			continue
		}
		// Pickup collection is independent of movement and control locks. A
		// player can be standing on a reward when a stun/channel starts, and
		// the reward must still be claimed on the authoritative tick.
		gs.collectPickups(p)
		if p.StunUntil > now || p.ChannelUntil > now {
			continue
		}
		if p.MoveX == 0 && p.MoveY == 0 {
			continue
		}
		speed := EffectiveMovementSpeedAt(p, now, gs.Map, p.X, p.Y) * step
		if p.IsBot {
			if memory := gs.BotMemory[p.PlayerId]; memory != nil && memory.MoveScale > 0 {
				speed *= memory.MoveScale
			}
		}
		magnitude := math.Hypot(p.MoveX, p.MoveY)
		fromX, fromY := p.X, p.Y
		deltaX, deltaY := p.MoveX/magnitude*speed, p.MoveY/magnitude*speed
		if isPlayerFlying(p, now) {
			// Flight changes only traversal. The ocean/map boundary remains
			// authoritative, while walls and ground props stay below the hero.
			moveCircleDuringFlight(&p.CircleBody, gs.Walls, deltaX, deltaY)
		} else {
			geometry.MoveCircleWithBlockingWallsAndCircles(&p.CircleBody, gs.Walls, blockingCrates, deltaX, deltaY)
		}

		clamped := gs.Map.ClampCircle(&p.CircleBody)
		p.X, p.Y = clamped.X, clamped.Y
		if isPlayerFlying(p, now) {
			gs.updateKattyFlightTrail(p, fromX, fromY, p.X, p.Y, now)
		}
		gs.collectPickups(p)
	}
}

func (gs *GameState) activeCrateBodies() []*geometry.CircleBody {
	if gs == nil || len(gs.Props) == 0 {
		return nil
	}
	crates := make([]*geometry.CircleBody, 0, len(gs.Props))
	for _, pr := range gs.Props {
		if pr == nil || !pr.Active || !isBreakableCrate(pr) {
			continue
		}
		crates = append(crates, &pr.CircleBody)
	}
	return crates
}

func worldAngleFromScreen(angle float64) float64 {
	return math.Atan2(math.Sin(angle)/.66, math.Cos(angle))
}

type CombatEvent struct {
	ID                uint64
	Ts                int64
	MatchID           string
	Kind              string
	Phase             string
	Hero              string
	AbilitySlot       string
	Reason            string
	CommandID         string
	SourceID          string
	TargetType        string
	TargetID          string
	ProjectileID      uint64
	Distance          float64
	Damage            int
	EffectiveDamage   int
	ResourceKind      string
	ResourceBefore    int
	ResourceAfter     int
	Reaction          string
	HitStopMs         int64
	TargetLivesBefore int
	TargetLivesAfter  int
	Accepted          bool
	Resolved          bool
}

type abilityResolution struct {
	CommandID string
	SourceID  string
	Slot      string
	ResolveAt int64
	Hit       bool
}

func abilityResolutionWindow(hero string) int64 {
	switch hero {
	case "Needle":
		return 3_500
	case "Mandy":
		return 800
	case "Brock Zeus":
		return 1_900
	case "Kaze":
		return 450
	case "Wukong Mico":
		return 2_500
	case "Persephone Lumi":
		return 6_600
	case "Katty":
		return 7_500
	default:
		return 0
	}
}

func (gs *GameState) startAbilityResolution(source *player.Player, slot, commandID string, ts int64) {
	if gs == nil || source == nil || slot != "primary" || commandID == "" {
		return
	}
	window := abilityResolutionWindow(source.HeroName)
	if window <= 0 {
		return
	}
	if gs.abilityResolutions == nil {
		gs.abilityResolutions = make(map[string]*abilityResolution)
	}
	gs.abilityResolutions[commandID] = &abilityResolution{
		CommandID: commandID, SourceID: source.PlayerId, Slot: slot, ResolveAt: ts + window,
	}
}

func (gs *GameState) markAbilityResolutionHit(commandID string) {
	if gs == nil || commandID == "" || gs.abilityResolutions == nil {
		return
	}
	if resolution := gs.abilityResolutions[commandID]; resolution != nil {
		resolution.Hit = true
	}
}

func (gs *GameState) updateAbilityResolutions(now int64) {
	if gs == nil || len(gs.abilityResolutions) == 0 {
		return
	}
	for commandID, resolution := range gs.abilityResolutions {
		if resolution == nil || resolution.ResolveAt > now {
			continue
		}
		reason, phase, accepted := "ability_missed", "miss", false
		if resolution.Hit {
			reason, phase, accepted = "ability_resolved", "impact", true
		}
		gs.emitCombatEvent(CombatEvent{
			Kind: "ability", AbilitySlot: resolution.Slot, Reason: reason, CommandID: commandID,
			SourceID: resolution.SourceID, Accepted: accepted, Resolved: true, Phase: phase,
		})
		delete(gs.abilityResolutions, commandID)
	}
}

func (gs *GameState) withCombatCommand(commandID, sourceID, abilitySlot string, action func()) {
	if action == nil {
		return
	}
	if gs == nil || commandID == "" {
		action()
		return
	}
	previousCommandID, previousSourceID, previousAbilitySlot := gs.activeCommandID, gs.activeSourceID, gs.activeAbilitySlot
	gs.activeCommandID, gs.activeSourceID, gs.activeAbilitySlot = commandID, sourceID, abilitySlot
	defer func() {
		gs.activeCommandID, gs.activeSourceID, gs.activeAbilitySlot = previousCommandID, previousSourceID, previousAbilitySlot
	}()
	action()
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
	now := gs.nowMs()
	for _, pr := range gs.Props {
		if pr == nil {
			continue
		}
		expired := pr.ExpiresAt > 0 && pr.ExpiresAt <= now
		if !pr.Active || expired {
			if expired {
				pr.Active = false
			}
			continue
		}
		if pr.Type == "power" {
			// Legacy power cubes used to combine an instant heal, max-health
			// growth, and a damage multiplier. They are not part of the
			// versioned combat economy; discard stale props without mutating
			// authoritative player state.
			pr.Active = false
			continue
		}
		inside := geometry.CircleToCircle(&p.CircleBody, &pr.CircleBody)
		if pr.Type == "health_boost" && pr.LootType == "bat" && inside && !canCollectPickup(p, pr) {
			gs.recordBatRewardDenial(p, pr)
			continue
		}
		if !canCollectPickup(p, pr) {
			continue
		}
		if inside {
			switch pr.Type {
			case "health_boost":
				if !gs.collectHealthBoost(p, pr) {
					if pr.LootType == "bat" {
						gs.recordBatRewardDenial(p, pr)
					}
					continue
				}
				if pr.LootType == "bat" {
					gs.recordBatRewardClaim(p, pr)
				}
				pr.Active = false
				gs.addEffect("health_boost", p.X, p.Y, 0, 0, 24, 0, 0, 0, "#4dff70", 0, 700)
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

func canCollectPickup(p *player.Player, pr *prop.Prop) bool {
	if p == nil || pr == nil {
		return false
	}
	if pr.VisibilityPlayerID != "" && pr.VisibilityPlayerID != p.PlayerId {
		return false
	}
	return pr.VisibilityTeam == "" || pr.VisibilityTeam == p.Team
}

func (gs *GameState) expireProps(now int64) {
	if gs == nil {
		return
	}
	for _, pr := range gs.Props {
		if pr != nil && pr.Active && pr.ExpiresAt > 0 && pr.ExpiresAt <= now {
			pr.Active = false
			if pr.Type == "health_boost" && pr.LootType == "bat" {
				gs.recordBatRewardExpiry(pr)
			}
		}
	}
}

func (gs *GameState) collectHealthBoost(collector *player.Player, reward *prop.Prop) bool {
	if reward == nil || reward.HealthBoostKillerID == "" {
		if collector.ApplyHealthBoost(HealthBoostFraction, HealthBoostMaxStacks) <= 0 {
			return false
		}
		collector.CubeClaims++
		return true
	}

	killer := gs.Players[reward.HealthBoostKillerID]
	if gs.Mode != ModeTeamDeathmatch || reward.VisibilityTeam == "" {
		if killer == nil || killer.PlayerId != collector.PlayerId || killer.ApplyHealthBoost(HealthBoostFraction, HealthBoostMaxStacks) <= 0 {
			return false
		}
		killer.CubeClaims++
		return true
	}

	benefited := false
	for _, teammate := range gs.Players {
		if teammate == nil || teammate.Team != reward.VisibilityTeam {
			continue
		}
		fraction := TeamHealthBoostFraction
		if teammate.PlayerId == reward.HealthBoostKillerID {
			fraction = HealthBoostFraction
		}
		if teammate.ApplyHealthBoost(fraction, HealthBoostMaxStacks) > 0 {
			teammate.CubeClaims++
			// Keep the pickup active when every eligible teammate is already at
			// the stack cap. A contested resource must never disappear without
			// producing an authoritative state change.
			benefited = true
		}
	}
	return benefited
}

func normalizeGadgetCharges(p *player.Player) {
	if p == nil {
		return
	}
	if p.GadgetCharges < 0 {
		p.GadgetCharges = 0
	}
	if p.GadgetCharges > MaxGadgetCharges {
		p.GadgetCharges = MaxGadgetCharges
	}
}

func (gs *GameState) playerAbility(id string, ts int64, slot string, clientID ...string) {
	p := gs.Players[id]
	normalizeGadgetCharges(p)
	ackID := ""
	if len(clientID) > 0 {
		ackID = clientID[0]
	}
	if len(clientID) > 1 {
		gs.AbilityTargets[id] = clientID[1]
	}
	previousCommandID, previousSourceID, previousAbilitySlot := gs.activeCommandID, gs.activeSourceID, gs.activeAbilitySlot
	gs.activeCommandID, gs.activeSourceID, gs.activeAbilitySlot = ackID, id, slot
	defer func() {
		gs.activeCommandID, gs.activeSourceID, gs.activeAbilitySlot = previousCommandID, previousSourceID, previousAbilitySlot
	}()
	resourceKind := ""
	resourceBefore := 0
	if slot == "primary" {
		resourceKind = "super_charge"
		if p != nil {
			resourceBefore = p.SuperCharge
		}
	} else {
		resourceKind = "gadget_charges"
		if p != nil {
			resourceBefore = p.GadgetCharges
		}
	}
	emitAbilityEvent := func(accepted bool, reason string) {
		if ackID == "" {
			return
		}
		resourceAfter := 0
		if p != nil {
			if slot == "primary" {
				resourceAfter = p.SuperCharge
			} else {
				resourceAfter = p.GadgetCharges
			}
		}
		gs.emitCombatEvent(CombatEvent{
			Kind: "ability", AbilitySlot: slot, Reason: reason, CommandID: ackID,
			SourceID: id, ResourceKind: resourceKind, ResourceBefore: resourceBefore,
			ResourceAfter: resourceAfter, Accepted: accepted, Resolved: true,
		})
	}
	if p != nil {
		p.LastAbilityID = ackID
		p.LastAbilityOK = false
	}
	if p == nil || !p.IsAlive() || p.StunUntil > ts || p.CastUntil > ts || !gs.CombatEnabled() {
		emitAbilityEvent(false, "ability_unavailable")
		return
	}
	primary := slot == "primary"
	last := p.LastSecondaryAt
	cooldown := AbilityCooldownMs(p.HeroName, "secondary")
	if primary {
		last, cooldown = p.LastPrimaryAt, AbilityCooldownMs(p.HeroName, "primary")
	}
	if last != 0 && ts-last < cooldown {
		emitAbilityEvent(false, "ability_cooldown")
		return
	}
	if !primary {
		switch p.HeroName {
		case "Needle", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico", "Persephone Lumi", "Katty":
			p.LastAbilityOK = gs.useNewHeroGadget(p, ts)
			if p.LastAbilityOK {
				p.GadgetPulse++
			}
			if p.LastAbilityOK {
				emitAbilityEvent(true, "accepted")
			} else {
				emitAbilityEvent(false, "gadget_unavailable")
			}
			return
		}
	}
	if p.HeroName == "Mandy" && !primary {
		if p.GadgetCharges <= 0 || p.GadgetArmed {
			emitAbilityEvent(false, "gadget_unavailable")
			return
		}
		p.GadgetCharges--
		// Mandy keeps control of her movement and attack. The gadget is a
		// short defensive window that rewards landing the next staff hit.
		p.ShieldUntil = ts + 1800
		p.GadgetArmed = true
		p.GadgetPulse++
		gs.addEffect("mandy_stance", p.X, p.Y, 0, 0, 52, p.Rotation, 0, 0, p.Color, 0, 1800)
		p.LastSecondaryAt = ts
		p.LastAbilityOK = true
		emitAbilityEvent(true, "accepted")
		return
	}
	if primary {
		if kit := gs.combatKitFor(p.HeroName); kit != nil {
			aimDistance := p.AimDistance
			if aimDistance <= 0 {
				aimDistance = kit.AttackRange()
			}
			if !kit.Super(gs, p, ts, p.Rotation, aimDistance) {
				emitAbilityEvent(false, "ability_rejected")
				return
			}
			if p.HeroName == "Kaze" && p.KazeSuperReset {
				p.LastPrimaryAt = 0
				p.KazeSuperReset = false
			} else {
				p.LastPrimaryAt = ts
			}
			p.SuperCharge = 0
			if p.HeroName != "Mandy" {
				p.SuperPulse++
			}
			p.RevealedUntil = gs.nowMs() + 2000
			p.LastAbilityOK = true
			emitAbilityEvent(true, "accepted")
			gs.startAbilityResolution(p, slot, ackID, ts)
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
	emitAbilityEvent(true, "accepted")
	gs.startAbilityResolution(p, slot, ackID, ts)

	angle := p.Rotation
	gs.addEffect("burst", p.X, p.Y, 0, 0, 95, angle, 0, 0, p.Color, 0, 420)
	switch p.HeroName {
	case "Needle":
		if primary {
			p.VineUntil = ts + 4000
			gs.addEffect("vine", p.X, p.Y, 0, 0, 245, angle, 0, 0, "#75d947", 0, 650)
		} else {
			gs.dashAttack(p, angle, 170, 0, 0)
			gs.radialDamage(p.PlayerId, p.X, p.Y, 90, 65)
			gs.addEffect("spore-jump", p.X, p.Y, 0, 0, 90, angle, 0, 0, "#75d947", 0, 500)
		}
	}
}

// playerAbilityCancel is an explicit player decision during a readable
// wind-up/channel. The resource was already committed by the accepted cast;
// cancellation only prevents its delayed impact and reports that outcome so
// the client cannot leave a stale telegraph on screen.
func (gs *GameState) playerAbilityCancel(id string, ts int64, clientID string, targetClientID string) {
	p := gs.Players[id]
	emit := func(accepted bool, reason string) {
		if clientID == "" {
			return
		}
		resourceKind := "super_charge"
		resourceBefore, resourceAfter := 0, 0
		if p != nil {
			resourceBefore, resourceAfter = p.SuperCharge, p.SuperCharge
		}
		gs.emitCombatEvent(CombatEvent{
			Kind: "ability", AbilitySlot: "primary", Reason: reason, CommandID: clientID,
			SourceID: id, ResourceKind: resourceKind, ResourceBefore: resourceBefore, ResourceAfter: resourceAfter,
			Accepted: accepted, Resolved: true, Phase: "cancelled",
		})
	}
	if p == nil || !p.IsAlive() || !gs.CombatEnabled() {
		emit(false, "ability_unavailable")
		return
	}
	cancelled := false
	keptMandy := gs.PendingMandySupers[:0]
	for _, cast := range gs.PendingMandySupers {
		if cast != nil && cast.Owner == id && cast.TriggerAt > ts && (targetClientID == "" || cast.CommandID == targetClientID) {
			cancelled = true
			if cast.Visual != nil {
				cast.Visual.ExpiresAt = ts
			}
			continue
		}
		keptMandy = append(keptMandy, cast)
	}
	gs.PendingMandySupers = keptMandy
	keptStrikes := gs.LightningStrikes[:0]
	for _, strike := range gs.LightningStrikes {
		if strike != nil && strike.Owner == id && strike.TriggerAt > ts && (targetClientID == "" || strike.CommandID == targetClientID) {
			cancelled = true
			if strike.Visual != nil {
				strike.Visual.ExpiresAt = ts
			}
			if strike.TargetVisual != nil {
				strike.TargetVisual.ExpiresAt = ts
			}
			continue
		}
		keptStrikes = append(keptStrikes, strike)
	}
	gs.LightningStrikes = keptStrikes
	if !cancelled {
		emit(false, "ability_unavailable")
		return
	}
	if gs.abilityResolutions != nil {
		if targetClientID != "" {
			delete(gs.abilityResolutions, targetClientID)
		} else {
			for commandID, resolution := range gs.abilityResolutions {
				if resolution != nil && resolution.SourceID == id && resolution.ResolveAt > ts {
					delete(gs.abilityResolutions, commandID)
				}
			}
		}
	}
	p.CastUntil, p.ChannelUntil = 0, 0
	if p.MandySuperShieldUntil > ts {
		p.MandySuperShieldUntil, p.ShieldUntil, p.ShieldHP = 0, 0, 0
	}
	p.LastAbilityID, p.LastAbilityOK = clientID, false
	emit(false, "ability_cancelled")
}

func AbilityCooldownMs(heroName, slot string) int64 {
	if cooldown, ok := profileAbilityCooldownMs(heroName, slot); ok {
		return cooldown
	}
	// Unknown heroes are rejected by the catalog contract, but keep a safe
	// generic fallback for compatibility fixtures that exercise this helper
	// without a roster entry.
	if slot == "secondary" {
		return 6500
	}
	return 12000
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
	gs.playerShootWithMode(id, ts, screenAngle, "", false, aimDistance...)
}

func (gs *GameState) playerShootWithCommand(id string, ts int64, screenAngle float64, commandID string, aimDistance ...float64) {
	gs.playerShootWithMode(id, ts, screenAngle, commandID, false, aimDistance...)
}

func (gs *GameState) playerShootWithMode(id string, ts int64, screenAngle float64, commandID string, autoAim bool, aimDistance ...float64) {
	p := gs.Players[id]
	ammoBefore := 0
	if p != nil {
		ammoBefore = p.Ammo
	}
	emitResult := func(accepted, resolved bool) {
		ammoAfter := ammoBefore
		if p != nil {
			ammoAfter = p.Ammo
		}
		gs.emitCombatEvent(CombatEvent{
			Kind: "attack", CommandID: commandID, SourceID: id, ResourceKind: "ammo",
			ResourceBefore: ammoBefore, ResourceAfter: ammoAfter, Accepted: accepted, Resolved: resolved,
		})
	}
	if p == nil || !p.IsAlive() || p.StunUntil > ts || p.CastUntil > ts || p.ChannelUntil > ts || !gs.CombatEnabled() || p.Ammo <= 0 {
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
	previousCommandID, previousSourceID, previousAbilitySlot, previousBotAttackID, previousProjectileID := gs.activeCommandID, gs.activeSourceID, gs.activeAbilitySlot, gs.activeBotAttackID, gs.activeProjectileID
	previousPending := gs.commandHasProjectile
	previousAutoAim := gs.activeAutoAim
	gs.activeCommandID, gs.activeSourceID, gs.activeAbilitySlot, gs.activeProjectileID = commandID, id, "basic", 0
	gs.activeBotAttackID = ""
	gs.commandHasProjectile = false
	gs.activeAutoAim = autoAim
	defer func() {
		resolved := !gs.commandHasProjectile
		gs.activeCommandID, gs.activeSourceID, gs.activeBotAttackID, gs.activeProjectileID = previousCommandID, previousSourceID, previousBotAttackID, previousProjectileID
		gs.activeAbilitySlot = previousAbilitySlot
		gs.commandHasProjectile = previousPending
		gs.activeAutoAim = previousAutoAim
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
	if p.IsBot {
		gs.botMetrics.AttackAttempts++
		gs.activeBotAttackID = fmt.Sprintf("basic:%s:%d", id, p.AttackPulse)
	}
	if p.HeroName == "Kaze" && p.StealthUntil > ts {
		p.KazeCritReady = true
		p.KazeStealthCritReady = true
	}
	p.StealthUntil = 0
	revealDuration := int64(2_000)
	if gs.isInConcealment(p) {
		// Firing from concealment gives the hunter a fair read on the ambush
		// without making the attacker permanently visible in open combat.
		revealDuration = 1_200
	}
	p.RevealedUntil = ts + revealDuration
	if kit := gs.basicCombatKitFor(p.HeroName); kit != nil {
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
	b.DestroyWalls = wallBreakerProjectile(kind)
	b.HitRadius = 0
	if gs.activeAutoAim && gs.hasAutoAimTarget {
		b.HitRadius = AutoAimAssistRadius
		if !isMeleeBasicAttacker(p) && gs.autoAimTargetID != "" {
			b.TargetID = gs.autoAimTargetID
			b.Homing = true
		}
	}
	b.CommandID = gs.activeCommandID
	b.AbilitySlot = gs.activeAbilitySlot
	b.BotAttackID = gs.activeBotAttackID
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

func wallBreakerProjectile(kind string) bool {
	switch kind {
	case "spore", "mina_star", "lumi_orb", "katty_paint", "katty_paint_spray":
		return true
	default:
		return false
	}
}

func (gs *GameState) damageMultiplier(p *player.Player) float64 {
	if p == nil {
		return 1
	}
	multiplier := math.Max(1, p.DamageMultiplier)
	if p.LunarDamageUntil > gs.nowMs() {
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
		gs.damageMonster(bestMonsterID, target, damage, owner)
		gs.addEffect("lightning", fromX, fromY, target.X, target.Y, 0, 0, 0, 0, "#65efff", 0, 260)
		hit[bestMonsterID] = true
		fromX, fromY = target.X, target.Y
	}
}

func (gs *GameState) damageMonster(id string, target *monster.Monster, damage int, sourceIDs ...string) bool {
	if target == nil || !target.IsAlive() || damage <= 0 {
		return false
	}
	if target.VulnerableUntil > gs.nowMs() {
		damage = int(math.Round(float64(damage) * 1.25))
	}
	damageSourceID := gs.activeSourceID
	if len(sourceIDs) > 0 && sourceIDs[0] != "" {
		damageSourceID = sourceIDs[0]
	}
	livesBefore := target.Lives
	target.Hurt(damage)
	dealt := livesBefore - target.Lives
	if source := gs.Players[damageSourceID]; source != nil {
		source.BatDamage += dealt
		addSuperChargeForEffectiveDamage(source, target.MaxLives, dealt)
	}
	gs.recordBatDamage(id, gs.Players[damageSourceID], dealt)
	if gs.activeCommandID != "" {
		if gs.activeAbilitySlot != "" && gs.activeAbilitySlot != "basic" && dealt > 0 {
			gs.markAbilityResolutionHit(gs.activeCommandID)
		}
		gs.emitCombatEvent(CombatEvent{
			Kind: "hit", CommandID: gs.activeCommandID, SourceID: damageSourceID,
			TargetType: "monsters", TargetID: id, ProjectileID: gs.activeProjectileID, Damage: dealt,
		})
	}
	if target.IsAlive() {
		return false
	}
	dropX, dropY := gs.safeHealthBoostDropPosition(target.X+8, target.Y, 14)
	reward := prop.NewProp("health_boost", dropX, dropY, 14)
	reward.LootType = "bat"
	reward.LootSourceID = id
	reward.ExpiresAt = gs.nowMs() + HealthBoostTTL.Milliseconds()
	if source := gs.Players[damageSourceID]; source != nil && source.PlayerId != "" {
		reward.HealthBoostKillerID = source.PlayerId
		if gs.Mode == ModeTeamDeathmatch && source.Team != "" {
			reward.VisibilityTeam = source.Team
		} else {
			reward.VisibilityPlayerID = source.PlayerId
		}
	}
	if gs.appendHealthBoostReward(reward) {
		gs.recordBatReward(id, gs.Players[damageSourceID], reward)
	}
	if gs.MonsterRespawns == nil {
		gs.MonsterRespawns = make(map[string]MonsterRespawn)
	}
	gs.MonsterRespawns[id] = MonsterRespawn{
		RespawnAt: gs.nowMs() + BatCampRespawnDuration.Milliseconds(),
		X:         target.SpawnX, Y: target.SpawnY, Radius: target.Radius,
		Kind: target.Kind, CampID: target.CampID, TerritoryRadius: target.TerritoryRadius,
		Tier: target.Tier, MaxLives: target.MaxLives,
	}
	delete(gs.Monsters, id)
	delete(gs.batDamageTeams, id)
	delete(gs.batDamageSeen, id)
	delete(gs.batContested, id)
	return true
}

func (gs *GameState) updateMonsterRespawns(now int64) {
	if gs == nil || len(gs.MonsterRespawns) == 0 {
		return
	}
	if gs.Monsters == nil {
		gs.Monsters = make(map[string]*monster.Monster)
	}
	for id, respawn := range gs.MonsterRespawns {
		if now < respawn.RespawnAt {
			continue
		}
		if _, occupied := gs.Monsters[id]; occupied {
			delete(gs.MonsterRespawns, id)
			continue
		}
		lives := respawn.MaxLives
		if lives <= 0 {
			lives = monster.MonsterLives
		}
		mapWidth, mapHeight := float64(512), float64(512)
		if gs.Map != nil {
			mapWidth, mapHeight = gs.Map.WidthInPixels, gs.Map.HeightInPixels
		}
		m := monster.NewMonsterOfKindAt(now, respawn.Kind, respawn.CampID, respawn.X, respawn.Y, respawn.Radius, mapWidth, mapHeight, respawn.TerritoryRadius, lives)
		m.Tier = respawn.Tier
		if m.Tier <= 0 {
			m.Tier = 1
		}
		gs.Monsters[id] = m
		gs.recordBatRespawn()
		delete(gs.MonsterRespawns, id)
	}
}

func (gs *GameState) updateMonsterZones() {
	if gs == nil || len(gs.MonsterZones) == 0 {
		return
	}
	now := gs.nowMs()
	kept := gs.MonsterZones[:0]
	for _, zone := range gs.MonsterZones {
		if zone == nil || zone.TicksLeft <= 0 || now >= zone.ExpiresAt {
			continue
		}
		for zone.TicksLeft > 0 && now >= zone.NextTickAt {
			for _, target := range gs.Players {
				if target == nil || !target.IsAlive() || math.Hypot(target.X-zone.X, target.Y-zone.Y) > zone.Radius+target.Radius {
					continue
				}
				gs.dealPlayerDamage(nil, target, zone.Damage)
			}
			zone.TicksLeft--
			zone.NextTickAt += zone.Interval
		}
		if zone.TicksLeft > 0 {
			kept = append(kept, zone)
		}
	}
	gs.MonsterZones = kept
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
		if !gs.autoAimHitsTarget(source, target.X, target.Y, meleeTargetRadius(source, target), angle, reach, halfArc) {
			continue
		}
		gs.dealPlayerDamage(source, target, damage)
		hits++
		if pull {
			gs.movePlayerByCollision(target, -math.Cos(angle)*16, -math.Sin(angle)*16)
		}
	}
	for id, target := range gs.Monsters {
		if target == nil || !target.IsAlive() {
			continue
		}
		if !gs.autoAimHitsTarget(source, target.X, target.Y, target.Radius, angle, reach, halfArc) {
			continue
		}
		gs.damageMonster(id, target, damage, source.PlayerId)
		hits++
		gs.addEffect("damage", target.X, target.Y, 0, 0, 0, 0, 0, 0, "#ffe55c", damage, 260)
	}
	for _, crate := range gs.Props {
		if crate == nil || !crate.Active || !isBreakableCrate(crate) {
			continue
		}
		dx, dy := crate.X-source.X, crate.Y-source.Y
		delta := math.Atan2(math.Sin(math.Atan2(dy, dx)-angle), math.Cos(math.Atan2(dy, dx)-angle))
		if math.Hypot(dx, dy) > reach+crate.Radius || math.Abs(delta) > halfArc {
			continue
		}
		if gs.damageCrate(source, crate, damage) {
			hits++
		}
	}
	if gs.Mode == ModeTeamDeathmatch {
		for _, objective := range gs.Objectives {
			if objective == nil || objective.Lives <= 0 || objective.Team == source.Team || !gs.autoAimHitsTarget(source, objective.X, objective.Y, objective.Radius, angle, reach, halfArc) {
				continue
			}
			if gs.damageObjective(source, objective, damage) {
				hits++
			}
		}
	}
	return hits
}

func isBreakableCrate(crate *prop.Prop) bool {
	return crate != nil && crate.Type == "lunar_crate"
}

// movePlayerByCollision applies displacement caused by a control ability using
// the same live collision graph as ordinary movement. Flying heroes retain
// their traversal exception, while grounded heroes cannot be pulled or pushed
// through a wall or an active crate.
func (gs *GameState) movePlayerByCollision(p *player.Player, deltaX, deltaY float64) {
	if gs == nil || p == nil || (deltaX == 0 && deltaY == 0) {
		return
	}
	if isPlayerFlying(p, gs.nowMs()) {
		moveCircleDuringFlight(&p.CircleBody, gs.Walls, deltaX, deltaY)
	} else {
		geometry.MoveCircleWithBlockingWallsAndCircles(&p.CircleBody, gs.Walls, gs.activeCrateBodies(), deltaX, deltaY)
	}
	if gs.Map != nil {
		clamped := gs.Map.ClampCircle(&p.CircleBody)
		p.X, p.Y = clamped.X, clamped.Y
	}
}

func (gs *GameState) damageLunarCrate(source *player.Player, crate *prop.Prop, damage int) bool {
	if crate == nil || crate.Type != "lunar_crate" {
		return false
	}
	return gs.damageCrate(source, crate, damage)
}

func (gs *GameState) damageCrate(source *player.Player, crate *prop.Prop, damage int) bool {
	if !isBreakableCrate(crate) || !crate.Active || damage <= 0 {
		return false
	}
	crate.Lives -= int(math.Max(1, float64(damage)))
	crateColor := lunarLootColor(crate.LootType)
	gs.addEffect("crate_hit", crate.X, crate.Y, 0, 0, crate.Radius, 0, 0, 0, crateColor, damage, 260)
	if crate.Lives > 0 {
		return true
	}
	crate.Lives = 0
	crate.Active = false
	reward := prop.NewProp("lunar_"+crate.LootType, crate.X, crate.Y, 16)
	reward.LootType = crate.LootType
	gs.Props = append(gs.Props, reward)
	gs.addEffect("crate_break", crate.X, crate.Y, 0, 0, 34, 0, 0, 0, lunarLootColor(crate.LootType), 0, 650)
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
		gs.damageMonster(id, target, damage, owner)
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
		gs.damageMonster(id, target, damage, owner)
		hit[key] = true
		hits++
	}
	return hits
}

func SuperChargePercent(p *player.Player, _ int64) int {
	if p == nil {
		return 0
	}
	charge := p.SuperCharge
	if charge < 0 {
		return 0
	}
	if charge > SuperMaxChargePercent {
		return SuperMaxChargePercent
	}
	return charge
}

func addSuperChargeFromEffectiveDamage(source, target *player.Player, damage int) {
	if target == nil {
		return
	}
	addSuperChargeForEffectiveDamage(source, target.MaxLives, damage)
}

func addSuperChargeForEffectiveDamage(source *player.Player, maxLives, damage int) {
	if source == nil || damage <= 0 || maxLives <= 0 {
		return
	}
	charge := int(math.Round(float64(damage) * float64(SuperMaxChargePercent) / float64(maxLives)))
	if charge < 1 {
		charge = 1
	}
	addSuperChargePoints(source, charge)
}

// Control and support are deliberately smaller, bounded contributions than
// damage. They reward a successful role action without making a safe loop of
// short slows or self-heals the fastest way to a Super.
func addSuperChargeForControl(source, target *player.Player, durationMs int64) {
	if source == nil || target == nil || !target.IsAlive() || durationMs <= 0 {
		return
	}
	charge := int(math.Round(float64(durationMs) / 200))
	if charge < 1 {
		charge = 1
	}
	source.ControlAppliedMs += durationMs
	addSuperChargePoints(source, charge)
}

func addSuperChargeForSupport(source *player.Player, effectiveValue, maxLives int) {
	if source == nil || effectiveValue <= 0 || maxLives <= 0 {
		return
	}
	charge := int(math.Round(float64(effectiveValue) * 50 / float64(maxLives)))
	if charge < 1 {
		charge = 1
	}
	source.HealingDone += effectiveValue
	addSuperChargePoints(source, charge)
}

func addSuperChargePoints(source *player.Player, points int) {
	if source == nil || points <= 0 {
		return
	}
	source.SuperCharge += points
	if source.SuperCharge > SuperMaxChargePercent {
		source.SuperCharge = SuperMaxChargePercent
	}
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
		gs.WallsSource = kept
	}
	return destroyed
}

// destroyNearestWallAt removes one destructible cell touched by a projectile.
// Keeping the selection to one cell makes wall breaking powerful without
// turning every projectile into a map-wide beam.
func (gs *GameState) destroyNearestWallAt(x, y, radius float64) bool {
	if gs == nil || gs.Map == nil {
		return false
	}
	var hit *geometry.WallTile
	bestDistance := math.MaxFloat64
	for _, wall := range gs.Map.Collisions {
		if wall == nil || !isDestructibleWall(wall.Type) {
			continue
		}
		closestX := math.Max(wall.MinX, math.Min(wall.MaxX, x))
		closestY := math.Max(wall.MinY, math.Min(wall.MaxY, y))
		if math.Hypot(closestX-x, closestY-y) > radius {
			continue
		}
		distance := math.Hypot((wall.MinX+wall.MaxX)/2-x, (wall.MinY+wall.MaxY)/2-y)
		if distance < bestDistance {
			hit, bestDistance = wall, distance
		}
	}
	if hit == nil {
		return false
	}
	kept := make([]*geometry.WallTile, 0, len(gs.Map.Collisions)-1)
	for _, wall := range gs.Map.Collisions {
		if wall != hit {
			kept = append(kept, wall)
		}
	}
	gs.Map.Collisions = kept
	gs.MapRevision++
	gs.Walls = geometry.NewSpatialHash(TileSize)
	for _, wall := range kept {
		gs.Walls.Insert(wall)
	}
	gs.WallsSource = kept
	return true
}

func isDestructibleWall(wallType string) bool {
	return wallType == "destructible" || wallType == "dead_tree"
}

func (gs *GameState) createTemporaryRock(x, y float64, expiresAt int64) {
	const size = 38.0
	wall := &geometry.WallTile{MinX: x - size/2, MinY: y - size/2, MaxX: x + size/2, MaxY: y + size/2, Type: "temporary-rock"}
	gs.Map.Collisions = append(gs.Map.Collisions, wall)
	gs.Walls.Insert(wall)
	gs.WallsSource = gs.Map.Collisions
	gs.TemporaryWalls[wall] = expiresAt
	gs.MapRevision++
	gs.addEffect("rock", x, y, 0, 0, 58, 0, 0, 0, "#b87447", 0, 450)
}

func (gs *GameState) updateTemporaryWalls() {
	if len(gs.TemporaryWalls) == 0 {
		return
	}
	now, changed := gs.nowMs(), false
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
	gs.WallsSource = kept
}

func (gs *GameState) dashAttack(p *player.Player, angle, distance, radius float64, damage int) {
	steps := 5
	for step := 0; step < steps; step++ {
		geometry.MoveCircleWithBlockingWallsAndCircles(
			&p.CircleBody,
			gs.Walls,
			gs.activeCrateBodies(),
			math.Cos(angle)*distance/float64(steps),
			math.Sin(angle)*distance/float64(steps),
		)
		gs.hitSector(p, angle, radius, math.Pi, damage, false)
	}
}

func (gs *GameState) vaultMove(p *player.Player, angle, distance float64) {
	geometry.MoveCircleWithBlockingWallsAndCircles(
		&p.CircleBody,
		gs.Walls,
		gs.activeCrateBodies(),
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
			gs.resetPlayerMatchState(p)
		} else {
			p.Lives = 0
			gs.resetPlayerMatchState(p)
			p.Lives = 0
		}
	}
}

// resetPlayerMatchState is the single boundary between two fresh battles.
// Player identity and lobby/team selection survive, while every combat stat,
// ability resource, timer, stack and match history is rebuilt from the hero
// catalog so a previous battle cannot leak power into the next one.
func (gs *GameState) resetPlayerMatchState(p *player.Player) {
	if p == nil {
		return
	}
	catalog := gs.heroCatalog
	if catalog == nil {
		catalog = DefaultHeroCatalog()
	}
	if hero, ok := catalog.Find(p.HeroName); ok {
		p.Radius = hero.Radius
		p.MaxLives = hero.MaxLives
		p.BaseMaxLives = hero.MaxLives
		p.Speed = float64(hero.Speed) * RuntimeMovementSpeedScale
		p.AttackDmg = hero.AttackDamage
		p.AttackRate = hero.AttackRate
		p.ReloadTime = hero.ReloadTime
		p.MaxAmmo = hero.MaxAmmo
		p.BulletSpd = float64(hero.BulletSpeed) * RuntimeProjectileSpeedScale
		p.BulletSz = hero.BulletSize
		p.AttackType = hero.AttackType
		p.RegenRate = hero.RegenRate
	} else if p.BaseMaxLives > 0 {
		p.MaxLives = p.BaseMaxLives
	}

	p.Lives = p.MaxLives
	p.HealthBoosts = 0
	p.Kills, p.BasicDamage, p.SkillDamage, p.BasicOnlyKills, p.SkillAssistedKills = 0, 0, 0, 0, 0
	p.HealingDone, p.HealingBlocked, p.ShieldProvided, p.DamagePrevented, p.Assists = 0, 0, 0, 0, 0
	p.HealWindowMs, p.LastEffectiveHealAt = 0, 0
	p.ControlAppliedMs = 0
	p.BatDamage, p.BatContests, p.CubeClaims, p.EscapeSaves = 0, 0, 0, 0
	p.TimeToFirstContactMs, p.CombatUptimeMs, p.RespawnDowntimeMs = 0, 0, 0
	p.UncontestedTravelMs = 0
	p.CombatFirstContactAt, p.LastCombatAt, p.LastDeathAt, p.LastMovementAt = 0, 0, 0, 0
	p.Place, p.Deaths = 0, 0
	p.PlayerDamage, p.TowerDamage = 0, 0
	p.TownHallDamage, p.TowersDestroyed, p.TownHallsDestroyed = 0, 0, 0
	p.Rotation, p.Ack = 0, 0
	p.LastShootAt, p.MoveX, p.MoveY = 0, 0, 0
	p.ShieldHP, p.ShieldStacks, p.ShieldStackUntil = 0, 0, 0
	p.PoisonUntil, p.PoisonTickAt, p.PoisonBy = 0, 0, ""
	p.Marks, p.SuperCharge, p.Heat, p.HeatUntil = 0, 0, 0, 0
	p.AttackPulse, p.SuperPulse, p.GadgetPulse = 0, 0, 0
	p.Aiming, p.AimDistance = false, 0
	p.ShieldUntil, p.InvulnerableUntil, p.StealthUntil = 0, 0, 0
	p.StunUntil, p.CastUntil, p.ChannelUntil = 0, 0, 0
	p.VineUntil, p.VortexUntil, p.VortexReadyAt, p.VortexTickAt = 0, 0, 0, 0
	p.FlyingUntil, p.FlightSpeedMultiplier, p.BlindUntil = 0, 0, 0
	p.Dodges, p.Souls, p.Deflect, p.Evolution = 0, 0, 0, 0
	p.LastAbilityTick, p.LastAbilityID, p.LastAbilityOK = 0, "", false
	p.PowerCores, p.DamageMultiplier = 0, 1
	p.LastPrimaryAt, p.LastSecondaryAt = 0, 0
	p.HasteUntil, p.LunarSpeedUntil, p.LunarDamageUntil = 0, 0, 0
	p.LunarShield, p.SlowUntil, p.SlowMultiplier = false, 0, 1
	p.AntiHealUntil, p.AntiHealMultiplier = 0, 1
	p.SporeStacks, p.SporeStackUntil = 0, 0
	p.FocusStartedAt, p.FocusCharge = 0, 0
	p.SuppressedRage, p.MicoRage, p.LumiFlowers = 0, 0, 0
	p.VortexRadius, p.VortexDamage = 0, 0
	p.StoneArmorUntil, p.GadgetArmed = 0, false
	p.MandySuperShieldUntil, p.MicoArmorDetonation = 0, false
	p.KazeCritReady, p.KazeStealthCritReady, p.KazeSuperReset, p.KazeCombo, p.KazeComboUntil = false, false, false, 0, 0
	p.GadgetCharges, p.Ammo, p.NextAmmoAt = GadgetChargesOnSpawn, p.MaxAmmo, 0
	p.RegenCarry, p.LastDamageAt, p.RespawnAt = 0, 0, 0
	p.RespawnCount, p.LastRegenAt = 0, 0
	p.CombatFirstContactAt, p.LastCombatAt, p.LastDeathAt = 0, 0, 0
	p.TimeToFirstContactMs, p.CombatUptimeMs, p.RespawnDowntimeMs = 0, 0, 0
	p.RevealedUntil, p.LastContactAt, p.LastContactBy = 0, 0, ""
	p.LastContactX, p.LastContactY, p.LastContactDirX, p.LastContactDirY = 0, 0, 0, 0
	p.HitImpulseX, p.HitImpulseY = 0, 0
}

func (gs *GameState) resetMatchAbilityRuntime() {
	gs.Bullets = make([]*bullet.Bullet, 0)
	gs.Actions = make([]Action, 0)
	gs.Effects = make([]*BattleEffect, 0)
	gs.DelayedEffects = make([]*DelayedBattleEffect, 0)
	gs.ScheduledShots = make([]*ScheduledShot, 0)
	gs.DamageZones = make([]*DamageZone, 0)
	gs.MonsterZones = make([]*MonsterZone, 0)
	gs.PendingMandySupers = make([]*PendingMandySuper, 0)
	gs.HeroZones = make([]*HeroZone, 0)
	gs.KattyPaintStacks = make(map[string]map[string]int)
	gs.KattyPaintUntil = make(map[string]map[string]int64)
	gs.LightMarkedUntil = make(map[string]int64)
	gs.AbilityTargets = make(map[string]string)
	gs.abilityResolutions = make(map[string]*abilityResolution)
	gs.LightningStrikes = make([]*LightningStrike, 0)
	gs.Skyfalls = make([]*Skyfall, 0)
	gs.TemporaryWalls = make(map[*geometry.WallTile]int64)
	gs.CombatEvents = make([]CombatEvent, 0)
	gs.NextCombatEventID = 0
	gs.NextCombatEffectID = 0
	gs.BotMemory = make(map[string]*BotPerception)
	gs.botMLTrajectory = nil
	gs.resetBotAIMetrics()
	gs.resetBatLifecycleMetrics()
	gs.activeCommandID, gs.activeSourceID, gs.activeAbilitySlot = "", "", ""
	gs.activeBotAttackID = ""
	gs.activeProjectileID, gs.commandHasProjectile = 0, false
	gs.activeAutoAim, gs.hasAutoAimTarget = false, false
	gs.autoAimTargetX, gs.autoAimTargetY, gs.autoAimTargetID = 0, 0, ""
}

// resetMatchMap restores the authored collision graph before a new battle.
// Abilities can destroy walls or add temporary rocks, so clearing only the
// ability lists would still leak mutated map geometry into the next match.
func (gs *GameState) resetMatchMap() {
	if gs == nil || gs.mapProvider == nil {
		return
	}
	m, err := gs.mapProvider.LoadMap(gs.MapName)
	if err != nil || m == nil {
		return
	}
	gs.Map = m
	gs.Walls = geometry.NewSpatialHash(float64(TileSize))
	for _, wall := range m.Collisions {
		gs.Walls.Insert(wall)
	}
	gs.WallsSource = m.Collisions
	gs.MapRevision++
	gs.botWallCacheRevision = -1
	gs.botWallCache = nil
	gs.botTerrainCacheRevision = -1
	gs.botTerrainCache = nil
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

func (gs *GameState) setPlayersPositionForTeams() {
	if gs.Map == nil || len(gs.Map.TeamSpawners) == 0 {
		return
	}
	used := map[string]int{"Blue": 0, "Red": 0}
	for _, p := range gs.Players {
		spawners := gs.Map.TeamSpawners[p.Team]
		if len(spawners) == 0 {
			continue
		}
		spawner := spawners[used[p.Team]%len(spawners)]
		used[p.Team]++
		p.X = spawner.X + PlayerSize/2
		p.Y = spawner.Y + PlayerSize/2
		p.MoveX, p.MoveY, p.Aiming, p.Ack = 0, 0, false, 0
	}
}

// PlacePlayerAtTeamSpawn is used for players joining an already-running team
// match. Their initial PlayerAdd position is intentionally mode-agnostic, so
// the final team assignment must be followed by an authoritative placement.
func (gs *GameState) PlacePlayerAtTeamSpawn(playerID string) {
	if gs == nil || gs.Mode != ModeTeamDeathmatch || gs.Map == nil {
		return
	}
	p := gs.Players[playerID]
	if p == nil {
		return
	}
	spawners := gs.Map.TeamSpawners[p.Team]
	if len(spawners) == 0 {
		return
	}
	for _, spawn := range spawners {
		occupied := false
		for id, other := range gs.Players {
			if id == playerID || other == nil || other.Team != p.Team {
				continue
			}
			if math.Hypot(other.X-spawn.CenterX(), other.Y-spawn.CenterY()) < PlayerSize {
				occupied = true
				break
			}
		}
		if occupied {
			continue
		}
		p.X, p.Y = spawn.CenterX(), spawn.CenterY()
		p.MoveX, p.MoveY, p.Aiming, p.Ack = 0, 0, false, 0
		return
	}
	// A full team still must never fall back to the enemy base.
	spawn := spawners[0]
	p.X, p.Y = spawn.CenterX(), spawn.CenterY()
	p.MoveX, p.MoveY, p.Aiming, p.Ack = 0, 0, false, 0
}

func (gs *GameState) setPlayersTeamsRandomly() {
	ids := make([]string, 0, len(gs.Players))
	for id := range gs.Players {
		ids = append(ids, id)
	}
	ids = geometry.ShuffleStrings(ids)
	// Matchmaking may have already assigned a valid team. Preserve it and use
	// the legacy balanced fallback only for clients that joined a room directly.
	counts := map[string]int{"Blue": 0, "Red": 0}
	for _, id := range ids {
		if gs.Players[id].TeamLocked {
			team := gs.Players[id].Team
			if team == "Blue" || team == "Red" {
				counts[team]++
			}
		}
	}

	minPerTeam := len(ids) / 2
	rest := len(ids) % 2

	for _, id := range ids {
		p := gs.Players[id]
		if p.TeamLocked {
			continue
		}
		team := "Red"
		if counts["Blue"] < minPerTeam+rest {
			team = "Blue"
		}
		p.SetTeam(team)
		counts[team]++
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
	if gs.State != GameStateGame || len(gs.Players) == 0 {
		return false
	}
	winner, decided := gs.matchRules().EvaluateWinner(gs, gs.nowMs())
	if !decided {
		return false
	}
	if winner == "" {
		// Elimination is terminal even when it happens before the island's
		// beacon phase. There is no winner in a simultaneous all-dead result.
		gs.EndReason = resultReason(gs.matchRules(), gs, winner, false)
		gs.onGameEnd(&ServerEvent{
			Type:   "won",
			Params: map[string]interface{}{"name": "", "reason": gs.EndReason, "draw": true},
		})
		gs.startFinished()
		return true
	}

	gs.setWinnerPlayerID(winner)
	gs.EndReason = resultReason(gs.matchRules(), gs, winner, false)
	gs.onGameEnd(&ServerEvent{
		Type:   "won",
		Params: map[string]interface{}{"name": winner, "winnerId": gs.WinnerPlayerID, "reason": gs.EndReason, "draw": false},
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
	return gs.matchRules().TimeoutWinner(gs)
}

func (gs *GameState) matchRules() MatchRules {
	if gs.rules == nil {
		gs.rules = NewMatchRules(gs.Mode)
	}
	return gs.rules
}

func (gs *GameState) matchDuration() time.Duration {
	if gs.Mode == ModeTeamDeathmatch {
		return TeamBattleDuration
	}
	return GameDuration
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
	if gs.Map == nil || count <= 0 {
		return
	}
	if len(gs.Map.MonsterSpawns) > 0 {
		if gs.Mode == ModeTeamDeathmatch {
			gs.addAuthoredTeamMonsters(count)
		} else {
			gs.addAuthoredSoloMonsters(count)
		}
		return
	}

	regions := monsterSpawnRegions()
	placed := make([][2]float64, 0, count)
	for i := 0; i < count; i++ {
		tier := 1
		if i == 0 {
			tier = 2
		}
		x, y := gs.randomMonsterSpawn(regions[i%len(regions)], placed)
		placed = append(placed, [2]float64{x, y})
		lives := monster.MonsterLives
		if tier == 2 {
			lives = monster.EliteMonsterLives
		}
		m := monster.NewMonsterAt(gs.nowMs(), x, y, PlayerSize/2, gs.Map.WidthInPixels, gs.Map.HeightInPixels, lives)
		m.Tier, m.MaxLives = tier, lives
		monsterID := ""
		for monsterID == "" {
			candidate := fmt.Sprintf("%d", geometry.GetRandomInt(0, 1000))
			if _, exists := gs.Monsters[candidate]; !exists {
				monsterID = candidate
			}
		}
		gs.Monsters[monsterID] = m
	}
}

func (gs *GameState) addAuthoredSoloMonsters(count int) {
	limit := count
	if limit > len(gs.Map.MonsterSpawns) {
		limit = len(gs.Map.MonsterSpawns)
	}
	for index, spawn := range gs.Map.MonsterSpawns[:limit] {
		tier, lives := 1, monster.MonsterLives
		if index%4 == 0 {
			tier, lives = 2, monster.EliteMonsterLives
		}
		m := monster.NewMonsterOfKindAt(gs.nowMs(), monster.MonsterKind(spawn.Kind), spawn.ID, spawn.X, spawn.Y, PlayerSize/2, gs.Map.WidthInPixels, gs.Map.HeightInPixels, spawn.TerritoryRadius, lives)
		m.Tier, m.MaxLives = tier, lives
		gs.Monsters[fmt.Sprintf("solo-camp-%d", index)] = m
	}
}

func (gs *GameState) addAuthoredTeamMonsters(count int) {
	limit := count
	if limit > len(gs.Map.MonsterSpawns) {
		limit = len(gs.Map.MonsterSpawns)
	}
	for index, spawn := range gs.Map.MonsterSpawns[:limit] {
		tier, lives := 1, monster.MonsterLives
		if index%4 == 0 {
			tier, lives = 2, monster.EliteMonsterLives
		}
		m := monster.NewMonsterOfKindAt(gs.nowMs(), monster.MonsterKind(spawn.Kind), spawn.ID, spawn.X, spawn.Y, PlayerSize/2, gs.Map.WidthInPixels, gs.Map.HeightInPixels, spawn.TerritoryRadius, lives)
		m.Tier, m.MaxLives = tier, lives
		gs.Monsters[fmt.Sprintf("team-bat-%d", index)] = m
	}
}

const (
	monsterSpawnColumns   = 4
	monsterSpawnRows      = 2
	monsterSpawnAttempts  = 32
	monsterSpawnClearance = PlayerSize * 2
)

func monsterSpawnRegions() [][2]int {
	regions := make([][2]int, 0, monsterSpawnColumns*monsterSpawnRows)
	for row := 0; row < monsterSpawnRows; row++ {
		for column := 0; column < monsterSpawnColumns; column++ {
			regions = append(regions, [2]int{column, row})
		}
	}
	for i := len(regions) - 1; i > 0; i-- {
		j := geometry.GetRandomInt(0, i)
		regions[i], regions[j] = regions[j], regions[i]
	}
	return regions
}

func (gs *GameState) randomMonsterSpawn(region [2]int, placed [][2]float64) (float64, float64) {
	cellWidth := gs.Map.WidthInPixels / monsterSpawnColumns
	cellHeight := gs.Map.HeightInPixels / monsterSpawnRows
	minX := float64(region[0])*cellWidth + monsterSpawnClearance
	maxX := float64(region[0]+1)*cellWidth - monsterSpawnClearance
	minY := float64(region[1])*cellHeight + monsterSpawnClearance
	maxY := float64(region[1]+1)*cellHeight - monsterSpawnClearance

	for attempt := 0; attempt < monsterSpawnAttempts; attempt++ {
		x := geometry.GetRandomFloat(minX, maxX)
		y := geometry.GetRandomFloat(minY, maxY)
		if gs.isMonsterSpawnFree(x, y, placed) {
			return x, y
		}
	}

	return (minX + maxX) / 2, (minY + maxY) / 2
}

func (gs *GameState) isMonsterSpawnFree(x, y float64, placed [][2]float64) bool {
	body := &geometry.CircleBody{X: x, Y: y, Radius: PlayerSize / 2}
	for _, wall := range gs.Map.Collisions {
		if wall == nil || !geometry.IsBlockingWall(wall.Type) {
			continue
		}
		wallBody := &geometry.RectangleBody{X: wall.MinX, Y: wall.MinY, Width: wall.MaxX - wall.MinX, Height: wall.MaxY - wall.MinY}
		if geometry.CircleToRectangle(body, wallBody) {
			return false
		}
	}
	for _, p := range gs.Players {
		if p != nil && math.Hypot(x-p.X, y-p.Y) < monsterSpawnClearance {
			return false
		}
	}
	for _, other := range placed {
		if math.Hypot(x-other[0], y-other[1]) < monsterSpawnClearance {
			return false
		}
	}
	return true
}

func (gs *GameState) monstersClear() {
	gs.Monsters = make(map[string]*monster.Monster)
	gs.MonsterRespawns = make(map[string]MonsterRespawn)
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
