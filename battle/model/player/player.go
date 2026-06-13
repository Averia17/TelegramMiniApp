package player

import (
	"battle/service/geometry"
	"strings"
)

type Player struct {
	geometry.CircleBody
	PlayerId    string
	Name        string
	Lives       int
	MaxLives    int
	Team        string
	Color       string
	Kills       int
	Rotation    float64
	Ack         int64
	LastShootAt int64
}

func NewPlayer(id, name string, x, y, radius float64, maxLives int, team string) *Player {
	p := &Player{
		CircleBody: geometry.CircleBody{X: x, Y: y, Radius: radius},
		PlayerId:   id,
		Name:       ValidateName(name),
		MaxLives:   maxLives,
		Lives:      maxLives,
		Team:       team,
		Color:      "#FFFFFF",
	}
	if team != "" {
		p.Color = GetTeamColor(team)
	}
	return p
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
	p.Lives--
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

func ValidateName(name string) string {
	name = strings.TrimSpace(name)
	if len(name) > 16 {
		name = name[:16]
	}
	return name
}

func GetTeamColor(team string) string {
	if team == "Blue" {
		return "#0000FF"
	}
	return "#FF0000"
}
