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
type DamianKit struct{}
type PersephoneLumiKit struct{}

type HeroZone struct {
	Owner, Kind                      string
	X, Y, Radius                     float64
	CreatedAt, ExpiresAt, NextTickAt, TriggerAt int64
	Triggered                        map[string]bool
}

type LightningStrike struct {
	Owner     string
	X, Y      float64
	TriggerAt int64
	Impact    int
}

type Totem struct {
	Owner                 string
	X, Y                  float64
	HP                    int
	ExpiresAt, NextShotAt int64
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
func (DamianKit) AimShape() string             { return "line" }
func (DamianKit) AttackRange() float64         { return 640 }
func (PersephoneLumiKit) AimShape() string     { return "line" }
func (PersephoneLumiKit) AttackRange() float64 { return 600 }

func (MinaKit) Basic(gs *GameState, p *player.Player, _ int64, angle, _ float64) {
	spawnConfiguredFan(gs, p, angle, heroAttackConfigs[p.HeroName])
}
func (MinaKit) Super(gs *GameState, p *player.Player, ts int64, _, _ float64) bool {
	p.ShieldHP = 400
	p.ShieldUntil = ts + 4000
	gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: p.PlayerId, Kind: "mina_heal", X: p.X, Y: p.Y, Radius: 160, CreatedAt: ts, ExpiresAt: ts + 5000, NextTickAt: ts, Triggered: map[string]bool{}})
	gs.addEffect("mina_healing_aura", p.X, p.Y, 0, 0, 160, 0, 0, 0, "#ff9bea", 0, 5000)
	return true
}

func (BrockZeusKit) Basic(gs *GameState, p *player.Player, _ int64, angle, _ float64) {
	shot := gs.spawnAttackBullet(p, angle, "zeus_lightning", p.AttackDmg, p.BulletSpd, p.BulletSz, 760, 0, false, false)
	shot.Splash = 72
	if p.GadgetArmed {
		shot.Pierce, shot.DestroyWalls = 99, true
		shot.Kind = "zeus_lightning_fire"
		p.GadgetArmed = false
	}
}
func (BrockZeusKit) Super(gs *GameState, p *player.Player, ts int64, angle, distance float64) bool {
	distance = math.Max(80, math.Min(620, distance))
	cx, cy := p.X+math.Cos(angle)*distance, p.Y+math.Sin(angle)*distance
	p.ChannelUntil = ts + 1000
	for i := 0; i < 6; i++ {
		a := float64(i) * math.Pi * 2 / 6
		gs.LightningStrikes = append(gs.LightningStrikes, &LightningStrike{Owner: p.PlayerId, X: cx + math.Cos(a)*75, Y: cy + math.Sin(a)*75, TriggerAt: ts + 1000 + int64(i)*180, Impact: i})
	}
	gs.addEffect("zeus_storm_target", cx, cy, 0, 0, 150, 0, 0, 0, "#75d8ff", 0, 2100)
	return true
}

func (KazeKit) Basic(gs *GameState, p *player.Player, _ int64, angle, _ float64) {
	gs.hitSector(p, angle-.22, 105, .72, p.AttackDmg, false)
	gs.hitSector(p, angle+.22, 105, .72, p.AttackDmg, false)
	gs.addEffect("kaze_cross_slash", p.X, p.Y, 0, 0, 105, angle, 105, .9, p.Color, p.AttackDmg*2, 260)
}
func (KazeKit) Super(gs *GameState, p *player.Player, ts int64, angle, _ float64) bool {
	startX, startY := p.X, p.Y
	gs.vaultMove(p, angle, 320)
	for _, target := range gs.Players {
		if target.CanBulletHurt(p.PlayerId, p.Team) && segmentHitsCircle(startX, startY, p.X, p.Y, target.X, target.Y, target.Radius+18) {
			gs.dealPlayerDamage(p, target, 2500)
			gs.DoomedUntil[target.PlayerId] = ts + 3000
			target.StunUntil = ts + 500
		}
	}
	gs.addEffect("kaze_dash", startX, startY, p.X, p.Y, 25, angle, 320, 0, p.Color, 2500, 450)
	return true
}

func (WukongMicoKit) Basic(gs *GameState, p *player.Player, ts int64, angle, _ float64) {
	const reach = 120.0
	const halfArc = 50.0 * math.Pi / 180
	gs.hitSector(p, angle, reach, halfArc, p.AttackDmg, false)
	p.Rage = int(math.Min(5, float64(p.Rage+1)))
	if p.GadgetArmed {
		for _, target := range gs.Players {
			if target.CanBulletHurt(p.PlayerId, p.Team) &&
				insideSector(p.X, p.Y, target.X, target.Y, target.Radius, angle, reach, halfArc) {
				target.SlowUntil = ts + 2000
			}
		}
		p.GadgetArmed = false
	}
	gs.addEffect("mico_staff_swing", p.X, p.Y, 0, 0, reach, angle, reach, halfArc, p.Color, p.AttackDmg, 360)
}
func (WukongMicoKit) Super(gs *GameState, p *player.Player, _ int64, angle, _ float64) bool {
	rage := p.Rage
	duration := int64(3000 + rage*500)
	radius := 165.0 + float64(rage)*12
	p.Rage = 0
	p.VortexUntil = time.Now().UnixMilli() + duration
	gs.radialDamage(p.PlayerId, p.X, p.Y, radius, 3000)
	gs.addEffect("mico_staff_spin", p.X, p.Y, 0, 0, radius, angle, radius, math.Pi, p.Color, 3000, duration)
	return true
}

func (DamianKit) Basic(gs *GameState, p *player.Player, _ int64, angle, _ float64) {
	gs.spawnAttackBullet(p, angle, "damian_orb", p.AttackDmg, p.BulletSpd, p.BulletSz, 640, 0, false, false)
}
func (DamianKit) Super(gs *GameState, p *player.Player, ts int64, angle, distance float64) bool {
	distance = math.Max(55, math.Min(280, distance))
	x, y := p.X+math.Cos(angle)*distance, p.Y+math.Sin(angle)*distance
	body := gs.Map.ClampCircle(&geometry.CircleBody{X: x, Y: y, Radius: 20})
	gs.Totems[p.PlayerId] = &Totem{Owner: p.PlayerId, X: body.X, Y: body.Y, HP: 3000, ExpiresAt: ts + 15000, NextShotAt: ts + 500}
	gs.addEffect("damian_totem_spawn", body.X, body.Y, 0, 0, 28, 0, 0, 0, p.Color, 0, 700)
	return true
}

func (PersephoneLumiKit) Basic(gs *GameState, p *player.Player, ts int64, angle, _ float64) {
	shot := gs.spawnAttackBullet(p, angle, "lumi_orb", p.AttackDmg, p.BulletSpd, p.BulletSz, 600, 0, false, false)
	shot.SpawnedAt = ts
}
func (PersephoneLumiKit) Super(gs *GameState, p *player.Player, ts int64, angle, distance float64) bool {
	distance = math.Max(80, math.Min(520, distance))
	x, y := p.X+math.Cos(angle)*distance, p.Y+math.Sin(angle)*distance
	gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: p.PlayerId, Kind: "lumi_roots", X: x, Y: y, Radius: 200, CreatedAt: ts, ExpiresAt: ts + 6000, NextTickAt: ts, Triggered: map[string]bool{}})
	gs.addEffect("lumi_roots", x, y, 0, 0, 200, 0, 0, 0, p.Color, 0, 6000)
	return true
}

func (ShadowKit) Basic(gs *GameState, p *player.Player, _ int64, angle, _ float64) {
	gs.spawnAttackBullet(p, angle, "spore", p.AttackDmg, p.BulletSpd, p.BulletSz, 620, 0, false, false)
}

func (ShadowKit) AimShape() string { return "line" }
func (ShadowKit) AttackRange() float64 { return 620 }

func (ShadowKit) Super(gs *GameState, p *player.Player, ts int64, angle, distance float64) bool {
	distance = math.Max(80, math.Min(600, distance))
	x, y := p.X+math.Cos(angle)*distance, p.Y+math.Sin(angle)*distance
	gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: p.PlayerId, Kind: "shadow_roots", X: x, Y: y, Radius: 120, CreatedAt: ts, TriggerAt: ts + 800, ExpiresAt: ts + 4800, NextTickAt: ts + 800, Triggered: map[string]bool{}})
	gs.addEffect("shadow_root_cast", x, y, 0, 0, 120, 0, 0, 0, "#75d947", 0, 4800)
	return true
}

func (gs *GameState) useNewHeroGadget(p *player.Player, ts int64) bool {
	if p == nil || p.GadgetCharges <= 0 {
		return false
	}
	switch p.HeroName {
	case "Shadow":
		originX, originY := p.X, p.Y
		gs.vaultMove(p, p.Rotation, 320)
		for _, target := range gs.Players {
			if target.CanBulletHurt(p.PlayerId, p.Team) && math.Hypot(target.X-originX, target.Y-originY) <= 75+target.Radius {
				gs.SporeStacks[target.PlayerId] = int(math.Min(3, float64(gs.SporeStacks[target.PlayerId]+2)))
				target.BlindUntil = ts + 5000
			}
		}
		gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: p.PlayerId, Kind: "shadow_spore_cloud", X: originX, Y: originY, Radius: 75, CreatedAt: ts, NextTickAt: ts + 500, ExpiresAt: ts + 5000, Triggered: map[string]bool{}})
		gs.addEffect("shadow_spore_cloud", originX, originY, 0, 0, 75, p.Rotation, 0, 0, "#75d947", 0, 5000)
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
				if gs.LightMarkedUntil[target.PlayerId] > ts { target.StunUntil = ts + 1000 }
			}
		}
		gs.addEffect("mina_air_wave", p.X, p.Y, 0, 0, 135, 0, 0, 0, p.Color, 0, 450)
	case "Kaze":
		p.StealthUntil = ts + 3000
		gs.addEffect("kaze_veil_step", p.X, p.Y, 0, 0, 74, p.Rotation, 0, 0, "#d7b8ff", 0, 700)
	case "Damian":
		totem := gs.Totems[p.PlayerId]
		if totem == nil {
			return false
		}
		p.X, totem.X = totem.X, p.X
		p.Y, totem.Y = totem.Y, p.Y
		gs.radialDamage(p.PlayerId, p.X, p.Y, 105, 100)
		gs.addEffect("damian_swap", p.X, p.Y, totem.X, totem.Y, 45, 0, 0, 0, p.Color, 0, 500)
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
					gs.dealPlayerDamage(p, target, 500)
					target.SlowUntil = ts + 2000
				}
			}
		}
		gs.HeroZones = keptZones
		if !detonated {
			return false
		}
		gs.addEffect("lumi_seedburst", p.X, p.Y, 0, 0, 105, 0, 0, 0, "#f07bd0", 500, 600)
	default:
		p.GadgetArmed = true
		switch p.HeroName {
		case "Brock Zeus":
			gs.addEffect("zeus_thunderbrand", p.X, p.Y, 0, 0, 68, p.Rotation, 0, 0, "#9eeaff", 0, 650)
	case "Wukong Mico":
		p.ShieldHP, p.StoneArmorUntil = 300, ts+4000
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
		if z.Kind == "shadow_roots" {
			for _, target := range gs.Players {
				owner := gs.Players[z.Owner]
				if owner != nil && target.CanBulletHurt(owner.PlayerId, owner.Team) && !z.Triggered[target.PlayerId] && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					target.StunUntil = now + 1500
					z.Triggered[target.PlayerId] = true
				}
			}
		}
		if z.Kind == "shadow_spore_cloud" && now >= z.NextTickAt {
			for _, target := range gs.Players {
				owner := gs.Players[z.Owner]
				if owner != nil && target.CanBulletHurt(owner.PlayerId, owner.Team) && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					gs.SporeStacks[target.PlayerId]++
					if gs.SporeStacks[target.PlayerId] > 3 { gs.SporeStacks[target.PlayerId] = 3 }
				}
			}
			z.NextTickAt = now + 500
		}
		if z.Kind == "mandy_stance" {
			owner := gs.Players[z.Owner]
			for _, target := range gs.Players {
				if owner != nil && target.CanBulletHurt(owner.PlayerId, owner.Team) && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					target.SlowUntil = now + 250
				}
			}
		}
		if z.Kind == "mina_heal" && now >= z.NextTickAt {
			owner := gs.Players[z.Owner]
			for _, target := range gs.Players {
				if target.IsAlive() && owner != nil && (target.PlayerId == owner.PlayerId || (owner.Team != "" && target.Team == owner.Team)) && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					target.Lives = int(math.Min(float64(target.MaxLives), float64(target.Lives+320)))
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
		gs.radialDamage(s.Owner, s.X, s.Y, 62, 2100)
		gs.destroyWallsInRadius(s.X, s.Y, 62)
		gs.addEffect("zeus_lightning_strike", s.X, s.Y, 0, 0, 62, 0, 0, 0, "#b9efff", 2100, 450)
		if s.Impact == 5 {
			gs.DamageZones = append(gs.DamageZones, &DamageZone{Owner: s.Owner, X: s.X, Y: s.Y, Radius: 100, Damage: 300, TicksLeft: 5, NextTickAt: now, Interval: 1000, ExpiresAt: now + 5000, Kind: "zeus_fire"})
			gs.addEffect("zeus_burning_ground", s.X, s.Y, 0, 0, 100, 0, 0, 0, "#ff9a4d", 300, 5000)
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
			gs.radialDamage(f.Owner, f.X, f.Y, 125, 3000)
			gs.knockbackEnemies(p, 125, 120)
			gs.addEffect("mico_skyfall", f.X, f.Y, 0, 0, 125, 0, 0, 0, p.Color, 3000, 700)
		}
	}
	gs.Skyfalls = falls
	for owner, t := range gs.Totems {
		if t == nil || t.HP <= 0 || now >= t.ExpiresAt {
			delete(gs.Totems, owner)
			continue
		}
		if now < t.NextShotAt {
			continue
		}
		source := gs.Players[owner]
		if source == nil {
			delete(gs.Totems, owner)
			continue
		}
		var best *player.Player
		bestD := 420.0
		for _, candidate := range gs.Players {
			if candidate.CanBulletHurt(source.PlayerId, source.Team) {
				if d := math.Hypot(candidate.X-t.X, candidate.Y-t.Y); d < bestD {
					best, bestD = candidate, d
				}
			}
		}
		if best != nil {
			ghost := *source
			ghost.X, ghost.Y = t.X, t.Y
			gs.spawnAttackBullet(&ghost, math.Atan2(best.Y-t.Y, best.X-t.X), "damian_totem_orb", 550, 320, 7, 430, 0, false, false)
		}
		t.NextShotAt = now + 850
	}
}

func (gs *GameState) finishNewHeroProjectile(b *bullet.Bullet) {
	if b == nil || (b.Kind != "zeus_lightning" && b.Kind != "zeus_lightning_fire") {
		return
	}
	gs.radialDamage(b.PlayerId, b.X, b.Y, 72, b.Damage)
	gs.addEffect("zeus_lightning_blast", b.X, b.Y, 0, 0, 72, 0, 0, 0, b.Color, b.Damage, 420)
	if b.Kind == "zeus_lightning_fire" {
		now := time.Now().UnixMilli()
		gs.DamageZones = append(gs.DamageZones, &DamageZone{Owner: b.PlayerId, X: b.X, Y: b.Y, Radius: 62, Damage: 300, TicksLeft: 4, NextTickAt: now, Interval: 500, ExpiresAt: now + 2100, Kind: "zeus_fire", Color: "#66cfff"})
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
