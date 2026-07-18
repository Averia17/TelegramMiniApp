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
	Rotation float64 `json:"rotation"`
}

type ShootValue struct {
	Angle float64 `json:"angle"`
}

type AbilityValue struct {
	Slot string `json:"slot"`
}

type ServerEvent struct {
	Type   string
	Params interface{}
}
