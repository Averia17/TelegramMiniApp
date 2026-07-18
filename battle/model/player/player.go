package player

import (
	"battle/service/geometry"
)

type Player struct {
	geometry.CircleBody
	PlayerId        string
	Name            string
	Lives           int
	MaxLives        int
	Team            string
	Color           string
	Kills           int
	Rotation        float64
	Ack             int64
	LastShootAt     int64
	HeroName        string
	Speed           float64
	AttackDmg       int
	AttackRate      int64
	BulletSpd       float64
	BulletSz        float64
	AttackType      string
	ShieldHP        int
	PoisonUntil     int64
	PoisonTickAt    int64
	PoisonBy        string
	Marks           int
	IsBot           bool
	LastPrimaryAt   int64
	LastSecondaryAt int64
	HasteUntil      int64
	SlowUntil       int64
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
	if amount <= 0 || !p.IsAlive() {
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

func (p *Player) Heal() {
	p.Lives++
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
