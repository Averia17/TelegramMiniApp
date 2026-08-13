package game

import (
	"battle/model/player"
	"battle/service/geometry"
	"math/rand"
	"strings"
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
	Kit          HeroKit      `json:"kit"`
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
	Basic  AbilityDefinition `json:"basic"`
	Super  AbilityDefinition `json:"super"`
	Gadget AbilityDefinition `json:"gadget"`
}

var heroKits = map[string]HeroKit{
	"Needle":          {Basic: AbilityDefinition{"spore_thorn", "Споровый шип", "Спора летит по прямой, ломает ближайшую разрушаемую стену и при попадании или в конце полёта раскрывается шестью фиксированными радиальными шипами.", "basic", "projectile"}, Super: AbilityDefinition{"hunter_root", "Ловчий корень", "Корень оглушает врагов и оставляет замедляющую зону.", "primary", "server"}, Gadget: AbilityDefinition{"moisture_reserve", "Запас влаги", "Гарантированно восстанавливает 30% максимального здоровья за 3 секунды даже при получении урона.", "secondary", "server"}},
	"Mandy":           {Basic: AbilityDefinition{"staff_strike", "Удар посохом", "Неподвижность усиливает удар и оглушает.", "basic", "melee"}, Super: AbilityDefinition{"devastation_wave", "Волна опустошения", "После подготовки выпускает волну через всю карту, разрушая стены; во время подготовки Mandy может двигаться.", "primary", "server"}, Gadget: AbilityDefinition{"unyielding_stance", "Нерушимая стойка", "На 1,8 секунды снижает входящий урон на 40%; следующий удар посохом наносит на 50% больше урона и замедляет цель.", "secondary", "server"}},
	"Fairy Mina":      {Basic: AbilityDefinition{"star_fan", "Звёздный веер", "Три прямых звезды ломают ближайшую разрушаемую стену при столкновении; врага метят и повторным попаданием взрывают метку, союзника лечат.", "basic", "projectile"}, Super: AbilityDefinition{"star_cocoon", "Звёздный кокон", "Выбирает самого раненого союзника рядом; щит и лечащая аура следуют за ним.", "primary", "server"}, Gadget: AbilityDefinition{"repelling_wave", "Отталкивающая волна", "Отбрасывает врагов и оглушает отмеченных.", "secondary", "server"}},
	"Brock Zeus":      {Basic: AbilityDefinition{"thunder_projectile", "Грозовой снаряд", "Снаряд взрывается при столкновении или в конце дальности, но не разрушает стены.", "basic", "projectile"}, Super: AbilityDefinition{"gods_hammer", "Молот богов", "Показывает три точки удара молнии; последний удар больше и разрушает стены.", "primary", "server"}, Gadget: AbilityDefinition{"discharge_cable", "Разрядный кабель", "Следующий выстрел становится пробивающим лучом.", "secondary", "server"}},
	"Kaze":            {Basic: AbilityDefinition{"cross_slash", "Косые удары", "Два попадания открывают усиленный третий удар.", "basic", "melee"}, Super: AbilityDefinition{"piercing_dash", "Пронзающий рывок", "Попадание рывком сразу подготавливает усиленный следующий удар Kaze.", "primary", "server"}, Gadget: AbilityDefinition{"vanish", "Исчезновение", "Невидимость гарантирует критический первый удар.", "secondary", "server"}},
	"Wukong Mico":     {Basic: AbilityDefinition{"heavy_staff", "Тяжёлый посох", "Попадания накапливают до 5 зарядов Ярости.", "basic", "melee"}, Super: AbilityDefinition{"vengeance_vortex", "Вихрь возмездия", "Расходует Ярость, увеличивая радиус, длительность и урон вихря; вихрь лечит Mico по тикам.", "primary", "server"}, Gadget: AbilityDefinition{"stone_armor", "Каменная броня", "Броня снижает входящий урон и превращает поглощённый урон в Ярость без ответного взрыва.", "secondary", "server"}},
	"Persephone Lumi": {Basic: AbilityDefinition{"luminous_flower", "Световой цветок", "Снаряд ломает ближайшую разрушаемую стену, наносит прямой урон и выращивает один замедляющий и раскрывающий цветок в точке остановки.", "basic", "projectile"}, Super: AbilityDefinition{"root_garden", "Сад корней", "Поле корней обездвиживает вошедших врагов.", "primary", "server"}, Gadget: AbilityDefinition{"flower_burst", "Цветочный взрыв", "Поглощает все цветки и сады, нанося каждой цели один общий всплеск.", "secondary", "server"}},
}

var Heroes = withHeroKits(withAttackConfigs([]Hero{
	{Name: "Needle", Color: "#75D947", Radius: 14, MaxLives: 620, Speed: 12, AttackDamage: 65, AttackRate: 420, ReloadTime: 1750, MaxAmmo: 3, BulletSpeed: 23, BulletSize: 15, AttackType: "spore", Role: "Controller", RegenRate: .011, Desc: "Straight spore splits into six fixed radial thorns"},
	{Name: "Mandy", Color: "#F4C542", Radius: 14, MaxLives: 720, Speed: 13, AttackDamage: 60, AttackRate: 420, ReloadTime: 1650, MaxAmmo: 3, AttackType: "mandy_staff", Role: "Fighter", RegenRate: .010, Desc: "Focused melee fighter with a map-wide ground-wave Super"},
	{Name: "Fairy Mina", Color: "#FF8FE8", Radius: 13, MaxLives: 600, Speed: 14, AttackDamage: 40, AttackRate: 420, ReloadTime: 1550, MaxAmmo: 3, BulletSpeed: 30, BulletSize: 7, AttackType: "mina_star_fan", Role: "Support", RegenRate: .011, Desc: "Direct star fan marks enemies and heals allies"},
	{Name: "Brock Zeus", Color: "#62C8FF", Radius: 14, MaxLives: 620, Speed: 12, AttackDamage: 80, AttackRate: 520, ReloadTime: 1800, MaxAmmo: 3, BulletSpeed: 36, BulletSize: 8, AttackType: "zeus_lightning", Role: "Sharpshooter", RegenRate: .009, Desc: "Explosive lightning and a wall-breaking storm"},
	{Name: "Kaze", Color: "#B88CFF", Radius: 12, MaxLives: 650, Speed: 16, AttackDamage: 40, AttackRate: 220, ReloadTime: 850, MaxAmmo: 3, AttackType: "kaze_cross_slash", Role: "Assassin", RegenRate: .011, Desc: "Rapid combo slashes and a follow-up-priming dash"},
	{Name: "Wukong Mico", Color: "#FFB33E", Radius: 15, MaxLives: 900, Speed: 13, AttackDamage: 85, AttackRate: 650, ReloadTime: 1750, MaxAmmo: 3, AttackType: "mico_staff", Role: "Tank", RegenRate: .010, Desc: "Heavy close-range staff swings without forced movement"},
	{Name: "Persephone Lumi", Color: "#D954A8", Radius: 13, MaxLives: 680, Speed: 13, AttackDamage: 70, AttackRate: 470, ReloadTime: 1600, MaxAmmo: 3, BulletSpeed: 28, BulletSize: 10, AttackType: "lumi_trail_orb", Role: "Controller", RegenRate: .010, Desc: "A single slowing flower and a rooting garden"},
	{Name: "Katty", Color: "#FF5C9A", Radius: 13, MaxLives: 640, Speed: 14, AttackDamage: 42, AttackRate: 520, ReloadTime: 1700, MaxAmmo: 3, AttackType: "katty_paint_queue", Role: "Controller", RegenRate: .010, Desc: "Street artist who controls space with layered paint"},
}))

func RandomHero() Hero {
	return Heroes[rand.Intn(len(Heroes))]
}

func withHeroKits(heroes []Hero) []Hero {
	heroKits["Katty"] = HeroKit{
		Basic:  AbilityDefinition{"paint_queue", "Краска-очередь", "Три последовательных снаряда веером ломают ближайшую разрушаемую стену при столкновении и накладывают слои краски; третий слой оглушает.", "basic", "server"},
		Super:  AbilityDefinition{"paint_grenade", "Баллон-граната", "После приземления лужа однократно ослепляет каждого вошедшего врага и наносит третий слой.", "primary", "server"},
		Gadget: AbilityDefinition{"paint_flight", "Красколёт", "Рывок оставляет след краски, замедляющий врагов и ускоряющий Кэтти.", "secondary", "server"},
	}
	for index := range heroes {
		kit := heroKits[heroes[index].Name]
		heroes[index].Kit = kit
	}
	return heroes
}

func CanonicalHeroName(name string) string {
	normalized := strings.ToLower(strings.TrimSpace(name))
	if normalized == "needle" || normalized == "shadow" {
		return "Needle"
	}
	for _, h := range Heroes {
		if strings.ToLower(h.Name) == normalized {
			return h.Name
		}
	}
	return ""
}

func GetHeroByName(name string) *Hero {
	canonical := CanonicalHeroName(name)
	for _, h := range Heroes {
		if h.Name == canonical {
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
		SuperCharge:      100,
		GadgetCharges:    3,
	}
	return p
}
