package game

import (
	"battle/model/prop"
	"fmt"
)

// BotMLScenarioIDs returns the deterministic tactical situations used by the
// ML dataset and holdout runner. They deliberately vary one decision pressure
// at a time so a report can explain why a policy changed its intent.
func BotMLScenarioIDs() []string {
	return []string{
		"open_engage",
		"low_health_retreat",
		"empty_ammo_retreat",
		"safe_pickup",
		"contested_pickup",
	}
}

// NewBotMLScenarioState builds a fresh authoritative state for one tactical
// scenario. It is shared by trajectory export and paired evaluation so train
// and holdout use the same setup vocabulary without sharing runtime state.
func NewBotMLScenarioState(scenarioID string, episode int) (*GameState, error) {
	state := NewGameState(GameConfig{
		MatchID: fmt.Sprintf("bot-ml-%s-%d", scenarioID, episode), RoomName: "bot-ml-scenario",
		MapName: "small", MaxPlayers: 2, Mode: ModeDeathmatch,
	})
	state.State = GameStateWaiting
	state.PlayerAdd("bot", "Bot", "Needle")
	state.PlayerAdd("enemy", "Enemy", "Kaze")
	state.State = GameStateGame
	state.Walls = nil
	state.Props = nil
	state.Players["bot"].IsBot = true
	state.Players["bot"].X, state.Players["bot"].Y = 100, 100

	bot := state.Players["bot"]
	enemy := state.Players["enemy"]
	if bot == nil || enemy == nil {
		return nil, fmt.Errorf("ML scenario %q did not create the required players", scenarioID)
	}
	// Keep a small deterministic seed-dependent offset without allowing the
	// scenario class to disappear from the observation distribution.
	offset := float64((episode % 3) * 8)
	switch scenarioID {
	case "open_engage":
		enemy.X, enemy.Y = 260+offset, 100
	case "low_health_retreat":
		enemy.X, enemy.Y = 220+offset, 100
		bot.Lives = bot.MaxLives / 4
	case "empty_ammo_retreat":
		enemy.X, enemy.Y = 220+offset, 100
		bot.Ammo = 0
	case "safe_pickup":
		enemy.X, enemy.Y = 900, 100
		bot.Lives = bot.MaxLives / 2
		state.Props = append(state.Props, prop.NewProp("health_boost", 180+offset, 100, 12))
	case "contested_pickup":
		enemy.X, enemy.Y = 360+offset, 100
		state.Props = append(state.Props, prop.NewProp("health_boost", 220+offset, 100, 12))
	default:
		return nil, fmt.Errorf("unknown ML scenario %q", scenarioID)
	}
	return state, nil
}

// NewBotMLTeamScenarioState creates the reproducible 3v3 arena used by the
// multi-agent bridge. All six agents are authoritative bots; the external
// policy can therefore control both teams with isolated recurrent state.
func NewBotMLTeamScenarioState(episode int) (*GameState, error) {
	state := NewGameState(GameConfig{
		MatchID: fmt.Sprintf("bot-ml-team-%d", episode), RoomName: "bot-ml-team-scenario",
		MapName: "small", MaxPlayers: 6, Mode: ModeTeamDeathmatch,
	})
	state.State = GameStateWaiting
	blue := []struct{ id, hero string }{{"blue-0", "Needle"}, {"blue-1", "Fairy Mina"}, {"blue-2", "Brock Zeus"}}
	red := []struct{ id, hero string }{{"red-0", "Kaze"}, {"red-1", "Mandy"}, {"red-2", "Wukong Mico"}}
	for _, entry := range append(blue, red...) {
		state.PlayerAdd(entry.id, entry.id, entry.hero)
		player := state.Players[entry.id]
		player.IsBot = true
		if entry.id[:4] == "blue" {
			player.Team = "Blue"
		} else {
			player.Team = "Red"
		}
	}
	positions := map[string][2]float64{
		"blue-0": {180, 280}, "blue-1": {180, 400}, "blue-2": {180, 520},
		"red-0": {620, 280}, "red-1": {620, 400}, "red-2": {620, 520},
	}
	for id, position := range positions {
		state.Players[id].X, state.Players[id].Y = position[0], position[1]
	}
	state.State = GameStateGame
	state.Walls = nil
	state.Props = nil
	return state, nil
}
