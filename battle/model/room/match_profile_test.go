package room

import (
	"battle/model/game"
	"testing"
)

func TestNormalizeMatchProfileUsesBackwardCompatibleDefaults(t *testing.T) {
	profile := NormalizeMatchProfile("", "", 0)
	if profile.Mode != game.ModeDeathmatch || profile.MapName != "battle-royale" || profile.MaxPlayers != 8 {
		t.Fatalf("unexpected defaults: %+v", profile)
	}
	if got := NormalizeMatchProfile("deathmatch", "ARENA", 4).MapName; got != "arena" {
		t.Fatalf("map name was not canonicalized: %q", got)
	}
}

func TestMatchProfilesAreCompatibleOnlyWithinTheSameQueue(t *testing.T) {
	team := NormalizeMatchProfile(string(game.ModeTeamDeathmatch), "small", 4)
	if !team.Compatible(NormalizeMatchProfile("team deathmatch", "small", 4)) {
		t.Fatal("equal team profiles should be compatible")
	}
	if team.Compatible(NormalizeMatchProfile("deathmatch", "small", 4)) {
		t.Fatal("different modes must not share a queue")
	}
	if team.Compatible(NormalizeMatchProfile("team deathmatch", "battle-royale", 4)) {
		t.Fatal("different maps must not share a queue")
	}
}

func TestFindLobbyRoomForDoesNotCrossProfiles(t *testing.T) {
	ResetRooms()
	defer ResetRooms()
	team := NormalizeMatchProfile(string(game.ModeTeamDeathmatch), "small", 4)
	GetOrCreateRoomFor("team-room", "team-room", team)
	if FindLobbyRoomFor(DefaultMatchProfile()) != nil {
		t.Fatal("solo queue must not reuse a team room")
	}
	if FindLobbyRoomFor(team) == nil {
		t.Fatal("team queue should reuse its own room")
	}
}

func TestFindLobbyRoomForCountsDisconnectedPlayersAgainstCapacity(t *testing.T) {
	ResetRooms()
	defer ResetRooms()
	profile := NormalizeMatchProfile("deathmatch", "small", 1)
	room := GetOrCreateRoomFor("full-lobby", "full-lobby", profile)
	room.State.PlayerAdd("disconnected-player", "Disconnected", "Needle")

	if FindLobbyRoomFor(profile) != nil {
		t.Fatal("lobby with a retained disconnected player was offered to another match")
	}
}
