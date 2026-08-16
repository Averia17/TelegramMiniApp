package room

import (
	"battle/model/game"
	"battle/provider"
	"log"
	"time"
)

// registerClient owns connection replacement and reconnect semantics. It is
// intentionally independent from the scheduler so another room runtime can
// reuse the same authoritative transport policy.
func (r *Room) registerClient(client *Client, emptySince *time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if client.State == nil {
		client.State = make(chan []byte, 1)
	}
	if r.Disconnected == nil {
		r.Disconnected = make(map[string]time.Time)
	}
	*emptySince = time.Time{}
	previous := r.Clients[client.Id]
	existingPlayer := r.State.Players[client.Id]
	r.Clients[client.Id] = client
	delete(r.Disconnected, client.Id)

	if previous != nil && previous != client {
		close(previous.Send)
		if previous.Conn != nil {
			_ = previous.Conn.Close()
		}
	}
	if existingPlayer != nil {
		client.Name = existingPlayer.Name
		client.HeroName = existingPlayer.HeroName
	} else {
		lateJoin := r.State.State == game.GameStateGame
		r.State.PlayerAdd(client.Id, client.Name, client.HeroName)
		if lateJoin {
			if joined := r.State.Players[client.Id]; joined != nil {
				joined.InvulnerableUntil = time.Now().Add(3 * time.Second).UnixMilli()
			}
		}
	}
	if Store != nil && previous == nil {
		playerRecord := &provider.PlayerRecord{PlayerId: client.Id, RoomId: r.Id, Name: client.Name}
		if err := Store.AddPlayerToRoom(r.Id, playerRecord); err != nil {
			log.Printf("Store add player error: %v", err)
		}
	}
}

func (r *Room) unregisterClient(client *Client, emptySince *time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if current, ok := r.Clients[client.Id]; ok && current == client {
		delete(r.Clients, client.Id)
		r.Disconnected[client.Id] = time.Now()
		close(client.Send)
		if Store != nil {
			if err := Store.RemovePlayerFromRoom(r.Id, client.Id); err != nil {
				log.Printf("Store remove player error: %v", err)
			}
		}
	}
	if len(r.Clients) == 0 && len(r.Disconnected) == 0 {
		*emptySince = time.Now()
	}
}

func (r *Room) deliverBroadcast(message []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, client := range r.Clients {
		select {
		case client.Send <- message:
		default:
			close(client.Send)
			delete(r.Clients, client.Id)
		}
	}
}
