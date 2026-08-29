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
	Heroes map[string]struct {
		Super struct {
			CooldownMs int64 `json:"cooldownMs"`
		} `json:"super"`
		Gadget struct {
			CooldownMs int64 `json:"cooldownMs"`
		} `json:"gadget"`
	} `json:"heroes"`
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
	for heroID, contract := range defaults.Heroes {
		if contract.Super.CooldownMs <= 0 || contract.Gadget.CooldownMs <= 0 {
			panic("generated combat profile has invalid ability cooldown for " + heroID)
		}
	}
	return defaults
}

var loadedCombatProfileRuntimeDefaults = loadCombatProfileRuntimeDefaults()

var combatProfileHeroIDs = map[string]string{
	"Needle":          "needle",
	"Mandy":           "mandy",
	"Fairy Mina":      "fairy-mina",
	"Brock Zeus":      "brock-zeus",
	"Kaze":            "kaze",
	"Wukong Mico":     "wukong-mico",
	"Persephone Lumi": "persephone-lumi",
	"Katty":           "katty",
}

func profileAbilityCooldownMs(heroName, slot string) (int64, bool) {
	heroID, ok := combatProfileHeroIDs[heroName]
	if !ok {
		return 0, false
	}
	contract, ok := loadedCombatProfileRuntimeDefaults.Heroes[heroID]
	if !ok {
		return 0, false
	}
	if slot == "secondary" {
		return contract.Gadget.CooldownMs, contract.Gadget.CooldownMs > 0
	}
	return contract.Super.CooldownMs, contract.Super.CooldownMs > 0
}
