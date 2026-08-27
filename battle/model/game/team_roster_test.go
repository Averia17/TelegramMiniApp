package game

import "testing"

func TestTeamBattleStartFillsCompleteThreeVsThreeRoster(t *testing.T) {
	state := NewGameState(GameConfig{RoomName: "team-roster", MapName: "team-battle", MaxPlayers: 6, Mode: ModeTeamDeathmatch})
	state.PlayerAdd("human", "Human", "Needle")
	state.startGame()

	if len(state.Players) != 6 {
		t.Fatalf("team battle roster=%d, want six players", len(state.Players))
	}
	counts := map[string]int{}
	for _, candidate := range state.Players {
		if candidate == nil || !candidate.IsAlive() {
			t.Fatalf("team battle contains an inactive player: %#v", candidate)
		}
		counts[candidate.Team]++
	}
	if counts["Blue"] != 3 || counts["Red"] != 3 {
		t.Fatalf("team battle teams=%v, want Blue=3/Red=3", counts)
	}
}

func TestTeamBattleMaintainsCompleteRosterDuringCombatTicks(t *testing.T) {
	state := NewGameState(GameConfig{RoomName: "team-roster-ticks", MapName: "team-battle", MaxPlayers: 6, Mode: ModeTeamDeathmatch})
	state.PlayerAdd("human", "Human", "Needle")
	state.startGame()

	for tick := 0; tick < 180; tick++ {
		state.UpdateWithDelta(16 * 1_000_000)
		if len(state.Players) != 6 {
			t.Fatalf("tick %d team roster=%d, want six players", tick, len(state.Players))
		}
	}
}

func TestTeamBattleReplacesDisconnectedHumansWithVisibleBots(t *testing.T) {
	state := NewGameState(GameConfig{RoomName: "team-roster-disconnect", MapName: "team-battle", MaxPlayers: 6, Mode: ModeTeamDeathmatch})
	for index, hero := range []string{"Needle", "Mandy", "Brock Zeus"} {
		state.PlayerAdd("human-"+hero, "Human", hero)
		state.Players["human-"+hero].Team = map[int]string{0: "Red", 1: "Blue", 2: "Red"}[index]
	}
	state.startGame()
	if countBots(state) != 3 {
		t.Fatalf("initial bots=%d, want 3", countBots(state))
	}

	state.EnsureTeamRoster(1)

	if countBots(state) != 5 {
		t.Fatalf("bots after two disconnected humans=%d, want 5", countBots(state))
	}
}
