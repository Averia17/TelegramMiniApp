package room

import (
	"battle/model/game"
	"testing"
)

func TestFindRoomForPlayerOnlyReturnsRoomsContainingPlayer(t *testing.T) {
	ResetRooms()
	defer ResetRooms()

	owned := GetOrCreateRoom("owned", "owned", "small", "deathmatch", 4)
	owned.State.PlayerAdd("player-1", "Player", "Needle")
	foreign := GetOrCreateRoom("foreign", "foreign", "small", "deathmatch", 4)
	foreign.State.PlayerAdd("player-2", "Other", "Needle")

	got := FindRoomForPlayer("player-1", "")
	if got != owned {
		t.Fatalf("recovered room = %v, want owned room", got)
	}
	if got := FindRoomForPlayer("player-1", "foreign"); got != owned {
		t.Fatalf("stale room hint recovery = %v, want owned room", got)
	}
	if got := FindRoomForPlayer("player-3", ""); got != nil {
		t.Fatalf("foreign player recovered room = %v, want nil", got)
	}

	owned.State.State = game.GameStateFinished
	if got := FindRoomForPlayer("player-1", ""); got != nil {
		t.Fatalf("finished room recovered as active = %v, want nil", got)
	}
}
