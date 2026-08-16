package room

import (
	"battle/model/game"
	"strings"
)

// MatchProfile describes the immutable matchmaking dimensions of a room.
// Keeping it separate from transport requests makes queue compatibility explicit.
type MatchProfile struct {
	Mode       game.GameMode
	MapName    string
	MaxPlayers int
}

func DefaultMatchProfile() MatchProfile {
	return MatchProfile{Mode: game.ModeDeathmatch, MapName: "battle-royale", MaxPlayers: 8}
}

func NormalizeMatchProfile(mode, mapName string, maxPlayers int) MatchProfile {
	profile := DefaultMatchProfile()
	if mode == string(game.ModeTeamDeathmatch) {
		profile.Mode = game.ModeTeamDeathmatch
	}
	mapName = strings.ToLower(strings.TrimSpace(mapName))
	if game.IsKnownMap(mapName) {
		profile.MapName = mapName
	}
	if maxPlayers > 0 {
		if maxPlayers > 8 {
			maxPlayers = 8
		}
		profile.MaxPlayers = maxPlayers
	}
	return profile
}

func (p MatchProfile) Compatible(other MatchProfile) bool {
	p = normalizeProfileValue(p)
	other = normalizeProfileValue(other)
	return p == other
}

func normalizeProfileValue(profile MatchProfile) MatchProfile {
	if profile.Mode == "" || profile.MapName == "" || profile.MaxPlayers <= 0 {
		defaults := DefaultMatchProfile()
		if profile.Mode == "" {
			profile.Mode = defaults.Mode
		}
		if profile.MapName == "" {
			profile.MapName = defaults.MapName
		}
		if profile.MaxPlayers <= 0 {
			profile.MaxPlayers = defaults.MaxPlayers
		}
	}
	return profile
}
