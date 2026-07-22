package bullet

import (
	"battle/service/geometry"
	"math"
	"sync/atomic"
)

var nextID atomic.Uint64

type Bullet struct {
	geometry.CircleBody
	ID           uint64
	PlayerId     string
	Team         string
	Rotation     float64
	Active       bool
	Color        string
	Damage       int
	Kind         string
	Speed        float64
	Acceleration float64
	MaxRange     float64
	Travelled    float64
	Pierce       int
	Returning    bool
	OriginX      float64
	OriginY      float64
	Poison       bool
	Splash       float64
	Chain        int
	Bounces      int
	Split        bool
	HitPlayers   map[string]bool
	Knockback    float64
	DestroyWalls bool
	Lobbed       bool
	TargetX      float64
	TargetY      float64
	SpawnedAt    int64
	LandsAt      int64
	ZoneRadius   float64
	ZoneTicks    int
	ZoneInterval int64
}

func NewBullet(playerId, team string, x, y, radius, rotation float64, color string) *Bullet {
	return &Bullet{
		CircleBody: geometry.CircleBody{X: x, Y: y, Radius: radius},
		ID:         nextID.Add(1),
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
	b.Speed += b.Acceleration / 60
	distance := speed / 60
	b.X += math.Cos(b.Rotation) * distance
	b.Y += math.Sin(b.Rotation) * distance
	b.Travelled += distance
}

func (b *Bullet) Reset(playerId, team string, x, y, radius, rotation float64, color string) {
	b.ID = nextID.Add(1)
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
	b.Acceleration = 0
	b.MaxRange = 900
	b.Travelled = 0
	b.Pierce = 0
	b.Returning = false
	b.OriginX, b.OriginY = x, y
	b.Poison = false
	b.Splash = 0
	b.Chain = 0
	b.Bounces = 0
	b.Split = false
	b.HitPlayers = make(map[string]bool)
	b.Knockback = 0
	b.DestroyWalls = false
	b.Lobbed = false
	b.TargetX, b.TargetY = 0, 0
	b.SpawnedAt, b.LandsAt = 0, 0
	b.ZoneRadius, b.ZoneTicks, b.ZoneInterval = 0, 0, 0
}
