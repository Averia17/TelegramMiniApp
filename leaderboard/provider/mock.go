package provider

import (
	"fmt"
	"leaderboard/model"
	"sort"
	"sync"
)

type MockStore struct {
	mu     sync.RWMutex
	scores map[string]*model.Score
}

func NewMockStore() *MockStore {
	return &MockStore{scores: make(map[string]*model.Score)}
}

func (m *MockStore) Save(score *model.Score) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	existing, ok := m.scores[score.PlayerId]
	if ok {
		existing.Name = score.Name
		existing.Score += score.Score
		existing.Wins += score.Wins
		existing.Games += score.Games
		existing.Kills += score.Kills
	} else {
		cp := *score
		m.scores[score.PlayerId] = &cp
	}
	return nil
}

func (m *MockStore) Get(playerId string) (*model.Score, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.scores[playerId]
	if !ok {
		return nil, fmt.Errorf("player %s not found", playerId)
	}
	cp := *s
	return &cp, nil
}

func (m *MockStore) Top(limit int) ([]model.Score, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	list := make([]model.Score, 0, len(m.scores))
	for _, s := range m.scores {
		list = append(list, *s)
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].Score > list[j].Score
	})
	if limit > 0 && len(list) > limit {
		list = list[:limit]
	}
	return list, nil
}

func (m *MockStore) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.scores = make(map[string]*model.Score)
}

func (m *MockStore) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.scores)
}
