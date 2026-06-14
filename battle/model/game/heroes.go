package game

import (
	"battle/model/player"
	"battle/service/geometry"
	"math/rand"
)

type Hero struct {
	Name         string
	Color        string
	Radius       float64
	MaxLives     int
	Speed        float64
	AttackDamage int
	AttackRate   int64
	BulletSpeed  float64
	BulletSize   float64
}

var Heroes = []Hero{
	{Name: "Blaze", Color: "#FF4500", Radius: 14, MaxLives: 5, Speed: 1.2, AttackDamage: 2, AttackRate: 700, BulletSpeed: 5, BulletSize: 6},
	{Name: "Frost", Color: "#00BFFF", Radius: 14, MaxLives: 4, Speed: 1.0, AttackDamage: 2, AttackRate: 800, BulletSpeed: 4.5, BulletSize: 7},
	{Name: "Viper", Color: "#32CD32", Radius: 12, MaxLives: 3, Speed: 1.5, AttackDamage: 1, AttackRate: 500, BulletSpeed: 6, BulletSize: 5},
	{Name: "Titan", Color: "#8B4513", Radius: 18, MaxLives: 8, Speed: 0.7, AttackDamage: 3, AttackRate: 1000, BulletSpeed: 3.5, BulletSize: 10},
	{Name: "Shadow", Color: "#4B0082", Radius: 13, MaxLives: 3, Speed: 1.3, AttackDamage: 2, AttackRate: 600, BulletSpeed: 5.5, BulletSize: 5},
	{Name: "Spark", Color: "#FFD700", Radius: 13, MaxLives: 4, Speed: 1.1, AttackDamage: 2, AttackRate: 750, BulletSpeed: 5, BulletSize: 6},
	{Name: "Nova", Color: "#FF69B4", Radius: 14, MaxLives: 4, Speed: 1.0, AttackDamage: 2, AttackRate: 800, BulletSpeed: 4.5, BulletSize: 7},
	{Name: "Rex", Color: "#228B22", Radius: 16, MaxLives: 6, Speed: 0.9, AttackDamage: 2, AttackRate: 850, BulletSpeed: 4, BulletSize: 8},
	{Name: "Pixel", Color: "#FF1493", Radius: 11, MaxLives: 3, Speed: 1.4, AttackDamage: 1, AttackRate: 450, BulletSpeed: 6, BulletSize: 4},
	{Name: "Boulder", Color: "#A0522D", Radius: 20, MaxLives: 10, Speed: 0.6, AttackDamage: 4, AttackRate: 1200, BulletSpeed: 3, BulletSize: 12},
}

func RandomHero() Hero {
	return Heroes[rand.Intn(len(Heroes))]
}

func (h Hero) CreatePlayer(id, name string, x, y float64) *player.Player {
	p := &player.Player{
		CircleBody: geometry.CircleBody{X: x, Y: y, Radius: h.Radius},
		PlayerId:   id,
		Name:       name,
		MaxLives:   h.MaxLives,
		Lives:      h.MaxLives,
		Color:      h.Color,
		HeroName:   h.Name,
		Speed:      h.Speed,
		AttackDmg:  h.AttackDamage,
		AttackRate: h.AttackRate,
		BulletSpd:  h.BulletSpeed,
		BulletSz:   h.BulletSize,
	}
	return p
}
