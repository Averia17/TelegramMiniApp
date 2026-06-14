package bullet

import (
	"battle/service/geometry"
	"math"
)

type Bullet struct {
	geometry.CircleBody
	PlayerId string
	Team     string
	Rotation float64
	Active   bool
	Color    string
	Damage   int
}

func NewBullet(playerId, team string, x, y, radius, rotation float64, color string) *Bullet {
	return &Bullet{
		CircleBody: geometry.CircleBody{X: x, Y: y, Radius: radius},
		PlayerId:   playerId,
		Team:       team,
		Rotation:   rotation,
		Active:     true,
		Color:      color,
	}
}

func (b *Bullet) Move(speed float64) {
	b.X += math.Cos(b.Rotation) * speed
	b.Y += math.Sin(b.Rotation) * speed
}

func (b *Bullet) Reset(playerId, team string, x, y, radius, rotation float64, color string) {
	b.PlayerId = playerId
	b.Team = team
	b.X = x
	b.Y = y
	b.Radius = radius
	b.Rotation = rotation
	b.Active = true
	b.Color = color
}
