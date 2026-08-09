package game

import (
	"battle/model/bullet"
	"battle/model/player"
	"battle/service/geometry"
	"math"
	"time"
)

type MinaKit struct{}
type BrockZeusKit struct{}
type KazeKit struct{}
type WukongMicoKit struct{}
type PersephoneLumiKit struct{}

const (
	// Active skill windows are deliberately short enough to leave counterplay;
	// no hero skill may persist longer than this cap.
	MaxHeroSkillDuration = 15 * time.Second

	NeedleSporeSlowDuration       = 2 * time.Second
	KazeEmpowerInterval           = 3 * time.Second
	KazeEmpoweredDamageMultiplier = 1.75
	MicoVortexDuration            = 5 * time.Second
)

func cappedSkillDuration(duration time.Duration) int64 {
	if duration > MaxHeroSkillDuration {
		duration = MaxHeroSkillDuration
	}
	if duration < 0 {
		return 0
	}
	return duration.Milliseconds()
}

type HeroZone struct {
	Owner, Kind                                 string
	X, Y, Radius                                float64
	CreatedAt, ExpiresAt, NextTickAt, TriggerAt int64
	Triggered                                   map[string]bool
}

type LightningStrike struct {
	Owner     string
	X, Y      float64
	TriggerAt int64
	Impact    int
}

type Skyfall struct {
	Owner   string
	X, Y    float64
	LandsAt int64
}

func (MinaKit) AimShape() string               { return "cone" }
func (MinaKit) AttackRange() float64           { return 510 }
func (BrockZeusKit) AimShape() string          { return "line" }
func (BrockZeusKit) AttackRange() float64      { return 760 }
func (KazeKit) AimShape() string               { return "cone" }
func (KazeKit) AttackRange() float64           { return 105 }
func (WukongMicoKit) AimShape() string         { return "cone" }
func (WukongMicoKit) AttackRange() float64     { return 120 }
func (PersephoneLumiKit) AimShape() string     { return "line" }
func (PersephoneLumiKit) AttackRange() float64 { return 600 }

func (MinaKit) Basic(gs *GameState, p *player.Player, _ int64, angle, _ float64) {
	spawnConfiguredFan(gs, p, angle, heroAttackConfigs[p.HeroName])
}
func (MinaKit) Super(gs *GameState, p *player.Player, ts int64, _, _ float64) bool {
	target := p
	if id := gs.AbilityTargets[p.PlayerId]; id != "" && gs.Players[id] != nil && gs.Players[id].Team == p.Team {
		target = gs.Players[id]
	}
	target.ShieldHP = 400
	duration := cappedSkillDuration(4 * time.Second)
	target.ShieldUntil = ts + duration
	gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: p.PlayerId, Kind: "mina_heal", X: target.X, Y: target.Y, Radius: 160, CreatedAt: ts, ExpiresAt: ts + duration, NextTickAt: ts, Triggered: map[string]bool{}})
	gs.addEffect("mina_healing_aura", target.X, target.Y, 0, 0, 160, 0, 0, 0, "#ff9bea", 0, duration)
	return true
}

func (BrockZeusKit) Basic(gs *GameState, p *player.Player, _ int64, angle, _ float64) {
	if p.GadgetArmed {
		for _, target := range gs.Players {
			if target.CanBulletHurt(p.PlayerId, p.Team) {
				dx, dy := target.X-p.X, target.Y-p.Y
				along := dx*math.Cos(angle) + dy*math.Sin(angle)
				across := math.Abs(-dx*math.Sin(angle) + dy*math.Cos(angle))
				if along > 0 && along <= 800 && across <= target.Radius+18 {
					gs.dealPlayerDamage(p, target, int(math.Round(float64(p.AttackDmg)*(1+math.Min(4, along/200)*.15))))
				}
			}
		}
		for id, target := range gs.Monsters {
			if target == nil || !target.IsAlive() {
				continue
			}
			dx, dy := target.X-p.X, target.Y-p.Y
			along := dx*math.Cos(angle) + dy*math.Sin(angle)
			across := math.Abs(-dx*math.Sin(angle) + dy*math.Cos(angle))
			if along > 0 && along <= 800 && across <= target.Radius+18 {
				gs.damageMonster(id, target, int(math.Round(float64(p.AttackDmg)*(1+math.Min(4, along/200)*.15))))
			}
		}
		gs.destroyWallsInSector(p.X, p.Y, angle, 800, .08)
		gs.addEffect("zeus_beam_hole", p.X, p.Y, p.X+math.Cos(angle)*800, p.Y+math.Sin(angle)*800, 20, angle, 800, 0, p.Color, p.AttackDmg, 8000)
		p.GadgetArmed = false
		return
	}
	shot := gs.spawnAttackBullet(p, angle, "zeus_lightning", p.AttackDmg, p.BulletSpd, p.BulletSz, 760, 0, false, false)
	shot.Splash = 72
}
func (BrockZeusKit) Super(gs *GameState, p *player.Player, ts int64, angle, distance float64) bool {
	distance = math.Max(80, math.Min(620, distance))
	cx, cy := p.X+math.Cos(angle)*distance, p.Y+math.Sin(angle)*distance
	p.ChannelUntil = ts + 1000
	for i := 0; i < 3; i++ {
		a := float64(i) * math.Pi * 2 / 3
		gs.LightningStrikes = append(gs.LightningStrikes, &LightningStrike{Owner: p.PlayerId, X: cx + math.Cos(a)*75, Y: cy + math.Sin(a)*75, TriggerAt: ts + 1000 + int64(i)*400, Impact: i})
	}
	gs.addEffect("zeus_storm_target", cx, cy, 0, 0, 150, 0, 0, 0, "#75d8ff", 0, 2100)
	return true
}

func (KazeKit) Basic(gs *GameState, p *player.Player, ts int64, angle, _ float64) {
	damage := p.AttackDmg
	if p.KazeCritReady || ts >= p.KazeNextEmpoweredAt {
		damage = int(math.Round(float64(p.AttackDmg) * KazeEmpoweredDamageMultiplier))
		p.KazeCritReady = false
		p.KazeNextEmpoweredAt = ts + KazeEmpowerInterval.Milliseconds()
	}
	gs.hitSector(p, angle-.22, 105, .72, damage, false)
	gs.hitSector(p, angle+.22, 105, .72, damage, false)
	gs.addEffect("kaze_cross_slash", p.X, p.Y, 0, 0, 105, angle, 105, .9, p.Color, p.AttackDmg*2, 260)
}
func (KazeKit) Super(gs *GameState, p *player.Player, ts int64, angle, _ float64) bool {
	startX, startY := p.X, p.Y
	gs.vaultMove(p, angle, 320)
	for _, target := range gs.Players {
		if target.CanBulletHurt(p.PlayerId, p.Team) && segmentHitsCircle(startX, startY, p.X, p.Y, target.X, target.Y, target.Radius+18) {
			gs.dealPlayerDamage(p, target, 160)
			gs.DoomedUntil[target.PlayerId] = ts + cappedSkillDuration(3*time.Second)
			target.StunUntil = ts + 500
		}
	}
	gs.addEffect("kaze_dash", startX, startY, p.X, p.Y, 25, angle, 320, 0, p.Color, 160, 450)
	return true
}

func (WukongMicoKit) Basic(gs *GameState, p *player.Player, ts int64, angle, _ float64) {
	const reach = 120.0
	const halfArc = 50.0 * math.Pi / 180
	gs.hitSector(p, angle, reach, halfArc, p.AttackDmg, false)
	if p.GadgetArmed {
		for _, target := range gs.Players {
			if target.CanBulletHurt(p.PlayerId, p.Team) &&
				insideSector(p.X, p.Y, target.X, target.Y, target.Radius, angle, reach, halfArc) {
				target.SlowUntil = ts + 2000
				target.SlowMultiplier = .60
			}
		}
		p.GadgetArmed = false
	}
	gs.addEffect("mico_staff_swing", p.X, p.Y, 0, 0, reach, angle, reach, halfArc, p.Color, p.AttackDmg, 360)
}
func (WukongMicoKit) Super(gs *GameState, p *player.Player, ts int64, angle, _ float64) bool {
	duration := cappedSkillDuration(MicoVortexDuration)
	radius := 180.0
	p.VortexUntil = ts + duration
	gs.radialDamage(p.PlayerId, p.X, p.Y, radius, 140)
	gs.addEffect("mico_staff_spin", p.X, p.Y, 0, 0, radius, angle, radius, math.Pi, p.Color, 140, duration)
	return true
}

func (PersephoneLumiKit) Basic(gs *GameState, p *player.Player, ts int64, angle, _ float64) {
	shot := gs.spawnAttackBullet(p, angle, "lumi_orb", p.AttackDmg, p.BulletSpd, p.BulletSz, 600, 0, false, false)
	shot.SpawnedAt = ts
}
func (PersephoneLumiKit) Super(gs *GameState, p *player.Player, ts int64, angle, distance float64) bool {
	distance = math.Max(80, math.Min(520, distance))
	x, y := p.X+math.Cos(angle)*distance, p.Y+math.Sin(angle)*distance
	duration := cappedSkillDuration(6600 * time.Millisecond)
	gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: p.PlayerId, Kind: "lumi_roots", X: x, Y: y, Radius: 200, CreatedAt: ts, TriggerAt: ts + 600, ExpiresAt: ts + duration, NextTickAt: ts + 600, Triggered: map[string]bool{}})
	gs.addEffect("lumi_roots", x, y, 0, 0, 200, 0, 0, 0, p.Color, 0, 6000)
	return true
}

func (NeedleKit) Basic(gs *GameState, p *player.Player, _ int64, angle, _ float64) {
	shot := gs.spawnAttackBullet(p, angle, "spore", p.AttackDmg, p.BulletSpd, p.BulletSz, 620, 0, false, false)
	best, bestDistance := "", 620.0
	for id, target := range gs.Players {
		if target.CanBulletHurt(p.PlayerId, p.Team) {
			if distance := math.Hypot(target.X-p.X, target.Y-p.Y); distance < bestDistance {
				best, bestDistance = id, distance
			}
		}
	}
	shot.TargetID, shot.Homing = best, best != ""
}

func (NeedleKit) AimShape() string     { return "line" }
func (NeedleKit) AttackRange() float64 { return 620 }

func (NeedleKit) Super(gs *GameState, p *player.Player, ts int64, angle, distance float64) bool {
	distance = math.Max(80, math.Min(600, distance))
	x, y := p.X+math.Cos(angle)*distance, p.Y+math.Sin(angle)*distance
	gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: p.PlayerId, Kind: "needle_roots", X: x, Y: y, Radius: 120, CreatedAt: ts, TriggerAt: ts + 800, ExpiresAt: ts + 4800, NextTickAt: ts + 800, Triggered: map[string]bool{}})
	gs.addEffect("needle_root_cast", x, y, 0, 0, 120, 0, 0, 0, "#75d947", 0, 4800)
	return true
}

func (gs *GameState) useNewHeroGadget(p *player.Player, ts int64) bool {
	if p == nil || p.GadgetCharges <= 0 {
		return false
	}
	switch p.HeroName {
	case "Needle":
		originX, originY := p.X, p.Y
		gs.vaultMove(p, p.Rotation, 320)
		for _, target := range gs.Players {
			if target.CanBulletHurt(p.PlayerId, p.Team) && math.Hypot(target.X-originX, target.Y-originY) <= 75+target.Radius {
				target.SlowUntil = ts + cappedSkillDuration(NeedleSporeSlowDuration)
				target.SlowMultiplier = .60
				target.BlindUntil = ts + 5000
			}
		}
		gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: p.PlayerId, Kind: "needle_spore_cloud", X: originX, Y: originY, Radius: 75, CreatedAt: ts, NextTickAt: ts + 500, ExpiresAt: ts + 5000, Triggered: map[string]bool{}})
		gs.addEffect("needle_spore_cloud", originX, originY, 0, 0, 75, p.Rotation, 0, 0, "#75d947", 0, 5000)
	case "Fairy Mina":
		for _, target := range gs.Players {
			if !target.CanBulletHurt(p.PlayerId, p.Team) {
				continue
			}
			dx, dy := target.X-p.X, target.Y-p.Y
			if d := math.Hypot(dx, dy); d > 0 && d <= 135 {
				geometry.MoveCircleWithBlockingWalls(
					&target.CircleBody,
					gs.Walls,
					dx/d*105,
					dy/d*105,
				)
				if gs.LightMarkedUntil[target.PlayerId] > ts {
					target.StunUntil = ts + 1000
				}
			}
		}
		gs.addEffect("mina_air_wave", p.X, p.Y, 0, 0, 135, 0, 0, 0, p.Color, 0, 450)
	case "Kaze":
		p.StealthUntil = ts + cappedSkillDuration(3*time.Second)
		gs.addEffect("kaze_veil_step", p.X, p.Y, 0, 0, 74, p.Rotation, 0, 0, "#d7b8ff", 0, 700)
	case "Persephone Lumi":
		detonated := false
		keptZones := gs.HeroZones[:0]
		for _, zone := range gs.HeroZones {
			if detonated || zone.Owner != p.PlayerId || (zone.Kind != "lumi_roots" && zone.Kind != "lumi_trail") {
				keptZones = append(keptZones, zone)
				continue
			}
			detonated = true
			for _, target := range gs.Players {
				if target.CanBulletHurt(p.PlayerId, p.Team) && math.Hypot(target.X-zone.X, target.Y-zone.Y) <= zone.Radius+target.Radius {
					gs.dealPlayerDamage(p, target, 35)
					target.SlowUntil = ts + 2000
				}
			}
		}
		gs.HeroZones = keptZones
		if !detonated {
			return false
		}
		gs.addEffect("lumi_seedburst", p.X, p.Y, 0, 0, 105, 0, 0, 0, "#f07bd0", 50, 600)
	default:
		p.GadgetArmed = true
		switch p.HeroName {
		case "Brock Zeus":
			gs.addEffect("zeus_thunderbrand", p.X, p.Y, 0, 0, 68, p.Rotation, 0, 0, "#9eeaff", 0, 650)
		case "Wukong Mico":
			p.ShieldHP, p.StoneArmorUntil = 30, ts+4000
			p.ShieldUntil = ts + 4000
			gs.addEffect("mico_ruyi_bind", p.X, p.Y, 0, 0, 72, p.Rotation, 0, 0, "#ffd35a", 0, 650)
		}
	}
	p.GadgetCharges--
	p.LastSecondaryAt = ts
	return true
}

func (gs *GameState) updateNewHeroSystems() {
	now := time.Now().UnixMilli()
	zones := gs.HeroZones[:0]
	for _, z := range gs.HeroZones {
		if z == nil || now >= z.ExpiresAt {
			continue
		}
		if z.TriggerAt > now {
			zones = append(zones, z)
			continue
		}
		if z.Kind == "needle_roots" {
			for _, target := range gs.Players {
				owner := gs.Players[z.Owner]
				if owner != nil && target.CanBulletHurt(owner.PlayerId, owner.Team) && !z.Triggered[target.PlayerId] && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					target.StunUntil = now + 1500
					target.SlowUntil = now + 4000
					target.SlowMultiplier = 0.70
					z.Triggered[target.PlayerId] = true
				}
			}
		}
		if z.Kind == "needle_spore_cloud" && now >= z.NextTickAt {
			for _, target := range gs.Players {
				owner := gs.Players[z.Owner]
				if owner != nil && target.CanBulletHurt(owner.PlayerId, owner.Team) && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					target.SlowUntil = now + cappedSkillDuration(NeedleSporeSlowDuration)
					target.SlowMultiplier = .60
				}
			}
			z.NextTickAt = now + 500
		}
		if z.Kind == "mandy_stance" {
			owner := gs.Players[z.Owner]
			for _, target := range gs.Players {
				if owner != nil && target.CanBulletHurt(owner.PlayerId, owner.Team) && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					target.SlowUntil = now + 250
					target.SlowMultiplier = .75
				}
			}
		}
		if z.Kind == "mina_heal" && now >= z.NextTickAt {
			owner := gs.Players[z.Owner]
			for _, target := range gs.Players {
				if target.IsAlive() && owner != nil && (target.PlayerId == owner.PlayerId || (owner.Team != "" && target.Team == owner.Team)) && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					target.Lives = int(math.Min(float64(target.MaxLives), float64(target.Lives+15)))
				}
			}
			z.NextTickAt += 500
		}
		if z.Kind == "lumi_roots" {
			owner := gs.Players[z.Owner]
			for _, target := range gs.Players {
				if owner != nil && target.CanBulletHurt(owner.PlayerId, owner.Team) && !z.Triggered[target.PlayerId] && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					target.StunUntil = now + 2000
					z.Triggered[target.PlayerId] = true
				}
			}
		}
		if z.Kind == "lumi_trail" {
			owner := gs.Players[z.Owner]
			for _, target := range gs.Players {
				if owner != nil && target.CanBulletHurt(owner.PlayerId, owner.Team) && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					target.SlowUntil = now + 250
					target.SlowMultiplier = .75
				}
			}
		}
		zones = append(zones, z)
	}
	for _, p := range gs.Players {
		if p != nil && p.StoneArmorUntil > 0 && p.StoneArmorUntil <= now {
			if p.SuppressedRage > 0 {
				gs.radialDamage(p.PlayerId, p.X, p.Y, 135, p.SuppressedRage)
				gs.addEffect("mico_suppressed_rage", p.X, p.Y, 0, 0, 135, 0, 0, 0, p.Color, p.SuppressedRage, 650)
			}
			p.SuppressedRage, p.StoneArmorUntil = 0, 0
		}
	}
	gs.HeroZones = zones
	strikes := gs.LightningStrikes[:0]
	for _, s := range gs.LightningStrikes {
		if s.TriggerAt > now {
			strikes = append(strikes, s)
			continue
		}
		gs.radialDamage(s.Owner, s.X, s.Y, 62, 60)
		if s.Impact >= 1 {
			gs.destroyWallsInRadius(s.X, s.Y, 62)
		}
		gs.addEffect("zeus_lightning_strike", s.X, s.Y, 0, 0, 62, 0, 0, 0, "#b9efff", 60, 450)
		if s.Impact == 2 {
			gs.DamageZones = append(gs.DamageZones, &DamageZone{Owner: s.Owner, X: s.X, Y: s.Y, Radius: 100, PercentMaxHP: .02, TicksLeft: 5, NextTickAt: now, Interval: 1000, ExpiresAt: now + 5000, Kind: "zeus_fire"})
			gs.addEffect("zeus_burning_ground", s.X, s.Y, 0, 0, 100, 0, 0, 0, "#ff9a4d", 12, 5000)
		}
	}
	gs.LightningStrikes = strikes
	falls := gs.Skyfalls[:0]
	for _, f := range gs.Skyfalls {
		if f.LandsAt > now {
			falls = append(falls, f)
			continue
		}
		if p := gs.Players[f.Owner]; p != nil {
			p.X, p.Y = f.X, f.Y
			gs.radialDamage(f.Owner, f.X, f.Y, 125, 140)
			gs.knockbackEnemies(p, 125, 120)
			gs.addEffect("mico_skyfall", f.X, f.Y, 0, 0, 125, 0, 0, 0, p.Color, 140, 700)
		}
	}
	gs.Skyfalls = falls
}

func (gs *GameState) finishNewHeroProjectile(b *bullet.Bullet) {
	if b == nil || (b.Kind != "zeus_lightning" && b.Kind != "zeus_lightning_fire") {
		return
	}
	gs.radialDamage(b.PlayerId, b.X, b.Y, 72, b.Damage)
	gs.addEffect("zeus_lightning_blast", b.X, b.Y, 0, 0, 72, 0, 0, 0, b.Color, b.Damage, 420)
	if b.Kind == "zeus_lightning_fire" {
		now := time.Now().UnixMilli()
		gs.DamageZones = append(gs.DamageZones, &DamageZone{Owner: b.PlayerId, X: b.X, Y: b.Y, Radius: 62, Damage: 10, TicksLeft: 4, NextTickAt: now, Interval: 500, ExpiresAt: now + 2100, Kind: "zeus_fire", Color: "#66cfff"})
		gs.addEffect("zeus_fire_ground", b.X, b.Y, 0, 0, 62, 0, 0, 0, "#66cfff", 0, 2100)
	}
}

func (gs *GameState) knockbackEnemies(p *player.Player, radius, force float64) {
	for _, target := range gs.Players {
		if !target.CanBulletHurt(p.PlayerId, p.Team) {
			continue
		}
		dx, dy := target.X-p.X, target.Y-p.Y
		if d := math.Hypot(dx, dy); d > 0 && d <= radius+target.Radius {
			geometry.MoveCircleWithBlockingWalls(
				&target.CircleBody,
				gs.Walls,
				dx/d*force,
				dy/d*force,
			)
		}
	}
}
