package room

import (
	"battle/model/game"
	"battle/model/player"
	"battle/observability"
	"battle/provider"
	"sync"
	"time"
)

var rooms = make(map[string]*Room)
var roomsMu sync.RWMutex

func GetOrCreateRoom(roomId, roomName, mapName, mode string, maxPlayers int) *Room {
	return GetOrCreateRoomFor(roomId, roomName, NormalizeMatchProfile(mode, mapName, maxPlayers))
}

func GetOrCreateRoomFor(roomId, roomName string, profile MatchProfile) *Room {
	return GetOrCreateRoomWithDependencies(roomId, roomName, profile, game.GameDependencies{})
}

// GetOrCreateRoomWithDependencies keeps room lifecycle independent from map
// loading and combat catalogs. New maps can provide their own MapProvider
// without changing matchmaking or transport code.
func GetOrCreateRoomWithDependencies(roomId, roomName string, profile MatchProfile, dependencies game.GameDependencies) *Room {
	profile = normalizeProfileValue(profile)
	roomsMu.Lock()
	defer roomsMu.Unlock()

	if r, ok := rooms[roomId]; ok {
		return r
	}

	r := &Room{
		Id:           roomId,
		Name:         roomName,
		MapName:      profile.MapName,
		Mode:         string(profile.Mode),
		MaxPlayers:   profile.MaxPlayers,
		Clients:      make(map[string]*Client),
		Disconnected: make(map[string]time.Time),
		Broadcast:    make(chan []byte, 256),
		Register:     make(chan *Client),
		Unregister:   make(chan *Client),
		TauntSpender: defaultTauntSpender,
	}

	gs := game.NewGameState(game.GameConfig{
		RoomName:     roomName,
		MapName:      profile.MapName,
		MaxPlayers:   profile.MaxPlayers,
		Mode:         profile.Mode,
		Dependencies: dependencies,
		Broadcast:    r.BroadcastMsg,
		SendToPlayer: r.SendToPlayer,
	})
	gs.OnGameEnd = func(players map[string]*player.Player, winner string, duration int64) {
		result := &provider.BattleResult{
			RoomId:   roomId,
			EndedAt:  provider.NowMillis(),
			MapName:  profile.MapName,
			Mode:     string(profile.Mode),
			Duration: duration,
			Winner:   winner,
			Reason:   gs.EndReason,
			Draw:     winner == "",
		}
		for _, p := range players {
			if p.IsBot {
				continue
			}
			result.Players = append(result.Players, buildPlayerResult(p, winner))
		}
		if Store != nil {
			if err := Store.SaveBattleResult(result); err != nil {
				observability.Default.IncCounter("battle_result_store_errors_total", "Battle results that failed to persist", nil)
			}
		}
		if Kafka != nil {
			_ = Kafka.PublishBattleResult(result)
		}
	}
	gs.OnPlayerKilled = func(playerId, killerName string) {
		r.SendToPlayer(playerId, "you_died", map[string]interface{}{
			"killerName": killerName,
		})
	}
	r.State = gs

	rooms[roomId] = r
	observability.Default.SetGauge("battle_active_rooms", "Currently registered battle rooms", float64(len(rooms)), nil)
	go r.Run()

	return r
}

func buildPlayerResult(p *player.Player, winner string) provider.PlayerResult {
	return provider.PlayerResult{
		PlayerId:           p.PlayerId,
		PartyID:            p.PartyID,
		Team:               p.Team,
		Name:               p.Name,
		Hero:               p.HeroName,
		Kills:              p.Kills,
		Lives:              p.Lives,
		Deaths:             p.Deaths,
		PlayerDamage:       p.PlayerDamage,
		TowerDamage:        p.TowerDamage,
		TownHallDamage:     p.TownHallDamage,
		TowersDestroyed:    p.TowersDestroyed,
		TownHallsDestroyed: p.TownHallsDestroyed,
		Won: p.Name == winner ||
			(winner == "Red team" && p.Team == "Red") ||
			(winner == "Blue team" && p.Team == "Blue"),
	}
}

func FindRoom(roomId string) *Room {
	roomsMu.RLock()
	defer roomsMu.RUnlock()
	return rooms[roomId]
}

// FindRoomForPlayer is the recovery lookup. A room ID is only a hint: the
// authoritative membership in the in-memory battle state decides whether a
// player may resume a room. Finished rooms are handled by the result store.
func FindRoomForPlayer(playerID, hintedRoomID string) *Room {
	roomsMu.RLock()
	defer roomsMu.RUnlock()
	if hintedRoomID != "" {
		if r := rooms[hintedRoomID]; r != nil && r.hasActivePlayer(playerID) {
			return r
		}
	}
	for _, r := range rooms {
		if r.hasActivePlayer(playerID) {
			return r
		}
	}
	return nil
}

func GetLatestBattleResultForPlayer(playerID string) (*provider.BattleResult, error) {
	if Store == nil {
		return nil, nil
	}
	return Store.GetLatestBattleResult(playerID)
}

func FindLobbyRoom() *Room {
	return FindLobbyRoomFor(DefaultMatchProfile())
}

func FindLobbyRoomFor(profile MatchProfile) *Room {
	profile = normalizeProfileValue(profile)
	roomsMu.RLock()
	defer roomsMu.RUnlock()
	for _, r := range rooms {
		if (r.State.State == "waiting" || r.State.State == "lobby") && len(r.Clients) < r.MaxPlayers &&
			profile.Compatible(MatchProfile{Mode: game.GameMode(r.Mode), MapName: r.MapName, MaxPlayers: r.MaxPlayers}) {
			return r
		}
	}
	return nil
}

func RemoveRoom(roomId string) {
	roomsMu.Lock()
	defer roomsMu.Unlock()
	delete(rooms, roomId)
	observability.Default.SetGauge("battle_active_rooms", "Currently registered battle rooms", float64(len(rooms)), nil)
}

func ResetRooms() {
	roomsMu.Lock()
	defer roomsMu.Unlock()
	rooms = make(map[string]*Room)
	observability.Default.SetGauge("battle_active_rooms", "Currently registered battle rooms", 0, nil)
}

func ListRoomsFromStore() ([]provider.RoomRecord, error) {
	if Store == nil {
		return nil, nil
	}
	return Store.ListRooms()
}
