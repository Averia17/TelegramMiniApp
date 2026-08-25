package room

import (
	"testing"
	"time"
)

func TestFindConnectedRoomForPlayerIgnoresDisconnectedReconnectGrace(t *testing.T) {
	ResetRooms()
	defer ResetRooms()

	battle := GetOrCreateRoom("active-battle", "active-battle", "small", "deathmatch", 4)
	battle.mu.Lock()
	battle.State.PlayerAdd("player-1", "Player", "Needle")
	client := &Client{Id: "player-1", Send: make(chan []byte, 1)}
	battle.Clients["player-1"] = client
	battle.mu.Unlock()

	if got := FindConnectedRoomForPlayer("player-1"); got != battle {
		t.Fatalf("connected room = %v, want active battle", got)
	}

	battle.mu.Lock()
	delete(battle.Clients, "player-1")
	battle.Disconnected["player-1"] = time.Now()
	battle.mu.Unlock()

	if got := FindConnectedRoomForPlayer("player-1"); got != nil {
		t.Fatalf("disconnected room = %v, want nil while reconnect grace is active", got)
	}
	if got := FindRoomForPlayer("player-1", ""); got != battle {
		t.Fatalf("recovery room = %v, want reconnectable battle", got)
	}
}

func TestLeaveForReconnectStopsActiveChecksButPreservesManualRecovery(t *testing.T) {
	ResetRooms()
	defer ResetRooms()

	battle := GetOrCreateRoom("leave-battle", "leave-battle", "small", "deathmatch", 4)
	battle.mu.Lock()
	battle.State.PlayerAdd("player-1", "Player", "Needle")
	client := &Client{Id: "player-1", Send: make(chan []byte, 1)}
	battle.Clients["player-1"] = client
	battle.mu.Unlock()

	battle.LeaveForReconnect(client)

	if got := FindConnectedRoomForPlayer("player-1"); got != nil {
		t.Fatalf("connected room after explicit leave = %v, want nil", got)
	}
	if got := FindRoomForPlayer("player-1", ""); got != battle {
		t.Fatalf("manual recovery room = %v, want old battle", got)
	}
	if _, ok := battle.State.Players["player-1"]; !ok {
		t.Fatal("explicit leave removed the player from recoverable battle state")
	}
}

func TestLeaveVoluntarilyMarksSessionAndStopsRecovery(t *testing.T) {
	ResetRooms()
	defer ResetRooms()

	battle := GetOrCreateRoom("voluntary-leave", "voluntary-leave", "small", "deathmatch", 4)
	battle.mu.Lock()
	battle.State.PlayerAdd("player-1", "Player", "Needle")
	client := &Client{Id: "player-1", Send: make(chan []byte, 1)}
	battle.Clients["player-1"] = client
	battle.mu.Unlock()

	battle.LeaveVoluntarily(client)

	if got := battle.PlayerStatus("player-1"); got != BattleSessionLeftVoluntarily {
		t.Fatalf("voluntary leave status = %q, want %q", got, BattleSessionLeftVoluntarily)
	}
	if got := FindRoomForPlayer("player-1", ""); got != nil {
		t.Fatalf("voluntarily left player remained recoverable in %v", got)
	}
	if !battle.HasPlayer("player-1") {
		t.Fatal("voluntarily left player was removed from the joinable battle")
	}
}

func TestVoluntaryLeaveCanRecoverByExplicitRoomHint(t *testing.T) {
	ResetRooms()
	defer ResetRooms()

	battle := GetOrCreateRoom("voluntary-reconnect", "voluntary-reconnect", "small", "deathmatch", 4)
	battle.mu.Lock()
	battle.State.PlayerAdd("player-1", "Player", "Needle")
	client := &Client{Id: "player-1", Send: make(chan []byte, 1)}
	battle.Clients["player-1"] = client
	battle.mu.Unlock()

	battle.LeaveVoluntarily(client)

	if got := FindRoomForPlayerForRecovery("player-1", battle.Id); got != battle {
		t.Fatalf("explicit room recovery = %v, want %v", got, battle)
	}
}
