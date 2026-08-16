package room

import (
	"battle/model/game"
	"battle/model/player"
	"testing"
	"time"
)

func TestStateSnapshotsUseEverySimulationFrame(t *testing.T) {
	if !shouldPublishState(1) || !shouldPublishState(2) || !shouldPublishState(3) {
		t.Fatal("every simulation frame should publish a snapshot")
	}
}

func TestBattleTickElapsedUsesThePreviousTickTimestamp(t *testing.T) {
	previous := time.UnixMilli(1_000)
	current := time.UnixMilli(1_100)

	if elapsed := battleTickElapsed(previous, current); elapsed != 100*time.Millisecond {
		t.Fatalf("elapsed = %s, want 100ms", elapsed)
	}
	if elapsed := battleTickElapsed(time.Time{}, current); elapsed != nominalTickDuration {
		t.Fatalf("first tick elapsed = %s, want %s", elapsed, nominalTickDuration)
	}
}

func TestSimulationStepSeparatesStateAdvanceFromTransport(t *testing.T) {
	r := &Room{
		Clients:      make(map[string]*Client),
		Disconnected: make(map[string]time.Time),
		State:        game.NewGameState(game.GameConfig{MapName: "small", MaxPlayers: 2}),
	}
	step := r.stepSimulation(time.Time{}, 0, time.UnixMilli(1_000))
	if step.hasClients {
		t.Fatal("empty room should not advance a transport step")
	}

	r.Clients["p1"] = &Client{Id: "p1"}
	step = r.stepSimulation(time.UnixMilli(1_000), 0, time.UnixMilli(1_016))
	if !step.hasClients {
		t.Fatal("room with a client should advance the simulation")
	}
	if step.tickGap != 16*time.Millisecond {
		t.Fatalf("tick gap = %s, want 16ms", step.tickGap)
	}
}

func TestAttackCooldownSecondsTracksServerAttackCadence(t *testing.T) {
	p := &player.Player{LastShootAt: 1_000, AttackRate: 800}

	if got := attackCooldownSeconds(p, 1_350); got != 0.45 {
		t.Fatalf("attack cooldown = %v, want 0.45", got)
	}
	if got := attackCooldownSeconds(p, 1_800); got != 0 {
		t.Fatalf("expired attack cooldown = %v, want 0", got)
	}
	if got := attackCooldownSeconds(&player.Player{AttackRate: 800}, 1_350); got != 0 {
		t.Fatalf("unused attack cooldown = %v, want 0", got)
	}
}

func TestAttackReadyRejectsEveryServerSideAttackLock(t *testing.T) {
	state := &game.GameState{State: game.GameStateGame}
	ready := &player.Player{Lives: 100, Ammo: 2, AttackRate: 800}
	if !attackReady(state, ready, 1_000) {
		t.Fatal("living armed player should be ready in active combat")
	}

	tests := []struct {
		name   string
		state  string
		player player.Player
	}{
		{name: "lobby", state: game.GameStateLobby, player: *ready},
		{name: "dead", state: game.GameStateGame, player: player.Player{Ammo: 2}},
		{name: "empty", state: game.GameStateGame, player: player.Player{Lives: 100}},
		{name: "cooldown", state: game.GameStateGame, player: player.Player{Lives: 100, Ammo: 2, LastShootAt: 900, AttackRate: 800}},
		{name: "stunned", state: game.GameStateGame, player: player.Player{Lives: 100, Ammo: 2, StunUntil: 1_100}},
		{name: "casting", state: game.GameStateGame, player: player.Player{Lives: 100, Ammo: 2, CastUntil: 1_100}},
		{name: "channeling", state: game.GameStateGame, player: player.Player{Lives: 100, Ammo: 2, ChannelUntil: 1_100}},
	}
	for _, test := range tests {
		state.State = test.state
		if attackReady(state, &test.player, 1_000) {
			t.Errorf("%s player should not advertise attack readiness", test.name)
		}
	}
}
