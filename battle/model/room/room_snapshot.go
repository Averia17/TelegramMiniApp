package room

import (
	"battle/model/game"
	"encoding/json"
	"fmt"
	"math"
	"time"
)

func (r *Room) prepareStateUpdates() []preparedStateUpdate {
	if len(r.Clients) == 0 {
		return nil
	}

	now := time.Now().UnixMilli()
	playerCount := len(r.State.Players)
	players := make(map[string]game.PlayerJSON, playerCount)
	for id, p := range r.State.Players {
		if _, disconnected := r.Disconnected[id]; disconnected {
			continue
		}
		attackConfig := game.GetAttackConfig(p.HeroName)
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
			AttackDamage:     p.AttackDmg,
			Ack:              p.Ack,
			Hero:             p.HeroName,
			AttackType:       p.AttackType,
			AttackArchetype:  attackConfig.Archetype,
			AttackRange:      attackConfig.Range,
			AttackHalfArc:    attackConfig.HalfArcDegrees,
			ShieldHP:         p.ShieldHP,
			ShieldStacks:     p.ShieldStacks,
			Marks:            p.Marks,
			SporeStacks:      r.State.SporeStacks[p.PlayerId],
			Doomed:           secondsRemaining(r.State.DoomedUntil[p.PlayerId], now),
			SuperCharge:      p.SuperCharge,
			Heat:             p.Heat,
			AttackPulse:      p.AttackPulse,
			SuperPulse:       p.SuperPulse,
			GadgetPulse:      p.GadgetPulse,
			FocusCharge:      p.FocusCharge,
			Rage:             p.Rage,
			SuppressedRage:   p.SuppressedRage,
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
			LunarSpeed:       secondsRemaining(p.LunarSpeedUntil, now),
			LunarDamage:      secondsRemaining(p.LunarDamageUntil, now),
			LunarShield:      p.LunarShield,
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
			Cooldowns:        game.CooldownsJSON{Primary: primaryCooldown, Secondary: secondaryCooldown},
			AbilityAck:       p.LastAbilityID,
			AbilityAccepted:  p.LastAbilityOK,
			Poisoned:         p.PoisonUntil > now,
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

	bullets := make([]game.BulletJSON, 0, len(r.State.Bullets))
	for _, b := range r.State.Bullets {
		if b.Active {
			z := 0.0
			if b.Lobbed && b.LandsAt > b.SpawnedAt {
				progress := math.Max(0, math.Min(1, float64(now-b.SpawnedAt)/float64(b.LandsAt-b.SpawnedAt)))
				z = math.Sin(progress*math.Pi) * 90
			}
			bullets = append(bullets, game.BulletJSON{
				ID:        b.ID,
				X:         b.X,
				Y:         b.Y,
				Z:         z,
				Radius:    b.Radius,
				PlayerId:  b.PlayerId,
				CommandID: b.CommandID,
				Team:      b.Team,
				Rotation:  b.Rotation,
				Color:     b.Color,
				Kind:      b.Kind,
				Damage:    b.Damage,
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

	props := make([]game.PropJSON, 0, len(r.State.Props))
	for _, p := range r.State.Props {
		if p.Active {
			props = append(props, game.PropJSON{
				X:        p.X,
				Y:        p.Y,
				Radius:   p.Radius,
				Type:     p.Type,
				LootType: p.LootType,
				Lives:    p.Lives,
				MaxLives: p.MaxLives,
				Active:   p.Active,
			})
		}
	}
	effects := make([]game.EffectJSON, 0, len(r.State.Effects))
	for _, effect := range r.State.Effects {
		if effect == nil || effect.ExpiresAt <= now {
			continue
		}
		maxLife := float64(effect.ExpiresAt-effect.CreatedAt) / 1000
		effects = append(effects, game.EffectJSON{Id: fmt.Sprintf("%d:%s:%.0f:%.0f", effect.CreatedAt, effect.Kind, effect.X, effect.Y), Kind: effect.Kind, X: effect.X, Y: effect.Y, ToX: effect.ToX, ToY: effect.ToY, Radius: effect.Radius, Angle: effect.Angle, Range: effect.Range, Arc: effect.Arc, Color: effect.Color, Damage: effect.Damage, Life: float64(effect.ExpiresAt-now) / 1000, MaxLife: maxLife})
	}
	totems := make([]game.TotemJSON, 0, len(r.State.Totems))
	for _, totem := range r.State.Totems {
		if totem != nil {
			totems = append(totems, game.TotemJSON{Owner: totem.Owner, X: totem.X, Y: totem.Y, HP: totem.HP, MaxHP: 300})
		}
	}

	gameState := game.GameStateJSON{
		State:             r.State.State,
		RoomName:          r.State.RoomName,
		MapName:           r.State.MapName,
		IslandName:        r.State.IslandName(),
		MaxPlayers:        r.State.MaxPlayers,
		Mode:              string(r.State.Mode),
		AlivePlayers:      activePlayerCount(r.State),
		LobbyEndsAt:       r.State.LobbyEndsAt,
		GameEndsAt:        r.State.GameEndsAt,
		Phase:             string(r.State.IslandPhase),
		PhaseStartedAt:    r.State.PhaseStartedAt,
		PhaseEndsAt:       r.State.PhaseEndsAt,
		IslandEvent:       r.State.IslandEvent,
		StormRadius:       r.State.StormRadius,
		StormDamage:       r.State.StormDamage,
		BeaconOpen:        r.State.BeaconOpen,
		BeaconHolder:      r.State.BeaconHolder,
		BeaconProgress:    r.State.BeaconProgress(now),
		SuddenDeath:       r.State.SuddenDeathDamage > 0,
		SuddenDeathDamage: r.State.SuddenDeathDamage,
	}

	var fullMapJSON game.MapJSON
	var compactMapJSON game.MapJSON
	needsFullMap := false
	updates := make([]preparedStateUpdate, 0, len(r.Clients))
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
		combatEvents := combatEventsForClient(r.State.CombatEvents, client.Id, now)
		clientState := game.NewStateUpdate(&gameState, &mapJSON, visiblePlayers, monsters, bullets, props, effects, combatEvents)
		clientState.Totems = totems
		updates = append(updates, preparedStateUpdate{client: client, state: clientState, mapRevision: r.State.MapRevision, sendingMap: sendingMap})
	}
	return updates
}

func (r *Room) queueStateUpdates(updates []preparedStateUpdate) {
	for _, update := range updates {
		data, err := json.Marshal(update.state)
		if err != nil {
			continue
		}
		client := update.client
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
		if update.sendingMap && queued {
			client.MapRevision = update.mapRevision
			client.MapSyncFrames++
		}
	}
}
