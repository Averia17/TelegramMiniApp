package provider

import "testing"

func TestMockStoreReturnsLatestBattleResultForPlayer(t *testing.T) {
	store := NewMockStore()
	old := &BattleResult{
		RoomId:  "old-room",
		EndedAt: 100,
		Players: []PlayerResult{{PlayerId: "player-1", Won: false}},
	}
	latest := &BattleResult{
		RoomId:  "latest-room",
		EndedAt: 200,
		Players: []PlayerResult{{PlayerId: "player-1", Won: true}},
	}
	if err := store.SaveBattleResult(old); err != nil {
		t.Fatalf("save old result: %v", err)
	}
	if err := store.SaveBattleResult(latest); err != nil {
		t.Fatalf("save latest result: %v", err)
	}

	got, err := store.GetLatestBattleResult("player-1")
	if err != nil {
		t.Fatalf("get latest result: %v", err)
	}
	if got == nil || got.RoomId != "latest-room" || !got.Players[0].Won {
		t.Fatalf("latest result = %#v, want latest-room win", got)
	}
	if result, err := store.GetLatestBattleResult("unknown"); err != nil || result != nil {
		t.Fatalf("unknown result = %#v, %v; want nil, nil", result, err)
	}
}
