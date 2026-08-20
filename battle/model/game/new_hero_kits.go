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
	KattyPaintBonusMultiplier = .30
	KattySprayRange           = 220.0
	KattySprayCloudRadius     = 58.0
	KattySprayCloudDuration   = 1800 * time.Millisecond
	KattySprayCloudTick       = 400 * time.Millisecond
	KattySprayCloudDamage     = 6
	KattySprayCloudTicks      = 4
	KattySprayCloudSlow       = .72
	KattySuperRadius          = 220.0
	KattySuperDuration        = 7500 * time.Millisecond
	KattySuperImpactDamage    = 70
	KattySuperPuddleDamage    = 12
	KattySuperPuddleTick      = 600 * time.Millisecond
	KattySuperPuddleTicks     = 10
	KattyPaintTrailWidth      = 42.0

	// Active skill windows are deliberately short enough to leave counterplay;
	// no hero skill may persist longer than this cap.
	MaxHeroSkillDuration = 15 * time.Second

	NeedleSporeSlowDuration       = 2 * time.Second
	NeedleMoistureDuration        = 3 * time.Second
	NeedleMoistureTick            = 500 * time.Millisecond
	NeedleMoistureHealFraction    = .05
	KazeComboWindow               = 2 * time.Second
	KazeEmpoweredDamageMultiplier = 1.75
	MeleeSkillStunDuration        = 1 * time.Second
	MandyFocusedDamageMultiplier  = 1.5
	MandyStaffStunDuration        = 250 * time.Millisecond
	MicoVortexBaseDuration        = 3 * time.Second
	MicoVortexDurationPerRage     = 400 * time.Millisecond
	MicoVortexBaseRadius          = 150.0
	MicoVortexRadiusPerRage       = 18.0
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
	Target                                      string
	X, Y, Radius                                float64
	ToX, ToY, Width                             float64
	CreatedAt, ExpiresAt, NextTickAt, TriggerAt int64
	Triggered                                   map[string]bool
	ImpactDone                                  bool
	Visual                                      *BattleEffect
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
func (KazeKit) AttackRange() float64           { return heroAttackConfigs["Kaze"].Range }
func (WukongMicoKit) AimShape() string         { return "cone" }
func (WukongMicoKit) AttackRange() float64     { return heroAttackConfigs["Wukong Mico"].Range }
func (PersephoneLumiKit) AimShape() string     { return "cone" }
func (PersephoneLumiKit) AttackRange() float64 { return heroAttackConfigs["Persephone Lumi"].Range }
func (KattyKit) AimShape() string              { return "line" }
func (KattyKit) AttackRange() float64          { return KattySprayRange }

func (KattyKit) Basic(gs *GameState, p *player.Player, ts int64, angle, _ float64) {
	shot := gs.spawnAttackBullet(p, angle, "katty_paint_spray", p.AttackDmg, 30*RuntimeProjectileSpeedScale, 10, KattyKit{}.AttackRange(), 0, false, false)
	shot.Splash = heroAttackConfigs["Katty"].SplashRadius
	shot.CommandID = gs.activeCommandID
	gs.addEffect("katty_paint_spray", p.X, p.Y, 0, 0, KattyKit{}.AttackRange(), angle, 0, .20, p.Color, p.AttackDmg, 260)
}

func (KattyKit) Super(gs *GameState, p *player.Player, ts int64, angle, distance float64) bool {
	distance = math.Max(80, math.Min(480, distance))
	x, y := p.X+math.Cos(angle)*distance, p.Y+math.Sin(angle)*distance
	if gs.Map != nil {
		clamped := gs.Map.ClampCircle(&geometry.CircleBody{X: x, Y: y, Radius: 8})
		x, y = clamped.X, clamped.Y
	}
	duration := KattySuperDuration.Milliseconds()
	gs.HeroZones = append(gs.HeroZones, &HeroZone{
		Owner: p.PlayerId, Kind: "katty_paint_puddle", X: x, Y: y, Radius: KattySuperRadius,
		CreatedAt: ts, TriggerAt: ts + 500, ExpiresAt: ts + duration, NextTickAt: ts, Triggered: map[string]bool{},
	})
	gs.DamageZones = append(gs.DamageZones, &DamageZone{
		Owner: p.PlayerId, Kind: "katty_paint_puddle", X: x, Y: y, Radius: KattySuperRadius,
		Damage: KattySuperPuddleDamage, TicksLeft: KattySuperPuddleTicks,
		NextTickAt: ts + 650, Interval: KattySuperPuddleTick.Milliseconds(), ExpiresAt: ts + duration,
		Color: p.Color,
	})
	gs.addEffect("katty_paint_grenade", p.X, p.Y, x, y, 26, angle, distance, 0, p.Color, p.AttackDmg, 500)
	return true
}

func (gs *GameState) kattyPaintStacks(owner, target string) int {
	if gs == nil || gs.KattyPaintStacks == nil || gs.KattyPaintStacks[owner] == nil {
		return 0
	}
	return gs.KattyPaintStacks[owner][target]
}

func (gs *GameState) applyKattyPaint(source, target *player.Player, ts int64, layers int, blind bool) {
	if gs == nil || source == nil || target == nil || layers <= 0 || !target.IsAlive() {
		return
	}
	if gs.KattyPaintStacks == nil {
		gs.KattyPaintStacks = make(map[string]map[string]int)
	}
	if gs.KattyPaintUntil == nil {
		gs.KattyPaintUntil = make(map[string]map[string]int64)
	}
	if gs.KattyPaintStacks[source.PlayerId] == nil {
		gs.KattyPaintStacks[source.PlayerId] = make(map[string]int)
	}
	if gs.KattyPaintUntil[source.PlayerId] == nil {
		gs.KattyPaintUntil[source.PlayerId] = make(map[string]int64)
	}
	stacks := gs.KattyPaintStacks[source.PlayerId][target.PlayerId] + layers
	gs.KattyPaintUntil[source.PlayerId][target.PlayerId] = ts + 5000
	if stacks < 3 {
		gs.KattyPaintStacks[source.PlayerId][target.PlayerId] = stacks
		return
	}
	gs.KattyPaintStacks[source.PlayerId][target.PlayerId] = 0
	gs.KattyPaintUntil[source.PlayerId][target.PlayerId] = 0
	if target.StunUntil < ts+800 {
		target.StunUntil = ts + 800
	}
	if blind && target.BlindUntil < ts+2500 {
		target.BlindUntil = ts + 2500
	}
	bonus := int(math.Round(float64(source.AttackDmg) * KattyPaintBonusMultiplier))
	if bonus > 0 {
		gs.dealPlayerDamage(source, target, bonus)
	}
	gs.addEffect("katty_paint_stick", target.X, target.Y, 0, 0, target.Radius+16, 0, 0, 0, source.Color, bonus, 800)
}

func (gs *GameState) spawnKattyPaintCloud(source *player.Player, x, y float64, ts int64) {
	if gs == nil || source == nil {
		return
	}
	expiresAt := ts + KattySprayCloudDuration.Milliseconds()
	gs.HeroZones = append(gs.HeroZones, &HeroZone{
		Owner: source.PlayerId, Kind: "katty_paint_cloud", X: x, Y: y, Radius: KattySprayCloudRadius,
		CreatedAt: ts, ExpiresAt: expiresAt, NextTickAt: ts, Triggered: map[string]bool{},
	})
	gs.DamageZones = append(gs.DamageZones, &DamageZone{
		Owner: source.PlayerId, X: x, Y: y, Radius: KattySprayCloudRadius,
		Damage: KattySprayCloudDamage, TicksLeft: KattySprayCloudTicks,
		NextTickAt: ts + 250, Interval: KattySprayCloudTick.Milliseconds(), ExpiresAt: expiresAt,
		Kind: "katty_paint_cloud", Color: source.Color,
	})
	gs.addEffect("katty_paint_cloud", x, y, 0, 0, KattySprayCloudRadius, 0, 0, 0, source.Color, KattySprayCloudDamage, KattySprayCloudDuration.Milliseconds())
}

func (gs *GameState) resolveKattySuperImpact(owner *player.Player, zone *HeroZone, ts int64) {
	if gs == nil || owner == nil || zone == nil {
		return
	}
	for _, target := range gs.Players {
		if !target.CanBulletHurt(owner.PlayerId, owner.Team) || math.Hypot(target.X-zone.X, target.Y-zone.Y) > zone.Radius+target.Radius {
			continue
		}
		if gs.dealPlayerDamage(owner, target, KattySuperImpactDamage) > 0 {
			gs.applyKattyPaint(owner, target, ts, 3, true)
		}
		zone.Triggered[target.PlayerId] = true
	}
	for id, target := range gs.Monsters {
		if target == nil || !target.IsAlive() || math.Hypot(target.X-zone.X, target.Y-zone.Y) > zone.Radius+target.Radius {
			continue
		}
		gs.damageMonster(id, target, KattySuperImpactDamage)
	}
	for _, crate := range gs.Props {
		if crate == nil || !crate.Active || !isBreakableCrate(crate) || math.Hypot(crate.X-zone.X, crate.Y-zone.Y) > zone.Radius+crate.Radius {
			continue
		}
		gs.damageCrate(owner, crate, KattySuperImpactDamage)
	}
	gs.addEffect("katty_paint_impact", zone.X, zone.Y, 0, 0, 150, 0, 0, 0, owner.Color, KattySuperImpactDamage, 520)
}

func (gs *GameState) damageKattyPuddle(zone *DamageZone) int {
	if gs == nil || zone == nil {
		return 0
	}
	hits := 0
	source := gs.Players[zone.Owner]
	if source == nil {
		return 0
	}
	for _, target := range gs.Players {
		if !target.CanBulletHurt(source.PlayerId, source.Team) || math.Hypot(target.X-zone.X, target.Y-zone.Y) > zone.Radius+target.Radius {
			continue
		}
		if gs.dealPlayerDamage(source, target, zone.Damage) > 0 {
			hits++
		}
	}
	for id, target := range gs.Monsters {
		if target == nil || !target.IsAlive() || math.Hypot(target.X-zone.X, target.Y-zone.Y) > zone.Radius+target.Radius {
			continue
		}
		gs.damageMonster(id, target, zone.Damage)
		hits++
	}
	for _, crate := range gs.Props {
		if crate == nil || !crate.Active || !isBreakableCrate(crate) || math.Hypot(crate.X-zone.X, crate.Y-zone.Y) > zone.Radius+crate.Radius {
			continue
		}
		if gs.damageCrate(source, crate, zone.Damage) {
			hits++
		}
	}
	return hits
}

func (gs *GameState) resolveKattyPaintSprayImpact(shot *bullet.Bullet) {
	if gs == nil || shot == nil {
		return
	}
	source := gs.Players[shot.PlayerId]
	if source == nil {
		return
	}
	radius := shot.Splash
	if radius <= 0 {
		radius = KattySprayCloudRadius
	}
	damage := int(math.Max(1, float64(shot.Damage)))
	now := time.Now().UnixMilli()

	for _, target := range gs.Players {
		if !target.CanBulletHurt(source.PlayerId, source.Team) || math.Hypot(target.X-shot.X, target.Y-shot.Y) > radius+target.Radius {
			continue
		}
		distance := math.Max(1, math.Hypot(target.X-shot.X, target.Y-shot.Y))
		target.HitImpulseX, target.HitImpulseY = (target.X-shot.X)/distance, (target.Y-shot.Y)/distance
		if gs.dealPlayerDamage(source, target, damage) > 0 {
			gs.applyKattyPaint(source, target, now, 1, false)
		}
	}
	for id, target := range gs.Monsters {
		if target == nil || !target.IsAlive() || math.Hypot(target.X-shot.X, target.Y-shot.Y) > radius+target.Radius {
			continue
		}
		gs.damageMonster(id, target, damage)
	}
	for _, crate := range gs.Props {
		if crate == nil || !crate.Active || !isBreakableCrate(crate) || math.Hypot(crate.X-shot.X, crate.Y-shot.Y) > radius+crate.Radius {
			continue
		}
		gs.damageCrate(source, crate, damage)
	}
	gs.spawnKattyPaintCloud(source, shot.X, shot.Y, now)
}

func (MinaKit) Basic(gs *GameState, p *player.Player, _ int64, angle, _ float64) {
	spawnConfiguredFan(gs, p, angle, heroAttackConfigs[p.HeroName])
}
func (MinaKit) Super(gs *GameState, p *player.Player, ts int64, _, _ float64) bool {
	target := p
	if id := gs.AbilityTargets[p.PlayerId]; id != "" && gs.Players[id] != nil && gs.Players[id].Team == p.Team {
		target = gs.Players[id]
	} else {
		bestHealthRatio := float64(p.Lives) / math.Max(1, float64(p.MaxLives))
		for _, candidate := range gs.Players {
			if candidate == nil || !candidate.IsAlive() || candidate.Team != p.Team || math.Hypot(candidate.X-p.X, candidate.Y-p.Y) > 600 {
				continue
			}
			healthRatio := float64(candidate.Lives) / math.Max(1, float64(candidate.MaxLives))
			if healthRatio < bestHealthRatio {
				target, bestHealthRatio = candidate, healthRatio
			}
		}
	}
	target.ShieldHP = 400
	duration := cappedSkillDuration(4 * time.Second)
	target.ShieldUntil = ts + duration
	visual := gs.addEffect("mina_healing_aura", target.X, target.Y, 0, 0, 160, 0, 0, 0, "#ff9bea", 0, duration)
	gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: p.PlayerId, Target: target.PlayerId, Kind: "mina_heal", X: target.X, Y: target.Y, Radius: 160, CreatedAt: ts, ExpiresAt: ts + duration, NextTickAt: ts, Triggered: map[string]bool{}, Visual: visual})
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
		gs.addEffect("zeus_beam_hole", p.X, p.Y, p.X+math.Cos(angle)*800, p.Y+math.Sin(angle)*800, 20, angle, 800, 0, p.Color, p.AttackDmg, 600)
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
		strike := &LightningStrike{Owner: p.PlayerId, X: cx + math.Cos(a)*75, Y: cy + math.Sin(a)*75, TriggerAt: ts + 1000 + int64(i)*400, Impact: i}
		gs.LightningStrikes = append(gs.LightningStrikes, strike)
		warningRadius := 62.0
		if i == 2 {
			warningRadius = 90
		}
		gs.addEffect("zeus_strike_warning", strike.X, strike.Y, 0, 0, warningRadius, 0, 0, 0, "#b9efff", 0, strike.TriggerAt-ts)
	}
	gs.addEffect("zeus_storm_target", cx, cy, 0, 0, 150, 0, 0, 0, "#75d8ff", 0, 2100)
	return true
}

func (KazeKit) Basic(gs *GameState, p *player.Player, ts int64, angle, _ float64) {
	config := heroAttackConfigs["Kaze"]
	if ts > p.KazeComboUntil {
		p.KazeCombo = 0
	}
	empowered := p.KazeCritReady || p.KazeCombo >= 2
	damage := p.AttackDmg
	if empowered {
		damage = int(math.Round(float64(p.AttackDmg) * KazeEmpoweredDamageMultiplier))
		p.KazeCritReady = false
	}
	hits := gs.hitSector(p, angle, config.Range, config.HalfArcDegrees*math.Pi/180, damage, false)
	if empowered {
		p.KazeCombo, p.KazeComboUntil = 0, 0
	} else if hits > 0 {
		p.KazeCombo++
		p.KazeComboUntil = ts + KazeComboWindow.Milliseconds()
	}
	gs.addEffect("kaze_cross_slash", p.X, p.Y, 0, 0, config.Range, angle, config.Range, config.HalfArcDegrees*math.Pi/180, p.Color, damage, 260)
}
func (KazeKit) Super(gs *GameState, p *player.Player, ts int64, angle, _ float64) bool {
	startX, startY := p.X, p.Y
	gs.vaultMove(p, angle, 320)
	hit := false
	for _, target := range gs.Players {
		if target.CanBulletHurt(p.PlayerId, p.Team) && segmentHitsCircle(startX, startY, p.X, p.Y, target.X, target.Y, target.Radius+18) {
			hit = true
			gs.dealPlayerDamage(p, target, 160)
			target.StunUntil = max(target.StunUntil, ts+MeleeSkillStunDuration.Milliseconds())
			p.KazeCombo, p.KazeComboUntil = 2, ts+KazeComboWindow.Milliseconds()
		}
	}
	if hit {
		gs.addEffect("kaze_followup_ready", p.X, p.Y, 0, 0, 74, 0, 0, 0, "#d7b8ff", 0, KazeComboWindow.Milliseconds())
	}
	gs.addEffect("kaze_dash", startX, startY, p.X, p.Y, 25, angle, 320, 0, p.Color, 160, 450)
	return true
}

func (WukongMicoKit) Basic(gs *GameState, p *player.Player, ts int64, angle, _ float64) {
	config := heroAttackConfigs["Wukong Mico"]
	reach := config.Range
	halfArc := config.HalfArcDegrees * math.Pi / 180
	hits := gs.hitSector(p, angle, reach, halfArc, p.AttackDmg, false)
	if hits > 0 {
		p.MicoRage = int(math.Min(5, float64(p.MicoRage+1)))
	}
	if p.GadgetArmed {
		for _, target := range gs.Players {
			if target.CanBulletHurt(p.PlayerId, p.Team) &&
				gs.autoAimHitsTarget(p, target.X, target.Y, meleeTargetRadius(p, target), angle, reach, halfArc) {
				target.SlowUntil = ts + 2000
				target.SlowMultiplier = .60
			}
		}
		p.GadgetArmed = false
	}
	gs.addEffect("mico_staff_swing", p.X, p.Y, 0, 0, reach, angle, reach, halfArc, p.Color, p.AttackDmg, 360)
}
func (WukongMicoKit) Super(gs *GameState, p *player.Player, ts int64, angle, distance float64) bool {
	if distance > 0 {
		leapDistance := math.Min(140, math.Max(0, distance*.5))
		startX, startY := p.X, p.Y
		gs.vaultMove(p, angle, leapDistance)
		gs.addEffect("mico_leap", startX, startY, p.X, p.Y, 24, angle, leapDistance, 0, p.Color, 0, 360)
	}
	rage := p.MicoRage
	duration := cappedSkillDuration(MicoVortexBaseDuration + time.Duration(rage)*MicoVortexDurationPerRage)
	radius := MicoVortexBaseRadius + float64(rage)*MicoVortexRadiusPerRage
	damage := 100 + rage*15
	p.MicoRage = 0
	p.VortexUntil = ts + duration
	p.VortexRadius = radius
	p.VortexDamage = 4 + rage*2
	gs.radialDamage(p.PlayerId, p.X, p.Y, radius, damage)
	for _, target := range gs.Players {
		if target.CanBulletHurt(p.PlayerId, p.Team) && math.Hypot(target.X-p.X, target.Y-p.Y) <= radius+target.Radius {
			target.StunUntil = max(target.StunUntil, ts+MeleeSkillStunDuration.Milliseconds())
		}
	}
	gs.addEffect("mico_staff_spin", p.X, p.Y, 0, 0, radius, angle, radius, math.Pi, p.Color, damage, duration)
	return true
}

func (PersephoneLumiKit) Basic(gs *GameState, p *player.Player, ts int64, angle, _ float64) {
	config := heroAttackConfigs["Persephone Lumi"]
	reach := config.Range
	halfArc := config.HalfArcDegrees * math.Pi / 180
	gs.hitSector(p, angle, reach, halfArc, p.AttackDmg, false)
	flowerX := p.X + math.Cos(angle)*reach
	flowerY := p.Y + math.Sin(angle)*reach
	gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: p.PlayerId, Kind: "lumi_flower", X: flowerX, Y: flowerY, Radius: 70, CreatedAt: ts, ExpiresAt: ts + 6000, Triggered: map[string]bool{}})
	gs.addEffect("lumi_scythe_swing", p.X, p.Y, 0, 0, reach, angle, reach, halfArc, p.Color, p.AttackDmg, 320)
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
	gs.spawnAttackBullet(p, angle, "spore", p.AttackDmg, p.BulletSpd, p.BulletSz, 620, 0, false, false)
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
		duration := cappedSkillDuration(NeedleMoistureDuration)
		gs.HeroZones = append(gs.HeroZones, &HeroZone{
			Owner: p.PlayerId, Kind: "needle_moisture_reserve", X: p.X, Y: p.Y, Radius: 42,
			CreatedAt: ts, NextTickAt: ts + NeedleMoistureTick.Milliseconds(), ExpiresAt: ts + duration + 1,
			Triggered: map[string]bool{},
		})
		gs.addEffect("needle_moisture_reserve", p.X, p.Y, 0, 0, 42, p.Rotation, 0, 0, "#75d947", 0, duration)
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
					gs.LightMarkedUntil[target.PlayerId] = 0
					target.Marks = 0
					gs.addEffect("mina_mark_break", target.X, target.Y, 0, 0, target.Radius+18, 0, 0, 0, "#ffb5f2", 0, 420)
				}
			}
		}
		gs.addEffect("mina_air_wave", p.X, p.Y, 0, 0, 135, 0, 0, 0, p.Color, 0, 450)
	case "Kaze":
		p.StealthUntil = ts + cappedSkillDuration(3*time.Second)
		gs.addEffect("kaze_veil_step", p.X, p.Y, 0, 0, 74, p.Rotation, 0, 0, "#d7b8ff", 0, 700)
	case "Katty":
		originX, originY := p.X, p.Y
		// Paint Flight is the only Katty movement that phases through walls.
		// Normal movement still goes through updatePlayerMovement and remains
		// blocked by the map collision hash.
		p.X += math.Cos(p.Rotation) * 320
		p.Y += math.Sin(p.Rotation) * 320
		if gs.Map != nil {
			clamped := gs.Map.ClampCircle(&geometry.CircleBody{X: p.X, Y: p.Y, Radius: p.Radius})
			p.X, p.Y = clamped.X, clamped.Y
		}
		for _, target := range gs.Players {
			if target.CanBulletHurt(p.PlayerId, p.Team) && segmentHitsCircle(originX, originY, p.X, p.Y, target.X, target.Y, target.Radius+18) {
				gs.applyKattyPaint(p, target, ts, 2, false)
			}
		}
		gs.HeroZones = append(gs.HeroZones, &HeroZone{
			Owner: p.PlayerId, Kind: "katty_paint_trail", X: originX, Y: originY,
			ToX: p.X, ToY: p.Y, Radius: KattyPaintTrailWidth, Width: KattyPaintTrailWidth, CreatedAt: ts, ExpiresAt: ts + 4000,
			Triggered: map[string]bool{},
		})
		gs.addEffect("katty_paint_trail", originX, originY, p.X, p.Y, 34, p.Rotation, 320, 0, p.Color, 0, 4000)
	case "Persephone Lumi":
		detonated := false
		affected := make(map[string]*player.Player)
		keptZones := gs.HeroZones[:0]
		for _, zone := range gs.HeroZones {
			if zone.Owner != p.PlayerId || (zone.Kind != "lumi_roots" && zone.Kind != "lumi_flower") {
				keptZones = append(keptZones, zone)
				continue
			}
			detonated = true
			for _, target := range gs.Players {
				if target.CanBulletHurt(p.PlayerId, p.Team) && math.Hypot(target.X-zone.X, target.Y-zone.Y) <= zone.Radius+target.Radius {
					affected[target.PlayerId] = target
				}
			}
			gs.addEffect("lumi_seedburst", zone.X, zone.Y, 0, 0, zone.Radius, 0, 0, 0, "#f07bd0", 35, 600)
		}
		gs.HeroZones = keptZones
		if !detonated {
			return false
		}
		for _, target := range affected {
			gs.dealPlayerDamage(p, target, 55)
			target.SlowUntil = ts + 2000
		}
	default:
		p.GadgetArmed = true
		switch p.HeroName {
		case "Brock Zeus":
			gs.addEffect("zeus_thunderbrand", p.X, p.Y, 0, 0, 68, p.Rotation, 0, 0, "#9eeaff", 0, 650)
		case "Wukong Mico":
			p.ShieldHP, p.StoneArmorUntil = 30, ts+4000
			p.ShieldUntil = ts + 4000
			gs.addEffect("mico_ruyi_bind", p.X, p.Y, 0, 0, 72, p.Rotation, 0, 0, "#ffd35a", 0, 4000)
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
				if owner != nil && target.CanBulletHurt(owner.PlayerId, owner.Team) && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					target.SlowUntil = now + 450
					target.SlowMultiplier = 0.55
					if !z.Triggered[target.PlayerId] {
						target.StunUntil = now + 1500
						z.Triggered[target.PlayerId] = true
						gs.addEffect("needle_root_burst", target.X, target.Y, 0, 0, target.Radius+22, 0, 0, 0, "#75d947", 0, 520)
					}
				}
			}
		}
		if z.Kind == "needle_moisture_reserve" {
			owner := gs.Players[z.Owner]
			if owner == nil || !owner.IsAlive() {
				continue
			}
			if now >= z.NextTickAt {
				heal := int(math.Ceil(float64(owner.MaxLives) * NeedleMoistureHealFraction))
				owner.Lives = int(math.Min(float64(owner.MaxLives), float64(owner.Lives+heal)))
				z.NextTickAt += NeedleMoistureTick.Milliseconds()
			}
		}
		if z.Kind == "mina_heal" && now >= z.NextTickAt {
			owner := gs.Players[z.Owner]
			if anchor := gs.Players[z.Target]; anchor != nil && anchor.IsAlive() {
				z.X, z.Y = anchor.X, anchor.Y
				if z.Visual != nil {
					z.Visual.X, z.Visual.Y = z.X, z.Y
				}
			}
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
				if owner != nil && target.CanBulletHurt(owner.PlayerId, owner.Team) && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					// The garden is a control zone: the first entry roots, while
					// staying inside keeps a readable slow refreshed every tick.
					target.SlowUntil = now + 350
					target.SlowMultiplier = .60
					if !z.Triggered[target.PlayerId] {
						target.StunUntil = now + 2000
						z.Triggered[target.PlayerId] = true
					}
				}
			}
		}
		if z.Kind == "lumi_flower" {
			owner := gs.Players[z.Owner]
			for _, target := range gs.Players {
				if owner != nil && target.CanBulletHurt(owner.PlayerId, owner.Team) && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					target.SlowUntil = now + 250
					target.SlowMultiplier = .75
					target.RevealedUntil = now + 2000
				}
			}
		}
		if z.Kind == "katty_paint_puddle" {
			owner := gs.Players[z.Owner]
			if z.Visual == nil && owner != nil {
				z.Visual = gs.addEffect("katty_paint_puddle", z.X, z.Y, 0, 0, z.Radius, 0, 0, 0, owner.Color, 0, z.ExpiresAt-now)
			}
			if owner != nil && !z.ImpactDone {
				gs.resolveKattySuperImpact(owner, z, now)
				z.ImpactDone = true
			}
			for _, target := range gs.Players {
				if owner != nil && target.CanBulletHurt(owner.PlayerId, owner.Team) && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					if !z.Triggered[target.PlayerId] {
						gs.applyKattyPaint(owner, target, now, 3, true)
						z.Triggered[target.PlayerId] = true
					}
					target.SlowUntil = now + 250
					target.SlowMultiplier = .80
				}
			}
		}
		if z.Kind == "katty_paint_cloud" {
			owner := gs.Players[z.Owner]
			for _, target := range gs.Players {
				if owner != nil && target.CanBulletHurt(owner.PlayerId, owner.Team) && math.Hypot(target.X-z.X, target.Y-z.Y) <= z.Radius+target.Radius {
					target.SlowUntil = now + 350
					target.SlowMultiplier = KattySprayCloudSlow
				}
			}
		}
		if z.Kind == "katty_paint_trail" {
			owner := gs.Players[z.Owner]
			for _, target := range gs.Players {
				if owner == nil || !segmentHitsCircle(z.X, z.Y, z.ToX, z.ToY, target.X, target.Y, z.Width+target.Radius) {
					continue
				}
				if target.PlayerId == owner.PlayerId {
					owner.HasteUntil = now + 250
					continue
				}
				if target.CanBulletHurt(owner.PlayerId, owner.Team) {
					target.SlowUntil = now + 250
					target.SlowMultiplier = .75
				}
			}
		}
		zones = append(zones, z)
	}
	for owner, targets := range gs.KattyPaintUntil {
		for target, expiresAt := range targets {
			if expiresAt > 0 && expiresAt <= now {
				delete(targets, target)
				if gs.KattyPaintStacks[owner] != nil {
					delete(gs.KattyPaintStacks[owner], target)
				}
			}
		}
	}
	for _, p := range gs.Players {
		if p != nil && p.StoneArmorUntil > 0 && p.StoneArmorUntil <= now {
			if p.SuppressedRage > 0 {
				p.MicoRage = int(math.Min(5, float64(p.MicoRage+int(math.Ceil(float64(p.SuppressedRage)/60)))))
				gs.addEffect("mico_suppressed_rage", p.X, p.Y, 0, 0, 72, 0, 0, 0, p.Color, 0, 650)
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
		radius, damage := 62.0, 60
		if s.Impact == 2 {
			radius, damage = 90, 80
			gs.destroyWallsInRadius(s.X, s.Y, radius)
		}
		gs.radialDamage(s.Owner, s.X, s.Y, radius, damage)
		gs.addEffect("zeus_lightning_strike", s.X, s.Y, 0, 0, radius, 0, 0, 0, "#b9efff", damage, 450)
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
	if b == nil {
		return
	}
	if b.Kind == "lumi_orb" {
		now := time.Now().UnixMilli()
		b.Kind = "lumi_spent"
		gs.HeroZones = append(gs.HeroZones, &HeroZone{Owner: b.PlayerId, Kind: "lumi_flower", X: b.X, Y: b.Y, Radius: 70, CreatedAt: now, ExpiresAt: now + 6000, Triggered: map[string]bool{}})
		gs.addEffect("lumi_flower", b.X, b.Y, 0, 0, 70, 0, 0, 0, b.Color, 0, 6000)
		return
	}
	if b.Kind != "zeus_lightning" && b.Kind != "zeus_lightning_fire" {
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
