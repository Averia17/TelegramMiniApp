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

func (DeathmatchRules) ResultReason(_ *GameState, winner string, timedOut bool) string {
	if winner == "" {
		return "Ничья: все бойцы выбыли."
	}
	if timedOut {
		return "Победа по оставшемуся HP бойца."
	}
	return "Последний выживший."
}

type TeamDeathmatchRules struct{}

func (TeamDeathmatchRules) Mode() GameMode               { return ModeTeamDeathmatch }
func (TeamDeathmatchRules) AssignTeams(state *GameState) { state.setPlayersTeamsRandomly() }

func (TeamDeathmatchRules) EvaluateWinner(state *GameState, _ int64) (string, bool) {
	if winner := state.objectiveWinner(); winner != "" {
		return winner + " team", true
	}
	if len(state.Objectives) > 0 {
		return "", false
	}
	if state.countActivePlayers() == 0 {
		return "", true
	}
	if team := state.getWinningTeam(); team != "" {
		return team + " team", true
	}
	return "", false
}

func (TeamDeathmatchRules) TimeoutWinner(state *GameState) string {
	blueHallLives, blueFound := townHallLives(state, "Blue")
	redHallLives, redFound := townHallLives(state, "Red")
	if !blueFound || !redFound || blueHallLives == redHallLives {
		return ""
	}
	if blueHallLives > redHallLives {
		return "Red team"
	}
	return "Blue team"
}

func (TeamDeathmatchRules) ResultReason(_ *GameState, winner string, timedOut bool) string {
	if winner == "" {
		if timedOut {
			return "Ничья: у ратуш одинаковое здоровье."
		}
		return "Ничья: ратуши не разрушены."
	}
	if timedOut {
		return "Победа по HP ратуши: у ратуши противника осталось меньше здоровья."
	}
	return "Ратуша противника разрушена."
}

func resultReason(rules MatchRules, state *GameState, winner string, timedOut bool) string {
	switch rules.(type) {
	case TeamDeathmatchRules:
		return (TeamDeathmatchRules{}).ResultReason(state, winner, timedOut)
	default:
		return (DeathmatchRules{}).ResultReason(state, winner, timedOut)
	}
}

func townHallLives(state *GameState, team string) (int, bool) {
	if state == nil {
		return 0, false
	}
	for _, objective := range state.Objectives {
		if objective != nil && objective.Type == "town_hall" && objective.Team == team {
			return objective.Lives, true
		}
	}
	return 0, false
}

func NewMatchRules(mode GameMode) MatchRules {
	return defaultMatchRulesRegistry.Resolve(mode)
}
