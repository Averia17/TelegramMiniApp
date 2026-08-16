package game

import (
	"battle/model/player"
	"battle/service/geometry"
	"math"
	"time"
)

// CombatKit is the polymorphic Match Scene contract. Hero-specific behavior
// lives behind this interface instead of growing the legacy attack switch.
type CombatKit interface {
	Basic(gs *GameState, source *player.Player, ts int64, angle, aimDistance float64)
	Super(gs *GameState, source *player.Player, ts int64, angle, aimDistance float64) bool
	AimShape() string
	AttackRange() float64
}

type MandyKit struct{}
type NeedleKit struct{}
type KattyKit struct{}

type ScheduledShot struct {
	Owner        string
	CommandID    string
	Angle        float64
	SpawnAt      int64
	Damage       int
	Speed        float64
	Size         float64
	MaxRange     float64
	Kind         string
	Knockback    float64
	Pierce       int
	DestroyWalls bool
}

type DamageZone struct {
	Owner        string
	X, Y         float64
	Radius       float64
	Damage       int
	PercentMaxHP float64
	TicksLeft    int
	NextTickAt   int64
	Interval     int64
	ExpiresAt    int64
	Kind         string
	Color        string
	Group        string
}

type PendingMandySuper struct {
	Owner     string
	X, Y      float64
	Angle     float64
	TriggerAt int64
	Visual    *BattleEffect
}

const (
	AutoAimAssistRadius           = 34.0
	MeleeMovingTargetAssistRadius = 20.0
)

func CombatKitFor(hero string) CombatKit {
	return defaultCombatRegistry.CombatKitFor(hero)
}

func (gs *GameState) autoAimTarget(owner string) (float64, float64) {
	source := gs.Players[owner]
	if source == nil {
		gs.hasAutoAimTarget = false
		gs.autoAimTargetID = ""
		return 0, 0
	}
	gs.hasAutoAimTarget = false
	gs.autoAimTargetID = ""
	reach := autoAimAttackReach(source)
	// Enemy heroes are the intentional target for auto-aim. Monsters are only a
	// fallback, so a nearby PvP opponent is never silently replaced by a mob.
	var best *player.Player
	bestDistance := math.Inf(1)
	for _, candidate := range gs.Players {
		if candidate == nil || !candidate.CanBulletHurt(source.PlayerId, source.Team) {
			continue
		}
		distance := math.Hypot(candidate.X-source.X, candidate.Y-source.Y)
		maxDistance := reach
		if isMeleeBasicAttacker(source) {
			maxDistance += meleeTargetRadius(source, candidate)
		}
		if distance <= maxDistance && distance <= bestDistance {
			best, bestDistance = candidate, distance
		}
	}
	if best != nil {
		gs.autoAimTargetX, gs.autoAimTargetY, gs.autoAimTargetID, gs.hasAutoAimTarget = best.X, best.Y, best.PlayerId, true
		return screenAngleFromWorld(math.Atan2(best.Y-source.Y, best.X-source.X)), bestDistance
	}
	var bestMonsterX, bestMonsterY float64
	bestMonsterDistance := reach
	hasMonster := false
	for _, candidate := range gs.Monsters {
		if candidate == nil || !candidate.IsAlive() {
			continue
		}
		distance := math.Hypot(candidate.X-source.X, candidate.Y-source.Y)
		if distance <= bestMonsterDistance {
			bestMonsterX, bestMonsterY = candidate.X, candidate.Y
			bestMonsterDistance = distance
			hasMonster = true
		}
	}
	if hasMonster {
		gs.autoAimTargetX, gs.autoAimTargetY, gs.autoAimTargetID, gs.hasAutoAimTarget = bestMonsterX, bestMonsterY, "", true
		return screenAngleFromWorld(math.Atan2(bestMonsterY-source.Y, bestMonsterX-source.X)), bestMonsterDistance
	}
	if math.Hypot(source.MoveX, source.MoveY) > .01 {
		return screenAngleFromWorld(math.Atan2(source.MoveY, source.MoveX)), reach
	}
	return screenAngleFromWorld(source.Rotation), reach
}

func autoAimAttackReach(source *player.Player) float64 {
	reach := 700.0
	if source == nil {
		return reach
	}
	if kit := CombatKitFor(source.HeroName); kit != nil {
		reach = kit.AttackRange()
	}
	if source.HeroName == "Mandy" && source.FocusCharge >= 100 {
		reach *= 1.35
	}
	return reach
}

func (gs *GameState) combatKitFor(hero string) CombatKit {
	if gs != nil && gs.combatRegistry != nil {
		return gs.combatRegistry.CombatKitFor(hero)
	}
	return CombatKitFor(hero)
}

func (gs *GameState) basicCombatKitFor(hero string) BasicCombatKit {
	if gs != nil && gs.combatRegistry != nil {
		return gs.combatRegistry.BasicCombatKitFor(hero)
	}
	return BasicCombatKitFor(hero)
}

func (gs *GameState) autoAimHitsTarget(source *player.Player, targetX, targetY, targetRadius, angle, reach, halfArc float64) bool {
	dx, dy := targetX-source.X, targetY-source.Y
	delta := math.Atan2(math.Sin(math.Atan2(dy, dx)-angle), math.Cos(math.Atan2(dy, dx)-angle))
	distance := math.Hypot(dx, dy)
	angularRadius := 0.0
	if isMeleeBasicAttacker(source) {
		angularRadius = math.Pi
		if distance > targetRadius {
			angularRadius = math.Asin(math.Min(1, targetRadius/distance))
		}
	}
	if distance <= reach+targetRadius && math.Abs(delta) <= halfArc+angularRadius {
		return true
	}
	if !gs.activeAutoAim || !gs.hasAutoAimTarget || math.Hypot(targetX-gs.autoAimTargetX, targetY-gs.autoAimTargetY) > AutoAimAssistRadius+targetRadius {
		return false
	}
	return math.Hypot(dx, dy) <= reach+targetRadius+AutoAimAssistRadius
}

func isMeleeBasicAttacker(source *player.Player) bool {
	if source == nil {
		return false
	}
	return GetAttackConfig(source.HeroName).Archetype == AttackMeleeCone
}

func meleeTargetRadius(source, target *player.Player) float64 {
	if target == nil {
		return 0
	}
	radius := target.Radius
	if isMeleeBasicAttacker(source) && math.Hypot(target.MoveX, target.MoveY) > .01 {
		radius += MeleeMovingTargetAssistRadius
	}
	return radius
}

func (MandyKit) AimShape() string     { return "cone" }
func (MandyKit) AttackRange() float64 { return heroAttackConfigs["Mandy"].Range }

func (MandyKit) Basic(gs *GameState, source *player.Player, ts int64, angle, _ float64) {
	reach := MandyKit{}.AttackRange()
	focused := source.FocusCharge >= 100
	if focused {
		reach *= 1.35
		// A focused strike is a payoff, not a permanent stance. Restart the
		// stillness timer so Mandy must hold position again for the next one.
		source.FocusCharge = 0
		source.FocusStartedAt = ts
	}
	halfArc := heroAttackConfigs["Mandy"].HalfArcDegrees * math.Pi / 180
	slowUntil := int64(0)
	gadgetBoost := 1.0
	if source.GadgetArmed {
		slowUntil = ts + 1200
		gadgetBoost = 1.5
		source.GadgetArmed = false
	}
	for _, target := range gs.Players {
		if !target.CanBulletHurt(source.PlayerId, source.Team) || !gs.autoAimHitsTarget(source, target.X, target.Y, meleeTargetRadius(source, target), angle, reach, halfArc) {
			continue
		}
		damage := source.AttackDmg
		if gadgetBoost > 1 {
			damage = int(math.Round(float64(damage) * gadgetBoost))
		}
		if focused {
			damage = int(math.Round(float64(damage) * MandyFocusedDamageMultiplier))
		}
		if gs.dealPlayerDamage(source, target, damage) > 0 {
			stunDuration := MandyStaffStunDuration
			if focused {
				stunDuration = MeleeSkillStunDuration
			}
			target.StunUntil = max(target.StunUntil, ts+stunDuration.Milliseconds())
			if slowUntil > 0 {
				target.SlowUntil = slowUntil
			}
		}
	}
	for id, target := range gs.Monsters {
		if target == nil || !target.IsAlive() || !gs.autoAimHitsTarget(source, target.X, target.Y, target.Radius, angle, reach, halfArc) {
			continue
		}
		damage := source.AttackDmg
		if gadgetBoost > 1 {
			damage = int(math.Round(float64(damage) * gadgetBoost))
		}
		if focused {
			damage = int(math.Round(float64(damage) * MandyFocusedDamageMultiplier))
		}
		gs.damageMonster(id, target, damage)
	}
	gs.addEffect("mandy_staff_swing", source.X, source.Y, 0, 0, reach, angle, reach, halfArc, source.Color, 0, 360)
}

func (MandyKit) Super(gs *GameState, source *player.Player, ts int64, angle, _ float64) bool {
	const windup = int64(1200)
	source.CastUntil = ts + windup
	cast := &PendingMandySuper{
		Owner: source.PlayerId, X: source.X, Y: source.Y, Angle: angle, TriggerAt: ts + windup,
	}
	cast.Visual = gs.addEffect("mandy_super_charge", source.X, source.Y, 0, 0, 80, angle, 0, 0, "#ffd84d", 0, windup)
	gs.PendingMandySupers = append(gs.PendingMandySupers, cast)
	return true
}

func insideSector(x, y, targetX, targetY, targetRadius, angle, reach, halfArc float64) bool {
	dx, dy := targetX-x, targetY-y
	delta := math.Atan2(math.Sin(math.Atan2(dy, dx)-angle), math.Cos(math.Atan2(dy, dx)-angle))
	return math.Hypot(dx, dy) <= reach+targetRadius && math.Abs(delta) <= halfArc
}

func (gs *GameState) updateMandyFocus() {
	now := time.Now().UnixMilli()
	for _, source := range gs.Players {
		if source == nil || source.HeroName != "Mandy" || !source.IsAlive() {
			continue
		}
		if math.Hypot(source.MoveX, source.MoveY) > .01 || source.CastUntil > now {
			source.FocusStartedAt, source.FocusCharge = 0, 0
			continue
		}
		if source.FocusStartedAt == 0 {
			source.FocusStartedAt = now
		}
		source.FocusCharge = int(math.Min(100, float64(now-source.FocusStartedAt)/20))
	}
}

func (gs *GameState) updatePendingMandySupers() {
	now := time.Now().UnixMilli()
	kept := gs.PendingMandySupers[:0]
	for _, cast := range gs.PendingMandySupers {
		if cast == nil {
			continue
		}
		source := gs.Players[cast.Owner]
		if source == nil || !source.IsAlive() {
			continue
		}
		cast.X, cast.Y = source.X, source.Y
		if cast.Visual != nil {
			cast.Visual.X, cast.Visual.Y = cast.X, cast.Y
		}
		if cast.TriggerAt > now {
			kept = append(kept, cast)
			continue
		}
		source.SuperPulse++
		reach := math.Hypot(gs.Map.WidthInPixels, gs.Map.HeightInPixels) + TileSize
		for _, target := range gs.Players {
			if !target.CanBulletHurt(source.PlayerId, source.Team) || !insideBeam(cast.X, cast.Y, target.X, target.Y, target.Radius, cast.Angle, reach, 50) {
				continue
			}
			along := math.Abs((target.X-cast.X)*math.Cos(cast.Angle) + (target.Y-cast.Y)*math.Sin(cast.Angle))
			progress := math.Min(1, along/math.Max(1, reach))
			gs.dealPlayerDamage(source, target, int(math.Round(140*(1+progress*.6))))
			target.StunUntil = max(target.StunUntil, now+MeleeSkillStunDuration.Milliseconds())
		}
		for id, target := range gs.Monsters {
			if target != nil && target.IsAlive() && insideBeam(cast.X, cast.Y, target.X, target.Y, target.Radius, cast.Angle, reach, 50) {
				gs.damageMonster(id, target, 140)
			}
		}
		gs.destroyWallsInBeam(cast.X, cast.Y, cast.Angle, reach, 50)
		gs.addEffect("mandy_super_wave", cast.X, cast.Y, cast.X+math.Cos(cast.Angle)*reach, cast.Y+math.Sin(cast.Angle)*reach, 50, cast.Angle, reach, 0, "#ffd84d", 140, 700)
	}
	gs.PendingMandySupers = kept
}

func insideBeam(x, y, targetX, targetY, targetRadius, angle, reach, halfWidth float64) bool {
	dx, dy := targetX-x, targetY-y
	along := dx*math.Cos(angle) + dy*math.Sin(angle)
	across := math.Abs(-dx*math.Sin(angle) + dy*math.Cos(angle))
	return along >= -targetRadius && along <= reach+targetRadius && across <= halfWidth+targetRadius
}

func (gs *GameState) destroyWallsInBeam(x, y, angle, reach, halfWidth float64) int {
	kept := gs.Map.Collisions[:0]
	destroyed := 0
	cosine, sine := math.Cos(angle), math.Sin(angle)
	for _, wall := range gs.Map.Collisions {
		centerX, centerY := (wall.MinX+wall.MaxX)/2, (wall.MinY+wall.MaxY)/2
		halfX, halfY := (wall.MaxX-wall.MinX)/2, (wall.MaxY-wall.MinY)/2
		dx, dy := centerX-x, centerY-y
		along := dx*cosine + dy*sine
		across := math.Abs(-dx*sine + dy*cosine)
		alongExtent := math.Abs(cosine)*halfX + math.Abs(sine)*halfY
		acrossExtent := math.Abs(sine)*halfX + math.Abs(cosine)*halfY
		if isDestructibleWall(wall.Type) && along+alongExtent >= 0 && along-alongExtent <= reach && across <= halfWidth+acrossExtent {
			destroyed++
			continue
		}
		kept = append(kept, wall)
	}
	if destroyed > 0 {
		gs.Map.Collisions = kept
		gs.MapRevision++
		gs.Walls = geometry.NewSpatialHash(TileSize)
		for _, wall := range kept {
			gs.Walls.Insert(wall)
		}
		gs.WallsSource = kept
	}
	return destroyed
}

func (gs *GameState) updateScheduledShots() {
	now := time.Now().UnixMilli()
	kept := gs.ScheduledShots[:0]
	for _, scheduled := range gs.ScheduledShots {
		if scheduled == nil {
			continue
		}
		if scheduled.SpawnAt > now {
			kept = append(kept, scheduled)
			continue
		}
		source := gs.Players[scheduled.Owner]
		if source == nil || !source.IsAlive() {
			continue
		}
		previousCommandID, previousSourceID := gs.activeCommandID, gs.activeSourceID
		gs.activeCommandID, gs.activeSourceID = scheduled.CommandID, scheduled.Owner
		shot := gs.spawnAttackBullet(source, scheduled.Angle, scheduled.Kind, scheduled.Damage, scheduled.Speed, scheduled.Size, scheduled.MaxRange, 0, false, false)
		gs.activeCommandID, gs.activeSourceID = previousCommandID, previousSourceID
		shot.Knockback = scheduled.Knockback
		shot.Pierce = scheduled.Pierce
		shot.DestroyWalls = scheduled.DestroyWalls || wallBreakerProjectile(scheduled.Kind)
	}
	gs.ScheduledShots = kept
}

func (gs *GameState) updateDamageZones() {
	now := time.Now().UnixMilli()
	kept := gs.DamageZones[:0]
	damagedByGroup := make(map[string]map[string]bool)
	for _, zone := range gs.DamageZones {
		if zone == nil || zone.TicksLeft <= 0 || now >= zone.ExpiresAt {
			continue
		}
		for zone.TicksLeft > 0 && now >= zone.NextTickAt {
			if zone.Group == "" {
				damage := zone.Damage
				if zone.PercentMaxHP > 0 {
					gs.radialDamagePercentMaxHP(zone.Owner, zone.X, zone.Y, zone.Radius, zone.PercentMaxHP)
				} else {
					gs.radialDamage(zone.Owner, zone.X, zone.Y, zone.Radius, damage)
				}
			} else {
				hit := damagedByGroup[zone.Group]
				if hit == nil {
					hit = make(map[string]bool)
					damagedByGroup[zone.Group] = hit
				}
				gs.radialDamageOnce(zone.Owner, zone.X, zone.Y, zone.Radius, zone.Damage, hit)
			}
			zone.TicksLeft--
			zone.NextTickAt += zone.Interval
		}
		if zone.TicksLeft > 0 {
			kept = append(kept, zone)
		}
	}
	gs.DamageZones = kept
}

func (gs *GameState) destroyWallsInSector(x, y, angle, reach, halfArc float64) int {
	kept := gs.Map.Collisions[:0]
	destroyed := 0
	for _, wall := range gs.Map.Collisions {
		centerX, centerY := (wall.MinX+wall.MaxX)/2, (wall.MinY+wall.MaxY)/2
		dx, dy := centerX-x, centerY-y
		delta := math.Atan2(math.Sin(math.Atan2(dy, dx)-angle), math.Cos(math.Atan2(dy, dx)-angle))
		if isDestructibleWall(wall.Type) && math.Hypot(dx, dy) <= reach && math.Abs(delta) <= halfArc {
			destroyed++
			continue
		}
		kept = append(kept, wall)
	}
	if destroyed > 0 {
		gs.Map.Collisions = kept
		gs.MapRevision++
		gs.Walls = geometry.NewSpatialHash(TileSize)
		for _, wall := range kept {
			gs.Walls.Insert(wall)
		}
		gs.WallsSource = kept
	}
	return destroyed
}
