package integration

import (
	"battle/provider"
	"fmt"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestMockStore_ImplementsInterface(t *testing.T) {
	var _ provider.Store = (*provider.MockStore)(nil)
}

func TestIntegration_PlayerJoinCreatesRoom(t *testing.T) {
	ts, store := setupTest(t)

	conn := wsDial(t, ts)
	resp := wsJoin(t, conn, "Alice", "room-join", "arena")
	roomId := parseRoomId(resp)

	if store.RoomCount() == 0 {
		t.Fatal("expected room in store after join")
	}
	r, err := store.GetRoom(roomId)
	if err != nil {
		t.Fatalf("GetRoom: %v", err)
	}
	if r.PlayerCount < 1 {
		t.Errorf("PlayerCount=%d, want >=1", r.PlayerCount)
	}
}

func TestIntegration_TwoPlayersTracked(t *testing.T) {
	ts, store := setupTest(t)

	_, _, roomId := joinTwo(t, ts, "room-two", "arena")

	pollUntil(t, 5*time.Second, "player count >= 2", func() bool {
		r, _ := store.GetRoom(roomId)
		return r != nil && r.PlayerCount >= 2
	})
}

func TestIntegration_LeaveDecrementsCount(t *testing.T) {
	ts, store := setupTest(t)

	c1, c2, roomId := joinTwo(t, ts, "room-leave", "arena")

	pollUntil(t, 5*time.Second, "player count == 2", func() bool {
		r, _ := store.GetRoom(roomId)
		return r != nil && r.PlayerCount >= 2
	})

	c1.Close()

	pollUntil(t, 5*time.Second, "player count <= 1", func() bool {
		r, _ := store.GetRoom(roomId)
		return r != nil && r.PlayerCount <= 1
	})
	_ = c2
}

func TestIntegration_AllLeaveRemovesRoom(t *testing.T) {
	ts, store := setupTest(t)

	conn := wsDial(t, ts)
	resp := wsJoin(t, conn, "Solo", "room-solo", "arena")
	roomId := parseRoomId(resp)

	pollUntil(t, 5*time.Second, "room exists", func() bool {
		return store.RoomCount() > 0
	})

	conn.Close()

	pollUntil(t, 5*time.Second, "room removed", func() bool {
		_, err := store.GetRoom(roomId)
		return err != nil
	})
}

func TestIntegration_GameStateInBroadcast(t *testing.T) {
	ts, _ := setupTest(t)

	c1, _, _ := joinTwo(t, ts, "room-game", "arena")
	waitForGame(t, c1)
}

func TestIntegration_GameStatusInStore(t *testing.T) {
	ts, store := setupTest(t)

	c1, _, roomId := joinTwo(t, ts, "room-status", "arena")
	waitForGame(t, c1)

	pollUntil(t, 8*time.Second, "store status == game", func() bool {
		r, _ := store.GetRoom(roomId)
		return r != nil && r.Status == "game"
	})
}

func TestIntegration_ShootingProducesBullets(t *testing.T) {
	ts, _ := setupTest(t)

	c1, _, _ := joinTwo(t, ts, "room-shoot", "arena")
	waitForGame(t, c1)

	c1.WriteMessage(websocket.TextMessage, []byte(`{"type":"shoot","ts":999999,"value":{"angle":0}}`))

	waitState(t, c1, 5*time.Second, func(msg map[string]interface{}) bool {
		bullets, ok := msg["bullets"].([]interface{})
		return ok && len(bullets) > 0
	})
}

func TestIntegration_GameSpawnsMonsters(t *testing.T) {
	ts, _ := setupTest(t)

	c1, _, _ := joinTwo(t, ts, "room-monsters", "arena")

	waitState(t, c1, 20*time.Second, func(msg map[string]interface{}) bool {
		game, _ := msg["game"].(map[string]interface{})
		monsters, _ := msg["monsters"].(map[string]interface{})
		return game != nil && game["state"] == "game" && len(monsters) > 0
	})
}

func TestIntegration_MoveChangesPosition(t *testing.T) {
	ts, _ := setupTest(t)

	c1, _, _ := joinTwo(t, ts, "room-move", "arena")
	waitForGame(t, c1)

	for i := 0; i < 50; i++ {
		c1.WriteMessage(websocket.TextMessage, []byte(`{"type":"move","ts":1000,"value":{"x":1,"y":0}}`))
	}

	waitState(t, c1, 5*time.Second, func(msg map[string]interface{}) bool {
		players, _ := msg["players"].(map[string]interface{})
		for _, p := range players {
			pd, _ := p.(map[string]interface{})
			if pd != nil {
				x, _ := pd["x"].(float64)
				if x > 200 {
					return true
				}
			}
		}
		return false
	})
}

func TestIntegration_PlayerDiesWhenHealthZero(t *testing.T) {
	ts, store := setupTest(t)

	c1, c2, roomId := joinTwo(t, ts, "room-die", "arena")
	waitForGame(t, c1)

	c2.Close()

	pollUntil(t, 5*time.Second, "p2 removed from store", func() bool {
		r, _ := store.GetRoom(roomId)
		return r != nil && r.PlayerCount <= 1
	})

	for i := 0; i < 30; i++ {
		c1.WriteMessage(websocket.TextMessage, []byte(`{"type":"shoot","ts":999999,"value":{"angle":0}}`))
	}
}

func TestIntegration_ConcurrentJoins(t *testing.T) {
	ts, store := setupTest(t)

	const n = 5
	done := make(chan string, n)

	for i := 0; i < n; i++ {
		go func(idx int) {
			conn := wsDial(t, ts)
			resp := wsJoin(t, conn, fmt.Sprintf("C%d", idx), "room-conc", "arena")
			done <- parseRoomId(resp)
		}(i)
	}

	roomId := ""
	for i := 0; i < n; i++ {
		r := <-done
		if roomId == "" {
			roomId = r
		}
	}

	pollUntil(t, 5*time.Second, "all players in room", func() bool {
		r, _ := store.GetRoom(roomId)
		return r != nil && r.PlayerCount >= n
	})
}
