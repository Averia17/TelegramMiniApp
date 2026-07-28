package room

import (
	"battle/model/game"
	"battle/provider"
	"encoding/json"
	"fmt"
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
			if client.State == nil {
				client.State = make(chan []byte, 1)
			}
			emptySince = time.Time{}
			r.Clients[client.Id] = client
			lateJoin := r.State.State == game.GameStateGame
			r.State.PlayerAdd(client.Id, client.Name, client.HeroName)
			if lateJoin {
				if joined := r.State.Players[client.Id]; joined != nil {
					joined.InvulnerableUntil = time.Now().Add(3 * time.Second).UnixMilli()
				}
			}
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
			if frame%2 == 0 {
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
		attackConfig := game.AttackConfig{}
		if hero := game.GetHeroByName(p.HeroName); hero != nil {
			attackConfig = hero.Attack
		}
		primaryCooldown := math.Max(0, float64(p.LastPrimaryAt+game.AbilityCooldownMs(p.HeroName, "primary")-now)/1000)
		secondaryCooldown := math.Max(0, float64(p.LastSecondaryAt+game.AbilityCooldownMs(p.HeroName, "secondary")-now)/1000)
		reloadProgress := 0.0
		if p.Ammo < p.MaxAmmo && p.ReloadTime > 0 && p.NextAmmoAt > 0 {
			reloadProgress = math.Max(0, math.Min(1, 1-float64(p.NextAmmoAt-now)/float64(p.ReloadTime)))
		}
		players[id] = game.PlayerJSON{
			X:                p.X,
			Y:                p.Y,
			Radius:           p.Radius,
			PlayerId:         p.PlayerId,
			Name:             p.Name,
			Lives:            p.Lives,
			MaxLives:         p.MaxLives,
			Team:             p.Team,
			Color:            p.Color,
			Kills:            p.Kills,
			Rotation:         p.Rotation,
			MoveX:            p.MoveX,
			MoveY:            p.MoveY,
			Speed:            p.Speed,
			Ack:              p.Ack,
			Hero:             p.HeroName,
			AttackType:       p.AttackType,
			AttackArchetype:  attackConfig.Archetype,
			AttackRange:      attackConfig.Range,
			AttackHalfArc:    attackConfig.HalfArcDegrees,
			ShieldHP:         p.ShieldHP,
			ShieldStacks:     p.ShieldStacks,
			Marks:            p.Marks,
			SuperCharge:      p.SuperCharge,
			Heat:             p.Heat,
			AttackPulse:      p.AttackPulse,
			SuperPulse:       p.SuperPulse,
			FocusCharge:      p.FocusCharge,
			GadgetArmed:      p.GadgetArmed,
			GadgetCharges:    p.GadgetCharges,
			Ammo:             p.Ammo,
			MaxAmmo:          p.MaxAmmo,
			ReloadProgress:   reloadProgress,
			HitImpulseX:      p.HitImpulseX,
			HitImpulseY:      p.HitImpulseY,
			Aiming:           p.Aiming,
			AimDistance:      p.AimDistance,
			Shield:           secondsRemaining(p.ShieldUntil, now),
			Haste:            secondsRemaining(p.HasteUntil, now),
			Stealth:          secondsRemaining(p.StealthUntil, now),
			Invulnerable:     secondsRemaining(p.InvulnerableUntil, now),
			Blind:            secondsRemaining(p.BlindUntil, now),
			Stun:             secondsRemaining(p.StunUntil, now),
			Channel:          secondsRemaining(p.ChannelUntil, now),
			Vine:             secondsRemaining(p.VineUntil, now),
			Vortex:           secondsRemaining(p.VortexUntil, now),
			Flying:           secondsRemaining(p.FlyingUntil, now),
			Evolution:        p.Evolution,
			Souls:            p.Souls,
			Deflect:          p.Deflect,
			PowerCores:       p.PowerCores,
			DamageMultiplier: p.DamageMultiplier,
			Cooldowns:        map[string]float64{"primary": primaryCooldown, "secondary": secondaryCooldown},
			Poisoned:         p.PoisonUntil > time.Now().UnixMilli(),
			RegenRate:        p.RegenRate,
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
				Lives:    m.Lives,
				MaxLives: m.MaxLives,
				Tier:     m.Tier,
			}
		}
	}

	var bullets []game.BulletJSON
	for _, b := range r.State.Bullets {
		if b.Active {
			z := 0.0
			if b.Lobbed && b.LandsAt > b.SpawnedAt {
				progress := math.Max(0, math.Min(1, float64(time.Now().UnixMilli()-b.SpawnedAt)/float64(b.LandsAt-b.SpawnedAt)))
				z = math.Sin(progress*math.Pi) * 90
			}
			bullets = append(bullets, game.BulletJSON{
				ID:        b.ID,
				X:         b.X,
				Y:         b.Y,
				Z:         z,
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
				Splash:    b.Splash,
				Chain:     b.Chain,
				Bounces:   b.Bounces,
				Lobbed:    b.Lobbed,
				TargetX:   b.TargetX,
				TargetY:   b.TargetY,
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
	var effects []game.EffectJSON
	now := time.Now().UnixMilli()
	for _, effect := range r.State.Effects {
		if effect == nil || effect.ExpiresAt <= now {
			continue
		}
		maxLife := float64(effect.ExpiresAt-effect.CreatedAt) / 1000
		effects = append(effects, game.EffectJSON{Id: fmt.Sprintf("%d:%s:%.0f:%.0f", effect.CreatedAt, effect.Kind, effect.X, effect.Y), Kind: effect.Kind, X: effect.X, Y: effect.Y, ToX: effect.ToX, ToY: effect.ToY, Radius: effect.Radius, Angle: effect.Angle, Range: effect.Range, Arc: effect.Arc, Color: effect.Color, Damage: effect.Damage, Life: float64(effect.ExpiresAt-now) / 1000, MaxLife: maxLife})
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
		if client.MapRevision != r.State.MapRevision || client.MapSyncFrames < 3 {
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
					MinX: w.MinX, MinY: w.MinY, MaxX: w.MaxX, MaxY: w.MaxY, Type: w.Type, BushGroup: w.BushGroup,
				})
			}
			fullMapJSON = compactMapJSON
			fullMapJSON.Walls = walls
		}
	}

	for _, client := range r.Clients {
		mapChanged := client.MapRevision != r.State.MapRevision
		if mapChanged {
			client.MapSyncFrames = 0
		}
		sendingMap := mapChanged || client.MapSyncFrames < 3
		mapJSON := compactMapJSON
		if sendingMap {
			mapJSON = fullMapJSON
		}
		visiblePlayers := visiblePlayersForClient(r.State, client.Id, players, now)
		clientState := game.NewStateUpdate(&gameState, &mapJSON, visiblePlayers, monsters, bullets, props, effects)
		for _, totem := range r.State.Totems {
			if totem != nil {
				clientState.Totems = append(clientState.Totems, game.TotemJSON{Owner: totem.Owner, X: totem.X, Y: totem.Y, HP: totem.HP, MaxHP: 3000})
			}
		}
		data, err := json.Marshal(clientState)
		if err != nil {
			continue
		}
		queued := false
		select {
		case client.State <- data:
			queued = true
		default:
			select {
			case <-client.State:
			default:
			}
			select {
			case client.State <- data:
				queued = true
			default:
			}
		}
		if sendingMap && queued {
			client.MapRevision = r.State.MapRevision
			client.MapSyncFrames++
		}
	}
}

func visiblePlayersForClient(state *game.GameState, viewerID string, all map[string]game.PlayerJSON, now int64) map[string]game.PlayerJSON {
	viewer := state.Players[viewerID]
	if viewer == nil {
		return all
	}
	visible := make(map[string]game.PlayerJSON, len(all))
	for id, snapshot := range all {
		target := state.Players[id]
		if target == nil {
			continue
		}
		if id == viewerID || (viewer.Team != "" && viewer.Team == target.Team) || target.RevealedUntil > now || math.Hypot(target.X-viewer.X, target.Y-viewer.Y) <= 100 {
			visible[id] = snapshot
			continue
		}
		concealed := target.StealthUntil > now || playerInsideBush(state, target.X, target.Y)
		if !concealed {
			visible[id] = snapshot
		}
	}
	return visible
}

func playerInsideBush(state *game.GameState, x, y float64) bool {
	if state == nil || state.Map == nil {
		return false
	}
	for _, wall := range state.Map.Collisions {
		if wall == nil || (wall.Type != "bush" && wall.Type != "half") {
			continue
		}
		if x >= wall.MinX && x <= wall.MaxX && y >= wall.MinY && y <= wall.MaxY {
			return true
		}
	}
	return false
}

func secondsRemaining(until, now int64) float64 {
	if until <= now {
		return 0
	}
	return float64(until-now) / 1000
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
