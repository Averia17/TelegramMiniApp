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
	Speed        int          `json:"speed"`
	AttackDamage int          `json:"attackDamage"`
	AttackRate   int64        `json:"attackRate"`
	ReloadTime   int64        `json:"reloadTime"`
	MaxAmmo      int          `json:"maxAmmo"`
	BulletSpeed  int          `json:"bulletSpeed"`
	BulletSize   float64      `json:"bulletSize"`
	AttackType   string       `json:"attackType"`
	Role         string       `json:"role"`
	Desc         string       `json:"desc"`
	RegenRate    float64      `json:"regenRate"`
	Attack       AttackConfig `json:"attack"`
	Kit          HeroKit       `json:"kit"`
}

// AbilityDefinition is the wire contract shared by the battle server and the
// client. Mechanics stay in the concrete CombatKit; this metadata describes
// how a command is presented and whether it is safe to predict locally.
type AbilityDefinition struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Slot        string `json:"slot"`
	Prediction  string `json:"prediction"`
}

type HeroKit struct {
	Basic   AbilityDefinition `json:"basic"`
	Super   AbilityDefinition `json:"super"`
	Gadget  AbilityDefinition `json:"gadget"`
}

var heroKits = map[string]HeroKit{
	"Shadow": {Basic: AbilityDefinition{"spore_thorn", "Споровый шип", "Самонаводящийся шип накладывает Споры.", "basic", "projectile"}, Super: AbilityDefinition{"hunter_root", "Ловчий корень", "Корень подбрасывает врагов и оставляет замедляющую зону.", "primary", "server"}, Gadget: AbilityDefinition{"spore_dash", "Споровый рывок", "Рывок оставляет облако спор.", "secondary", "server"}},
	"Mandy": {Basic: AbilityDefinition{"staff_strike", "Удар посохом", "Неподвижность усиливает удар и оглушает.", "basic", "melee"}, Super: AbilityDefinition{"devastation_wave", "Волна опустошения", "Дальняя волна разрушает стены.", "primary", "server"}, Gadget: AbilityDefinition{"unyielding_stance", "Нерушимая стойка", "Стойка защищает от контроля и снижает урон.", "secondary", "server"}},
	"Fairy Mina": {Basic: AbilityDefinition{"star_fan", "Звёздный веер", "Звёзды лечат союзников и метят врагов.", "basic", "projectile"}, Super: AbilityDefinition{"star_cocoon", "Звёздный кокон", "Щит создаёт лечащую ауру.", "primary", "server"}, Gadget: AbilityDefinition{"repelling_wave", "Отталкивающая волна", "Отбрасывает врагов и оглушает отмеченных.", "secondary", "server"}},
	"Brock Zeus": {Basic: AbilityDefinition{"thunder_projectile", "Грозовой снаряд", "Взрывной снаряд разрушает стены.", "basic", "projectile"}, Super: AbilityDefinition{"gods_hammer", "Молот богов", "Три удара молнии создают горящую зону.", "primary", "server"}, Gadget: AbilityDefinition{"discharge_cable", "Разрядный кабель", "Следующий выстрел становится пробивающим лучом.", "secondary", "server"}},
	"Kaze": {Basic: AbilityDefinition{"cross_slash", "Косые удары", "Два попадания открывают усиленный третий удар.", "basic", "melee"}, Super: AbilityDefinition{"piercing_dash", "Пронзающий рывок", "Рывок помечает врагов и усиливает получаемый ими урон.", "primary", "server"}, Gadget: AbilityDefinition{"vanish", "Исчезновение", "Невидимость гарантирует критический первый удар.", "secondary", "server"}},
	"Wukong Mico": {Basic: AbilityDefinition{"heavy_staff", "Тяжёлый посох", "Попадания накапливают Ярость.", "basic", "melee"}, Super: AbilityDefinition{"vengeance_vortex", "Вихрь возмездия", "Вихрь расходует Ярость и наносит урон вокруг.", "primary", "server"}, Gadget: AbilityDefinition{"stone_armor", "Каменная броня", "Щит накапливает урон и взрывается после окончания.", "secondary", "server"}},
	"Damian": {Basic: AbilityDefinition{"blight_orb", "Сфера скверны", "Попадания снижают исходящий урон врага.", "basic", "projectile"}, Super: AbilityDefinition{"soul_totem", "Тотем душ", "Тотем автономно атакует ближайшего врага.", "primary", "server"}, Gadget: AbilityDefinition{"exchange", "Обмен", "Меняет место с тотемом и взрывает его.", "secondary", "server"}},
	"Persephone Lumi": {Basic: AbilityDefinition{"luminous_trail", "Световой след", "След замедляет и раскрывает врагов.", "basic", "projectile"}, Super: AbilityDefinition{"root_garden", "Сад корней", "Поле корней обездвиживает вошедших врагов.", "primary", "server"}, Gadget: AbilityDefinition{"flower_burst", "Цветочный взрыв", "Взрывает активный след или сад.", "secondary", "server"}},
}

var Heroes = withHeroKits(withAttackConfigs([]Hero{
	{Name: "Shadow", Color: "#75D947", Radius: 14, MaxLives: 620, Speed: 12, AttackDamage: 65, AttackRate: 420, ReloadTime: 1750, MaxAmmo: 3, BulletSpeed: 23, BulletSize: 15, AttackType: "spore", Role: "Controller", RegenRate: .011, Desc: "Spore capsule splits into six seeking thorns and zones enemies"},
	{Name: "Mandy", Color: "#F4C542", Radius: 14, MaxLives: 720, Speed: 13, AttackDamage: 60, AttackRate: 420, ReloadTime: 1650, MaxAmmo: 3, AttackType: "mandy_staff", Role: "Fighter", RegenRate: .010, Desc: "Focused melee fighter with a map-wide ground-wave Super"},
	{Name: "Fairy Mina", Color: "#FF8FE8", Radius: 13, MaxLives: 600, Speed: 14, AttackDamage: 40, AttackRate: 420, ReloadTime: 1550, MaxAmmo: 3, BulletSpeed: 30, BulletSize: 7, AttackType: "mina_star_fan", Role: "Support", RegenRate: .011, Desc: "Three-star cone and a five-second healing aura"},
	{Name: "Brock Zeus", Color: "#62C8FF", Radius: 14, MaxLives: 620, Speed: 12, AttackDamage: 80, AttackRate: 520, ReloadTime: 1800, MaxAmmo: 3, BulletSpeed: 36, BulletSize: 8, AttackType: "zeus_lightning", Role: "Sharpshooter", RegenRate: .009, Desc: "Explosive lightning and a wall-breaking storm"},
	{Name: "Kaze", Color: "#B88CFF", Radius: 12, MaxLives: 650, Speed: 16, AttackDamage: 40, AttackRate: 220, ReloadTime: 850, MaxAmmo: 3, AttackType: "kaze_cross_slash", Role: "Assassin", RegenRate: .011, Desc: "Rapid twin slash and an eight-tile piercing dash"},
	{Name: "Wukong Mico", Color: "#FFB33E", Radius: 15, MaxLives: 900, Speed: 13, AttackDamage: 85, AttackRate: 650, ReloadTime: 1750, MaxAmmo: 3, AttackType: "mico_staff", Role: "Tank", RegenRate: .010, Desc: "Heavy close-range staff swings without forced movement"},
	{Name: "Damian", Color: "#8D52D9", Radius: 13, MaxLives: 640, Speed: 13, AttackDamage: 75, AttackRate: 430, ReloadTime: 1550, MaxAmmo: 3, BulletSpeed: 31, BulletSize: 9, AttackType: "damian_dark_orb", Role: "Summoner", RegenRate: .010, Desc: "Dark projectiles and an autonomous soul totem"},
	{Name: "Persephone Lumi", Color: "#D954A8", Radius: 13, MaxLives: 680, Speed: 13, AttackDamage: 70, AttackRate: 470, ReloadTime: 1600, MaxAmmo: 3, BulletSpeed: 28, BulletSize: 10, AttackType: "lumi_trail_orb", Role: "Controller", RegenRate: .010, Desc: "Slow trails and a rooting garden"},
}))

func RandomHero() Hero {
	return Heroes[rand.Intn(len(Heroes))]
}

func withHeroKits(heroes []Hero) []Hero {
	for index := range heroes {
		heroes[index].Kit = heroKits[heroes[index].Name]
	}
	return heroes
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
		Speed:            float64(h.Speed) * RuntimeMovementSpeedScale,
		AttackDmg:        h.AttackDamage,
		AttackRate:       int64(float64(h.AttackRate)*AttackRateScale + .5),
		ReloadTime:       int64(float64(h.ReloadTime)*ReloadTimeScale + .5),
		MaxAmmo:          h.MaxAmmo,
		Ammo:             h.MaxAmmo,
		BulletSpd:        float64(h.BulletSpeed) * RuntimeProjectileSpeedScale,
		BulletSz:         h.BulletSize,
		AttackType:       h.AttackType,
		RegenRate:        h.RegenRate,
		DamageMultiplier: 1,
		SlowMultiplier:   1,
		GadgetCharges:    3,
	}
	return p
}
