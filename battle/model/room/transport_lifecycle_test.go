package room

import (
	"battle/model/game"
	"testing"
	"time"
)

func newLifecycleRoom() *Room {
	return &Room{
		Id:           "transport-test",
		Clients:      make(map[string]*Client),
		Disconnected: make(map[string]time.Time),
		State:        game.NewGameState(game.GameConfig{MapName: "small", MaxPlayers: 2}),
	}
}

func TestTransportLifecycleKeepsNewestReconnectOwner(t *testing.T) {
	r := newLifecycleRoom()
	emptySince := time.Time{}
	old := &Client{Id: "p1", Name: "old", HeroName: "Needle", Send: make(chan []byte, 1)}
	newClient := &Client{Id: "p1", Name: "new", HeroName: "Mandy", Send: make(chan []byte, 1)}
	r.registerClient(old, &emptySince)
	r.registerClient(newClient, &emptySince)
	r.unregisterClient(old, &emptySince)

	if r.Clients["p1"] != newClient {
		t.Fatal("stale disconnect must not remove the newest connection")
	}
	if got := r.State.Players["p1"].Name; got != "old" {
		t.Fatalf("reconnect changed authoritative player name to %q", got)
	}
}

func TestTransportLifecycleDeliversBroadcastAndDropsSlowClient(t *testing.T) {
	r := newLifecycleRoom()
	fast := &Client{Id: "fast", Send: make(chan []byte, 1)}
	slow := &Client{Id: "slow", Send: make(chan []byte)}
	r.Clients[fast.Id] = fast
	r.Clients[slow.Id] = slow
	r.deliverBroadcast([]byte("snapshot"))

	select {
	case got := <-fast.Send:
		if string(got) != "snapshot" {
			t.Fatalf("broadcast = %q", got)
		}
	default:
		t.Fatal("fast client did not receive broadcast")
	}
	if _, ok := r.Clients[slow.Id]; ok {
		t.Fatal("slow client should be removed after backpressure")
	}
}
