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
	CreatedAt, ExpiresAt, NextTickAt int64
	Triggered                        map[string]bool
}

type LightningStrike struct {
	Owner     string
	X, Y      float64
	TriggerAt int64
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
func (WukongMicoKit) AimShape() string         { return "lob" }
func (WukongMicoKit) AttackRange() float64     { return 100 }
func (DamianKit) AimShape() string             { return "line" }
func (DamianKit) AttackRange() float64         { return 640 }
func (PersephoneLumiKit) AimShape() string     { return "line" }
func (PersephoneLumiKit) AttackRange() float64 { return 600 }

func (MinaKit) Basic(gs *GameState, p *player.Player, _ int64, angle, _ float64) {
	spawnConfiguredFan(gs, p, angle, heroAttackConfigs[p.HeroName])
}
func (MinaKit) Super(gs *GameState, p *player.Player, ts int64, _, _ float64) bool {
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
		gs.LightningStrikes = append(gs.LightningStrikes, &LightningStrike{Owner: p.PlayerId, X: cx + math.Cos(a)*75, Y: cy + math.Sin(a)*75, TriggerAt: ts + 1000 + int64(i)*180})
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
			target.StunUntil = ts + 500
		}
	}
	gs.addEffect("kaze_dash", startX, startY, p.X, p.Y, 25, angle, 320, 0, p.Color, 2500, 450)
	return true
}

func (WukongMicoKit) Basic(gs *GameState, p *player.Player, ts int64, angle, _ float64) {
	p.InvulnerableUntil = ts + 420
	gs.vaultMove(p, angle, 100)
	gs.radialDamage(p.PlayerId, p.X, p.Y, 82, p.AttackDmg)
	if p.GadgetArmed {
		for _, target := range gs.Players {
			if target.CanBulletHurt(p.PlayerId, p.Team) && math.Hypot(target.X-p.X, target.Y-p.Y) <= 82+target.Radius {
				target.SlowUntil = ts + 2000
			}
		}
		p.GadgetArmed = false
	}
	gs.addEffect("mico_jump_slam", p.X, p.Y, 0, 0, 82, angle, 100, 0, p.Color, p.AttackDmg, 500)
}
func (WukongMicoKit) Super(gs *GameState, p *player.Player, ts int64, angle, distance float64) bool {
	distance = math.Max(50, math.Min(480, distance))
	p.FlyingUntil, p.InvulnerableUntil, p.ChannelUntil = ts+3000, ts+3000, ts+3000
	gs.Skyfalls = append(gs.Skyfalls, &Skyfall{Owner: p.PlayerId, X: p.X + math.Cos(angle)*distance, Y: p.Y + math.Sin(angle)*distance, LandsAt: ts + 3000})
	gs.addEffect("mico_skyfall_target", p.X+math.Cos(angle)*distance, p.Y+math.Sin(angle)*distance, 0, 0, 125, 0, 0, 0, p.Color, 0, 3000)
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

func (gs *GameState) useNewHeroGadget(p *player.Player, ts int64) bool {
	if p == nil || p.GadgetCharges <= 0 {
		return false
	}
	switch p.HeroName {
	case "Fairy Mina":
		for _, target := range gs.Players {
			if !target.CanBulletHurt(p.PlayerId, p.Team) {
				continue
			}
			dx, dy := target.X-p.X, target.Y-p.Y
			if d := math.Hypot(dx, dy); d > 0 && d <= 135 {
				target.X += dx / d * 105
				target.Y += dy / d * 105
			}
		}
		gs.addEffect("mina_air_wave", p.X, p.Y, 0, 0, 135, 0, 0, 0, p.Color, 0, 450)
	case "Kaze":
		p.StealthUntil = ts + 3000
	case "Damian":
		totem := gs.Totems[p.PlayerId]
		if totem == nil {
			return false
		}
		p.X, totem.X = totem.X, p.X
		p.Y, totem.Y = totem.Y, p.Y
		gs.addEffect("damian_swap", p.X, p.Y, totem.X, totem.Y, 45, 0, 0, 0, p.Color, 0, 500)
	case "Persephone Lumi":
		for _, zone := range gs.HeroZones {
			if zone.Owner != p.PlayerId {
				continue
			}
			for _, target := range gs.Players {
				if target.CanBulletHurt(p.PlayerId, p.Team) && math.Hypot(target.X-zone.X, target.Y-zone.Y) <= zone.Radius+target.Radius {
					gs.dealPlayerDamage(p, target, 500)
				}
			}
		}
	default:
		p.GadgetArmed = true
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
			target.X += dx / d * force
			target.Y += dy / d * force
		}
	}
}
