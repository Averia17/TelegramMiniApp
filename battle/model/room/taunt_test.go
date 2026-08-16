package room

import (
	"battle/model/game"
	"battle/model/player"
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

type fakeTauntSpender struct {
	calls int
	err   error
}

func (s *fakeTauntSpender) SpendTaunt(_, _ string) error {
	s.calls++
	return s.err
}

func TestHandleMessageBroadcastsTauntFromLivePlayer(t *testing.T) {
	spender := &fakeTauntSpender{}
	r := &Room{
		Clients:      make(map[string]*Client),
		Broadcast:    make(chan []byte, 1),
		TauntSpender: spender,
		State: &game.GameState{
			State: game.GameStateGame,
			Players: map[string]*player.Player{
				"p1": {PlayerId: "p1", Name: "Alice", Lives: 3},
				"p2": {PlayerId: "p2", Name: "Bob", Lives: 3},
			},
		},
	}
	client := &Client{Id: "p1", Name: "Alice", AccessToken: "token"}
	r.Clients[client.Id] = client

	data, err := json.Marshal(map[string]interface{}{
		"type":  "taunt",
		"ts":    time.Now().UnixMilli(),
		"value": map[string]string{"tauntId": "clown_laugh", "targetId": "p2"},
	})
	if err != nil {
		t.Fatal(err)
	}

	r.HandleMessage(client, data)
	if spender.calls != 1 {
		t.Fatalf("spend calls = %d, want 1", spender.calls)
	}

	select {
	case raw := <-r.Broadcast:
		var message game.ServerMessage
		if err := json.Unmarshal(raw, &message); err != nil {
			t.Fatal(err)
		}
		if message.Type != "taunt" {
			t.Fatalf("message type = %q, want taunt", message.Type)
		}
		params, ok := message.Params.(map[string]interface{})
		if !ok {
			t.Fatalf("params type = %T, want object", message.Params)
		}
		if params["playerId"] != "p1" || params["tauntId"] != "clown_laugh" || params["targetId"] != "p2" || params["targetName"] != "Bob" {
			t.Fatalf("params = %#v", params)
		}
	case <-time.After(time.Second):
		t.Fatal("taunt was not broadcast")
	}
}

func TestHandleMessageRejectsTauntWithInvalidTarget(t *testing.T) {
	spender := &fakeTauntSpender{}
	r := &Room{
		Clients:      make(map[string]*Client),
		Broadcast:    make(chan []byte, 1),
		TauntSpender: spender,
		State: &game.GameState{
			State: game.GameStateGame,
			Players: map[string]*player.Player{
				"p1": {PlayerId: "p1", Name: "Alice", Lives: 3},
			},
		},
	}
	client := &Client{Id: "p1", Name: "Alice", AccessToken: "token"}
	r.Clients[client.Id] = client

	r.HandleMessage(client, []byte(`{"type":"taunt","value":{"tauntId":"clown_laugh","targetId":"missing"}}`))
	if len(r.Broadcast) != 0 {
		t.Fatal("taunt with a missing target should be rejected")
	}
	if spender.calls != 0 {
		t.Fatal("invalid target should not spend crystals")
	}
}

func TestHandleMessageRejectsTauntOutsideGameAndDuringCooldown(t *testing.T) {
	spender := &fakeTauntSpender{}
	r := &Room{
		Clients:      make(map[string]*Client),
		Broadcast:    make(chan []byte, 2),
		TauntSpender: spender,
		State: &game.GameState{
			State:   game.GameStateLobby,
			Players: map[string]*player.Player{"p2": {PlayerId: "p2", Name: "Bob", Lives: 3}},
		},
	}
	client := &Client{Id: "p1", Name: "Alice", AccessToken: "token"}
	r.Clients[client.Id] = client
	data := []byte(`{"type":"taunt","value":{"tauntId":"clown_laugh","targetId":"p2"}}`)

	r.HandleMessage(client, data)
	if len(r.Broadcast) != 0 {
		t.Fatal("taunt should be rejected outside the game")
	}

	r.State.State = game.GameStateGame
	r.HandleMessage(client, data)
	r.HandleMessage(client, data)
	if len(r.Broadcast) != 1 {
		t.Fatalf("broadcast count = %d, want 1 during cooldown", len(r.Broadcast))
	}
	if spender.calls != 1 {
		t.Fatalf("spend calls = %d, want 1 during cooldown", spender.calls)
	}
}

func TestHandleMessageDoesNotBroadcastWhenTauntPaymentFails(t *testing.T) {
	spender := &fakeTauntSpender{err: fmt.Errorf("taunt access expired")}
	r := &Room{
		Clients:      make(map[string]*Client),
		Broadcast:    make(chan []byte, 1),
		TauntSpender: spender,
		State: &game.GameState{
			State: game.GameStateGame,
			Players: map[string]*player.Player{
				"p1": {PlayerId: "p1", Name: "Alice", Lives: 3},
				"p2": {PlayerId: "p2", Name: "Bob", Lives: 3},
			},
		},
	}
	client := &Client{Id: "p1", Name: "Alice", AccessToken: "token"}
	r.Clients[client.Id] = client

	r.HandleMessage(client, []byte(`{"type":"taunt","value":{"tauntId":"clown_laugh","targetId":"p2"}}`))
	if len(r.Broadcast) != 0 {
		t.Fatal("failed taunt payment should not broadcast")
	}
	if client.LastTauntAt != 0 {
		t.Fatal("failed taunt payment should release cooldown")
	}
}
