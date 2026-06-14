package room

import (
	"battle/model/game"
	"battle/model/player"
	"battle/provider"
	"sync"
)

var rooms = make(map[string]*Room)
var roomsMu sync.RWMutex

func GetOrCreateRoom(roomId, roomName, mapName, mode string, maxPlayers int) *Room {
	roomsMu.Lock()
	defer roomsMu.Unlock()

	if r, ok := rooms[roomId]; ok {
		return r
	}

	r := &Room{
		Id:         roomId,
		Name:       roomName,
		MapName:    mapName,
		Mode:       mode,
		MaxPlayers: maxPlayers,
		Clients:    make(map[string]*Client),
		Broadcast:  make(chan []byte, 256),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
	}

	gs := &game.GameState{
		RoomName:   roomName,
		MapName:    mapName,
		MaxPlayers: maxPlayers,
		Mode:       game.GameMode(mode),
		Broadcast:  r.BroadcastMsg,
		OnGameEnd: func(players map[string]*player.Player, winner string, duration int64) {
			if Kafka == nil {
				return
			}
			result := &provider.BattleResult{
				RoomId:   roomId,
				MapName:  mapName,
				Mode:     mode,
				Duration: duration,
				Winner:   winner,
			}
			for _, p := range players {
				result.Players = append(result.Players, provider.PlayerResult{
					PlayerId: p.PlayerId,
					Name:     p.Name,
					Hero:     p.HeroName,
					Kills:    p.Kills,
					Lives:    p.Lives,
					Won:      p.Name == winner,
				})
			}
			Kafka.PublishBattleResult(result)
		},
		OnPlayerKilled: func(playerId, killerName string) {
			r.SendToPlayer(playerId, "you_died", map[string]interface{}{
				"killerName": killerName,
			})
		},
	}
	game.InitGameState(gs)
	r.State = gs

	rooms[roomId] = r
	go r.Run()

	return r
}

func FindRoom(roomId string) *Room {
	roomsMu.RLock()
	defer roomsMu.RUnlock()
	return rooms[roomId]
}

func FindLobbyRoom() *Room {
	roomsMu.RLock()
	defer roomsMu.RUnlock()
	for _, r := range rooms {
		if (r.State.State == "waiting" || r.State.State == "lobby") && len(r.Clients) < r.MaxPlayers {
			return r
		}
	}
	return nil
}

func RemoveRoom(roomId string) {
	roomsMu.Lock()
	defer roomsMu.Unlock()
	delete(rooms, roomId)
}

func ResetRooms() {
	roomsMu.Lock()
	defer roomsMu.Unlock()
	rooms = make(map[string]*Room)
}

func ListRoomsFromStore() ([]provider.RoomRecord, error) {
	if Store == nil {
		return nil, nil
	}
	return Store.ListRooms()
}
