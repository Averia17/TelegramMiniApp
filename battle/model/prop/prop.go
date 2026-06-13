package prop

import "battle/service/geometry"

type Prop struct {
	geometry.CircleBody
	Type   string
	Active bool
}

func NewProp(propType string, x, y, radius float64) *Prop {
	return &Prop{
		CircleBody: geometry.CircleBody{X: x, Y: y, Radius: radius},
		Type:       propType,
		Active:     true,
	}
}
