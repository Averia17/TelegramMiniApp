package room

import (
	"battle/model/game"
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

func RemoveRoom(roomId string) {
	roomsMu.Lock()
	defer roomsMu.Unlock()
	delete(rooms, roomId)
}

func ListRoomsFromRedis() ([]provider.RoomRecord, error) {
	if Redis == nil {
		return nil, nil
	}
	return Redis.ListRooms()
}
