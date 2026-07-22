package game

type Action struct {
	PlayerId string
	Type     string
	Ts       int64
	Value    interface{}
}

type MoveValue struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type RotateValue struct {
	Rotation    float64 `json:"rotation"`
	AimDistance float64 `json:"aimDistance,omitempty"`
}

type ShootValue struct {
	Angle       float64 `json:"angle"`
	AimDistance float64 `json:"aimDistance,omitempty"`
	AutoAim     bool    `json:"autoAim,omitempty"`
}

type AbilityValue struct {
	Slot string `json:"slot"`
}

type AimingValue struct {
	Aiming bool `json:"aiming"`
}

type ServerEvent struct {
	Type   string
	Params interface{}
}
