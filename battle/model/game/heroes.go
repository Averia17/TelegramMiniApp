package game

import (
	"battle/model/player"
	"battle/service/geometry"
	"strings"
)

type Hero struct {
	Name               string       `json:"name"`
	DisplayName        string       `json:"displayName"`
	Rarity             string       `json:"rarity"`
	Title              string       `json:"title"`
	AttackDescription  string       `json:"attackDescription"`
	SuperDescription   string       `json:"superDescription"`
	PassiveDescription string       `json:"passiveDescription"`
	Color              string       `json:"color"`
	Radius             float64      `json:"radius"`
	MaxLives           int          `json:"maxLives"`
	Speed              int          `json:"speed"`
	AttackDamage       int          `json:"attackDamage"`
	AttackRate         int64        `json:"attackRate"`
	ReloadTime         int64        `json:"reloadTime"`
	MaxAmmo            int          `json:"maxAmmo"`
	BulletSpeed        int          `json:"bulletSpeed"`
	BulletSize         float64      `json:"bulletSize"`
	AttackType         string       `json:"attackType"`
	Role               string       `json:"role"`
	Desc               string       `json:"desc"`
	RegenRate          float64      `json:"regenRate"`
	Attack             AttackConfig `json:"attack"`
	Kit                HeroKit      `json:"kit"`
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
	"Needle":          {Basic: AbilityDefinition{"spore_thorn", "Споровый шип", "Спора летит по прямой, снижает лечение цели на 50% на 2 секунды и раскрывается шестью фиксированными шипами.", "basic", "projectile"}, Super: AbilityDefinition{"hunter_root", "Ловчий корень", "После 300 мс замаха корень наносит 40 урона, притягивает врагов к центру и оставляет на 3 секунды зону с уроном 15 каждые 0,5 секунды и замедлением 60%.", "primary", "server"}, Gadget: AbilityDefinition{"spore_escape", "Споровый побег", "Рывок на 6 метров оставляет облако спор радиусом 90 на 2 секунды: оно замедляет на 40%, а третий стак спор оглушает.", "secondary", "server"}},
	"Mandy":           {Basic: AbilityDefinition{"staff_strike", "Удар посохом", "Наносит 100 урона и оглушает на 0,3 секунды. После 2 секунд неподвижности Фокус усиливает следующий удар до 150, увеличивает радиус и дальность, оглушая на 0,8 секунды.", "basic", "melee"}, Super: AbilityDefinition{"devastation_wave", "Волна опустошения", "После подготовки 0,8 секунды выпускает волну через всю карту: 140–220 урона, оглушение 1,2 секунды и разрушение стен; во время подготовки Mandy защищена щитом 30% HP.", "primary", "server"}, Gadget: AbilityDefinition{"unyielding_stance", "Нерушимая стойка", "На 1,8 секунды снижает входящий урон на 40%; следующий удар наносит на 50% больше и возвращает Mandy 10% максимального HP при попадании.", "secondary", "server"}},
	"Fairy Mina":      {Basic: AbilityDefinition{"star_fan", "Звёздный веер", "Звёзды наносят 40 урона и лечат Mina на 5 HP за попадание; третье попадание взрывает метку на 80 урона в радиусе 100 и замедляет.", "basic", "projectile"}, Super: AbilityDefinition{"star_cocoon", "Звёздный кокон", "Всегда окутывает Mina: щит 500 HP на 4 секунды, аура радиусом 180 лечит её на 15 и наносит врагам 10 каждые 0,5 секунды.", "primary", "server"}, Gadget: AbilityDefinition{"repelling_wave", "Отталкивающая волна", "Волна радиусом 150 наносит 30 урона, отбрасывает врагов и очищает с Mina отрицательные эффекты.", "secondary", "server"}},
	"Brock Zeus":      {Basic: AbilityDefinition{"thunder_projectile", "Грозовой снаряд", "Снаряд наносит 85 урона и взрывается радиусом 80.", "basic", "projectile"}, Super: AbilityDefinition{"gods_hammer", "Молот богов", "Три удара через 0,7/1,1/1,5 секунды наносят 80/80/120 урона, замедляют и каждый разрушает стены.", "primary", "server"}, Gadget: AbilityDefinition{"discharge_cable", "Разрядный кабель", "Следующий выстрел становится пробивающим лучом и оставляет огненный след на 3 секунды: 5 урона каждые 0,5 секунды.", "secondary", "server"}},
	"Kaze":            {Basic: AbilityDefinition{"cross_slash", "Косые удары", "Два попадания открывают усиленный третий удар.", "basic", "melee"}, Super: AbilityDefinition{"piercing_dash", "Пронзающий рывок", "Попадание рывком оглушает на 1 секунду и сразу подготавливает усиленный следующий удар Kaze.", "primary", "server"}, Gadget: AbilityDefinition{"vanish", "Исчезновение", "Невидимость гарантирует критический первый удар.", "secondary", "server"}},
	"Wukong Mico":     {Basic: AbilityDefinition{"heavy_staff", "Тяжёлый посох", "Попадания накапливают до 5 зарядов Ярости.", "basic", "melee"}, Super: AbilityDefinition{"vengeance_vortex", "Вихрь возмездия", "Короткий прыжок запускает вихрь: он притягивает врагов на 20%, наносит 35 урона при старте, оглушает на 0,6 секунды, затем тикает каждые 0,4 секунды и лечит Mico.", "primary", "server"}, Gadget: AbilityDefinition{"stone_armor", "Каменная броня", "4 секунды снижает урон на 60%, хранит до 240 урона и взрывается на 80 урона в радиусе 140, давая до 4 зарядов Ярости.", "secondary", "server"}},
	"Persephone Lumi": {Basic: AbilityDefinition{"luminous_flower", "Световой цветок", "Цветок летит на 520 и прорастает при попадании или в конце пути: 60 урона сразу, затем 15 урона каждые 0,5 секунды в течение 6 секунд; враги замедляются и раскрываются.", "basic", "projectile"}, Super: AbilityDefinition{"root_garden", "Сад корней", "После 600 мс поле наносит 60 урона и оглушает врагов в радиусе на 1 секунду, затем замедляет их на 60%.", "primary", "server"}, Gadget: AbilityDefinition{"flower_burst", "Цветочный взрыв", "Поглощает цветы и сад, наносит каждой цели один общий всплеск на 55 урона и лечит Lumi на 10 HP за объект, максимум 50.", "secondary", "server"}},
}

var Heroes = withSelectionMetadata(withHeroKits(withAttackConfigs([]Hero{
	{Name: "Needle", Color: "#75D947", Radius: 14, MaxLives: 600, Speed: 13, AttackDamage: 60, AttackRate: 420, ReloadTime: 1200, MaxAmmo: 3, BulletSpeed: 23, BulletSize: 15, AttackType: "spore", Role: "Controller", RegenRate: .011, Desc: "Root controller with anti-heal spores and a pull zone"},
	{Name: "Mandy", Color: "#F4C542", Radius: 14, MaxLives: 700, Speed: 15, AttackDamage: 100, AttackRate: 420, ReloadTime: 1150, MaxAmmo: 3, AttackType: "mandy_staff", Role: "Fighter", RegenRate: .010, Desc: "Focused melee fighter with a map-wide ground-wave Super"},
	{Name: "Fairy Mina", Color: "#FF8FE8", Radius: 13, MaxLives: 650, Speed: 14, AttackDamage: 40, AttackRate: 420, ReloadTime: 1100, MaxAmmo: 3, BulletSpeed: 30, BulletSize: 7, AttackType: "mina_star_fan", Role: "Support", RegenRate: .008, Desc: "Self-sustaining star fan with a dangerous aura"},
	{Name: "Brock Zeus", Color: "#62C8FF", Radius: 14, MaxLives: 600, Speed: 12, AttackDamage: 85, AttackRate: 520, ReloadTime: 1300, MaxAmmo: 3, BulletSpeed: 36, BulletSize: 8, AttackType: "zeus_lightning", Role: "Sharpshooter", RegenRate: .009, Desc: "Explosive lightning and a wall-breaking storm"},
	{Name: "Kaze", Color: "#B88CFF", Radius: 12, MaxLives: 650, Speed: 16, AttackDamage: 85, AttackRate: 280, ReloadTime: 800, MaxAmmo: 3, AttackType: "kaze_cross_slash", Role: "Assassin", RegenRate: .011, Desc: "Rapid combo slashes and a follow-up-priming dash"},
	{Name: "Wukong Mico", Color: "#FFB33E", Radius: 15, MaxLives: 900, Speed: 14, AttackDamage: 100, AttackRate: 650, ReloadTime: 1400, MaxAmmo: 3, AttackType: "mico_staff", Role: "Tank", RegenRate: .010, Desc: "Heavy close-range staff swings without forced movement"},
	{Name: "Persephone Lumi", Color: "#D954A8", Radius: 13, MaxLives: 680, Speed: 15, AttackDamage: 60, AttackRate: 470, ReloadTime: 1250, MaxAmmo: 3, BulletSpeed: 28, BulletSize: 8, AttackType: "lumi_orb", Role: "Controller", RegenRate: .010, Desc: "Tactical flower projectiles build a damaging garden and root enemies"},
	{Name: "Katty", Color: "#FF5C9A", Radius: 13, MaxLives: 640, Speed: 14, AttackDamage: 55, AttackRate: 520, ReloadTime: 1300, MaxAmmo: 3, AttackType: "katty_paint_spray", Role: "Controller", RegenRate: .010, Desc: "Street artist who controls space with layered paint"},
})))

type heroSelectionMetadata struct {
	displayName string
	rarity      string
	title       string
}

var heroSelectionMetadataByName = map[string]heroSelectionMetadata{
	"Needle":          {"NEEDLE", "rare", "Bio Shooter"},
	"Mandy":           {"MANDY", "super-rare", "Close-Range Sugar Fighter"},
	"Fairy Mina":      {"FAIRY MINA", "epic", "Star Support"},
	"Brock Zeus":      {"BROCK ZEUS", "mythic", "Storm Sharpshooter"},
	"Kaze":            {"KAZE", "legendary", "Assassin of the Wind"},
	"Wukong Mico":     {"WUKONG MICO", "epic", "Iron Staff Tank"},
	"Persephone Lumi": {"PERSEPHONE LUMI", "mythic", "Root Garden Controller"},
	"Katty":           {"KATTY", "legendary", "Street Paint Artist"},
}

func withSelectionMetadata(heroes []Hero) []Hero {
	for index := range heroes {
		metadata := heroSelectionMetadataByName[heroes[index].Name]
		heroes[index].DisplayName = metadata.displayName
		heroes[index].Rarity = metadata.rarity
		heroes[index].Title = metadata.title
		heroes[index].AttackDescription = heroes[index].Kit.Basic.Description
		heroes[index].SuperDescription = heroes[index].Kit.Super.Description
		heroes[index].PassiveDescription = heroes[index].Desc
	}
	return heroes
}

func RandomHero() Hero {
	return DefaultHeroCatalog().Random()
}

func withHeroKits(heroes []Hero) []Hero {
	heroKits["Katty"] = HeroKit{
		Basic:  AbilityDefinition{"paint_spray", "Краска-пшик", "Короткий направленный пшик наносит 55 урона в радиусе 65 и оставляет облако краски; третий слой даёт +45% урона и оглушение.", "basic", "server"},
		Super:  AbilityDefinition{"paint_grenade", "Красящая лужа", "Katty создаёт под собой лужу радиусом 220: после активации она наносит 70 урона, наносит третий слой краски и замедляет врагов.", "primary", "server"},
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
	if hero, ok := DefaultHeroCatalog().Find(name); ok {
		return &hero
	}
	return nil
}

func (h Hero) CreatePlayer(id, name string, x, y float64) *player.Player {
	p := &player.Player{
		CircleBody:       geometry.CircleBody{X: x, Y: y, Radius: h.Radius},
		PlayerId:         id,
		Name:             name,
		MaxLives:         h.MaxLives,
		BaseMaxLives:     h.MaxLives,
		Lives:            h.MaxLives,
		Color:            h.Color,
		HeroName:         h.Name,
		Speed:            float64(h.Speed) * RuntimeMovementSpeedScale,
		AttackDmg:        h.AttackDamage,
		AttackRate:       h.AttackRate,
		ReloadTime:       h.ReloadTime,
		MaxAmmo:          h.MaxAmmo,
		Ammo:             h.MaxAmmo,
		BulletSpd:        float64(h.BulletSpeed) * RuntimeProjectileSpeedScale,
		BulletSz:         h.BulletSize,
		AttackType:       h.AttackType,
		RegenRate:        h.RegenRate,
		DamageMultiplier: 1,
		SlowMultiplier:   1,
		SuperCharge:      SuperStartChargePercent,
		GadgetCharges:    GadgetChargesOnSpawn,
	}
	return p
}
