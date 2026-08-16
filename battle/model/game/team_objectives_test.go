package game

import (
	"battle/model/gamemap"
	"battle/model/player"
	"testing"
	"time"
)

func newTeamObjectiveState() *GameState {
	state := newTestGameState()
	state.Mode = ModeTeamDeathmatch
	state.Map = gamemap.GenerateTeamBattle(gamemap.CanonicalTeamBattleSeed)
	state.State = GameStateGame
	state.Players = map[string]*player.Player{}
	state.Objectives = newObjectiveStates(objectiveDefinitions(state))
	state.PlayerAdd("blue", "Blue", "Needle")
	state.PlayerAdd("red", "Red", "Mandy")
	state.Players["blue"].SetTeam("Blue")
	state.Players["red"].SetTeam("Red")
	state.Players["blue"].X, state.Players["blue"].Y = 300, 2900
	state.Players["red"].X, state.Players["red"].Y = 2900, 300
	return state
}

func TestTeamObjectivesKeepTownHallProtectedWhileItsTowersLive(t *testing.T) {
	state := newTeamObjectiveState()
	source := state.Players["blue"]
	hall := state.Objectives["red-town-hall"]
	before := hall.Lives
	if state.damageObjective(source, hall, 1000) {
		t.Fatal("town hall should not take damage while both towers are alive")
	}
	if hall.Lives != before {
		t.Fatalf("protected town hall lives=%d, want %d", hall.Lives, before)
	}
	state.Objectives["red-tower-west"].Lives = 0
	state.Objectives["red-tower-east"].Lives = 0
	if !state.damageObjective(source, hall, 1000) || hall.Lives >= before {
		t.Fatal("town hall should become vulnerable after tower destruction")
	}
}

func TestTeamTowerAttacksEnemyAndRespawnReturnsHeroToOwnBase(t *testing.T) {
	state := newTeamObjectiveState()
	state.Players["blue"].X, state.Players["blue"].Y = 2560, 680
	state.updateTeamObjectivesAt(time.Now().UnixMilli())
	if state.Players["blue"].Lives >= state.Players["blue"].MaxLives {
		t.Fatal("enemy tower did not attack a hero in its range")
	}
	state.Players["blue"].Lives = 0
	state.Players["blue"].RespawnAt = time.Now().Add(-time.Second).UnixMilli()
	state.updateTeamRespawns(time.Now().UnixMilli())
	respawned := state.Players["blue"]
	if !respawned.IsAlive() || respawned.X < 100 || respawned.Y < 2600 {
		t.Fatalf("hero did not respawn in the Blue base: alive=%v pos=(%.0f,%.0f)", respawned.IsAlive(), respawned.X, respawned.Y)
	}
}
