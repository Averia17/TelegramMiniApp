package room

import (
	"battle/model/game"
	"battle/observability"
	"battle/provider"
	"encoding/json"
	"log"
	"time"
)

var Store provider.Store
var Kafka *provider.KafkaProducer

const reconnectGracePeriod = 2 * time.Minute
const snapshotEveryFrames = 1
const nominalTickDuration = time.Second / 60
const tauntCooldown = 1500 * time.Millisecond

func shouldPublishState(frame int) bool {
	return frame > 0 && frame%snapshotEveryFrames == 0
}

func battleTickElapsed(previous, current time.Time) time.Duration {
	if previous.IsZero() {
		return nominalTickDuration
	}
	if elapsed := current.Sub(previous); elapsed > 0 {
		return elapsed
	}
	return nominalTickDuration
}

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
	var previousTickAt time.Time
	var metricsWindowAt time.Time
	var metricsTicks int
	var metricsSlowTicks int
	var metricsMaxGap, metricsMaxUpdate, metricsMaxSnapshot, metricsMaxQueue time.Duration

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
			snapshotDuration := time.Duration(0)
			tickStarted := time.Now()
			tickGap := time.Duration(0)
			if !previousTickAt.IsZero() {
				tickGap = tickStarted.Sub(previousTickAt)
			}
			elapsed := battleTickElapsed(previousTickAt, tickStarted)
			previousTickAt = tickStarted
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
			if metricsWindowAt.IsZero() {
				metricsWindowAt = tickStarted
			}
			frame++
			r.State.UpdateWithDelta(elapsed)
			updateDuration := time.Since(tickStarted)
			// Simulate and publish at 60 Hz so movement and combat presentation
			// do not inherit an avoidable 33 ms transport gap.
			if shouldPublishState(frame) {
				snapshotStarted := time.Now()
				updates = r.prepareStateUpdates()
				snapshotDuration = time.Since(snapshotStarted)
				metricsMaxSnapshot = maxDuration(metricsMaxSnapshot, snapshotDuration)
			}
			r.mu.Unlock()
			queueStarted := time.Now()
			queuedUpdates, stateBytes, queueDrops := r.queueStateUpdates(updates)
			queueDuration := time.Since(queueStarted)

			metricsTicks++
			metricsMaxGap = maxDuration(metricsMaxGap, tickGap)
			metricsMaxUpdate = maxDuration(metricsMaxUpdate, updateDuration)
			metricsMaxQueue = maxDuration(metricsMaxQueue, queueDuration)
			if tickGap > 20*time.Millisecond || updateDuration > 10*time.Millisecond || queueDuration > 10*time.Millisecond {
				metricsSlowTicks++
			}
			observability.RecordBattleTick(observability.Default, observability.BattleTickSample{
				Gap: tickGap, Update: updateDuration, Snapshot: snapshotDuration, Queue: queueDuration,
				Updates: queuedUpdates, Bytes: stateBytes, Dropped: queueDrops,
				Slow: tickGap > 20*time.Millisecond || updateDuration > 10*time.Millisecond || queueDuration > 10*time.Millisecond,
			})
			if time.Since(metricsWindowAt) >= 2*time.Second {
				log.Printf("battle tick metrics room=%s ticks=%d hz=%.1f slow=%d gap_max=%s update_max=%s snapshot_max=%s queue_max=%s players=%d bots=%d bullets=%d effects=%d", r.Id, metricsTicks, float64(metricsTicks)/time.Since(metricsWindowAt).Seconds(), metricsSlowTicks, metricsMaxGap, metricsMaxUpdate, metricsMaxSnapshot, metricsMaxQueue, len(r.State.Players), countBots(r.State), len(r.State.Bullets), len(r.State.Effects))
				metricsWindowAt = tickStarted
				metricsTicks = 0
				metricsSlowTicks = 0
				metricsMaxGap, metricsMaxUpdate, metricsMaxSnapshot, metricsMaxQueue = 0, 0, 0, 0
			}

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
	if msg.Type == "taunt" {
		r.handleTaunt(client, msg.Value)
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	switch msg.Type {
	case "clock_sync":
		var v game.ClockSyncValue
		if err := json.Unmarshal(msg.Value, &v); err != nil || v.ClientTs <= 0 {
			return
		}
		response, err := json.Marshal(game.NewServerMessage("clock_sync", game.ClockSyncParams{
			ClientTs: v.ClientTs,
			ServerTs: time.Now().UnixMilli(),
		}))
		if err != nil || r.Clients[client.Id] != client {
			return
		}
		select {
		case client.Send <- response:
		default:
		}
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

func (r *Room) handleTaunt(client *Client, data []byte) {
	var v game.TauntValue
	if err := json.Unmarshal(data, &v); err != nil || v.TauntID != "clown_laugh" {
		return
	}

	r.mu.Lock()
	if r.State == nil || r.State.State != game.GameStateGame || r.Clients[client.Id] != client {
		r.mu.Unlock()
		return
	}
	now := time.Now().UnixMilli()
	if client.LastTauntAt > 0 && now-client.LastTauntAt < tauntCooldown.Milliseconds() {
		r.mu.Unlock()
		return
	}
	if player := r.State.Players[client.Id]; player != nil && !player.IsAlive() {
		r.mu.Unlock()
		return
	}
	target := r.State.Players[v.TargetID]
	if v.TargetID == "" || v.TargetID == client.Id || target == nil || !target.IsAlive() {
		r.mu.Unlock()
		return
	}
	spender := r.TauntSpender
	if spender == nil {
		spender = defaultTauntSpender
	}
	if spender == nil || client.AccessToken == "" {
		r.mu.Unlock()
		r.SendToPlayer(client.Id, "error", game.ErrorParams{Message: "Насмешка временно недоступна"})
		return
	}
	client.LastTauntAt = now
	targetName := target.Name
	r.mu.Unlock()

	if err := spender.SpendTaunt(client.AccessToken, v.TauntID); err != nil {
		r.mu.Lock()
		if client.LastTauntAt == now {
			client.LastTauntAt = 0
		}
		r.mu.Unlock()
		message := "Насмешка временно недоступна"
		if err.Error() == "not enough taunt charges" {
			message = "Нет оплаченных насмешек"
		}
		r.SendToPlayer(client.Id, "error", game.ErrorParams{Message: message})
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	if r.State == nil || r.State.State != game.GameStateGame || r.Clients[client.Id] != client {
		return
	}
	target = r.State.Players[v.TargetID]
	if target == nil || !target.IsAlive() {
		return
	}
	r.BroadcastMsg("taunt", game.TauntParams{
		PlayerID:   client.Id,
		PlayerName: client.Name,
		TauntID:    v.TauntID,
		TargetID:   v.TargetID,
		TargetName: targetName,
	})
}

func maxDuration(current, candidate time.Duration) time.Duration {
	if candidate > current {
		return candidate
	}
	return current
}

func countBots(state *game.GameState) int {
	if state == nil {
		return 0
	}
	count := 0
	for _, candidate := range state.Players {
		if candidate != nil && candidate.IsBot {
			count++
		}
	}
	return count
}
