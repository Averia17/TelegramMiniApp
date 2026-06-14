package room

import (
	"battle/model/game"
	"battle/model/room"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func newTestClient(id string) *room.Client {
	return &room.Client{
		Id:   id,
		Name: "Test_" + id,
		Send: make(chan []byte, 256),
	}
}

func TestMatchQueueAdd(t *testing.T) {
	matchQueue.mu.Lock()
	matchQueue.queue = nil
	matchQueue.mu.Unlock()

	c1 := newTestClient("m1")
	c2 := newTestClient("m2")

	AddToMatchQueue(c1)
	AddToMatchQueue(c2)

	matchQueue.mu.Lock()
	queueLen := len(matchQueue.queue)
	matchQueue.mu.Unlock()

	if queueLen != 0 {
		t.Errorf("queue length = %v, want 0", queueLen)
	}

	select {
	case msg := <-c1.Send:
		if !json.Valid(msg) {
			t.Error("c1 received invalid JSON")
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("c1 did not receive match_found")
	}

	select {
	case msg := <-c2.Send:
		if !json.Valid(msg) {
			t.Error("c2 received invalid JSON")
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("c2 did not receive match_found")
	}
}

func TestMatchQueueRemove(t *testing.T) {
	matchQueue.mu.Lock()
	matchQueue.queue = nil
	matchQueue.mu.Unlock()

	c1 := newTestClient("rm1")
	AddToMatchQueue(c1)
	RemoveFromMatchQueue("rm1")

	matchQueue.mu.Lock()
	queueLen := len(matchQueue.queue)
	matchQueue.mu.Unlock()

	if queueLen != 0 {
		t.Errorf("queue length = %v, want 0", queueLen)
	}
}

func TestMatchQueueSinglePlayer(t *testing.T) {
	matchQueue.mu.Lock()
	matchQueue.queue = nil
	matchQueue.mu.Unlock()

	c1 := newTestClient("s1")
	AddToMatchQueue(c1)

	matchQueue.mu.Lock()
	queueLen := len(matchQueue.queue)
	matchQueue.mu.Unlock()

	if queueLen != 0 {
		t.Errorf("queue length = %v, want 0 (single player gets room immediately)", queueLen)
	}

	select {
	case msg := <-c1.Send:
		if !strings.Contains(string(msg), "match_found") {
			t.Errorf("expected match_found, got: %s", string(msg))
		}
	default:
		t.Error("expected match_found message in send channel")
	}

	matchQueue.mu.Lock()
	matchQueue.queue = nil
	matchQueue.mu.Unlock()
}

func TestGameStateInRoom(t *testing.T) {
	r := room.GetOrCreateRoom("gs1", "GameState", "small", "deathmatch", 8)
	gs := r.State
	if gs == nil {
		t.Fatal("State should not be nil")
	}
	if gs.Mode != game.GameMode("deathmatch") {
		t.Errorf("Mode = %v, want deathmatch", gs.Mode)
	}
	if gs.State != game.GameStateWaiting {
		t.Errorf("State = %v, want waiting", gs.State)
	}
	room.RemoveRoom("gs1")
}
