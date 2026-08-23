package game

import (
	"battle/model/bullet"
	"battle/model/player"
	"math"
)

const (
	AttackProjectile   = "projectile"
	AttackBurst        = "burst"
	AttackShotgun      = "shotgun"
	AttackPiercingArea = "piercing_area"
	AttackThrower      = "thrower"
	AttackDash         = "dash"
	AttackReturning    = "returning"
	AttackMeleeCone    = "melee_cone"
)

type AttackConfig struct {
	Archetype       string  `json:"archetype"`
	AimShape        string  `json:"aimShape"`
	Range           float64 `json:"range"`
	ProjectileKind  string  `json:"projectileKind,omitempty"`
	ProjectileCount int     `json:"projectileCount,omitempty"`
	SpreadDegrees   float64 `json:"spreadDegrees,omitempty"`
	Pierce          int     `json:"pierce,omitempty"`
	Poison          bool    `json:"poison,omitempty"`
	SplashRadius    float64 `json:"splashRadius,omitempty"`
	Chain           int     `json:"chain,omitempty"`
	HalfArcDegrees  float64 `json:"halfArcDegrees,omitempty"`
	DashDistance    float64 `json:"dashDistance,omitempty"`
	FlightTimeMs    int64   `json:"flightTimeMs,omitempty"`
	ImpactRadius    float64 `json:"impactRadius,omitempty"`
	ZoneTicks       int     `json:"zoneTicks,omitempty"`
	ZoneIntervalMs  int64   `json:"zoneIntervalMs,omitempty"`
	Modifier        string  `json:"modifier,omitempty"`
}

var heroAttackConfigs = map[string]AttackConfig{
	"Needle":          {Archetype: AttackProjectile, AimShape: "line", Range: 620, ProjectileKind: "spore"},
	"Mandy":           {Archetype: AttackMeleeCone, AimShape: "cone", Range: 110, HalfArcDegrees: 60, Modifier: "mandy_focus"},
	"Fairy Mina":      {Archetype: AttackShotgun, AimShape: "cone", Range: 510, ProjectileKind: "mina_star", ProjectileCount: 3, SpreadDegrees: 24},
	"Brock Zeus":      {Archetype: AttackProjectile, AimShape: "line", Range: 760, ProjectileKind: "zeus_lightning", SplashRadius: 80},
	"Kaze":            {Archetype: AttackMeleeCone, AimShape: "cone", Range: 125, HalfArcDegrees: 60, Modifier: "kaze_double"},
	"Wukong Mico":     {Archetype: AttackMeleeCone, AimShape: "cone", Range: 140, HalfArcDegrees: 60, Modifier: "mico_staff"},
	"Persephone Lumi": {Archetype: AttackProjectile, AimShape: "line", Range: 520, ProjectileKind: "lumi_orb"},
	"Katty":           {Archetype: AttackProjectile, AimShape: "line", Range: 220, ProjectileKind: "katty_paint_spray", SplashRadius: 65, Modifier: "katty_paint_cloud"},
}

// GetAttackConfig returns the immutable wire-facing attack metadata without
// scanning the full hero catalog. Snapshot generation calls this for every
// player on every state update.
func GetAttackConfig(hero string) AttackConfig {
	return heroAttackConfigs[hero]
}

func withAttackConfigs(heroes []Hero) []Hero {
	for index := range heroes {
		heroes[index].Attack = heroAttackConfigs[heroes[index].Name]
	}
	return heroes
}

type BasicCombatKit interface {
	Basic(gs *GameState, source *player.Player, ts int64, angle, aimDistance float64)
	AimShape() string
	AttackRange() float64
}

type ConfiguredBasicKit struct {
	Config AttackConfig
}

func BasicCombatKitFor(hero string) BasicCombatKit {
	return defaultCombatRegistry.BasicCombatKitFor(hero)
}

func (kit ConfiguredBasicKit) AimShape() string     { return kit.Config.AimShape }
func (kit ConfiguredBasicKit) AttackRange() float64 { return kit.Config.Range }

func (kit ConfiguredBasicKit) Basic(gs *GameState, source *player.Player, ts int64, angle, aimDistance float64) {
	config := kit.Config
	switch config.Archetype {
	case AttackShotgun:
		spawnConfiguredFan(gs, source, angle, config)
	case AttackBurst:
		spawnConfiguredBurst(gs, source, angle, config)
	case AttackPiercingArea:
		executeConfiguredArea(gs, source, ts, angle, config)
	case AttackReturning:
		executeConfiguredReturning(gs, source, angle, config)
	case AttackDash:
		executeConfiguredDash(gs, source, angle, config)
	case AttackProjectile:
		executeConfiguredProjectile(gs, source, angle, aimDistance, config)
	default:
		gs.spawnAttackBullet(source, angle, config.ProjectileKind, source.AttackDmg, source.BulletSpd, source.BulletSz, config.Range, config.Pierce, false, config.Poison)
	}
}

func spawnConfiguredFan(gs *GameState, source *player.Player, angle float64, config AttackConfig) {
	count := int(math.Max(1, float64(config.ProjectileCount)))
	spread := config.SpreadDegrees * math.Pi / 180
	for index := 0; index < count; index++ {
		offset := 0.0
		if count > 1 {
			offset = -spread/2 + spread*float64(index)/float64(count-1)
		}
		shot := gs.spawnAttackBullet(source, angle+offset, config.ProjectileKind, source.AttackDmg, source.BulletSpd, source.BulletSz, config.Range, config.Pierce, false, config.Poison)
		shot.Splash, shot.Chain = config.SplashRadius, config.Chain
	}
}

func spawnConfiguredBurst(gs *GameState, source *player.Player, angle float64, config AttackConfig) {
	count := int(math.Max(1, float64(config.ProjectileCount)))
	spread := config.SpreadDegrees * math.Pi / 180
	kind, pierce := config.ProjectileKind, config.Pierce
	if config.Modifier == "heat" && source.Heat >= 5 {
		kind, pierce = "firebeam", 2
	}
	for index := 0; index < count; index++ {
		offset := 0.0
		if count > 1 {
			offset = -spread/2 + spread*float64(index)/float64(count-1)
		}
		gs.spawnAttackBullet(source, angle+offset, kind, source.AttackDmg, source.BulletSpd, source.BulletSz, config.Range, pierce, false, config.Poison)
	}
}

func executeConfiguredArea(gs *GameState, source *player.Player, ts int64, angle float64, config AttackConfig) {
	halfArc := config.HalfArcDegrees * math.Pi / 180
	swing := 0.0
	if config.Modifier == "alternating_melee" {
		if gs.wallAhead(source, angle, 82) {
			gs.vaultMove(source, angle, 155)
			gs.addEffect("thruster", source.X, source.Y, 0, 0, 75, angle, 0, 0, "#7be8ff", 0, 400)
			return
		}
		swing = -.18
		if source.AttackPulse%2 == 0 {
			swing = .18
		}
	}
	effect := "slash"
	if config.Modifier == "slam" {
		effect = "slam"
	}
	gs.addEffect(effect, source.X, source.Y, 0, 0, config.Range, angle+swing, config.Range, halfArc, source.Color, 0, 420)
	hits := gs.hitSector(source, angle+swing, config.Range, halfArc, source.AttackDmg, false)
	if config.Modifier == "souls_melee" {
		source.Souls = int(math.Min(3, float64(source.Souls+hits)))
		if source.Souls >= 3 {
			source.Souls = 0
			source.Deflect = 1
			gs.radialDamage(source.PlayerId, source.X, source.Y, 105, 60)
			gs.addEffect("spin", source.X, source.Y, 0, 0, 105, 0, 0, 0, "#d9ff8b", 0, 400)
		}
		return
	}
	if config.Modifier != "slam" {
		return
	}
	if hits > 0 {
		source.ShieldStacks = int(math.Min(5, float64(source.ShieldStacks+hits)))
		source.ShieldStackUntil = ts + 4000
	}
	for _, target := range gs.Players {
		if target == source || !target.IsAlive() {
			continue
		}
		dx, dy := target.X-source.X, target.Y-source.Y
		delta := math.Atan2(math.Sin(math.Atan2(dy, dx)-angle), math.Cos(math.Atan2(dy, dx)-angle))
		if math.Hypot(dx, dy) <= config.Range+target.Radius && math.Abs(delta) <= halfArc {
			target.SlowUntil = ts + 1200
		}
	}
	if hits == 0 {
		gs.createTemporaryRock(source.X+math.Cos(angle)*92, source.Y+math.Sin(angle)*92, ts+3500)
	}
}

func executeConfiguredReturning(gs *GameState, source *player.Player, angle float64, config AttackConfig) {
	var active *bullet.Bullet
	for _, candidate := range gs.Bullets {
		if candidate.Active && candidate.PlayerId == source.PlayerId && candidate.Kind == config.ProjectileKind {
			active = candidate
			break
		}
	}
	if config.Modifier == "recall" && active != nil {
		source.X, source.Y, active.Active = active.X, active.Y, false
		gs.radialDamage(source.PlayerId, source.X, source.Y, 105, 60)
		return
	}
	gs.spawnAttackBullet(source, angle, config.ProjectileKind, source.AttackDmg, source.BulletSpd, source.BulletSz, config.Range, config.Pierce, true, config.Poison)
}

func executeConfiguredDash(gs *GameState, source *player.Player, angle float64, config AttackConfig) {
	originX, originY := source.X, source.Y
	gs.dashAttack(source, angle, config.DashDistance, 0, 0)
	hits := gs.hitSector(source, angle, config.Range, config.HalfArcDegrees*math.Pi/180, source.AttackDmg, false)
	gs.addEffect("scythe", originX, originY, source.X, source.Y, 0, angle, config.Range+30, config.HalfArcDegrees*math.Pi/180, source.Color, 0, 420)
	if config.Modifier == "souls" {
		source.Souls = int(math.Min(3, float64(source.Souls+hits)))
		if source.Souls >= 3 {
			source.Souls = 0
			source.Deflect = 1
			gs.radialDamage(source.PlayerId, source.X, source.Y, 105, 60)
			gs.addEffect("spin", source.X, source.Y, 0, 0, 105, 0, 0, 0, "#d9ff8b", 0, 400)
		}
	}
}

func executeConfiguredProjectile(gs *GameState, source *player.Player, angle, _ float64, config AttackConfig) {
	shot := gs.spawnAttackBullet(source, angle, config.ProjectileKind, source.AttackDmg, source.BulletSpd, source.BulletSz, config.Range, config.Pierce, false, config.Poison)
	shot.Splash, shot.Chain = config.SplashRadius, config.Chain
	if config.Modifier == "evolution" && source.Evolution >= 4 {
		shot.Kind, shot.Pierce, shot.Chain, shot.Bounces, shot.Splash = "chain", 1, 4, 2, 75
	}
}
