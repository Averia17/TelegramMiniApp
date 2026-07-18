package game

import (
	"battle/model/player"
	"battle/service/geometry"
	"math/rand"
)

type Hero struct {
	Name         string  `json:"name"`
	Color        string  `json:"color"`
	Radius       float64 `json:"radius"`
	MaxLives     int     `json:"maxLives"`
	Speed        float64 `json:"speed"`
	AttackDamage int     `json:"attackDamage"`
	AttackRate   int64   `json:"attackRate"`
	BulletSpeed  float64 `json:"bulletSpeed"`
	BulletSize   float64 `json:"bulletSize"`
	AttackType   string  `json:"attackType"`
	Role         string  `json:"role"`
	Desc         string  `json:"desc"`
	RegenRate    float64 `json:"regenRate"`
}

var Heroes = []Hero{
	{Name: "Blaze", Color: "#C64BFF", Radius: 14, MaxLives: 5600, Speed: 1.40, AttackDamage: 520, AttackRate: 520, BulletSpeed: 5.6, BulletSize: 6, AttackType: "shotgun", Role: "Assault", RegenRate: .010, Desc: "Five plasma pellets apply marks; abilities detonate them or reposition"},
	{Name: "Frost", Color: "#35D9FF", Radius: 14, MaxLives: 5000, Speed: 1.48, AttackDamage: 360, AttackRate: 620, BulletSpeed: 7.4, BulletSize: 4, AttackType: "burst", Role: "Gunner", RegenRate: .009, Desc: "Six-shot precision burst rewards tracking the same target"},
	{Name: "Viper", Color: "#FF7138", Radius: 18, MaxLives: 9800, Speed: 1.03, AttackDamage: 1850, AttackRate: 790, AttackType: "slam", Role: "Tank", RegenRate: .008, Desc: "Short magma slam controls space and pulls enemies inward"},
	{Name: "Titan", Color: "#42E3D2", Radius: 13, MaxLives: 4700, Speed: 1.69, AttackDamage: 850, AttackRate: 650, BulletSpeed: 5.2, BulletSize: 10, AttackType: "boomerang", Role: "Assassin", RegenRate: .012, Desc: "Returning discs hit twice; cloak enables a high-risk ambush"},
	{Name: "Shadow", Color: "#75D947", Radius: 14, MaxLives: 6200, Speed: 1.23, AttackDamage: 1050, AttackRate: 720, BulletSpeed: 4.5, BulletSize: 12, AttackType: "spore", Role: "Controller", RegenRate: .011, Desc: "Spore capsule splits into six seeking thorns and zones enemies"},
	{Name: "Spark", Color: "#6D52C7", Radius: 13, MaxLives: 5400, Speed: 1.60, AttackDamage: 1450, AttackRate: 540, AttackType: "dash", Role: "Assassin", RegenRate: .0105, Desc: "Scythe dash restores resources for every enemy crossed"},
	{Name: "Nova", Color: "#FFF4D0", Radius: 12, MaxLives: 4300, Speed: 1.31, AttackDamage: 1200, AttackRate: 860, BulletSpeed: 8.6, BulletSize: 4, AttackType: "sniper", Role: "Marksman", RegenRate: .0095, Desc: "Long-range shot gains damage with distance; vulnerable up close"},
	{Name: "Rex", Color: "#4BC7FF", Radius: 15, MaxLives: 7200, Speed: 1.50, AttackDamage: 850, AttackRate: 480, AttackType: "double_melee", Role: "Bruiser", RegenRate: .0085, Desc: "Twin manipulator strikes convert dealt damage into temporary shield"},
	{Name: "Pixel", Color: "#FFD43B", Radius: 14, MaxLives: 6600, Speed: 1.25, AttackDamage: 1250, AttackRate: 650, BulletSpeed: 5.8, BulletSize: 9, AttackType: "quantum", Role: "Fighter", RegenRate: .010, Desc: "Quantum core splits into three shards and evolves during combat"},
	{Name: "Boulder", Color: "#59D348", Radius: 13, MaxLives: 5200, Speed: 1.48, AttackDamage: 480, AttackRate: 590, BulletSpeed: 6.0, BulletSize: 5, AttackType: "poison_fan", Role: "Debuffer", RegenRate: .0115, Desc: "Three poison darts stack damage-over-time and suppress healing"},
}

func RandomHero() Hero {
	return Heroes[rand.Intn(len(Heroes))]
}

func GetHeroByName(name string) *Hero {
	for _, h := range Heroes {
		if h.Name == name {
			return &h
		}
	}
	return nil
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
		AttackType: h.AttackType,
		RegenRate:  h.RegenRate,
	}
	return p
}
