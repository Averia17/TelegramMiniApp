package provider

import (
	"fmt"
	"sort"
	"sync"
)

type MockStore struct {
	mu      sync.RWMutex
	rooms   map[string]*RoomRecord
	players map[string]*PlayerRecord
	roomSet map[string]map[string]bool
	results map[string]*BattleResult
}

func NewMockStore() *MockStore {
	return &MockStore{
		rooms:   make(map[string]*RoomRecord),
		players: make(map[string]*PlayerRecord),
		roomSet: make(map[string]map[string]bool),
		results: make(map[string]*BattleResult),
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

func (m *MockStore) SaveBattleResult(result *BattleResult) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if result == nil {
		return nil
	}
	cp := cloneBattleResult(result)
	if previous, ok := m.results[result.RoomId]; !ok || previous.EndedAt <= result.EndedAt {
		m.results[result.RoomId] = cp
	}
	return nil
}

func (m *MockStore) GetLatestBattleResult(playerId string) (*BattleResult, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var latest *BattleResult
	for _, result := range m.results {
		if !battleResultHasPlayer(result, playerId) || (latest != nil && latest.EndedAt >= result.EndedAt) {
			continue
		}
		latest = cloneBattleResult(result)
	}
	return latest, nil
}

func (m *MockStore) ListBattleResults(playerId string, beforeEndedAt int64, beforeRoomId string, limit int) ([]*BattleResult, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if limit <= 0 {
		limit = 20
	}
	results := make([]*BattleResult, 0, len(m.results))
	for _, result := range m.results {
		if battleResultHasPlayer(result, playerId) {
			results = append(results, result)
		}
	}
	sort.Slice(results, func(i, j int) bool {
		if results[i].EndedAt != results[j].EndedAt {
			return results[i].EndedAt > results[j].EndedAt
		}
		return results[i].RoomId > results[j].RoomId
	})

	page := make([]*BattleResult, 0, minInt(limit, len(results)))
	for _, result := range results {
		if beforeEndedAt > 0 && (result.EndedAt > beforeEndedAt || (result.EndedAt == beforeEndedAt && result.RoomId >= beforeRoomId)) {
			continue
		}
		page = append(page, cloneBattleResult(result))
		if len(page) == limit {
			break
		}
	}
	return page, nil
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
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
	m.results = make(map[string]*BattleResult)
}

func cloneBattleResult(result *BattleResult) *BattleResult {
	if result == nil {
		return nil
	}
	cp := *result
	cp.Players = append([]PlayerResult(nil), result.Players...)
	return &cp
}

func battleResultHasPlayer(result *BattleResult, playerId string) bool {
	if result == nil {
		return false
	}
	for _, player := range result.Players {
		if player.PlayerId == playerId {
			return true
		}
	}
	return false
}
