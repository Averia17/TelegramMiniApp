package game

import "battle/model/player"

// MatchRules contains only decisions that vary by game mode. Simulation,
// movement, collisions, heroes, and transport remain shared by every mode.
type MatchRules interface {
	Mode() GameMode
	AssignTeams(state *GameState)
	EvaluateWinner(state *GameState, now int64) (winner string, decided bool)
	TimeoutWinner(state *GameState) string
}

type DeathmatchRules struct{}

func (DeathmatchRules) Mode() GameMode           { return ModeDeathmatch }
func (DeathmatchRules) AssignTeams(_ *GameState) {}

func (DeathmatchRules) EvaluateWinner(state *GameState, now int64) (string, bool) {
	active := state.countActivePlayers()
	if active == 0 {
		return "", true
	}
	if active == 1 {
		if survivor := state.getWinningPlayer(); survivor != nil {
			return survivor.Name, true
		}
	}
	if state.IslandPhase != IslandPhaseBeacon {
		return "", false
	}
	if winner := state.beaconWinner(now); winner != nil {
		return winner.Name, true
	}
	return "", false
}

func (DeathmatchRules) TimeoutWinner(state *GameState) string {
	var winner *player.Player
	tied := false
	for _, candidate := range state.Players {
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

type TeamDeathmatchRules struct{}

func (TeamDeathmatchRules) Mode() GameMode               { return ModeTeamDeathmatch }
func (TeamDeathmatchRules) AssignTeams(state *GameState) { state.setPlayersTeamsRandomly() }

func (TeamDeathmatchRules) EvaluateWinner(state *GameState, _ int64) (string, bool) {
	if state.countActivePlayers() == 0 {
		return "", true
	}
	if team := state.getWinningTeam(); team != "" {
		return team + " team", true
	}
	return "", false
}

func (TeamDeathmatchRules) TimeoutWinner(state *GameState) string {
	teamLives := map[string]int{"Red": 0, "Blue": 0}
	for _, candidate := range state.Players {
		teamLives[candidate.Team] += candidate.Lives
	}
	if teamLives["Red"] == teamLives["Blue"] {
		return ""
	}
	if teamLives["Red"] > teamLives["Blue"] {
		return "Red team"
	}
	return "Blue team"
}

func NewMatchRules(mode GameMode) MatchRules {
	return defaultMatchRulesRegistry.Resolve(mode)
}
