package game

import (
	"encoding/json"
	"fmt"
	"strings"
)

// CombatBalanceRow is the measurable part of the hero balance contract. It is
// intentionally separate from subjective role notes: damage, cadence and range
// can be regenerated from authoritative runtime values.
type CombatBalanceRow struct {
	Hero                   string  `json:"hero"`
	Role                   string  `json:"role"`
	AttackType             string  `json:"attackType"`
	BasicBurst             int     `json:"basicBurst"`
	BasicDPS               float64 `json:"basicDps"`
	SustainedBasicDPS      float64 `json:"sustainedBasicDps"`
	BasicRange             float64 `json:"basicRange"`
	MaxHealth              int     `json:"maxHealth"`
	MoveSpeed              int     `json:"moveSpeed"`
	AttackRateMs           int64   `json:"attackRateMs"`
	ReloadMs               int64   `json:"reloadMs"`
	MaxAmmo                int     `json:"maxAmmo"`
	FullAmmoWindowMs       int64   `json:"fullAmmoWindowMs"`
	ReloadDeadTimeFraction float64 `json:"reloadDeadTimeFraction"`
}

// CombatReloadDeadTimeCeiling is the player-facing budget for time spent
// waiting on ammo. Reload remains a meaningful commitment, but it must not
// dominate a basic-combat cycle.
const CombatReloadDeadTimeCeiling = 0.60

// CombatPowerBudgetVector is the role-facing part of the versioned combat
// profile. Keeping this typed in the audit code prevents a balance review from
// silently drifting away from the generated profile JSON.
type CombatPowerBudgetVector struct {
	Threat         float64 `json:"threat"`
	Control        float64 `json:"control"`
	Safety         float64 `json:"safety"`
	Mobility       float64 `json:"mobility"`
	Sustain        float64 `json:"sustain"`
	Information    float64 `json:"information"`
	ObjectiveValue float64 `json:"objectiveValue"`
}

type CombatPowerBudgetRow struct {
	Hero           string                  `json:"hero"`
	Role           string                  `json:"role"`
	PowerBudget    float64                 `json:"powerBudget"`
	Vector         CombatPowerBudgetVector `json:"vector"`
	Signature      string                  `json:"signature"`
	SignatureValue float64                 `json:"signatureValue"`
}

type generatedCombatProfile struct {
	Heroes map[string]struct {
		Role              string                  `json:"role"`
		PowerBudget       float64                 `json:"powerBudget"`
		PowerBudgetVector CombatPowerBudgetVector `json:"powerBudgetVector"`
	} `json:"heroes"`
}

var powerBudgetDimensions = []struct {
	name  string
	value func(CombatPowerBudgetVector) float64
}{
	{name: "threat", value: func(v CombatPowerBudgetVector) float64 { return v.Threat }},
	{name: "control", value: func(v CombatPowerBudgetVector) float64 { return v.Control }},
	{name: "safety", value: func(v CombatPowerBudgetVector) float64 { return v.Safety }},
	{name: "mobility", value: func(v CombatPowerBudgetVector) float64 { return v.Mobility }},
	{name: "sustain", value: func(v CombatPowerBudgetVector) float64 { return v.Sustain }},
	{name: "information", value: func(v CombatPowerBudgetVector) float64 { return v.Information }},
	{name: "objectiveValue", value: func(v CombatPowerBudgetVector) float64 { return v.ObjectiveValue }},
}

// BuildCombatPowerBudgetMatrix reads the generated profile, then joins it to
// the authoritative hero catalog in stable catalog order. This makes the
// profile the single source of role intent while leaving runtime combat stats
// in the Go catalog.
func BuildCombatPowerBudgetMatrix() ([]CombatPowerBudgetRow, error) {
	var profile generatedCombatProfile
	if err := json.Unmarshal([]byte(GeneratedCombatProfileJSON), &profile); err != nil {
		return nil, fmt.Errorf("decode generated combat profile: %w", err)
	}
	rows := make([]CombatPowerBudgetRow, 0, len(Heroes))
	for _, hero := range Heroes {
		contract, ok := profile.Heroes[combatProfileHeroID(hero.Name)]
		if !ok {
			return nil, fmt.Errorf("hero %q is missing from generated power budget profile", hero.Name)
		}
		signature, signatureValue := powerBudgetSignature(contract.PowerBudgetVector)
		rows = append(rows, CombatPowerBudgetRow{
			Hero:           hero.Name,
			Role:           contract.Role,
			PowerBudget:    contract.PowerBudget,
			Vector:         contract.PowerBudgetVector,
			Signature:      signature,
			SignatureValue: signatureValue,
		})
	}
	return rows, nil
}

// ValidateCombatPowerBudgetMatrix enforces the minimum role promise. It does
// not require heroes to be identical: every role has one high-value axis and
// gives up budget elsewhere so counterplay remains possible.
func ValidateCombatPowerBudgetMatrix(rows []CombatPowerBudgetRow) error {
	if len(rows) != len(Heroes) {
		return fmt.Errorf("power budget rows=%d, want %d", len(rows), len(Heroes))
	}
	seen := make(map[string]bool, len(rows))
	for _, row := range rows {
		if row.Hero == "" || seen[row.Hero] {
			return fmt.Errorf("duplicate or empty hero row %q", row.Hero)
		}
		seen[row.Hero] = true
		hero := GetHeroByName(row.Hero)
		if hero == nil {
			return fmt.Errorf("power budget references unknown hero %q", row.Hero)
		}
		if row.Role != hero.Role {
			return fmt.Errorf("%s role=%q, want catalog role %q", row.Hero, row.Role, hero.Role)
		}
		if row.PowerBudget < .1 || row.PowerBudget > 2 {
			return fmt.Errorf("%s power budget=%.2f outside [0.1, 2]", row.Hero, row.PowerBudget)
		}
		for _, dimension := range powerBudgetDimensions {
			value := dimension.value(row.Vector)
			if value < 0 || value > 1 {
				return fmt.Errorf("%s %s=%.2f outside [0, 1]", row.Hero, dimension.name, value)
			}
		}
		wantSignature, wantValue := powerBudgetSignature(row.Vector)
		if row.Signature != wantSignature || row.SignatureValue != wantValue {
			return fmt.Errorf("%s signature=%s/%.2f, want %s/%.2f", row.Hero, row.Signature, row.SignatureValue, wantSignature, wantValue)
		}
		if wantValue < .85 {
			return fmt.Errorf("%s has no signature power axis >=.85", row.Hero)
		}
		if minimum, ok := roleSignatureMinimums[row.Role]; ok && dimensionValue(row.Vector, minimum.dimension) < minimum.value {
			return fmt.Errorf("%s role %s needs %s>=%.2f, got %.2f", row.Hero, row.Role, minimum.dimension, minimum.value, dimensionValue(row.Vector, minimum.dimension))
		}
	}
	return nil
}

type roleSignatureMinimum struct {
	dimension string
	value     float64
}

var roleSignatureMinimums = map[string]roleSignatureMinimum{
	"Controller":   {dimension: "control", value: .85},
	"Fighter":      {dimension: "threat", value: .80},
	"Support":      {dimension: "sustain", value: .85},
	"Sharpshooter": {dimension: "threat", value: .90},
	"Assassin":     {dimension: "mobility", value: .90},
	"Tank":         {dimension: "safety", value: .90},
}

func powerBudgetSignature(vector CombatPowerBudgetVector) (string, float64) {
	bestName := ""
	bestValue := -1.0
	for _, dimension := range powerBudgetDimensions {
		value := dimension.value(vector)
		if value > bestValue {
			bestName, bestValue = dimension.name, value
		}
	}
	return bestName, bestValue
}

func dimensionValue(vector CombatPowerBudgetVector, name string) float64 {
	for _, dimension := range powerBudgetDimensions {
		if dimension.name == name {
			return dimension.value(vector)
		}
	}
	return -1
}

func combatProfileHeroID(name string) string {
	return strings.ToLower(strings.ReplaceAll(name, " ", "-"))
}

// BuildCombatBalanceMatrix returns one deterministic row for every active hero.
// BasicBurst describes a full ammo load if every projectile/sector hit; it is a
// comparison tool, not a promise that a real fight reaches that value.
func BuildCombatBalanceMatrix() []CombatBalanceRow {
	matrix := make([]CombatBalanceRow, 0, len(Heroes))
	for _, hero := range Heroes {
		hitsPerAttack := hero.Attack.ProjectileCount
		if hitsPerAttack < 1 {
			hitsPerAttack = 1
		}
		burst := hero.AttackDamage * hitsPerAttack * hero.MaxAmmo
		dps := 0.0
		if hero.AttackRate > 0 {
			dps = float64(hero.AttackDamage*hitsPerAttack) * 1000 / float64(hero.AttackRate)
		}
		fullAmmoWindow := int64(0)
		if hero.MaxAmmo > 1 {
			fullAmmoWindow = int64(hero.MaxAmmo-1) * hero.AttackRate
		}
		cycleWindow := fullAmmoWindow + hero.ReloadTime
		reloadDeadTimeFraction := 0.0
		sustainedDPS := 0.0
		if cycleWindow > 0 {
			reloadDeadTimeFraction = float64(hero.ReloadTime) / float64(cycleWindow)
			sustainedDPS = float64(burst) * 1000 / float64(cycleWindow)
		}
		matrix = append(matrix, CombatBalanceRow{
			Hero:                   hero.Name,
			Role:                   hero.Role,
			AttackType:             hero.AttackType,
			BasicBurst:             burst,
			BasicDPS:               dps,
			SustainedBasicDPS:      sustainedDPS,
			BasicRange:             hero.Attack.Range,
			MaxHealth:              hero.MaxLives,
			MoveSpeed:              hero.Speed,
			AttackRateMs:           hero.AttackRate,
			ReloadMs:               hero.ReloadTime,
			MaxAmmo:                hero.MaxAmmo,
			FullAmmoWindowMs:       fullAmmoWindow,
			ReloadDeadTimeFraction: reloadDeadTimeFraction,
		})
	}
	return matrix
}
