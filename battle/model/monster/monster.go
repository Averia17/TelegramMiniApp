package monster

import (
	"battle/model/player"
	"battle/service/geometry"
	"math"
	"time"
)

type MonsterState string

type MonsterKind string

const (
	MonsterBat          MonsterKind = "bat"
	MonsterAshHound     MonsterKind = "ash_hound"
	MonsterRootGuardian MonsterKind = "root_guardian"
)

const (
	MonsterIdle     MonsterState = "idle"
	MonsterPatrol   MonsterState = "patrol"
	MonsterNotice   MonsterState = "notice"
	MonsterChase    MonsterState = "chase"
	MonsterWindup   MonsterState = "windup"
	MonsterRecovery MonsterState = "recovery"
)

const (
	MonsterSpeedPatrol        = 0.75
	MonsterSpeedChase         = 1.15
	MonsterSpeedReturn        = 0.9
	MonsterSight              = 220.0
	MonsterChaseLeash         = 320.0
	MonsterChasePace          = 105.0
	MonsterReturnPace         = 82.0
	MonsterReturnStopDistance = 18.0
	MonsterMoveTurnBlend      = 0.22
	MonsterMoveRelease        = 0.84
	MonsterMoveStopScale      = 0.045
	MonsterLostTargetDelay    = 2500
	MonsterLives              = 260
	EliteMonsterLives         = 380
	MonsterAttackDamage       = 25
	MonsterIdleDurationMin    = 1000
	MonsterIdleDurationMax    = 3000
	MonsterPatrolDurationMin  = 1000
	MonsterPatrolDurationMax  = 3000
	MonsterNoticeDuration     = 350
	MonsterAttackBackoff      = 3000
	MonsterAttackWindup       = 450
)

// AttackProfile is the authored threat contract for neutral camps. Keeping
// these values beside MonsterKind prevents every camp from collapsing into a
// recoloured bat while leaving the authoritative resolution in game state.
type AttackProfile struct {
	Range      float64
	CooldownMs int64
	WindupMs   int64
	Damage     int
	Telegraph  string
	Impact     string
	Color      string
	RecoveryMs int64
}

func ProfileForKind(kind MonsterKind, tier int) AttackProfile {
	if tier < 1 {
		tier = 1
	}
	profile := AttackProfile{
		Range:      56,
		CooldownMs: 1100 - int64(math.Min(200, float64((tier-1)*200))),
		WindupMs:   MonsterAttackWindup,
		Damage:     62 + tier*18,
		Telegraph:  "bat_windup",
		Impact:     "bat_strike",
		Color:      "#ff486f",
	}
	switch kind {
	case MonsterAshHound:
		profile.Range = 128
		profile.CooldownMs = 1450 - int64(math.Min(250, float64((tier-1)*250)))
		profile.WindupMs = 520
		profile.Damage = 78 + (tier-1)*16
		profile.Telegraph = "ash_hound_charge_telegraph"
		profile.Impact = "ash_hound_charge_impact"
		profile.Color = "#ff8a3d"
		profile.RecoveryMs = 720
	case MonsterRootGuardian:
		profile.Range = 192
		profile.CooldownMs = 2200 - int64(math.Min(400, float64((tier-1)*400)))
		profile.WindupMs = 650
		profile.Damage = 28 + (tier-1)*8
		profile.Telegraph = "root_guardian_telegraph"
		profile.Impact = "root_guardian_impact"
		profile.Color = "#9be66f"
		profile.RecoveryMs = 850
	}
	return profile
}

type Monster struct {
	geometry.CircleBody
	Kind               MonsterKind
	CampID             string
	TerritoryRadius    float64
	Rotation           float64
	MapWidth           float64
	MapHeight          float64
	Lives              int
	MaxLives           int
	Tier               int
	State              MonsterState
	LastActionAt       int64
	LastAttackAt       int64
	IdleDuration       int
	PatrolDuration     int
	TargetPlayerId     string
	ChaseOriginX       float64
	ChaseOriginY       float64
	SpawnX             float64
	SpawnY             float64
	ReturningHome      bool
	IgnorePlayersUntil int64
	NoticeUntil        int64
	MoveX              float64
	MoveY              float64
	MoveScale          float64
	AttackWindupUntil  int64
	AttackOriginX      float64
	AttackOriginY      float64
	AttackTargetX      float64
	AttackTargetY      float64
	VulnerableUntil    int64
	RecoveryUntil      int64
}

func NewMonster(x, y, radius, mapWidth, mapHeight float64, lives int) *Monster {
	return NewMonsterAt(NowMillis(), x, y, radius, mapWidth, mapHeight, lives)
}

// NewMonsterAt keeps monster lifecycle timestamps on the same authoritative
// clock as the battle state. NewMonster remains the wall-clock convenience
// constructor for standalone callers and legacy tests.
func NewMonsterAt(now int64, x, y, radius, mapWidth, mapHeight float64, lives int) *Monster {
	return NewMonsterOfKindAt(now, MonsterBat, "", x, y, radius, mapWidth, mapHeight, 320, lives)
}

// NewMonsterOfKindAt creates a neutral with an authored camp identity. The
// identity is part of the gameplay contract so snapshots, rewards and future
// type-specific AI can remain correlated across respawns.
func NewMonsterOfKindAt(now int64, kind MonsterKind, campID string, x, y, radius, mapWidth, mapHeight, territoryRadius float64, lives int) *Monster {
	if kind == "" {
		kind = MonsterBat
	}
	if territoryRadius <= 0 {
		territoryRadius = MonsterChaseLeash
	}
	return &Monster{
		CircleBody:      geometry.CircleBody{X: x, Y: y, Radius: radius},
		Kind:            kind,
		CampID:          campID,
		TerritoryRadius: territoryRadius,
		MapWidth:        mapWidth,
		MapHeight:       mapHeight,
		Lives:           lives,
		MaxLives:        lives,
		Tier:            1,
		State:           MonsterIdle,
		LastActionAt:    now,
		LastAttackAt:    now,
		ChaseOriginX:    x,
		ChaseOriginY:    y,
		SpawnX:          x,
		SpawnY:          y,
	}
}

func (m *Monster) Update(players map[string]*player.Player) {
	switch m.State {
	case MonsterIdle:
		m.updateIdle(players)
	case MonsterPatrol:
		m.updatePatrol(players)
	case MonsterNotice:
		m.updateNotice(players)
	case MonsterChase:
		m.updateChase(players)
	}
}

func (m *Monster) updateNotice(players map[string]*player.Player) {
	p, ok := players[m.TargetPlayerId]
	if !ok || !p.IsAlive() {
		m.loseTarget()
		return
	}
	if NowMillis() < m.NoticeUntil {
		m.MoveX, m.MoveY, m.MoveScale = 0, 0, 0
		return
	}
	m.State = MonsterChase
	m.NoticeUntil = 0
	m.updateChase(players)
}

func (m *Monster) updateIdle(players map[string]*player.Player) {
	if m.ReturningHome {
		m.returnHome()
		return
	}
	if m.lookForPlayer(players) {
		return
	}
	m.coast(MonsterSpeedPatrol)
	delta := NowMillis() - m.LastActionAt
	if delta > int64(m.IdleDuration) {
		m.startPatrol()
	}
}

func (m *Monster) updatePatrol(players map[string]*player.Player) {
	if m.lookForPlayer(players) {
		return
	}
	delta := NowMillis() - m.LastActionAt
	if delta > int64(m.PatrolDuration) {
		m.startIdle()
		m.coast(MonsterSpeedPatrol)
		return
	}
	m.move(MonsterSpeedPatrol, m.Rotation)
	tileSize := 32.0
	if m.X < tileSize || m.X > m.MapWidth-tileSize || m.Y < tileSize || m.Y > m.MapHeight-tileSize {
		m.X = geometry.Clamp(m.X, 0, m.MapWidth)
		m.Y = geometry.Clamp(m.Y, 0, m.MapHeight)
		m.Rotation = float64(geometry.GetRandomInt(-3, 3))
	}
}

func (m *Monster) updateChase(players map[string]*player.Player) {
	p, ok := players[m.TargetPlayerId]
	if !ok || !p.IsAlive() {
		m.loseTarget()
		m.coast(MonsterSpeedChase)
		return
	}
	dist := geometry.GetDistance(m.X, m.Y, p.X, p.Y)
	chaseDistance := geometry.GetDistance(m.X, m.Y, m.SpawnX, m.SpawnY)
	if dist > MonsterSight || chaseDistance > MonsterChaseLeash {
		m.loseTarget()
		m.coast(MonsterSpeedChase)
		return
	}
	m.Rotation = geometry.CalculateAngle(p.X, p.Y, m.X, m.Y)
	m.move(MonsterSpeedChase, m.Rotation)
}

func (m *Monster) startIdle() {
	m.State = MonsterIdle
	m.TargetPlayerId = ""
	m.ReturningHome = false
	m.IdleDuration = geometry.GetRandomInt(MonsterIdleDurationMin, MonsterIdleDurationMax)
	m.LastActionAt = NowMillis()
}

func (m *Monster) startPatrol() {
	m.State = MonsterPatrol
	m.TargetPlayerId = ""
	m.PatrolDuration = geometry.GetRandomInt(MonsterPatrolDurationMin, MonsterPatrolDurationMax)
	m.Rotation = float64(geometry.GetRandomInt(-3, 3))
	m.LastActionAt = NowMillis()
}

func (m *Monster) startChase(playerId string) {
	m.State = MonsterChase
	m.TargetPlayerId = playerId
	m.ReturningHome = false
	m.ChaseOriginX, m.ChaseOriginY = m.X, m.Y
	m.LastActionAt = NowMillis()
}

func (m *Monster) lookForPlayer(players map[string]*player.Player) bool {
	if NowMillis() < m.IgnorePlayersUntil {
		return false
	}
	if m.TargetPlayerId == "" {
		playerId := GetClosestPlayerId(m.X, m.Y, players)
		if playerId != "" {
			m.startChase(playerId)
			return true
		}
	}
	return false
}

func (m *Monster) loseTarget() {
	m.State = MonsterIdle
	m.TargetPlayerId = ""
	m.ReturningHome = true
	m.LastActionAt = NowMillis()
	m.IgnorePlayersUntil = NowMillis() + MonsterLostTargetDelay
}

func (m *Monster) returnHome() {
	dx, dy := m.SpawnX-m.X, m.SpawnY-m.Y
	distance := math.Hypot(dx, dy)
	if distance <= MonsterReturnStopDistance {
		m.X, m.Y = m.SpawnX, m.SpawnY
		m.Rotation = 0
		m.MoveX, m.MoveY, m.MoveScale = 0, 0, 0
		m.ReturningHome = false
		m.LastActionAt = NowMillis()
		return
	}
	m.Rotation = math.Atan2(dy, dx)
	m.move(MonsterSpeedReturn, m.Rotation)
	m.X = geometry.Clamp(m.X, m.Radius, m.MapWidth-m.Radius)
	m.Y = geometry.Clamp(m.Y, m.Radius, m.MapHeight-m.Radius)
}

func (m *Monster) Hurt(amount ...int) {
	damage := 1
	if len(amount) > 0 && amount[0] > 0 {
		damage = amount[0]
	}
	m.Lives -= damage
	if m.Lives < 0 {
		m.Lives = 0
	}
}

func (m *Monster) move(speed, rotation float64) {
	desiredX, desiredY := math.Cos(rotation), math.Sin(rotation)
	currentLength := math.Hypot(m.MoveX, m.MoveY)
	if currentLength <= .01 {
		m.MoveX, m.MoveY = desiredX, desiredY
		m.MoveScale = math.Max(m.MoveScale, .4)
	} else {
		currentAngle := math.Atan2(m.MoveY, m.MoveX)
		delta := math.Atan2(math.Sin(rotation-currentAngle), math.Cos(rotation-currentAngle))
		currentAngle += delta * MonsterMoveTurnBlend
		m.MoveX, m.MoveY = math.Cos(currentAngle), math.Sin(currentAngle)
		m.MoveScale += (1 - m.MoveScale) * MonsterMoveTurnBlend
	}
	m.X += m.MoveX * m.MoveScale * speed
	m.Y += m.MoveY * m.MoveScale * speed
	m.X = geometry.Clamp(m.X, m.Radius, m.MapWidth-m.Radius)
	m.Y = geometry.Clamp(m.Y, m.Radius, m.MapHeight-m.Radius)
}

func (m *Monster) coast(speed float64) {
	if math.Hypot(m.MoveX, m.MoveY) <= .01 || m.MoveScale <= .01 {
		m.MoveX, m.MoveY, m.MoveScale = 0, 0, 0
		return
	}
	m.MoveScale *= MonsterMoveRelease
	if m.MoveScale <= MonsterMoveStopScale {
		m.MoveX, m.MoveY, m.MoveScale = 0, 0, 0
		return
	}
	m.X += m.MoveX * m.MoveScale * speed
	m.Y += m.MoveY * m.MoveScale * speed
	m.X = geometry.Clamp(m.X, m.Radius, m.MapWidth-m.Radius)
	m.Y = geometry.Clamp(m.Y, m.Radius, m.MapHeight-m.Radius)
}

func (m *Monster) Attack() {
	m.LastAttackAt = NowMillis()
}

func (m *Monster) IsAlive() bool {
	return m.Lives > 0
}

func (m *Monster) CanAttack() bool {
	delta := int64(math.Abs(float64(m.LastAttackAt - NowMillis())))
	return m.State == MonsterChase && delta > MonsterAttackBackoff
}

func GetClosestPlayerId(x, y float64, players map[string]*player.Player) string {
	var closestId string
	closestDist := MonsterSight
	for id, p := range players {
		if p.IsAlive() {
			dist := geometry.GetDistance(x, y, p.X, p.Y)
			if dist <= closestDist {
				closestDist = dist
				closestId = id
			}
		}
	}
	return closestId
}

func NowMillis() int64 {
	return time.Now().UnixMilli()
}
