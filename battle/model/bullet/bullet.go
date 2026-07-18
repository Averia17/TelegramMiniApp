package bullet

import (
	"battle/service/geometry"
	"math"
)

type Bullet struct {
	geometry.CircleBody
	PlayerId   string
	Team       string
	Rotation   float64
	Active     bool
	Color      string
	Damage     int
	Kind       string
	Speed      float64
	MaxRange   float64
	Travelled  float64
	Pierce     int
	Returning  bool
	OriginX    float64
	OriginY    float64
	Poison     bool
	Split      bool
	HitPlayers map[string]bool
}

func NewBullet(playerId, team string, x, y, radius, rotation float64, color string) *Bullet {
	return &Bullet{
		CircleBody: geometry.CircleBody{X: x, Y: y, Radius: radius},
		PlayerId:   playerId,
		Team:       team,
		Rotation:   rotation,
		Active:     true,
		Color:      color,
		Speed:      4,
		MaxRange:   900,
		OriginX:    x,
		OriginY:    y,
		HitPlayers: make(map[string]bool),
	}
}

func (b *Bullet) Move(speed float64) {
	if b.Speed > 0 {
		speed = b.Speed
	}
	b.X += math.Cos(b.Rotation) * speed
	b.Y += math.Sin(b.Rotation) * speed
	b.Travelled += speed
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
	b.Damage = 0
	b.Kind = ""
	b.Speed = 4
	b.MaxRange = 900
	b.Travelled = 0
	b.Pierce = 0
	b.Returning = false
	b.OriginX, b.OriginY = x, y
	b.Poison = false
	b.Split = false
	b.HitPlayers = make(map[string]bool)
}
