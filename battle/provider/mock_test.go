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

func TestMockStoreListsBattleResultsWithStableCursor(t *testing.T) {
	store := NewMockStore()
	for _, result := range []*BattleResult{
		{RoomId: "room-c", EndedAt: 300, Players: []PlayerResult{{PlayerId: "player-1"}}},
		{RoomId: "room-b", EndedAt: 200, Players: []PlayerResult{{PlayerId: "player-1"}}},
		{RoomId: "room-a", EndedAt: 100, Players: []PlayerResult{{PlayerId: "player-1"}}},
		{RoomId: "room-other", EndedAt: 400, Players: []PlayerResult{{PlayerId: "player-2"}}},
	} {
		if err := store.SaveBattleResult(result); err != nil {
			t.Fatal(err)
		}
	}

	first, err := store.ListBattleResults("player-1", 0, "", 2)
	if err != nil || len(first) != 2 || first[0].RoomId != "room-c" || first[1].RoomId != "room-b" {
		t.Fatalf("first page = %#v, err = %v; want room-c, room-b", first, err)
	}
	next, err := store.ListBattleResults("player-1", first[1].EndedAt, first[1].RoomId, 2)
	if err != nil || len(next) != 1 || next[0].RoomId != "room-a" {
		t.Fatalf("second page = %#v, err = %v; want room-a", next, err)
	}
}
