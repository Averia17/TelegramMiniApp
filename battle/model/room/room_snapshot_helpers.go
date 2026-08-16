package room

import (
	"battle/model/game"
	"battle/model/player"
	"math"
)

const lastContactTTL = int64(2_000)

func lastContactForClient(target *player.Player, viewerID string, now int64) *game.LastContactJSON {
	if target == nil || target.LastContactBy != viewerID || target.LastContactAt <= 0 || now-target.LastContactAt > lastContactTTL {
		return nil
	}
	return &game.LastContactJSON{
		X: target.LastContactX, Y: target.LastContactY, At: target.LastContactAt,
		DirectionX: target.LastContactDirX, DirectionY: target.LastContactDirY,
	}
}

func combatEventsForClient(events []game.CombatEvent, playerID string, now int64) []game.CombatEventJSON {
	count := 0
	for _, event := range events {
		if now-event.Ts > 2000 || (event.SourceID != playerID && event.TargetID != playerID) {
			continue
		}
		count++
	}
	if count == 0 {
		return nil
	}

	result := make([]game.CombatEventJSON, 0, count)
	for _, event := range events {
		if now-event.Ts > 2000 || (event.SourceID != playerID && event.TargetID != playerID) {
			continue
		}
		result = append(result, game.CombatEventJSON{
			ID: event.ID, Ts: event.Ts, Kind: event.Kind, CommandID: event.CommandID,
			SourceID: event.SourceID, TargetType: event.TargetType, TargetID: event.TargetID,
			ProjectileID: event.ProjectileID, Damage: event.Damage, Accepted: event.Accepted, Resolved: event.Resolved,
		})
	}
	return result
}

func activePlayerCount(state *game.GameState) int {
	if state == nil {
		return 0
	}
	count := 0
	for _, candidate := range state.Players {
		if candidate != nil && candidate.IsAlive() {
			count++
		}
	}
	return count
}

func visiblePlayersForClient(state *game.GameState, viewerID string, all map[string]game.PlayerJSON, now int64) map[string]game.PlayerJSON {
	viewer := state.Players[viewerID]
	if viewer == nil {
		return all
	}
	for id := range all {
		target := state.Players[id]
		if target == nil || !isPlayerVisible(state, viewer, viewerID, id, target, now) {
			visible := make(map[string]game.PlayerJSON, len(all))
			for visibleID, snapshot := range all {
				visibleTarget := state.Players[visibleID]
				if visibleTarget != nil && isPlayerVisible(state, viewer, viewerID, visibleID, visibleTarget, now) {
					visible[visibleID] = snapshot
					continue
				}
				if visibleTarget != nil {
					if contact := lastContactForClient(visibleTarget, viewerID, now); contact != nil {
						snapshot.X, snapshot.Y = contact.X, contact.Y
						// A last-contact marker is intentionally not a stale full player
						// snapshot. Do not leak health, ammo, or charge while the target is
						// concealed; only the directional contact clue is actionable.
						snapshot.Lives, snapshot.MaxLives = 0, 0
						snapshot.Ammo, snapshot.SuperCharge = 0, 0
						snapshot.Hidden, snapshot.LastContact = true, contact
						visible[visibleID] = snapshot
					}
				}
			}
			return visible
		}
	}
	return all
}

func isPlayerVisible(state *game.GameState, viewer *player.Player, viewerID, id string, target *player.Player, now int64) bool {
	if id == viewerID || (viewer.Team != "" && viewer.Team == target.Team) || target.RevealedUntil > now || math.Hypot(target.X-viewer.X, target.Y-viewer.Y) <= 100 {
		return true
	}
	concealed := target.StealthUntil > now || playerInsideBush(state, target.X, target.Y)
	return !concealed
}

func playerInsideBush(state *game.GameState, x, y float64) bool {
	if state == nil || state.Map == nil {
		return false
	}
	if state.Walls != nil {
		return state.Walls.ContainsPoint(x, y, "bush") || state.Walls.ContainsPoint(x, y, "half")
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
