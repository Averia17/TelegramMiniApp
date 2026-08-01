package room

import (
	"battle/model/game"
	"battle/provider"
	"encoding/json"
	"log"
	"time"
)

var Store provider.Store
var Kafka *provider.KafkaProducer

const reconnectGracePeriod = 2 * time.Minute

type preparedStateUpdate struct {
	client      *Client
	state       *game.StateUpdate
	mapRevision int
	sendingMap  bool
}

func SetStore(s provider.Store) {
	Store = s
}

func SetKafka(k *provider.KafkaProducer) {
	Kafka = k
}

func (r *Room) Run() {
	ticker := time.NewTicker(time.Second / 60)
	redisTicker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	defer redisTicker.Stop()

	frame := 0
	var emptySince time.Time

	for {
		select {
		case client := <-r.Register:
			r.mu.Lock()
			if client.State == nil {
				client.State = make(chan []byte, 1)
			}
			if r.Disconnected == nil {
				r.Disconnected = make(map[string]time.Time)
			}
			emptySince = time.Time{}
			previous := r.Clients[client.Id]
			existingPlayer := r.State.Players[client.Id]
			r.Clients[client.Id] = client
			delete(r.Disconnected, client.Id)

			if previous != nil && previous != client {
				// A newer authenticated connection owns this player now. The old
				// read pump may still send Unregister, so Unregister must verify
				// that it is still the current client before removing anything.
				close(previous.Send)
				if previous.Conn != nil {
					_ = previous.Conn.Close()
				}
			}

			if existingPlayer != nil {
				// Reconnects resume the authoritative server-side player. Client
				// supplied name/hero values must not reset battle progress.
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
				playerRecord := &provider.PlayerRecord{
					PlayerId: client.Id,
					RoomId:   r.Id,
					Name:     client.Name,
				}
				if err := Store.AddPlayerToRoom(r.Id, playerRecord); err != nil {
					log.Printf("Store add player error: %v", err)
				}
			}
			r.mu.Unlock()

		case client := <-r.Unregister:
			r.mu.Lock()
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
				emptySince = time.Now()
			}
			r.mu.Unlock()

		case message := <-r.Broadcast:
			r.mu.RLock()
			for _, client := range r.Clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(r.Clients, client.Id)
				}
			}
			r.mu.RUnlock()

		case <-ticker.C:
			var updates []preparedStateUpdate
			r.mu.Lock()
			r.expireDisconnectedPlayers()
			if len(r.Clients) == 0 {
				if len(r.Disconnected) == 0 && emptySince.IsZero() {
					emptySince = time.Now()
				}
				shouldClose := len(r.Disconnected) == 0 && !emptySince.IsZero() && time.Since(emptySince) >= 30*time.Second
				r.mu.Unlock()
				if shouldClose {
					RemoveRoom(r.Id)
					return
				}
				continue
			}
			r.State.Update()
			frame++
			if frame%2 == 0 {
				updates = r.prepareStateUpdates()
			}
			r.mu.Unlock()
			r.queueStateUpdates(updates)

		case <-redisTicker.C:
			r.mu.RLock()
			roomRecord := &provider.RoomRecord{
				RoomId:      r.Id,
				RoomName:    r.Name,
				MapName:     r.MapName,
				Mode:        r.Mode,
				MaxPlayers:  r.MaxPlayers,
				PlayerCount: len(r.Clients),
				Status:      r.State.State,
			}
			r.mu.RUnlock()
			if Store != nil {
				Store.SaveRoom(roomRecord)
			}
		}
	}
}

func (r *Room) expireDisconnectedPlayers() {
	now := time.Now()
	for playerID, disconnectedAt := range r.Disconnected {
		if now.Sub(disconnectedAt) < reconnectGracePeriod {
			continue
		}
		delete(r.Disconnected, playerID)
		r.State.PlayerRemove(playerID)
	}
}

func (r *Room) BroadcastMsg(msgType string, params interface{}) {
	msg := game.NewServerMessage(msgType, params)
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	select {
	case r.Broadcast <- data:
	default:
	}
}

func (r *Room) SendToPlayer(playerId string, msgType string, params interface{}) {
	msg := game.NewServerMessage(msgType, params)
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	if client, ok := r.Clients[playerId]; ok {
		select {
		case client.Send <- data:
		default:
		}
	}
}

func (r *Room) HandleMessage(client *Client, data []byte) {
	var msg struct {
		Type  string          `json:"type"`
		Ts    int64           `json:"ts,omitempty"`
		Value json.RawMessage `json:"value,omitempty"`
	}
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	switch msg.Type {
	case "move":
		var v game.MoveValue
		if err := json.Unmarshal(msg.Value, &v); err == nil {
			r.State.PlayerPushAction(game.Action{
				PlayerId: client.Id,
				Type:     "move",
				Ts:       msg.Ts,
				Value:    &v,
			})
		}
	case "rotate":
		var v game.RotateValue
		if err := json.Unmarshal(msg.Value, &v); err == nil {
			r.State.PlayerPushAction(game.Action{
				PlayerId: client.Id,
				Type:     "rotate",
				Ts:       msg.Ts,
				Value:    &v,
			})
		}
	case "shoot":
		var v game.ShootValue
		if err := json.Unmarshal(msg.Value, &v); err == nil {
			r.State.PlayerPushAction(game.Action{
				PlayerId: client.Id,
				Type:     "shoot",
				Ts:       msg.Ts,
				Value:    &v,
			})
		}
	case "ability":
		var v game.AbilityValue
		if err := json.Unmarshal(msg.Value, &v); err == nil {
			r.State.PlayerPushAction(game.Action{PlayerId: client.Id, Type: "ability", Ts: msg.Ts, Value: &v})
		}
	case "aiming":
		var v game.AimingValue
		if err := json.Unmarshal(msg.Value, &v); err == nil {
			if player := r.State.Players[client.Id]; player != nil {
				player.Aiming = v.Aiming
			}
		}
	}
}
