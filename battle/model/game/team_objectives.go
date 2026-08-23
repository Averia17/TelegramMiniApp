package game

import (
	"battle/model/bullet"
	"battle/model/player"
	"fmt"
	"math"
	"time"
)

const (
	teamTownHallLives   = 2000
	teamTowerLives      = 1000
	teamTowerRange      = 620.0
	teamTowerDamage     = 55
	teamTowerCooldown   = 1200
	teamTowerWindup     = 420
	teamTowerShotSpeed  = 34 * RuntimeProjectileSpeedScale
	teamTowerShotSize   = 13.0
	teamRespawnDelayMin = 5 * time.Second
	teamRespawnDelayMax = 15 * time.Second
)

func newObjectiveStates(definitions []objectiveDefinition) map[string]*ObjectiveState {
	result := map[string]*ObjectiveState{}
	for _, objective := range definitions {
		lives := teamTowerLives
		if objective.Type == "town_hall" {
			lives = teamTownHallLives
		}
		attackRange := 0.0
		if objective.Type == "tower" {
			attackRange = teamTowerRange
		}
		result[objective.ID] = &ObjectiveState{ID: objective.ID, Type: objective.Type, Team: objective.Team, X: objective.X, Y: objective.Y, Radius: objective.Radius, Lives: lives, MaxLives: lives, AttackRange: attackRange}
	}
	return result
}

type objectiveDefinition struct {
	ID, Type, Team string
	X, Y, Radius   float64
}

func objectiveDefinitions(state *GameState) []objectiveDefinition {
	if state == nil || state.Map == nil {
		return nil
	}
	result := make([]objectiveDefinition, 0, len(state.Map.Objectives))
	for _, objective := range state.Map.Objectives {
		result = append(result, objectiveDefinition{ID: objective.ID, Type: objective.Type, Team: objective.Team, X: objective.X, Y: objective.Y, Radius: objective.Radius})
	}
	return result
}

func newObjectiveStatesFromGame(state *GameState) map[string]*ObjectiveState {
	return newObjectiveStates(objectiveDefinitions(state))
}

func (gs *GameState) initializeTeamObjectives() {
	if gs.Mode != ModeTeamDeathmatch {
		gs.Objectives = nil
		return
	}
	gs.Objectives = newObjectiveStatesFromGame(gs)
}

func (gs *GameState) objectiveTowersAlive(team string) bool {
	for _, objective := range gs.Objectives {
		if objective.Team == team && objective.Type == "tower" && objective.Lives > 0 {
			return true
		}
	}
	return false
}

func (gs *GameState) damageObjective(source *player.Player, objective *ObjectiveState, amount int) bool {
	if gs.Mode != ModeTeamDeathmatch || source == nil || objective == nil || objective.Lives <= 0 || source.Team == objective.Team || amount <= 0 {
		return false
	}
	if objective.Type == "town_hall" && gs.objectiveTowersAlive(objective.Team) {
		return false
	}
	livesBefore := objective.Lives
	objective.Lives = int(math.Max(0, float64(objective.Lives-amount)))
	dealt := livesBefore - objective.Lives
	if objective.Type == "tower" {
		source.TowerDamage += dealt
		if livesBefore > 0 && objective.Lives == 0 {
			source.TowersDestroyed++
		}
	} else if objective.Type == "town_hall" {
		source.TownHallDamage += dealt
		if livesBefore > 0 && objective.Lives == 0 {
			source.TownHallsDestroyed++
		}
	}
	objective.LastDamagedAt = time.Now().UnixMilli()
	objective.LastDamagedBy = source.Team
	gs.addEffect("objective_hit", objective.X, objective.Y, 0, 0, objective.Radius, 0, 0, 0, source.Color, amount, 300)
	if gs.activeCommandID != "" {
		gs.emitCombatEvent(CombatEvent{
			Kind: "hit", CommandID: gs.activeCommandID, SourceID: source.PlayerId,
			TargetType: "objectives", TargetID: objective.ID, ProjectileID: gs.activeProjectileID,
			Damage: livesBefore - objective.Lives,
		})
	}
	if objective.Lives == 0 {
		gs.Broadcast("objective_destroyed", map[string]interface{}{"id": objective.ID, "type": objective.Type, "team": objective.Team})
	}
	return true
}

func (gs *GameState) updateTeamObjectivesAt(now int64) {
	if gs.Mode != ModeTeamDeathmatch || gs.State != GameStateGame {
		return
	}
	for _, objective := range gs.Objectives {
		if objective == nil || objective.Type != "tower" || objective.Lives <= 0 {
			continue
		}
		if objective.AttackReleaseAt > 0 {
			if objective.AttackReleaseAt > now {
				continue
			}
			if objective.AttackTargetID != "" {
				gs.spawnTowerShotAt(objective, objective.AttackTargetID, objective.AttackTargetX, objective.AttackTargetY)
				gs.addEffect("tower_muzzle", objective.X, objective.Y, 0, 0, objective.Radius+18, math.Atan2(objective.AttackTargetY-objective.Y, objective.AttackTargetX-objective.X), 0, 0, player.GetTeamColor(objective.Team), teamTowerDamage, 260)
			}
			objective.AttackTargetID = ""
			objective.AttackReleaseAt = 0
			continue
		}
		if objective.AttackAt > now {
			continue
		}
		var target *player.Player
		best := teamTowerRange
		for _, candidate := range gs.Players {
			if candidate == nil || !candidate.IsAlive() || candidate.Team == objective.Team {
				continue
			}
			if distance := math.Hypot(candidate.X-objective.X, candidate.Y-objective.Y); distance <= best {
				if segmentHitsBlockingWallExcept(objective.X, objective.Y, candidate.X, candidate.Y, objective.Radius, gs.Walls, "objective") {
					continue
				}
				best, target = distance, candidate
			}
		}
		if target == nil {
			continue
		}
		objective.AttackAt = now + teamTowerCooldown
		objective.AttackTargetID = target.PlayerId
		objective.AttackTargetX, objective.AttackTargetY = target.X, target.Y
		objective.AttackReleaseAt = now + teamTowerWindup
		gs.addEffect("tower_telegraph", objective.X, objective.Y, target.X, target.Y, target.Radius+22, 0, 0, 0, player.GetTeamColor(objective.Team), teamTowerDamage, teamTowerWindup+100)
	}
}

func (gs *GameState) spawnTowerShot(objective *ObjectiveState, target *player.Player) *bullet.Bullet {
	if target == nil {
		return nil
	}
	return gs.spawnTowerShotAt(objective, target.PlayerId, target.X, target.Y)
}

func (gs *GameState) spawnTowerShotAt(objective *ObjectiveState, targetID string, targetX, targetY float64) *bullet.Bullet {
	if gs == nil || objective == nil || targetID == "" {
		return nil
	}
	angle := math.Atan2(targetY-objective.Y, targetX-objective.X)
	x := objective.X + math.Cos(angle)*(objective.Radius+teamTowerShotSize+2)
	y := objective.Y + math.Sin(angle)*(objective.Radius+teamTowerShotSize+2)
	color := player.GetTeamColor(objective.Team)
	var shot *bullet.Bullet
	for _, candidate := range gs.Bullets {
		if candidate != nil && !candidate.Active {
			shot = candidate
			shot.Reset(objective.ID, objective.Team, x, y, teamTowerShotSize, angle, color)
			break
		}
	}
	if shot == nil {
		shot = bullet.NewBullet(objective.ID, objective.Team, x, y, teamTowerShotSize, angle, color)
		gs.Bullets = append(gs.Bullets, shot)
	}
	shot.CommandID = fmt.Sprintf("tower:%s:%d", objective.ID, shot.ID)
	shot.Kind = "tower_shot"
	shot.Damage = teamTowerDamage
	shot.Speed = teamTowerShotSpeed
	shot.MaxRange = teamTowerRange + objective.Radius + 32
	shot.TargetID = targetID
	shot.TargetX, shot.TargetY = targetX, targetY
	shot.SpawnedAt = time.Now().UnixMilli()
	return shot
}

func (gs *GameState) updateTeamRespawns(now int64) {
	if gs.Mode != ModeTeamDeathmatch || gs.State != GameStateGame {
		return
	}
	for _, p := range gs.Players {
		if p == nil || p.IsAlive() || p.RespawnAt == 0 || p.RespawnAt > now || gs.teamHallDestroyed(p.Team) {
			continue
		}
		spawners := gs.Map.TeamSpawners[p.Team]
		if len(spawners) == 0 {
			continue
		}
		spawner := spawners[p.RespawnCount%len(spawners)]
		p.RespawnCount++
		p.X, p.Y = spawner.X+PlayerSize/2, spawner.Y+PlayerSize/2
		p.MoveX, p.MoveY, p.Aiming, p.Ack = 0, 0, false, 0
		p.HitImpulseX, p.HitImpulseY = 0, 0
		p.Lives, p.RespawnAt = p.MaxLives, 0
		p.FlyingUntil, p.FlightSpeedMultiplier = 0, 0
		p.Ammo, p.NextAmmoAt = p.MaxAmmo, 0
		p.InvulnerableUntil = now + SpawnProtectionDuration.Milliseconds()
		gs.Broadcast("respawn", map[string]interface{}{"playerId": p.PlayerId, "team": p.Team})
	}
}

func (gs *GameState) teamRespawnDelayAt(now int64) time.Duration {
	if gs == nil || gs.MatchStartedAt <= 0 || now <= gs.MatchStartedAt {
		return teamRespawnDelayMin
	}

	elapsed := time.Duration(now-gs.MatchStartedAt) * time.Millisecond
	progress := math.Min(1, float64(elapsed)/float64(TeamBattleDuration))
	return teamRespawnDelayMin + time.Duration(float64(teamRespawnDelayMax-teamRespawnDelayMin)*progress)
}

func (gs *GameState) teamHallDestroyed(team string) bool {
	for _, objective := range gs.Objectives {
		if objective.Team == team && objective.Type == "town_hall" {
			return objective.Lives <= 0
		}
	}
	return false
}

func (gs *GameState) objectiveWinner() string {
	blueDestroyed := false
	redDestroyed := false
	for _, objective := range gs.Objectives {
		if objective == nil || objective.Type != "town_hall" || objective.Lives > 0 {
			continue
		}
		switch objective.Team {
		case "Blue":
			blueDestroyed = true
		case "Red":
			redDestroyed = true
		}
	}
	if blueDestroyed == redDestroyed {
		return ""
	}
	if blueDestroyed {
		return "Red"
	}
	return "Blue"
}

func (gs *GameState) objectiveBattleDecided() bool {
	for _, objective := range gs.Objectives {
		if objective != nil && objective.Type == "town_hall" && objective.Lives <= 0 {
			return true
		}
	}
	return false
}
