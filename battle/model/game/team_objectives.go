package game

import (
	"battle/model/player"
	"math"
	"time"
)

const (
	teamTownHallLives = 12000
	teamTowerLives    = 3000
	teamTowerRange    = 620.0
	teamTowerDamage   = 55
	teamTowerCooldown = 1200
	teamRespawnDelay  = 5000
)

func newObjectiveStates(definitions []objectiveDefinition) map[string]*ObjectiveState {
	result := map[string]*ObjectiveState{}
	for _, objective := range definitions {
		lives := teamTowerLives
		if objective.Type == "town_hall" {
			lives = teamTownHallLives
		}
		result[objective.ID] = &ObjectiveState{ID: objective.ID, Type: objective.Type, Team: objective.Team, X: objective.X, Y: objective.Y, Radius: objective.Radius, Lives: lives, MaxLives: lives}
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
	objective.Lives = int(math.Max(0, float64(objective.Lives-amount)))
	objective.LastDamagedAt = time.Now().UnixMilli()
	objective.LastDamagedBy = source.Team
	gs.addEffect("objective_hit", objective.X, objective.Y, 0, 0, objective.Radius, 0, 0, 0, source.Color, amount, 300)
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
		if objective == nil || objective.Type != "tower" || objective.Lives <= 0 || objective.AttackAt > now {
			continue
		}
		var target *player.Player
		best := teamTowerRange
		for _, candidate := range gs.Players {
			if candidate == nil || !candidate.IsAlive() || candidate.Team == objective.Team {
				continue
			}
			if distance := math.Hypot(candidate.X-objective.X, candidate.Y-objective.Y); distance <= best {
				best, target = distance, candidate
			}
		}
		if target == nil {
			continue
		}
		objective.AttackAt = now + teamTowerCooldown
		source := &player.Player{Name: objective.ID, PlayerId: objective.ID, Team: objective.Team}
		gs.dealPlayerDamage(source, target, teamTowerDamage)
		gs.addEffect("tower_beam", objective.X, objective.Y, target.X, target.Y, 0, 0, 0, 0, player.GetTeamColor(objective.Team), teamTowerDamage, 350)
	}
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
		p.Lives, p.RespawnAt = p.MaxLives, 0
		p.Ammo, p.NextAmmoAt = p.MaxAmmo, 0
		p.InvulnerableUntil = now + SpawnProtectionDuration.Milliseconds()
		gs.Broadcast("respawn", map[string]interface{}{"playerId": p.PlayerId, "team": p.Team})
	}
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
	for _, objective := range gs.Objectives {
		if objective.Type == "town_hall" && objective.Lives <= 0 {
			if objective.Team == "Blue" {
				return "Red"
			}
			return "Blue"
		}
	}
	return ""
}
