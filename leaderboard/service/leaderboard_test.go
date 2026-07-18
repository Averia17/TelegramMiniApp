package service

import (
	"leaderboard/model"
	"leaderboard/provider"
	"testing"
)

func setupService(t *testing.T) (*LeaderboardService, *provider.MockStore) {
	t.Helper()
	store := provider.NewMockStore()
	svc := New(store)
	return svc, store
}

func TestUpdate_CreatesScore(t *testing.T) {
	svc, store := setupService(t)

	if err := svc.Update("p1", "Alice", 500, 1, 3); err != nil {
		t.Fatalf("Update: %v", err)
	}
	if store.Count() != 1 {
		t.Errorf("store count = %d, want 1", store.Count())
	}
	s, _ := svc.Get("p1")
	if s == nil {
		t.Fatal("score should exist")
	}
	if s.Score != 500 || s.Wins != 1 || s.Games != 3 {
		t.Errorf("score = %+v", s)
	}
}

func TestUpdate_Accumulates(t *testing.T) {
	svc, _ := setupService(t)

	svc.Update("p1", "Alice", 100, 0, 1)
	svc.Update("p1", "Alice", 200, 1, 1)

	s, _ := svc.Get("p1")
	if s.Score != 300 {
		t.Errorf("Score = %d, want 300", s.Score)
	}
	if s.Wins != 1 {
		t.Errorf("Wins = %d, want 1", s.Wins)
	}
	if s.Games != 2 {
		t.Errorf("Games = %d, want 2", s.Games)
	}
}

func TestUpdate_UpdatesName(t *testing.T) {
	svc, _ := setupService(t)

	svc.Update("p1", "Old", 100, 0, 1)
	svc.Update("p1", "New", 50, 0, 1)

	s, _ := svc.Get("p1")
	if s.Name != "New" {
		t.Errorf("Name = %q, want New", s.Name)
	}
}

func TestTop_ReturnsSortedDesc(t *testing.T) {
	svc, _ := setupService(t)

	svc.Update("p1", "Low", 100, 0, 1)
	svc.Update("p2", "High", 500, 0, 1)
	svc.Update("p3", "Mid", 300, 0, 1)

	top, err := svc.Top(10)
	if err != nil {
		t.Fatalf("Top: %v", err)
	}
	if len(top) != 3 {
		t.Fatalf("len = %d, want 3", len(top))
	}
	if top[0].Name != "High" || top[1].Name != "Mid" || top[2].Name != "Low" {
		t.Errorf("order = %v, %v, %v", top[0].Name, top[1].Name, top[2].Name)
	}
}

func TestTop_RespectsLimit(t *testing.T) {
	svc, _ := setupService(t)

	for i := 0; i < 10; i++ {
		svc.Update("p"+string(rune('A'+i)), "P", i*100, 0, 1)
	}

	top, _ := svc.Top(3)
	if len(top) != 3 {
		t.Errorf("len = %d, want 3", len(top))
	}
}

func TestTop_EmptyReturnsEmptySlice(t *testing.T) {
	svc, _ := setupService(t)

	top, _ := svc.Top(10)
	if len(top) != 0 {
		t.Errorf("len = %d, want 0", len(top))
	}
}

func TestGet_NotFound(t *testing.T) {
	svc, _ := setupService(t)

	_, err := svc.Get("nobody")
	if err == nil {
		t.Error("expected error for missing player")
	}
}

func TestApplyBattleResult_ScoresPlayers(t *testing.T) {
	svc, _ := setupService(t)

	svc.ApplyBattleResult(&model.BattleResult{
		RoomId: "room1",
		Players: []model.PlayerResult{
			{PlayerId: "p1", Name: "Alice", Kills: 5, Won: true},
			{PlayerId: "p2", Name: "Bob", Kills: 2, Won: false},
		},
	})

	p1, _ := svc.Get("p1")
	if p1.Score != 500 {
		t.Errorf("p1 Score = %d, want 500", p1.Score)
	}
	if p1.Wins != 1 {
		t.Errorf("p1 Wins = %d, want 1", p1.Wins)
	}
	if p1.Games != 1 {
		t.Errorf("p1 Games = %d, want 1", p1.Games)
	}

	p2, _ := svc.Get("p2")
	if p2.Score != 200 {
		t.Errorf("p2 Score = %d, want 200", p2.Score)
	}
	if p2.Wins != 0 {
		t.Errorf("p2 Wins = %d, want 0", p2.Wins)
	}
}

func TestApplyBattleResult_AccumulatesAcrossBattles(t *testing.T) {
	svc, _ := setupService(t)

	svc.ApplyBattleResult(&model.BattleResult{
		Players: []model.PlayerResult{
			{PlayerId: "p1", Name: "Alice", Kills: 3, Won: true},
		},
	})
	svc.ApplyBattleResult(&model.BattleResult{
		Players: []model.PlayerResult{
			{PlayerId: "p1", Name: "Alice", Kills: 2, Won: false},
		},
	})

	p1, _ := svc.Get("p1")
	if p1.Score != 500 {
		t.Errorf("Score = %d, want 500 (300+200)", p1.Score)
	}
	if p1.Wins != 1 {
		t.Errorf("Wins = %d, want 1", p1.Wins)
	}
	if p1.Games != 2 {
		t.Errorf("Games = %d, want 2", p1.Games)
	}
	if p1.Kills != 5 {
		t.Errorf("Kills = %d, want 5", p1.Kills)
	}
}

func TestProfile_ReturnsRankAndEmptyPlayer(t *testing.T) {
	svc, _ := setupService(t)
	svc.Update("p1", "Alice", 100, 1, 1)
	svc.Update("p2", "Bob", 300, 2, 3)

	profile, err := svc.Profile("p1")
	if err != nil || profile.Rank != 2 {
		t.Fatalf("Profile rank = %d, err = %v, want 2", profile.Rank, err)
	}
	empty, err := svc.Profile("new-player")
	if err != nil || empty.PlayerId != "new-player" || empty.Rank != 0 {
		t.Fatalf("empty Profile = %+v, err = %v", empty, err)
	}
}

func TestMockStore_ImplementsInterface(t *testing.T) {
	var _ provider.Store = (*provider.MockStore)(nil)
}
