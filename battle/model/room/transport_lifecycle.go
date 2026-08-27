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
func (r *Room) registerClient(client *Client, emptySince *time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if client == nil || r.State == nil {
		return ErrRoomFinished
	}
	if client.State == nil {
		client.State = make(chan []byte, 1)
	}
	if r.Disconnected == nil {
		r.Disconnected = make(map[string]time.Time)
	}
	if r.PlayerStates == nil {
		r.PlayerStates = make(map[string]BattleSessionStatus)
	}
	*emptySince = time.Time{}
	previous := r.Clients[client.Id]
	existingPlayer := r.State.Players[client.Id]
	if existingPlayer == nil {
		if r.State.State == game.GameStateFinished {
			return ErrRoomFinished
		}
		maxPlayers := r.MaxPlayers
		if maxPlayers <= 0 {
			maxPlayers = r.State.MaxPlayers
		}
		if maxPlayers > 0 && len(r.State.Players) >= maxPlayers {
			return ErrRoomFull
		}
	}
	r.Clients[client.Id] = client
	delete(r.Disconnected, client.Id)
	r.PlayerStates[client.Id] = BattleSessionActive

	if previous != nil && previous != client {
		r.dropPlayerActions(client.Id)
		previous.CloseSend()
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
	if store := currentStore(); store != nil && previous == nil {
		playerRecord := &provider.PlayerRecord{PlayerId: client.Id, RoomId: r.Id, Name: client.Name}
		if err := store.AddPlayerToRoom(r.Id, playerRecord); err != nil {
			log.Printf("Store add player error: %v", err)
		}
	}
	return nil
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
		if r.PlayerStates == nil {
			r.PlayerStates = make(map[string]BattleSessionStatus)
		}
		r.PlayerStates[client.Id] = BattleSessionDisconnected
		client.CloseSend()
		if store := currentStore(); store != nil {
			if err := store.RemovePlayerFromRoom(r.Id, client.Id); err != nil {
				log.Printf("Store remove player error: %v", err)
			}
		}
		if len(r.Clients) > 0 {
			r.State.EnsureTeamRoster(len(r.Clients))
		}
	}
	if len(r.Clients) == 0 && len(r.Disconnected) == 0 {
		*emptySince = time.Now()
	}
}

// LeaveForReconnect immediately removes a disconnected transport from active-
// room checks while preserving the player state for manual recovery.
func (r *Room) LeaveForReconnect(client *Client) {
	r.leaveClient(client, BattleSessionDisconnected)
}

// LeaveVoluntarily records an explicit exit, such as pressing the battle
// close button. The player remains in the state snapshot for room cleanup but
// is no longer eligible for recovery or for blocking a new battle.
func (r *Room) LeaveVoluntarily(client *Client) BattleSessionStatus {
	return r.leaveClient(client, BattleSessionLeftVoluntarily)
}

func (r *Room) leaveClient(client *Client, status BattleSessionStatus) BattleSessionStatus {
	if r == nil || client == nil {
		return status
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if current, ok := r.Clients[client.Id]; !ok || current != client {
		return status
	}
	if r.State != nil && r.State.State == game.GameStateFinished {
		status = BattleSessionFinished
	}
	r.dropPlayerActions(client.Id)
	if r.State != nil {
		if player := r.State.Players[client.Id]; player != nil {
			player.MoveX, player.MoveY, player.Aiming = 0, 0, false
		}
	}
	delete(r.Clients, client.Id)
	if r.Disconnected == nil {
		r.Disconnected = make(map[string]time.Time)
	}
	if r.PlayerStates == nil {
		r.PlayerStates = make(map[string]BattleSessionStatus)
	}
	r.Disconnected[client.Id] = time.Now()
	r.PlayerStates[client.Id] = status
	client.CloseSend()
	if store := currentStore(); store != nil {
		if err := store.RemovePlayerFromRoom(r.Id, client.Id); err != nil {
			log.Printf("Store remove leaving player error: %v", err)
		}
	}
	return status
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
		if !client.TrySend(message) {
			client.CloseSend()
			delete(r.Clients, client.Id)
		}
	}
}
