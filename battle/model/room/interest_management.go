package room

import (
	"battle/model/game"
	"battle/model/player"
	"math"
)

// Transient entities do not need to be replicated across the whole arena. A
// single server-wide radius keeps the visual rules identical for every client
// while avoiding remote projectile/effect payloads in team firefights.
const transientInterestRadius = 960.0

func withinTransientInterest(viewer *player.Player, x, y, extent float64) bool {
	if viewer == nil {
		return true
	}
	radius := transientInterestRadius + math.Max(0, extent)
	dx, dy := x-viewer.X, y-viewer.Y
	return dx*dx+dy*dy <= radius*radius
}

func monstersForClient(viewer *player.Player, all map[string]game.MonsterJSON) map[string]game.MonsterJSON {
	if viewer == nil {
		return all
	}
	visible := make(map[string]game.MonsterJSON)
	for id, monster := range all {
		if withinTransientInterest(viewer, monster.X, monster.Y, monster.Radius) {
			visible[id] = monster
		}
	}
	if len(visible) == 0 {
		return nil
	}
	return visible
}

func bulletsForClient(viewerID string, viewer *player.Player, players map[string]*player.Player, all []game.BulletJSON) []game.BulletJSON {
	if viewer == nil {
		return all
	}
	visible := make([]game.BulletJSON, 0, len(all))
	for _, bullet := range all {
		// The local player's own projectiles must remain immediate even when
		// they are launched at the far edge of the shared arena.
		owner := players[bullet.PlayerId]
		ally := owner != nil && viewer.Team != "" && owner.Team == viewer.Team
		if bullet.PlayerId == viewerID || ally || withinTransientInterest(viewer, bullet.X, bullet.Y, bullet.Radius) ||
			((bullet.TargetX != 0 || bullet.TargetY != 0) && withinTransientInterest(viewer, bullet.TargetX, bullet.TargetY, bullet.Radius)) {
			visible = append(visible, bullet)
		}
	}
	if len(visible) == 0 {
		return nil
	}
	return visible
}

func effectsForClient(viewer *player.Player, all []game.EffectJSON) []game.EffectJSON {
	if viewer == nil {
		return all
	}
	visible := make([]game.EffectJSON, 0, len(all))
	for _, effect := range all {
		if withinTransientInterest(viewer, effect.X, effect.Y, effect.Radius) ||
			((effect.ToX != 0 || effect.ToY != 0) && withinTransientInterest(viewer, effect.ToX, effect.ToY, effect.Radius)) {
			visible = append(visible, effect)
		}
	}
	if len(visible) == 0 {
		return nil
	}
	return visible
}
