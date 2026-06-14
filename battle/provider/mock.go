package provider

import (
	"fmt"
	"sync"
)

type MockStore struct {
	mu      sync.RWMutex
	rooms   map[string]*RoomRecord
	players map[string]*PlayerRecord
	roomSet map[string]map[string]bool
}

func NewMockStore() *MockStore {
	return &MockStore{
		rooms:   make(map[string]*RoomRecord),
		players: make(map[string]*PlayerRecord),
		roomSet: make(map[string]map[string]bool),
	}
}

func (m *MockStore) SaveRoom(room *RoomRecord) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := *room
	m.rooms[room.RoomId] = &cp
	return nil
}

func (m *MockStore) GetRoom(roomId string) (*RoomRecord, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	r, ok := m.rooms[roomId]
	if !ok {
		return nil, fmt.Errorf("room %s not found", roomId)
	}
	cp := *r
	return &cp, nil
}

func (m *MockStore) ListRooms() ([]RoomRecord, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []RoomRecord
	for _, r := range m.rooms {
		out = append(out, *r)
	}
	return out, nil
}

func (m *MockStore) AddPlayerToRoom(roomId string, player *PlayerRecord) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := *player
	m.players[player.PlayerId] = &cp
	if m.roomSet[roomId] == nil {
		m.roomSet[roomId] = make(map[string]bool)
	}
	m.roomSet[roomId][player.PlayerId] = true
	if r, ok := m.rooms[roomId]; ok {
		r.PlayerCount = len(m.roomSet[roomId])
	} else {
		m.rooms[roomId] = &RoomRecord{
			RoomId:      roomId,
			PlayerCount: len(m.roomSet[roomId]),
		}
	}
	return nil
}

func (m *MockStore) RemovePlayerFromRoom(roomId, playerId string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.players, playerId)
	if s, ok := m.roomSet[roomId]; ok {
		delete(s, playerId)
		if len(s) == 0 {
			delete(m.roomSet, roomId)
			delete(m.rooms, roomId)
		} else if r, ok := m.rooms[roomId]; ok {
			r.PlayerCount = len(s)
		}
	}
	return nil
}

func (m *MockStore) RoomCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.rooms)
}

func (m *MockStore) PlayerCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.players)
}

func (m *MockStore) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.rooms = make(map[string]*RoomRecord)
	m.players = make(map[string]*PlayerRecord)
	m.roomSet = make(map[string]map[string]bool)
}
