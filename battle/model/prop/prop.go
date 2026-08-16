package prop

import "battle/service/geometry"

const (
	LunarCrateLives  = 240
	HealthCrateLives = 500
)

type Prop struct {
	geometry.CircleBody
	Type     string
	LootType string
	Lives    int
	MaxLives int
	Active   bool
}

func NewProp(propType string, x, y, radius float64) *Prop {
	return &Prop{
		CircleBody: geometry.CircleBody{X: x, Y: y, Radius: radius},
		Type:       propType,
		Lives:      0,
		MaxLives:   0,
		Active:     true,
	}
}

func NewLunarCrate(x, y float64, lootType string) *Prop {
	return &Prop{
		CircleBody: geometry.CircleBody{X: x, Y: y, Radius: 22},
		Type:       "lunar_crate",
		LootType:   lootType,
		Lives:      LunarCrateLives,
		MaxLives:   LunarCrateLives,
		Active:     true,
	}
}

func NewHealthCrate(x, y float64) *Prop {
	return &Prop{
		CircleBody: geometry.CircleBody{X: x, Y: y, Radius: 22},
		Type:       "health_crate",
		Lives:      HealthCrateLives,
		MaxLives:   HealthCrateLives,
		Active:     true,
	}
}
