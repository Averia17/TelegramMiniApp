package room

import (
	"battle/model/game"
	"battle/provider"
	"encoding/json"
	"log"
	"time"
)

var Redis *provider.RedisProvider

func SetRedis(r *provider.RedisProvider) {
	Redis = r
}

func (r *Room) Run() {
	ticker := time.NewTicker(time.Second / 60)
	stateTicker := time.NewTicker(time.Second / 20)
	redisTicker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	defer stateTicker.Stop()
	defer redisTicker.Stop()

	for {
		select {
		case <-r.done:
			return
		case client := <-r.Register:
			r.mu.Lock()
			r.Clients[client.Id] = client
			r.State.PlayerAdd(client.Id, client.Name)
			playerRecord := &provider.PlayerRecord{
				PlayerId: client.Id,
				RoomId:   r.Id,
				Name:     client.Name,
				JoinedAt: time.Now().UnixMilli(),
			}
			if Redis != nil {
				if err := Redis.AddPlayerToRoom(r.Id, playerRecord); err != nil {
					log.Printf("Redis add player error: %v", err)
				}
			}
			r.mu.Unlock()

		case client := <-r.Unregister:
			r.mu.Lock()
			if _, ok := r.Clients[client.Id]; ok {
				r.State.PlayerRemove(client.Id)
				delete(r.Clients, client.Id)
				close(client.Send)
				if Redis != nil {
					if err := Redis.RemovePlayerFromRoom(r.Id, client.Id); err != nil {
						log.Printf("Redis remove player error: %v", err)
					}
				}
			}
			if len(r.Clients) == 0 {
				r.mu.Unlock()
				RemoveRoom(r.Id)
				return
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
			r.mu.Lock()
			r.State.Update()
			r.mu.Unlock()

		case <-stateTicker.C:
			r.mu.RLock()
			r.sendStateUpdate()
			r.mu.RUnlock()

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
				CreatedAt:   time.Now().UnixMilli(),
			}
			r.mu.RUnlock()
			if Redis != nil {
				Redis.UpdateRoom(roomRecord)
			}
		}
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

func (r *Room) sendStateUpdate() {
	players := make(map[string]game.PlayerJSON)
	for id, p := range r.State.Players {
		players[id] = game.PlayerJSON{
			X:        p.X,
			Y:        p.Y,
			Radius:   p.Radius,
			PlayerId: p.PlayerId,
			Name:     p.Name,
			Lives:    p.Lives,
			MaxLives: p.MaxLives,
			Team:     p.Team,
			Color:    p.Color,
			Kills:    p.Kills,
			Rotation: p.Rotation,
			Ack:      p.Ack,
		}
	}

	monsters := make(map[string]game.MonsterJSON)
	for id, m := range r.State.Monsters {
		monsters[id] = game.MonsterJSON{
			X:        m.X,
			Y:        m.Y,
			Radius:   m.Radius,
			Rotation: m.Rotation,
		}
	}

	bullets := make([]game.BulletJSON, 0)
	for _, b := range r.State.Bullets {
		if b.Active {
			bullets = append(bullets, game.BulletJSON{
				X:        b.X,
				Y:        b.Y,
				Radius:   b.Radius,
				PlayerId: b.PlayerId,
				Team:     b.Team,
				Rotation: b.Rotation,
				Active:   b.Active,
				Color:    b.Color,
			})
		}
	}

	props := make([]game.PropJSON, 0)
	for _, p := range r.State.Props {
		props = append(props, game.PropJSON{
			X:      p.X,
			Y:      p.Y,
			Radius: p.Radius,
			Type:   p.Type,
			Active: p.Active,
		})
	}

	gameState := game.GameStateJSON{
		State:       r.State.State,
		RoomName:    r.State.RoomName,
		MapName:     r.State.MapName,
		MaxPlayers:  r.State.MaxPlayers,
		Mode:        string(r.State.Mode),
		LobbyEndsAt: r.State.LobbyEndsAt,
		GameEndsAt:  r.State.GameEndsAt,
	}

	var mapJSON game.MapJSON
	if r.State.Map != nil {
		walls := make([]game.WallJSON, 0, len(r.State.Map.Collisions))
		for _, w := range r.State.Map.Collisions {
			walls = append(walls, game.WallJSON{
				MinX: w.MinX, MinY: w.MinY, MaxX: w.MaxX, MaxY: w.MaxY, Type: w.Type,
			})
		}
		mapJSON = game.MapJSON{
			Width:    r.State.Map.WidthInPixels,
			Height:   r.State.Map.HeightInPixels,
			TileSize: game.TileSize,
			Walls:    walls,
		}
	}

	msg := game.NewStateUpdate(&gameState, &mapJSON, players, monsters, bullets, props)
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	r.mu.RLock()
	for _, client := range r.Clients {
		select {
		case client.Send <- data:
		default:
		}
	}
	r.mu.RUnlock()
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
	}
}
