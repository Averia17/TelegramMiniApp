package game

import "encoding/json"

// combatProfileRuntimeDefaults is the small typed slice of the generated
// profile consumed by authoritative runtime code. The full JSON remains the
// generated contract; this type prevents gameplay constants from drifting
// away from that contract while keeping callers strongly typed.
type combatProfileRuntimeDefaults struct {
	Defaults struct {
		Super struct {
			MaxChargePercent   int `json:"maxChargePercent"`
			StartChargePercent int `json:"startChargePercent"`
		} `json:"super"`
		Gadget struct {
			MaxCharges     int `json:"maxCharges"`
			ChargesOnSpawn int `json:"chargesOnSpawn"`
		} `json:"gadget"`
		HealthBoost struct {
			Fraction          float64 `json:"fraction"`
			TeamFraction      float64 `json:"teamFraction"`
			MaxStacks         int     `json:"maxStacks"`
			MaxActivePickups  int     `json:"maxActivePickups"`
			TTLMS             int64   `json:"ttlMs"`
			HealsCurrentLives bool    `json:"healsCurrentLives"`
		} `json:"healthBoost"`
		AI struct {
			LowHealthRetreatFraction      float64 `json:"lowHealthRetreatFraction"`
			CriticalHealthRetreatFraction float64 `json:"criticalHealthRetreatFraction"`
			SuperUseAdvantageFraction     float64 `json:"superUseAdvantageFraction"`
			PickupContestHealthFraction   float64 `json:"pickupContestHealthFraction"`
		} `json:"ai"`
	} `json:"defaults"`
}

func loadCombatProfileRuntimeDefaults() combatProfileRuntimeDefaults {
	var defaults combatProfileRuntimeDefaults
	if err := json.Unmarshal([]byte(GeneratedCombatProfileJSON), &defaults); err != nil {
		panic("generated combat profile cannot be decoded: " + err.Error())
	}
	if defaults.Defaults.HealthBoost.Fraction <= 0 ||
		defaults.Defaults.HealthBoost.Fraction > 1 ||
		defaults.Defaults.HealthBoost.TeamFraction <= 0 ||
		defaults.Defaults.HealthBoost.TeamFraction > defaults.Defaults.HealthBoost.Fraction ||
		defaults.Defaults.HealthBoost.MaxStacks <= 0 ||
		defaults.Defaults.HealthBoost.MaxActivePickups <= 0 ||
		defaults.Defaults.HealthBoost.TTLMS <= 0 ||
		defaults.Defaults.HealthBoost.HealsCurrentLives {
		panic("generated combat profile has invalid health boost runtime defaults")
	}
	if defaults.Defaults.Super.MaxChargePercent <= 0 ||
		defaults.Defaults.Super.StartChargePercent < 0 ||
		defaults.Defaults.Super.StartChargePercent > defaults.Defaults.Super.MaxChargePercent ||
		defaults.Defaults.Gadget.MaxCharges <= 0 ||
		defaults.Defaults.Gadget.ChargesOnSpawn < 0 ||
		defaults.Defaults.Gadget.ChargesOnSpawn > defaults.Defaults.Gadget.MaxCharges {
		panic("generated combat profile has invalid ability runtime defaults")
	}
	if defaults.Defaults.AI.LowHealthRetreatFraction <= 0 ||
		defaults.Defaults.AI.LowHealthRetreatFraction > 1 ||
		defaults.Defaults.AI.CriticalHealthRetreatFraction <= 0 ||
		defaults.Defaults.AI.CriticalHealthRetreatFraction > 1 ||
		defaults.Defaults.AI.CriticalHealthRetreatFraction > defaults.Defaults.AI.LowHealthRetreatFraction ||
		defaults.Defaults.AI.SuperUseAdvantageFraction <= 0 ||
		defaults.Defaults.AI.SuperUseAdvantageFraction > 1 ||
		defaults.Defaults.AI.PickupContestHealthFraction <= 0 ||
		defaults.Defaults.AI.PickupContestHealthFraction > 1 {
		panic("generated combat profile has invalid AI runtime defaults")
	}
	return defaults
}

var loadedCombatProfileRuntimeDefaults = loadCombatProfileRuntimeDefaults()
