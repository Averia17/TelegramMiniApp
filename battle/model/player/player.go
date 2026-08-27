package player

import (
	"battle/service/geometry"
	"math"
	"time"
)

type Player struct {
	geometry.CircleBody
	PlayerId              string
	PartyID               string
	Name                  string
	Lives                 int
	MaxLives              int
	BaseMaxLives          int
	HealthBoosts          int
	Team                  string
	TeamLocked            bool
	Color                 string
	Kills                 int
	BasicDamage           int
	SkillDamage           int
	BasicOnlyKills        int
	SkillAssistedKills    int
	HealingDone           int
	HealingBlocked        int
	HealWindowMs          int64
	ShieldProvided        int
	DamagePrevented       int
	Assists               int
	ControlAppliedMs      int64
	BatDamage             int
	BatContests           int
	CubeClaims            int
	EscapeSaves           int
	TimeToFirstContactMs  int64
	CombatUptimeMs        int64
	RespawnDowntimeMs     int64
	UncontestedTravelMs   int64
	CombatFirstContactAt  int64
	LastCombatAt          int64
	LastDeathAt           int64
	LastMovementAt        int64
	LastEffectiveHealAt   int64
	Place                 int
	Deaths                int
	PlayerDamage          int
	TowerDamage           int
	TownHallDamage        int
	TowersDestroyed       int
	TownHallsDestroyed    int
	Rotation              float64
	Ack                   int64
	LastShootAt           int64
	HeroName              string
	Speed                 float64
	MoveX                 float64
	MoveY                 float64
	AttackDmg             int
	AttackRate            int64
	ReloadTime            int64
	Ammo                  int
	MaxAmmo               int
	NextAmmoAt            int64
	BulletSpd             float64
	BulletSz              float64
	AttackType            string
	ShieldHP              int
	ShieldStacks          int
	ShieldStackUntil      int64
	PoisonUntil           int64
	PoisonTickAt          int64
	PoisonBy              string
	Marks                 int
	SuperCharge           int
	Heat                  int
	HeatUntil             int64
	AttackPulse           int
	SuperPulse            int
	GadgetPulse           int
	Aiming                bool
	AimDistance           float64
	ShieldUntil           int64
	InvulnerableUntil     int64
	StealthUntil          int64
	StunUntil             int64
	CastUntil             int64
	ChannelUntil          int64
	VineUntil             int64
	VortexUntil           int64
	VortexTickAt          int64
	FlyingUntil           int64
	FlightSpeedMultiplier float64
	BlindUntil            int64
	Dodges                int
	Souls                 int
	Deflect               int
	Evolution             int
	LastAbilityTick       int64
	LastAbilityID         string
	LastAbilityOK         bool
	PowerCores            int
	DamageMultiplier      float64
	IsBot                 bool
	LastPrimaryAt         int64
	LastSecondaryAt       int64
	HasteUntil            int64
	LunarSpeedUntil       int64
	LunarDamageUntil      int64
	LunarShield           bool
	SlowUntil             int64
	SlowMultiplier        float64
	AntiHealUntil         int64
	AntiHealMultiplier    float64
	SporeStacks           int
	SporeStackUntil       int64
	FocusStartedAt        int64
	FocusCharge           int
	SuppressedRage        int
	MicoRage              int
	LumiFlowers           int
	VortexRadius          float64
	VortexDamage          int
	StoneArmorUntil       int64
	MandySuperShieldUntil int64
	MicoArmorDetonation   bool
	GadgetArmed           bool
	KazeCritReady         bool
	KazeStealthCritReady  bool
	KazeSuperReset        bool
	KazeCombo             int
	KazeComboUntil        int64
	GadgetCharges         int
	RegenRate             float64
	RegenCarry            float64
	LastDamageAt          int64
	RespawnAt             int64
	RespawnCount          int
	LastRegenAt           int64
	RevealedUntil         int64
	LastContactAt         int64
	LastContactBy         string
	LastContactX          float64
	LastContactY          float64
	LastContactDirX       float64
	LastContactDirY       float64
	HitImpulseX           float64
	HitImpulseY           float64
}

func (p *Player) Move(dirX, dirY, speed float64) {
	mag := geometry.Normalize2D(dirX, dirY)
	if mag == 0 {
		return
	}
	speedX := geometry.Round2Digits(dirX * (speed / mag))
	speedY := geometry.Round2Digits(dirY * (speed / mag))
	p.X += speedX
	p.Y += speedY
}

func (p *Player) Hurt() {
	p.TakeDamage(1)
}

func (p *Player) TakeDamage(amount int) {
	p.TakeDamageAt(amount, time.Now().UnixMilli())
}

// TakeDamageAt is the authoritative, clock-injected variant used by the
// battle simulation. Keeping the wall-clock wrapper preserves the small
// player package API for non-simulation callers while deterministic replays
// can own every timestamp that affects combat state.
func (p *Player) TakeDamageAt(amount int, now int64) {
	if amount <= 0 || !p.IsAlive() {
		return
	}
	p.InterruptRegenerationAt(now)
	if p.LunarShield {
		p.LunarShield = false
		p.ShieldHP = 0
		return
	}
	if p.ShieldHP >= amount {
		p.ShieldHP -= amount
		return
	}
	amount -= p.ShieldHP
	p.ShieldHP = 0
	p.Lives -= amount
	if p.Lives < 0 {
		p.Lives = 0
	}
}

func (p *Player) InterruptRegenerationAt(now int64) {
	p.LastDamageAt = now
	p.LastRegenAt = 0
}

func (p *Player) Heal() {
	p.Lives++
}

// ApplyHealthBoost permanently adds a fraction of the hero's original max
// health. The pickup is not a heal: current Lives stay unchanged, so the
// player must still create a safe recovery window after taking the upgrade.
// Keeping BaseMaxLives separate prevents stacked boosts from compounding
// unexpectedly as the current max health grows. The cap is supplied by the
// authoritative combat profile so this model package does not own a second
// balance source.
func (p *Player) ApplyHealthBoost(fraction float64, maxStacks int) int {
	if p == nil || fraction <= 0 {
		return 0
	}
	if maxStacks <= 0 || p.HealthBoosts >= maxStacks {
		return 0
	}
	if p.BaseMaxLives <= 0 {
		p.BaseMaxLives = p.MaxLives
	}
	bonus := int(math.Round(float64(p.BaseMaxLives) * fraction))
	if bonus <= 0 {
		return 0
	}
	p.MaxLives += bonus
	p.HealthBoosts++
	return bonus
}

func (p *Player) IsAlive() bool {
	return p.Lives > 0
}

func (p *Player) IsFullLives() bool {
	return p.Lives == p.MaxLives
}

func (p *Player) CanBulletHurt(otherPlayerId, team string) bool {
	if !p.IsAlive() {
		return false
	}
	if p.PlayerId == otherPlayerId {
		return false
	}
	if team != "" && team == p.Team {
		return false
	}
	return true
}

func (p *Player) SetTeam(team string) {
	p.Team = team
	p.Color = GetTeamColor(team)
}

func GetTeamColor(team string) string {
	if team == "Blue" {
		return "#0000FF"
	}
	return "#FF0000"
}
