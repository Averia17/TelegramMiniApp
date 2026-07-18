package monster

import (
	"battle/model/player"
	"battle/service/geometry"
	"math"
	"time"
)

type MonsterState string

const (
	MonsterIdle   MonsterState = "idle"
	MonsterPatrol MonsterState = "patrol"
	MonsterChase  MonsterState = "chase"
)

const (
	MonsterSpeedPatrol       = 0.75
	MonsterSpeedChase        = 1.25
	MonsterSight             = 192.0
	MonsterLives             = 6200
	EliteMonsterLives        = 8200
	MonsterAttackDamage      = 650
	MonsterIdleDurationMin   = 1000
	MonsterIdleDurationMax   = 3000
	MonsterPatrolDurationMin = 1000
	MonsterPatrolDurationMax = 3000
	MonsterAttackBackoff     = 3000
)

type Monster struct {
	geometry.CircleBody
	Rotation       float64
	MapWidth       float64
	MapHeight      float64
	Lives          int
	MaxLives       int
	Tier           int
	State          MonsterState
	LastActionAt   int64
	LastAttackAt   int64
	IdleDuration   int
	PatrolDuration int
	TargetPlayerId string
}

func NewMonster(x, y, radius, mapWidth, mapHeight float64, lives int) *Monster {
	now := NowMillis()
	return &Monster{
		CircleBody:   geometry.CircleBody{X: x, Y: y, Radius: radius},
		MapWidth:     mapWidth,
		MapHeight:    mapHeight,
		Lives:        lives,
		MaxLives:     lives,
		Tier:         1,
		State:        MonsterIdle,
		LastActionAt: now,
		LastAttackAt: now,
	}
}

func (m *Monster) Update(players map[string]*player.Player) {
	switch m.State {
	case MonsterIdle:
		m.updateIdle(players)
	case MonsterPatrol:
		m.updatePatrol(players)
	case MonsterChase:
		m.updateChase(players)
	}
}

func (m *Monster) updateIdle(players map[string]*player.Player) {
	if m.lookForPlayer(players) {
		return
	}
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
		m.startIdle()
		return
	}
	dist := geometry.GetDistance(m.X, m.Y, p.X, p.Y)
	if dist > MonsterSight {
		m.startIdle()
		return
	}
	m.Rotation = geometry.CalculateAngle(p.X, p.Y, m.X, m.Y)
	m.move(MonsterSpeedChase, m.Rotation)
}

func (m *Monster) startIdle() {
	m.State = MonsterIdle
	m.Rotation = 0
	m.TargetPlayerId = ""
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
	m.LastActionAt = NowMillis()
}

func (m *Monster) lookForPlayer(players map[string]*player.Player) bool {
	if m.TargetPlayerId == "" {
		playerId := GetClosestPlayerId(m.X, m.Y, players)
		if playerId != "" {
			m.startChase(playerId)
			return true
		}
	}
	return false
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
	m.X += math.Cos(rotation) * speed
	m.Y += math.Sin(rotation) * speed
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
