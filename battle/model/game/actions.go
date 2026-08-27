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
	ClientID    string  `json:"clientId,omitempty"`
}

type AbilityValue struct {
	Slot        string  `json:"slot"`
	TargetID    string  `json:"targetId,omitempty"`
	AimAngle    float64 `json:"aimAngle,omitempty"`
	AimDistance float64 `json:"aimDistance,omitempty"`
	AimProvided bool    `json:"aimProvided,omitempty"`
	// ClientID makes ability commands idempotently observable by prediction.
	// It is echoed back in PlayerJSON once the server has accepted or rejected
	// the command, so the client never guesses whether a cast happened.
	ClientID string `json:"clientId,omitempty"`
}

type AbilityCancelValue struct {
	ClientID       string `json:"clientId,omitempty"`
	TargetClientID string `json:"targetClientId,omitempty"`
}

type AimingValue struct {
	Aiming bool `json:"aiming"`
}

type ServerEvent struct {
	Type   string
	Params interface{}
}
