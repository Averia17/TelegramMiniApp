package game

import (
	"battle/model/player"
	"battle/service/geometry"
	"math"
)

const (
	flightLandingSearchStep   = 6.0
	flightLandingAngleSamples = 32
)

// moveCircleDuringFlight keeps the authored water/ocean boundary active while
// letting the hero pass every other blocking collision. Water is represented
// by the same WallTile list as cover, so this narrow filter is preferable to
// mutating the shared collision rules for every other movement mode.
func moveCircleDuringFlight(body *geometry.CircleBody, walls *geometry.SpatialHash, deltaX, deltaY float64) {
	distance := math.Hypot(deltaX, deltaY)
	if body == nil || distance == 0 {
		return
	}
	maxStep := math.Max(1, body.Radius*.5)
	steps := int(math.Ceil(distance / maxStep))
	stepX, stepY := deltaX/float64(steps), deltaY/float64(steps)
	for step := 0; step < steps; step++ {
		body.X += stepX
		body.Y += stepY
		// Both names are used by map providers for the non-playable ocean
		// boundary. Keep the filter local to flight so ordinary heroes and
		// projectiles retain their existing collision semantics.
		geometry.CorrectCircleWithWalls(body, walls, "water")
		geometry.CorrectCircleWithWalls(body, walls, "ocean")
	}
}

// isPlayerFlying is deliberately generic: any future hero can opt into the
// same traversal semantics by setting FlyingUntil and FlightSpeedMultiplier.
func isPlayerFlying(p *player.Player, now int64) bool {
	return p != nil && p.FlyingUntil > now
}

func (gs *GameState) expirePlayerFlight(p *player.Player, now int64, obstacles []*geometry.CircleBody) {
	if p == nil || p.FlyingUntil <= 0 || p.FlyingUntil > now {
		return
	}
	p.FlyingUntil = 0
	p.FlightSpeedMultiplier = 0
	gs.resolveFlightLanding(p, obstacles)
}

// resolveFlightLanding prevents a flight from ending with the hero embedded in
// a wall or a ground prop. First use the existing collision correction (cheap
// and exact for the common case), then do a deterministic radial search for a
// free center. This keeps the result stable for server and replay tests.
func (gs *GameState) resolveFlightLanding(p *player.Player, obstacles []*geometry.CircleBody) {
	if gs == nil || gs.Map == nil || p == nil {
		return
	}
	clamped := gs.Map.ClampCircle(&p.CircleBody)
	p.X, p.Y = clamped.X, clamped.Y
	if gs.flightLandingFree(p.X, p.Y, p.Radius, obstacles) {
		return
	}

	corrected := p.CircleBody
	for attempt := 0; attempt < 4; attempt++ {
		geometry.CorrectCircleWithBlockingWalls(&corrected, gs.Walls)
		geometry.CorrectCircleWithBlockingCircles(&corrected, obstacles)
		clamped = gs.Map.ClampCircle(&corrected)
		corrected.X, corrected.Y = clamped.X, clamped.Y
		if gs.flightLandingFree(corrected.X, corrected.Y, p.Radius, obstacles) {
			p.X, p.Y = corrected.X, corrected.Y
			return
		}
	}

	originX, originY := p.X, p.Y
	maxDistance := math.Hypot(gs.Map.WidthInPixels, gs.Map.HeightInPixels)
	for distance := flightLandingSearchStep; distance <= maxDistance; distance += flightLandingSearchStep {
		for sample := 0; sample < flightLandingAngleSamples; sample++ {
			angle := 2 * math.Pi * float64(sample) / flightLandingAngleSamples
			candidate := geometry.CircleBody{
				X:      originX + math.Cos(angle)*distance,
				Y:      originY + math.Sin(angle)*distance,
				Radius: p.Radius,
			}
			clamped = gs.Map.ClampCircle(&candidate)
			if gs.flightLandingFree(clamped.X, clamped.Y, p.Radius, obstacles) {
				p.X, p.Y = clamped.X, clamped.Y
				return
			}
		}
	}

	// A valid authored map always has free ground, but keep the final fallback
	// inside the ocean boundary if a malformed/custom map is completely full.
	center := geometry.CircleBody{X: gs.Map.WidthInPixels / 2, Y: gs.Map.HeightInPixels / 2, Radius: p.Radius}
	clamped = gs.Map.ClampCircle(&center)
	p.X, p.Y = clamped.X, clamped.Y
}

func (gs *GameState) flightLandingFree(x, y, radius float64, obstacles []*geometry.CircleBody) bool {
	if gs == nil || gs.Map == nil {
		return false
	}
	body := &geometry.CircleBody{X: x, Y: y, Radius: radius}
	if gs.Map.IsCircleOutside(body) || geometry.CollidesCircleWithBlockingWalls(body, gs.Walls) {
		return false
	}
	for _, obstacle := range obstacles {
		if geometry.CircleToCircle(body, obstacle) {
			return false
		}
	}
	return true
}

// updateKattyFlightTrail extends the authoritative trail and applies its
// crossing payload once per enemy. The zone is kept separate from movement so
// the same flight state can later be reused by another hero without paint
// behavior leaking into the base collision system.
func (gs *GameState) updateKattyFlightTrail(p *player.Player, fromX, fromY, toX, toY float64, now int64) {
	for _, zone := range gs.HeroZones {
		if zone == nil || zone.Owner != p.PlayerId || zone.Kind != "katty_paint_trail" {
			continue
		}
		zone.ToX, zone.ToY = toX, toY
		if zone.Visual != nil {
			zone.Visual.ToX, zone.Visual.ToY = toX, toY
		}
		for _, target := range gs.Players {
			if target == nil || !target.CanBulletHurt(p.PlayerId, p.Team) || zone.Triggered[target.PlayerId] {
				continue
			}
			if segmentHitsCircle(fromX, fromY, toX, toY, target.X, target.Y, target.Radius+18) {
				gs.triggerKattyPaintTrail(p, zone, target, now)
			}
		}
		return
	}
}
