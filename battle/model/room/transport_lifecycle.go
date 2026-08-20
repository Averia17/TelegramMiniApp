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
		r.dropPlayerActions(client.Id)
		close(previous.Send)
		if previous.Conn != nil {
			_ = previous.Conn.Close()
		}
	}
	if existingPlayer != nil {
		r.dropPlayerActions(client.Id)
		client.Name = existingPlayer.Name
		client.HeroName = existingPlayer.HeroName
		existingPlayer.MoveX, existingPlayer.MoveY, existingPlayer.Aiming = 0, 0, false
	} else {
		lateJoin := r.State.State == game.GameStateGame
		r.State.PlayerAdd(client.Id, client.Name, client.HeroName)
		if client.AssignedTeam == "Blue" || client.AssignedTeam == "Red" {
			r.State.Players[client.Id].SetTeam(client.AssignedTeam)
			r.State.Players[client.Id].TeamLocked = true
			// PlayerAdd starts from a mode-agnostic random pad. Matchmaking has
			// already assigned the authoritative team by this point, so place the
			// player immediately; otherwise the lobby can visibly show them on the
			// opposing base until startGame teleports everyone again.
			r.State.PlacePlayerAtTeamSpawn(client.Id)
		}
		r.State.Players[client.Id].PartyID = client.PartyID
		if lateJoin {
			if joined := r.State.Players[client.Id]; joined != nil {
				joined.InvulnerableUntil = time.Now().Add(3 * time.Second).UnixMilli()
			}
			r.State.PlacePlayerAtTeamSpawn(client.Id)
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
		r.dropPlayerActions(client.Id)
		if player := r.State.Players[client.Id]; player != nil {
			player.MoveX, player.MoveY, player.Aiming = 0, 0, false
		}
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

func (r *Room) dropPlayerActions(playerID string) {
	if r.State == nil || len(r.State.Actions) == 0 {
		return
	}
	kept := r.State.Actions[:0]
	for _, action := range r.State.Actions {
		if action.PlayerId != playerID {
			kept = append(kept, action)
		}
	}
	r.State.Actions = kept
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
