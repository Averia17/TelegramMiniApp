package room

import (
	"battle/model/game"
	"battle/provider"
	"encoding/json"
	"log"
	"math"
	"time"
)

var Store provider.Store
var Kafka *provider.KafkaProducer

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
			emptySince = time.Time{}
			r.Clients[client.Id] = client
			r.State.PlayerAdd(client.Id, client.Name, client.HeroName)
			if Store != nil {
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
			if _, ok := r.Clients[client.Id]; ok {
				r.State.PlayerRemove(client.Id)
				delete(r.Clients, client.Id)
				close(client.Send)
				if Store != nil {
					if err := Store.RemovePlayerFromRoom(r.Id, client.Id); err != nil {
						log.Printf("Store remove player error: %v", err)
					}
				}
			}
			if len(r.Clients) == 0 {
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
			r.mu.Lock()
			if len(r.Clients) == 0 {
				shouldClose := !emptySince.IsZero() && time.Since(emptySince) >= 30*time.Second
				r.mu.Unlock()
				if shouldClose {
					RemoveRoom(r.Id)
					return
				}
				continue
			}
			r.State.Update()
			frame++
			if frame%3 == 0 {
				r.sendStateUpdate()
			}
			r.mu.Unlock()

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

func (r *Room) sendStateUpdate() {
	if len(r.Clients) == 0 {
		return
	}

	playerCount := len(r.State.Players)
	players := make(map[string]game.PlayerJSON, playerCount)
	for id, p := range r.State.Players {
		now := time.Now().UnixMilli()
		primaryCooldown := math.Max(0, float64(p.LastPrimaryAt+6500-now)/1000)
		secondaryCooldown := math.Max(0, float64(p.LastSecondaryAt+9000-now)/1000)
		players[id] = game.PlayerJSON{
			X:          p.X,
			Y:          p.Y,
			Radius:     p.Radius,
			PlayerId:   p.PlayerId,
			Name:       p.Name,
			Lives:      p.Lives,
			MaxLives:   p.MaxLives,
			Team:       p.Team,
			Color:      p.Color,
			Kills:      p.Kills,
			Rotation:   p.Rotation,
			Ack:        p.Ack,
			Hero:       p.HeroName,
			AttackType: p.AttackType,
			ShieldHP:   p.ShieldHP,
			Marks:      p.Marks,
			Cooldowns:  map[string]float64{"primary": primaryCooldown, "secondary": secondaryCooldown},
			Poisoned:   p.PoisonUntil > time.Now().UnixMilli(),
		}
	}

	var monsters map[string]game.MonsterJSON
	if len(r.State.Monsters) > 0 {
		monsters = make(map[string]game.MonsterJSON, len(r.State.Monsters))
		for id, m := range r.State.Monsters {
			monsters[id] = game.MonsterJSON{
				X:        m.X,
				Y:        m.Y,
				Radius:   m.Radius,
				Rotation: m.Rotation,
			}
		}
	}

	var bullets []game.BulletJSON
	for _, b := range r.State.Bullets {
		if b.Active {
			bullets = append(bullets, game.BulletJSON{
				X:         b.X,
				Y:         b.Y,
				Radius:    b.Radius,
				PlayerId:  b.PlayerId,
				Team:      b.Team,
				Rotation:  b.Rotation,
				Color:     b.Color,
				Kind:      b.Kind,
				Speed:     b.Speed,
				MaxRange:  b.MaxRange,
				Travelled: b.Travelled,
				Returning: b.Returning,
			})
		}
	}

	var props []game.PropJSON
	for _, p := range r.State.Props {
		if p.Active {
			props = append(props, game.PropJSON{
				X:      p.X,
				Y:      p.Y,
				Radius: p.Radius,
				Type:   p.Type,
				Active: p.Active,
			})
		}
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

	var fullMapJSON game.MapJSON
	var compactMapJSON game.MapJSON
	needsFullMap := false
	for _, client := range r.Clients {
		if !client.MapSent {
			needsFullMap = true
			break
		}
	}
	if r.State.Map != nil {
		compactMapJSON = game.MapJSON{
			Width: r.State.Map.WidthInPixels, Height: r.State.Map.HeightInPixels, TileSize: game.TileSize,
		}
		if needsFullMap {
			walls := make([]game.WallJSON, 0, len(r.State.Map.Collisions))
			for _, w := range r.State.Map.Collisions {
				walls = append(walls, game.WallJSON{
					MinX: w.MinX, MinY: w.MinY, MaxX: w.MaxX, MaxY: w.MaxY, Type: w.Type,
				})
			}
			fullMapJSON = compactMapJSON
			fullMapJSON.Walls = walls
		}
	}

	compactState := game.NewStateUpdate(&gameState, &compactMapJSON, players, monsters, bullets, props)
	compactData, err := json.Marshal(compactState)
	if err != nil {
		return
	}
	var fullData []byte
	if needsFullMap {
		fullState := game.NewStateUpdate(&gameState, &fullMapJSON, players, monsters, bullets, props)
		fullData, err = json.Marshal(fullState)
		if err != nil {
			return
		}
	}

	for _, client := range r.Clients {
		data := compactData
		sendingMap := !client.MapSent
		if sendingMap {
			data = fullData
		}
		select {
		case client.Send <- data:
			if sendingMap {
				client.MapSent = true
			}
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
	}
}
