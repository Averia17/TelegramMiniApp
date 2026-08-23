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

func TestTransportLifecycleRejectsNewPlayersWhenRoomIsFull(t *testing.T) {
	r := newLifecycleRoom()
	r.State.MaxPlayers = 1
	emptySince := time.Time{}
	first := &Client{Id: "p1", Name: "first", HeroName: "Needle", Send: make(chan []byte, 1)}
	second := &Client{Id: "p2", Name: "second", HeroName: "Mandy", Send: make(chan []byte, 1)}
	r.registerClient(first, &emptySince)
	r.registerClient(second, &emptySince)

	if _, ok := r.Clients[second.Id]; ok {
		t.Fatal("full room accepted a new player")
	}
	if _, ok := r.State.Players[second.Id]; ok {
		t.Fatal("full room added an authoritative player")
	}
}

func TestTransportLifecycleStopsDisconnectedPlayerMovement(t *testing.T) {
	r := newLifecycleRoom()
	emptySince := time.Time{}
	client := &Client{Id: "p1", Send: make(chan []byte, 1)}
	r.registerClient(client, &emptySince)
	r.State.Players[client.Id].MoveX = 1
	r.State.Players[client.Id].MoveY = -1
	r.State.Players[client.Id].Aiming = true

	r.unregisterClient(client, &emptySince)

	p := r.State.Players[client.Id]
	if p.MoveX != 0 || p.MoveY != 0 || p.Aiming {
		t.Fatalf("disconnected player retained input: move=(%.1f, %.1f) aiming=%v", p.MoveX, p.MoveY, p.Aiming)
	}
}

func TestTransportLifecycleReconnectClearsStaleMovement(t *testing.T) {
	r := newLifecycleRoom()
	emptySince := time.Time{}
	old := &Client{Id: "p1", Name: "old", HeroName: "Needle", Send: make(chan []byte, 1)}
	r.registerClient(old, &emptySince)
	r.State.Players[old.Id].MoveX = -1
	r.State.Players[old.Id].MoveY = 1
	r.State.Players[old.Id].Aiming = true

	newClient := &Client{Id: "p1", Name: "new", HeroName: "Mandy", Send: make(chan []byte, 1)}
	r.registerClient(newClient, &emptySince)

	p := r.State.Players[old.Id]
	if p.MoveX != 0 || p.MoveY != 0 || p.Aiming {
		t.Fatalf("reconnected player retained stale input: move=(%.1f, %.1f) aiming=%v", p.MoveX, p.MoveY, p.Aiming)
	}
}

func TestTransportLifecycleReconnectDropsQueuedCommands(t *testing.T) {
	r := newLifecycleRoom()
	emptySince := time.Time{}
	old := &Client{Id: "p1", Name: "old", HeroName: "Needle", Send: make(chan []byte, 1)}
	r.registerClient(old, &emptySince)
	r.State.PlayerPushAction(game.Action{PlayerId: old.Id, Type: "move", Ts: 1})

	newClient := &Client{Id: "p1", Name: "new", HeroName: "Mandy", Send: make(chan []byte, 1)}
	r.registerClient(newClient, &emptySince)

	if len(r.State.Actions) != 0 {
		t.Fatalf("reconnect retained %d queued commands for the replaced session", len(r.State.Actions))
	}
}

func TestTransportLifecyclePlacesAssignedTeamPlayerAtOwnSpawnInLobby(t *testing.T) {
	r := &Room{
		Id:           "team-transport-test",
		Clients:      make(map[string]*Client),
		Disconnected: make(map[string]time.Time),
		State:        game.NewGameState(game.GameConfig{MapName: "team-battle", Mode: game.ModeTeamDeathmatch, MaxPlayers: 6}),
	}
	emptySince := time.Time{}
	client := &Client{
		Id: "p1", Name: "Blue player", HeroName: "Needle", AssignedTeam: "Blue",
		Send: make(chan []byte, 1),
	}

	r.registerClient(client, &emptySince)
	p := r.State.Players[client.Id]
	for _, spawn := range r.State.Map.TeamSpawners["Blue"] {
		if p.X >= spawn.X && p.X <= spawn.X+spawn.Width && p.Y >= spawn.Y && p.Y <= spawn.Y+spawn.Height {
			return
		}
	}
	t.Fatalf("assigned Blue player spawned outside the Blue base in lobby at (%.0f, %.0f)", p.X, p.Y)
}

func TestTransportLifecycleRejectsCommandsFromReplacedConnection(t *testing.T) {
	r := newLifecycleRoom()
	emptySince := time.Time{}
	old := &Client{Id: "p1", Name: "old", HeroName: "Needle", Send: make(chan []byte, 1)}
	newClient := &Client{Id: "p1", Name: "new", HeroName: "Mandy", Send: make(chan []byte, 1)}
	r.registerClient(old, &emptySince)
	r.registerClient(newClient, &emptySince)

	r.HandleMessage(old, []byte(`{"type":"move","ts":100,"value":{"x":1,"y":0}}`))

	if len(r.State.Actions) != 0 {
		t.Fatal("replaced connection was still allowed to enqueue a movement command")
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
