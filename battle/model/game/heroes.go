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
	ReloadTime   int64   `json:"reloadTime"`
	MaxAmmo      int     `json:"maxAmmo"`
	BulletSpeed  float64 `json:"bulletSpeed"`
	BulletSize   float64 `json:"bulletSize"`
	AttackType   string  `json:"attackType"`
	Role         string  `json:"role"`
	Desc         string  `json:"desc"`
	RegenRate    float64 `json:"regenRate"`
}

var Heroes = []Hero{
	{Name: "Shelly", Color: "#8E55D9", Radius: 14, MaxLives: 7400, Speed: 285, AttackDamage: 600, AttackRate: 250, ReloadTime: 1500, MaxAmmo: 3, BulletSpeed: 620, BulletSize: 5, AttackType: "shelly_shotgun", Role: "Fighter", RegenRate: .010, Desc: "Five-pellet shotgun and a wall-breaking knockback Super"},
	{Name: "Colt", Color: "#E94D56", Radius: 13, MaxLives: 5600, Speed: 290, AttackDamage: 420, AttackRate: 300, ReloadTime: 1700, MaxAmmo: 3, BulletSpeed: 760, BulletSize: 4, AttackType: "colt_burst", Role: "Sharpshooter", RegenRate: .009, Desc: "Six-round moving burst with exceptional lane pressure"},
	{Name: "Barley", Color: "#47A7E8", Radius: 13, MaxLives: 4800, Speed: 285, AttackDamage: 760, AttackRate: 350, ReloadTime: 2000, MaxAmmo: 3, BulletSpeed: 0, BulletSize: 9, AttackType: "barley_lob", Role: "Thrower", RegenRate: .009, Desc: "Arcing bottle creates a two-tick damage pool over walls"},
	{Name: "Blaze", Color: "#C64BFF", Radius: 14, MaxLives: 5600, Speed: 290, AttackDamage: 260, AttackRate: 220, ReloadTime: 1450, MaxAmmo: 3, BulletSpeed: 590, BulletSize: 6, AttackType: "shotgun", Role: "Assault", RegenRate: .010, Desc: "Five plasma pellets apply marks; abilities detonate them or reposition"},
	{Name: "Frost", Color: "#35D9FF", Radius: 14, MaxLives: 5000, Speed: 290, AttackDamage: 180, AttackRate: 180, ReloadTime: 1200, MaxAmmo: 3, BulletSpeed: 690, BulletSize: 4, AttackType: "burst", Role: "Gunner", RegenRate: .009, Desc: "Six-shot precision burst rewards tracking the same target"},
	{Name: "Viper", Color: "#FF7138", Radius: 18, MaxLives: 9800, Speed: 235, AttackDamage: 1250, AttackRate: 520, ReloadTime: 1850, MaxAmmo: 3, AttackType: "slam", Role: "Tank", RegenRate: .008, Desc: "Short magma slam controls space and pulls enemies inward"},
	{Name: "Titan", Color: "#42E3D2", Radius: 13, MaxLives: 4700, Speed: 325, AttackDamage: 650, AttackRate: 300, ReloadTime: 1350, MaxAmmo: 3, BulletSpeed: 520, BulletSize: 11, AttackType: "boomerang", Role: "Assassin", RegenRate: .012, Desc: "Returning discs hit twice; cloak enables a high-risk ambush"},
	{Name: "Shadow", Color: "#75D947", Radius: 14, MaxLives: 6200, Speed: 258, AttackDamage: 750, AttackRate: 420, ReloadTime: 1750, MaxAmmo: 3, BulletSpeed: 450, BulletSize: 15, AttackType: "spore", Role: "Controller", RegenRate: .011, Desc: "Spore capsule splits into six seeking thorns and zones enemies"},
	{Name: "Spark", Color: "#6D52C7", Radius: 13, MaxLives: 5400, Speed: 320, AttackDamage: 1050, AttackRate: 260, ReloadTime: 1250, MaxAmmo: 3, AttackType: "dash", Role: "Assassin", RegenRate: .0105, Desc: "Scythe dash restores resources for every enemy crossed"},
	{Name: "Nova", Color: "#FFF4D0", Radius: 12, MaxLives: 4300, Speed: 275, AttackDamage: 900, AttackRate: 600, ReloadTime: 2100, MaxAmmo: 3, BulletSpeed: 860, BulletSize: 4, AttackType: "sniper", Role: "Marksman", RegenRate: .0095, Desc: "Long-range shot gains damage with distance; vulnerable up close"},
	{Name: "Rex", Color: "#4BC7FF", Radius: 15, MaxLives: 7200, Speed: 295, AttackDamage: 1200, AttackRate: 260, ReloadTime: 1050, MaxAmmo: 3, AttackType: "double_melee", Role: "Bruiser", RegenRate: .0085, Desc: "Twin manipulator strikes convert dealt damage into temporary shield"},
	{Name: "Pixel", Color: "#FFD43B", Radius: 14, MaxLives: 6600, Speed: 263, AttackDamage: 850, AttackRate: 360, ReloadTime: 1550, MaxAmmo: 3, BulletSpeed: 580, BulletSize: 10, AttackType: "quantum", Role: "Fighter", RegenRate: .010, Desc: "Quantum core splits into three shards and evolves during combat"},
	{Name: "Boulder", Color: "#59D348", Radius: 13, MaxLives: 5200, Speed: 285, AttackDamage: 320, AttackRate: 280, ReloadTime: 1400, MaxAmmo: 3, BulletSpeed: 600, BulletSize: 5, AttackType: "poison_fan", Role: "Debuffer", RegenRate: .0115, Desc: "Three poison darts stack damage-over-time and suppress healing"},
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
		CircleBody:       geometry.CircleBody{X: x, Y: y, Radius: h.Radius},
		PlayerId:         id,
		Name:             name,
		MaxLives:         h.MaxLives,
		Lives:            h.MaxLives,
		Color:            h.Color,
		HeroName:         h.Name,
		Speed:            h.Speed,
		AttackDmg:        h.AttackDamage,
		AttackRate:       h.AttackRate,
		ReloadTime:       h.ReloadTime,
		MaxAmmo:          h.MaxAmmo,
		Ammo:             h.MaxAmmo,
		BulletSpd:        h.BulletSpeed,
		BulletSz:         h.BulletSize,
		AttackType:       h.AttackType,
		RegenRate:        h.RegenRate,
		DamageMultiplier: 1,
	}
	return p
}
