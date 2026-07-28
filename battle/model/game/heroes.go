package game

import (
	"battle/model/player"
	"battle/service/geometry"
	"math/rand"
)

type Hero struct {
	Name         string       `json:"name"`
	Color        string       `json:"color"`
	Radius       float64      `json:"radius"`
	MaxLives     int          `json:"maxLives"`
	Speed        float64      `json:"speed"`
	AttackDamage int          `json:"attackDamage"`
	AttackRate   int64        `json:"attackRate"`
	ReloadTime   int64        `json:"reloadTime"`
	MaxAmmo      int          `json:"maxAmmo"`
	BulletSpeed  float64      `json:"bulletSpeed"`
	BulletSize   float64      `json:"bulletSize"`
	AttackType   string       `json:"attackType"`
	Role         string       `json:"role"`
	Desc         string       `json:"desc"`
	RegenRate    float64      `json:"regenRate"`
	Attack       AttackConfig `json:"attack"`
}

var Heroes = withAttackConfigs([]Hero{
	{Name: "Shadow", Color: "#75D947", Radius: 14, MaxLives: 6200, Speed: 240, AttackDamage: 750, AttackRate: 420, ReloadTime: 1750, MaxAmmo: 3, BulletSpeed: 450, BulletSize: 15, AttackType: "spore", Role: "Controller", RegenRate: .011, Desc: "Spore capsule splits into six seeking thorns and zones enemies"},
	{Name: "Mandy", Color: "#F4C542", Radius: 14, MaxLives: 7200, Speed: 250, AttackDamage: 1700, AttackRate: 420, ReloadTime: 1650, MaxAmmo: 3, AttackType: "mandy_staff", Role: "Fighter", RegenRate: .010, Desc: "Focused melee fighter with a map-wide ground-wave Super"},
	{Name: "Fairy Mina", Color: "#FF8FE8", Radius: 13, MaxLives: 6000, Speed: 270, AttackDamage: 720, AttackRate: 420, ReloadTime: 1550, MaxAmmo: 3, BulletSpeed: 590, BulletSize: 7, AttackType: "mina_star_fan", Role: "Support", RegenRate: .011, Desc: "Three-star cone and a five-second healing aura"},
	{Name: "Brock Zeus", Color: "#62C8FF", Radius: 14, MaxLives: 6200, Speed: 245, AttackDamage: 1550, AttackRate: 520, ReloadTime: 1800, MaxAmmo: 3, BulletSpeed: 720, BulletSize: 8, AttackType: "zeus_lightning", Role: "Sharpshooter", RegenRate: .009, Desc: "Explosive lightning and a wall-breaking storm"},
	{Name: "Kaze", Color: "#B88CFF", Radius: 12, MaxLives: 6500, Speed: 310, AttackDamage: 780, AttackRate: 220, ReloadTime: 850, MaxAmmo: 3, AttackType: "kaze_cross_slash", Role: "Assassin", RegenRate: .011, Desc: "Rapid twin slash and an eight-tile piercing dash"},
	{Name: "Wukong Mico", Color: "#FFB33E", Radius: 15, MaxLives: 9000, Speed: 255, AttackDamage: 1450, AttackRate: 650, ReloadTime: 1750, MaxAmmo: 3, AttackType: "mico_staff", Role: "Tank", RegenRate: .010, Desc: "Heavy close-range staff swings without forced movement"},
	{Name: "Damian", Color: "#8D52D9", Radius: 13, MaxLives: 6400, Speed: 250, AttackDamage: 1200, AttackRate: 430, ReloadTime: 1550, MaxAmmo: 3, BulletSpeed: 610, BulletSize: 9, AttackType: "damian_dark_orb", Role: "Summoner", RegenRate: .010, Desc: "Dark projectiles and an autonomous soul totem"},
	{Name: "Persephone Lumi", Color: "#D954A8", Radius: 13, MaxLives: 6800, Speed: 250, AttackDamage: 1050, AttackRate: 470, ReloadTime: 1600, MaxAmmo: 3, BulletSpeed: 560, BulletSize: 10, AttackType: "lumi_trail_orb", Role: "Controller", RegenRate: .010, Desc: "Slow trails and a rooting garden"},
})

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
		Speed:            h.Speed * PlayerSpeedScale,
		AttackDmg:        h.AttackDamage,
		AttackRate:       int64(float64(h.AttackRate)*AttackRateScale + .5),
		ReloadTime:       int64(float64(h.ReloadTime)*ReloadTimeScale + .5),
		MaxAmmo:          h.MaxAmmo,
		Ammo:             h.MaxAmmo,
		BulletSpd:        h.BulletSpeed,
		BulletSz:         h.BulletSize,
		AttackType:       h.AttackType,
		RegenRate:        h.RegenRate,
		DamageMultiplier: 1,
		GadgetCharges:    3,
	}
	return p
}
