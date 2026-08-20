package room

import (
	"battle/model/game"
	"battle/model/player"
	"battle/observability"
	"encoding/json"
	"fmt"
	"math"
	"time"
)

func attackCooldownSeconds(p *player.Player, now int64) float64 {
	if p == nil || p.LastShootAt == 0 || p.AttackRate <= 0 {
		return 0
	}
	return math.Max(0, float64(p.LastShootAt+p.AttackRate-now)/1000)
}

func attackReady(state *game.GameState, p *player.Player, now int64) bool {
	return state != nil && state.CombatEnabled() && p != nil && p.IsAlive() && p.Ammo > 0 &&
		p.StunUntil <= now && p.CastUntil <= now && p.ChannelUntil <= now && attackCooldownSeconds(p, now) <= 0
}

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
		presentedChannelUntil := p.ChannelUntil
		if p.CastUntil > presentedChannelUntil {
			presentedChannelUntil = p.CastUntil
		}
		readyToAttack := attackReady(r.State, p, now)
		players[id] = game.PlayerJSON{
			X:                  p.X,
			Y:                  p.Y,
			Radius:             p.Radius,
			PlayerId:           p.PlayerId,
			Name:               p.Name,
			Lives:              p.Lives,
			MaxLives:           p.MaxLives,
			Team:               p.Team,
			Color:              p.Color,
			Kills:              p.Kills,
			Deaths:             p.Deaths,
			PlayerDamage:       p.PlayerDamage,
			TowerDamage:        p.TowerDamage,
			TownHallDamage:     p.TownHallDamage,
			TowersDestroyed:    p.TowersDestroyed,
			TownHallsDestroyed: p.TownHallsDestroyed,
			Rotation:           p.Rotation,
			MoveX:              p.MoveX,
			MoveY:              p.MoveY,
			Speed:              p.Speed,
			MovementSpeed:      game.EffectiveMovementSpeed(p, now),
			AttackDamage:       p.AttackDmg,
			AttackRate:         p.AttackRate,
			AttackCooldown:     attackCooldownSeconds(p, now),
			AttackReady:        readyToAttack,
			Ack:                p.Ack,
			Hero:               p.HeroName,
			AttackType:         p.AttackType,
			AttackArchetype:    attackConfig.Archetype,
			AttackRange:        attackConfig.Range,
			AttackHalfArc:      attackConfig.HalfArcDegrees,
			ShieldHP:           p.ShieldHP,
			ShieldStacks:       p.ShieldStacks,
			Marks:              p.Marks,
			SuperCharge:        game.SuperChargePercent(p, now),
			Heat:               p.Heat,
			AttackPulse:        p.AttackPulse,
			SuperPulse:         p.SuperPulse,
			GadgetPulse:        p.GadgetPulse,
			FocusCharge:        p.FocusCharge,
			SuppressedRage:     p.SuppressedRage,
			MicoRage:           p.MicoRage,
			KazeCombo:          p.KazeCombo,
			GadgetArmed:        p.GadgetArmed,
			GadgetCharges:      p.GadgetCharges,
			Ammo:               p.Ammo,
			MaxAmmo:            p.MaxAmmo,
			ReloadProgress:     reloadProgress,
			HitImpulseX:        p.HitImpulseX,
			HitImpulseY:        p.HitImpulseY,
			Aiming:             p.Aiming && (readyToAttack || presentedChannelUntil > now),
			AimDistance:        p.AimDistance,
			Shield:             secondsRemaining(p.ShieldUntil, now),
			Haste:              secondsRemaining(p.HasteUntil, now),
			LunarSpeed:         secondsRemaining(p.LunarSpeedUntil, now),
			LunarDamage:        secondsRemaining(p.LunarDamageUntil, now),
			LunarShield:        p.LunarShield,
			Stealth:            secondsRemaining(p.StealthUntil, now),
			Invulnerable:       secondsRemaining(p.InvulnerableUntil, now),
			Blind:              secondsRemaining(p.BlindUntil, now),
			Stun:               secondsRemaining(p.StunUntil, now),
			Slow:               secondsRemaining(p.SlowUntil, now),
			Channel:            secondsRemaining(presentedChannelUntil, now),
			Vine:               secondsRemaining(p.VineUntil, now),
			Vortex:             secondsRemaining(p.VortexUntil, now),
			Flying:             secondsRemaining(p.FlyingUntil, now),
			Evolution:          p.Evolution,
			Souls:              p.Souls,
			Deflect:            p.Deflect,
			PowerCores:         p.PowerCores,
			DamageMultiplier:   p.DamageMultiplier,
			Cooldowns:          game.CooldownsJSON{Primary: primaryCooldown, Secondary: secondaryCooldown},
			AbilityAck:         p.LastAbilityID,
			AbilityAccepted:    p.LastAbilityOK,
			Poisoned:           p.PoisonUntil > now,
			RegenRate:          p.RegenRate,
			RespawnAt:          p.RespawnAt,
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
		compactMapJSON = game.NewMapJSON(r.State.MapName, r.State.Map, r.State.MapRevision, false)
		if needsFullMap {
			fullMapJSON = game.NewMapJSON(r.State.MapName, r.State.Map, r.State.MapRevision, true)
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
		for _, objective := range r.State.Objectives {
			if objective != nil {
				clientState.Objectives = append(clientState.Objectives, game.ObjectiveStateJSON{ID: objective.ID, Type: objective.Type, Team: objective.Team, X: objective.X, Y: objective.Y, Lives: objective.Lives, MaxLives: objective.MaxLives, AttackRange: objective.AttackRange})
			}
		}
		updates = append(updates, preparedStateUpdate{client: client, state: clientState, mapRevision: r.State.MapRevision, sendingMap: sendingMap})
	}
	return updates
}

func (r *Room) queueStateUpdates(updates []preparedStateUpdate) (queuedUpdates, stateBytes, queueDrops int) {
	for _, update := range updates {
		data, err := json.Marshal(update.state)
		if err != nil {
			observability.Default.IncCounter("battle_state_marshal_errors_total", "State snapshots that failed JSON serialization", nil)
			continue
		}
		stateBytes += len(data)
		client := update.client
		queued := false
		select {
		case client.State <- data:
			queued = true
		default:
			select {
			case <-client.State:
				queueDrops++
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
		if queued {
			queuedUpdates++
		}
	}
	return queuedUpdates, stateBytes, queueDrops
}
