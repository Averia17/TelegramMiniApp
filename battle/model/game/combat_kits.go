package game

import (
	"battle/model/player"
	"battle/service/geometry"
	"fmt"
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

type ShellyKit struct{}
type ColtKit struct{}
type BarleyKit struct{}

type ScheduledShot struct {
	Owner        string
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
	Owner      string
	X, Y       float64
	Radius     float64
	Damage     int
	TicksLeft  int
	NextTickAt int64
	Interval   int64
	ExpiresAt  int64
	Kind       string
	Color      string
	Group      string
}

func CombatKitFor(hero string) CombatKit {
	switch hero {
	case "Shelly":
		return ShellyKit{}
	case "Colt":
		return ColtKit{}
	case "Barley":
		return BarleyKit{}
	default:
		return nil
	}
}

func (gs *GameState) autoAimTarget(owner string) (float64, float64) {
	source := gs.Players[owner]
	if source == nil {
		return 0, 0
	}
	reach := 700.0
	if kit := CombatKitFor(source.HeroName); kit != nil {
		reach = kit.AttackRange()
	}
	var best *player.Player
	bestDistance := reach
	for _, candidate := range gs.Players {
		if candidate == nil || !candidate.CanBulletHurt(source.PlayerId, source.Team) {
			continue
		}
		distance := math.Hypot(candidate.X-source.X, candidate.Y-source.Y)
		if distance <= bestDistance {
			best, bestDistance = candidate, distance
		}
	}
	if best != nil {
		return screenAngleFromWorld(math.Atan2(best.Y-source.Y, best.X-source.X)), bestDistance
	}
	if math.Hypot(source.MoveX, source.MoveY) > .01 {
		return screenAngleFromWorld(math.Atan2(source.MoveY, source.MoveX)), reach
	}
	return screenAngleFromWorld(source.Rotation), reach
}

func (ShellyKit) AimShape() string     { return "cone" }
func (ShellyKit) AttackRange() float64 { return 430 }
func (ColtKit) AimShape() string       { return "line" }
func (ColtKit) AttackRange() float64   { return 650 }
func (BarleyKit) AimShape() string     { return "lob" }
func (BarleyKit) AttackRange() float64 { return 620 }

func (ShellyKit) Basic(gs *GameState, source *player.Player, _ int64, angle, _ float64) {
	// Five independent hitboxes distributed over a 30 degree cone.
	for index := 0; index < 5; index++ {
		spread := (-15.0 + float64(index)*7.5) * math.Pi / 180
		gs.spawnAttackBullet(source, angle+spread, "shell", source.AttackDmg, source.BulletSpd, source.BulletSz, 430, 0, false, false)
	}
	gs.addEffect("shotgun_cone", source.X, source.Y, 0, 0, 0, angle, 430, 15*math.Pi/180, source.Color, 0, 260)
}

func (ShellyKit) Super(gs *GameState, source *player.Player, _ int64, angle, _ float64) bool {
	for index := 0; index < 9; index++ {
		spread := (-20.0 + float64(index)*5.0) * math.Pi / 180
		shot := gs.spawnAttackBullet(source, angle+spread, "super_shell", 720, 720, 7, 500, 1, false, false)
		shot.Knockback = 95
		shot.DestroyWalls = true
	}
	gs.destroyWallsInSector(source.X, source.Y, angle, 500, 24*math.Pi/180)
	gs.addEffect("super_cone", source.X, source.Y, 0, 0, 0, angle, 500, 24*math.Pi/180, "#f5d7ff", 0, 480)
	return true
}

func (ColtKit) Basic(gs *GameState, source *player.Player, ts int64, angle, _ float64) {
	// Position is deliberately not captured: each delayed round spawns at the
	// owner's current transform, so a moving Colt bends/shifts the whole burst.
	for index := 0; index < 6; index++ {
		gs.ScheduledShots = append(gs.ScheduledShots, &ScheduledShot{
			Owner: source.PlayerId, Angle: angle, SpawnAt: ts + int64(index)*50,
			Damage: source.AttackDmg, Speed: source.BulletSpd, Size: source.BulletSz,
			MaxRange: 650, Kind: "colt_round",
		})
	}
	gs.addEffect("burst_line", source.X, source.Y, 0, 0, 0, angle, 650, .03, source.Color, 0, 350)
}

func (ColtKit) Super(gs *GameState, source *player.Player, ts int64, angle, _ float64) bool {
	for index := 0; index < 12; index++ {
		gs.ScheduledShots = append(gs.ScheduledShots, &ScheduledShot{
			Owner: source.PlayerId, Angle: angle, SpawnAt: ts + int64(index)*50,
			Damage: 420, Speed: 760, Size: 5, MaxRange: 850, Kind: "colt_super_round",
			Pierce: 99, DestroyWalls: true,
		})
	}
	gs.addEffect("colt_super_line", source.X, source.Y, 0, 0, 0, angle, 850, .035, "#8ee8ff", 0, 700)
	return true
}

func (BarleyKit) Basic(gs *GameState, source *player.Player, ts int64, angle, aimDistance float64) {
	distance := math.Max(70, math.Min(BarleyKit{}.AttackRange(), aimDistance))
	x, y := source.X+math.Cos(angle)*distance, source.Y+math.Sin(angle)*distance
	clamped := gs.Map.ClampCircle(&geometry.CircleBody{X: x, Y: y, Radius: 8})
	shot := gs.spawnAttackBullet(source, angle, "barley_bottle", source.AttackDmg, 0, 9, distance, 0, false, false)
	shot.Lobbed = true
	shot.OriginX, shot.OriginY = source.X, source.Y
	shot.TargetX, shot.TargetY = clamped.X, clamped.Y
	shot.SpawnedAt, shot.LandsAt = ts, ts+650
	shot.ZoneRadius, shot.ZoneTicks, shot.ZoneInterval = 60, 2, 1000
	gs.addEffect("lob_target", clamped.X, clamped.Y, 0, 0, 60, 0, 0, 0, source.Color, 0, 650)
}

func (BarleyKit) Super(gs *GameState, source *player.Player, ts int64, angle, aimDistance float64) bool {
	distance := math.Max(70, math.Min(BarleyKit{}.AttackRange(), aimDistance))
	centerX, centerY := source.X+math.Cos(angle)*distance, source.Y+math.Sin(angle)*distance
	group := fmt.Sprintf("barley-super:%s:%d", source.PlayerId, ts)
	for _, offset := range []struct{ x, y float64 }{{0, 0}, {-72, 0}, {72, 0}, {0, -72}, {0, 72}} {
		target := gs.Map.ClampCircle(&geometry.CircleBody{X: centerX + offset.x, Y: centerY + offset.y, Radius: 8})
		shotAngle := math.Atan2(target.Y-source.Y, target.X-source.X)
		shotDistance := math.Hypot(target.X-source.X, target.Y-source.Y)
		shot := gs.spawnAttackBullet(source, shotAngle, "barley_super_bottle", 760, 0, 10, shotDistance, 0, false, false)
		shot.Lobbed = true
		shot.OriginX, shot.OriginY = source.X, source.Y
		shot.TargetX, shot.TargetY = target.X, target.Y
		shot.SpawnedAt, shot.LandsAt = ts, ts+700
		shot.ZoneRadius, shot.ZoneTicks, shot.ZoneInterval, shot.ZoneGroup = 70, 4, 1000, group
	}
	gs.addEffect("barley_super_target", centerX, centerY, 0, 0, 145, 0, 0, 0, "#79caff", 0, 850)
	return true
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
		shot := gs.spawnAttackBullet(source, scheduled.Angle, scheduled.Kind, scheduled.Damage, scheduled.Speed, scheduled.Size, scheduled.MaxRange, 0, false, false)
		shot.Knockback = scheduled.Knockback
		shot.Pierce = scheduled.Pierce
		shot.DestroyWalls = scheduled.DestroyWalls
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
				gs.radialDamage(zone.Owner, zone.X, zone.Y, zone.Radius, zone.Damage)
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
		if wall.Type == "destructible" && math.Hypot(dx, dy) <= reach && math.Abs(delta) <= halfArc {
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
	}
	return destroyed
}
