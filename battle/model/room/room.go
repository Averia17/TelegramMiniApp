package room

import (
	"battle/model/game"
	"battle/observability"
	"battle/provider"
	"encoding/json"
	"log"
	"sync"
	"time"
)

var Store provider.Store
var Kafka *provider.KafkaProducer
var dependenciesMu sync.RWMutex

const reconnectGracePeriod = 2 * time.Minute

// The simulation remains authoritative at 60Hz, while transport snapshots
// use a stable 30Hz cadence. Local prediction and remote interpolation cover
// the gap without creating per-client quality profiles or changing gameplay.
const snapshotEveryFrames = 2
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
	dependenciesMu.Lock()
	defer dependenciesMu.Unlock()
	Store = s
}

func SetKafka(k *provider.KafkaProducer) {
	dependenciesMu.Lock()
	defer dependenciesMu.Unlock()
	Kafka = k
}

func currentStore() provider.Store {
	dependenciesMu.RLock()
	defer dependenciesMu.RUnlock()
	return Store
}

func currentKafka() *provider.KafkaProducer {
	dependenciesMu.RLock()
	defer dependenciesMu.RUnlock()
	return Kafka
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
			err := r.registerClient(client, &emptySince)
			if client != nil && client.RegisterResult != nil {
				client.RegisterResult <- err
			}

		case client := <-r.Unregister:
			r.unregisterClient(client, &emptySince)

		case message := <-r.Broadcast:
			r.deliverBroadcast(message)

		case <-ticker.C:
			step := r.stepSimulation(previousTickAt, frame, time.Now())
			previousTickAt = step.tickStarted
			if !step.hasClients {
				if len(r.Disconnected) == 0 && emptySince.IsZero() {
					emptySince = time.Now()
				}
				shouldClose := len(r.Disconnected) == 0 && !emptySince.IsZero() && time.Since(emptySince) >= 30*time.Second
				if shouldClose {
					RemoveRoom(r.Id)
					return
				}
				continue
			}
			updates := step.updates
			snapshotDuration := step.snapshot
			if metricsWindowAt.IsZero() {
				metricsWindowAt = step.tickStarted
			}
			frame++
			metricsMaxSnapshot = maxDuration(metricsMaxSnapshot, snapshotDuration)
			queueStarted := time.Now()
			queuedUpdates, stateBytes, queueDrops := r.queueStateUpdates(updates)
			queueDuration := time.Since(queueStarted)

			metricsTicks++
			metricsMaxGap = maxDuration(metricsMaxGap, step.tickGap)
			metricsMaxUpdate = maxDuration(metricsMaxUpdate, step.updateDuration)
			metricsMaxQueue = maxDuration(metricsMaxQueue, queueDuration)
			if step.tickGap > 20*time.Millisecond || step.updateDuration > 10*time.Millisecond || queueDuration > 10*time.Millisecond {
				metricsSlowTicks++
			}
			observability.RecordBattleTick(observability.Default, observability.BattleTickSample{
				Gap: step.tickGap, Update: step.updateDuration, Snapshot: snapshotDuration, Queue: queueDuration,
				Updates: queuedUpdates, Bytes: stateBytes, Dropped: queueDrops,
				Slow: step.tickGap > 20*time.Millisecond || step.updateDuration > 10*time.Millisecond || queueDuration > 10*time.Millisecond,
			})
			if time.Since(metricsWindowAt) >= 2*time.Second {
				log.Printf("battle tick metrics room=%s ticks=%d hz=%.1f slow=%d gap_max=%s update_max=%s snapshot_max=%s queue_max=%s players=%d bots=%d bullets=%d effects=%d", r.Id, metricsTicks, float64(metricsTicks)/time.Since(metricsWindowAt).Seconds(), metricsSlowTicks, metricsMaxGap, metricsMaxUpdate, metricsMaxSnapshot, metricsMaxQueue, len(r.State.Players), countBots(r.State), len(r.State.Bullets), len(r.State.Effects))
				metricsWindowAt = step.tickStarted
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
			if store := currentStore(); store != nil {
				store.SaveRoom(roomRecord)
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
		delete(r.PlayerStates, playerID)
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
	r.mu.RLock()
	defer r.mu.RUnlock()
	r.sendToPlayerUnlocked(playerId, msgType, params)
}

// sendToPlayerUnlocked is used by GameState callbacks while Room.stepSimulation
// already owns r.mu. Keeping the callback on this path avoids a self-deadlock
// when combat emits a targeted event during the authoritative tick.
func (r *Room) sendToPlayerUnlocked(playerId string, msgType string, params interface{}) {
	msg := game.NewServerMessage(msgType, params)
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	client, ok := r.Clients[playerId]
	if ok {
		client.TrySend(data)
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
	if current, ok := r.Clients[client.Id]; !ok || current != client {
		return
	}

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
		client.TrySend(response)
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
	case "ability_cancel":
		var v game.AbilityCancelValue
		if err := json.Unmarshal(msg.Value, &v); err == nil {
			r.State.PlayerPushAction(game.Action{PlayerId: client.Id, Type: "ability_cancel", Ts: msg.Ts, Value: &v})
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
		if err.Error() == "taunt access expired" {
			message = "Доступ к насмешке закончился"
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
