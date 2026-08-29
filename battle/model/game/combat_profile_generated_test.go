package game

import (
	"encoding/json"
	"testing"
)

func TestGeneratedCombatProfileViewIsVersionedJSON(t *testing.T) {
	var profile struct {
		SchemaVersion   int                    `json:"schemaVersion"`
		ProfileRevision string                 `json:"profileRevision"`
		Heroes          map[string]interface{} `json:"heroes"`
	}
	if err := json.Unmarshal([]byte(GeneratedCombatProfileJSON), &profile); err != nil {
		t.Fatalf("generated combat profile is not valid JSON: %v", err)
	}
	if profile.SchemaVersion != CombatProfileSchemaVersion {
		t.Fatalf("generated schema version = %d, want %d", profile.SchemaVersion, CombatProfileSchemaVersion)
	}
	if profile.ProfileRevision != CombatProfileRevision {
		t.Fatalf("generated revision = %q, want %q", profile.ProfileRevision, CombatProfileRevision)
	}
	if len(profile.Heroes) != len(Heroes) {
		t.Fatalf("generated hero count = %d, want %d", len(profile.Heroes), len(Heroes))
	}
}

func TestCombatRuntimeHealthBoostDefaultsAreDeclaredInGeneratedProfile(t *testing.T) {
	var profile struct {
		Defaults struct {
			HealthBoost struct {
				Fraction          float64 `json:"fraction"`
				TeamFraction      float64 `json:"teamFraction"`
				MaxStacks         int     `json:"maxStacks"`
				MaxActivePickups  int     `json:"maxActivePickups"`
				TTLMS             int64   `json:"ttlMs"`
				HealsCurrentLives bool    `json:"healsCurrentLives"`
			} `json:"healthBoost"`
		} `json:"defaults"`
	}
	if err := json.Unmarshal([]byte(GeneratedCombatProfileJSON), &profile); err != nil {
		t.Fatalf("generated combat profile is not valid JSON: %v", err)
	}
	healthBoost := profile.Defaults.HealthBoost
	if healthBoost.Fraction <= 0 || healthBoost.TeamFraction <= 0 {
		t.Fatalf("health boost fractions must be declared in generated profile: %#v", healthBoost)
	}
	if healthBoost.TeamFraction > healthBoost.Fraction {
		t.Fatalf("team health boost fraction=%v exceeds personal fraction=%v", healthBoost.TeamFraction, healthBoost.Fraction)
	}
	if healthBoost.MaxStacks <= 0 || healthBoost.MaxActivePickups <= 0 || healthBoost.TTLMS <= 0 {
		t.Fatalf("health boost limits must be declared in generated profile: %#v", healthBoost)
	}
	if healthBoost.HealsCurrentLives {
		t.Fatal("health boost must remain MaxHP-only")
	}
	if HealthBoostFraction != healthBoost.Fraction || TeamHealthBoostFraction != healthBoost.TeamFraction {
		t.Fatalf("runtime health boost fractions=%v/%v, profile=%v/%v", HealthBoostFraction, TeamHealthBoostFraction, healthBoost.Fraction, healthBoost.TeamFraction)
	}
	if HealthBoostMaxStacks != healthBoost.MaxStacks || MaxActiveHealthBoosts != healthBoost.MaxActivePickups {
		t.Fatalf("runtime health boost limits=%d/%d, profile=%d/%d", HealthBoostMaxStacks, MaxActiveHealthBoosts, healthBoost.MaxStacks, healthBoost.MaxActivePickups)
	}
	if HealthBoostTTL.Milliseconds() != healthBoost.TTLMS {
		t.Fatalf("runtime health boost ttl=%dms, profile=%dms", HealthBoostTTL.Milliseconds(), healthBoost.TTLMS)
	}
	if HealthBoostHealsCurrentLives != healthBoost.HealsCurrentLives {
		t.Fatalf("runtime health boost current-lives policy=%v, profile=%v", HealthBoostHealsCurrentLives, healthBoost.HealsCurrentLives)
	}
}

func TestCombatRuntimeAbilityDefaultsAreDeclaredInGeneratedProfile(t *testing.T) {
	var profile struct {
		Defaults struct {
			Super struct {
				MaxChargePercent   int `json:"maxChargePercent"`
				StartChargePercent int `json:"startChargePercent"`
			} `json:"super"`
			Gadget struct {
				MaxCharges     int `json:"maxCharges"`
				ChargesOnSpawn int `json:"chargesOnSpawn"`
			} `json:"gadget"`
			AI struct {
				LowHealthRetreatFraction      float64 `json:"lowHealthRetreatFraction"`
				CriticalHealthRetreatFraction float64 `json:"criticalHealthRetreatFraction"`
				SuperUseAdvantageFraction     float64 `json:"superUseAdvantageFraction"`
				PickupContestHealthFraction   float64 `json:"pickupContestHealthFraction"`
			} `json:"ai"`
		} `json:"defaults"`
	}
	if err := json.Unmarshal([]byte(GeneratedCombatProfileJSON), &profile); err != nil {
		t.Fatalf("generated combat profile is not valid JSON: %v", err)
	}
	if profile.Defaults.Super.MaxChargePercent <= 0 || profile.Defaults.Super.StartChargePercent < 0 {
		t.Fatalf("super charge defaults are invalid: %#v", profile.Defaults.Super)
	}
	if profile.Defaults.Gadget.MaxCharges <= 0 || profile.Defaults.Gadget.ChargesOnSpawn < 0 || profile.Defaults.Gadget.ChargesOnSpawn > profile.Defaults.Gadget.MaxCharges {
		t.Fatalf("gadget charge defaults are invalid: %#v", profile.Defaults.Gadget)
	}
	if SuperMaxChargePercent != profile.Defaults.Super.MaxChargePercent || SuperStartChargePercent != profile.Defaults.Super.StartChargePercent {
		t.Fatalf("runtime super defaults=%d/%d, profile=%d/%d", SuperMaxChargePercent, SuperStartChargePercent, profile.Defaults.Super.MaxChargePercent, profile.Defaults.Super.StartChargePercent)
	}
	if MaxGadgetCharges != profile.Defaults.Gadget.MaxCharges || GadgetChargesOnSpawn != profile.Defaults.Gadget.ChargesOnSpawn {
		t.Fatalf("runtime gadget defaults=%d/%d, profile=%d/%d", MaxGadgetCharges, GadgetChargesOnSpawn, profile.Defaults.Gadget.MaxCharges, profile.Defaults.Gadget.ChargesOnSpawn)
	}
	if BotLowHealthRetreatFraction != profile.Defaults.AI.LowHealthRetreatFraction ||
		BotCriticalHealthFraction != profile.Defaults.AI.CriticalHealthRetreatFraction ||
		BotSuperUseAdvantageFraction != profile.Defaults.AI.SuperUseAdvantageFraction ||
		BotPickupContestHealthFraction != profile.Defaults.AI.PickupContestHealthFraction {
		t.Fatalf("runtime AI defaults=%v/%v/%v/%v, profile=%v/%v/%v/%v", BotLowHealthRetreatFraction, BotCriticalHealthFraction, BotSuperUseAdvantageFraction, BotPickupContestHealthFraction, profile.Defaults.AI.LowHealthRetreatFraction, profile.Defaults.AI.CriticalHealthRetreatFraction, profile.Defaults.AI.SuperUseAdvantageFraction, profile.Defaults.AI.PickupContestHealthFraction)
	}
}

func TestAbilityCooldownsAreReadFromGeneratedHeroContracts(t *testing.T) {
	if len(loadedCombatProfileRuntimeDefaults.Heroes) != len(Heroes) {
		t.Fatalf("generated hero cooldown contracts=%d, want %d", len(loadedCombatProfileRuntimeDefaults.Heroes), len(Heroes))
	}
	for heroName, heroID := range combatProfileHeroIDs {
		contract, ok := loadedCombatProfileRuntimeDefaults.Heroes[heroID]
		if !ok {
			t.Fatalf("missing generated cooldown contract for %s (%s)", heroName, heroID)
		}
		primary, primaryOK := profileAbilityCooldownMs(heroName, "primary")
		secondary, secondaryOK := profileAbilityCooldownMs(heroName, "secondary")
		if !primaryOK || !secondaryOK || primary != contract.Super.CooldownMs || secondary != contract.Gadget.CooldownMs {
			t.Fatalf("%s cooldowns=%d/%d, generated=%d/%d, ok=%v/%v", heroName, primary, secondary, contract.Super.CooldownMs, contract.Gadget.CooldownMs, primaryOK, secondaryOK)
		}
		if AbilityCooldownMs(heroName, "primary") != contract.Super.CooldownMs || AbilityCooldownMs(heroName, "secondary") != contract.Gadget.CooldownMs {
			t.Fatalf("public cooldown helper drifted for %s", heroName)
		}
	}
}
