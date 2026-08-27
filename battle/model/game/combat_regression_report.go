package game

import (
	"fmt"
	"math"
)

// CombatRegressionReport is the machine-readable summary used by the
// original-prompt regression gate. The legacy cadence is intentionally kept
// only as a comparison baseline; it is not a runtime tuning source.
type CombatRegressionReport struct {
	CombatProfileID    string                  `json:"combatProfileId"`
	CombatRulesVersion string                  `json:"combatRulesVersion"`
	Fingerprint        string                  `json:"fingerprint"`
	Balance            []CombatBalanceRow      `json:"balance"`
	PowerBudget        []CombatPowerBudgetRow  `json:"powerBudget"`
	Cadence            []CombatCadenceDeltaRow `json:"cadence"`
}

type CombatCadenceDeltaRow struct {
	Hero                          string  `json:"hero"`
	CurrentAttackRateMs           int64   `json:"currentAttackRateMs"`
	LegacyAttackRateMs            int64   `json:"legacyAttackRateMs"`
	CurrentReloadMs               int64   `json:"currentReloadMs"`
	LegacyReloadMs                int64   `json:"legacyReloadMs"`
	CurrentFullAmmoWindowMs       int64   `json:"currentFullAmmoWindowMs"`
	LegacyFullAmmoWindowMs        int64   `json:"legacyFullAmmoWindowMs"`
	CurrentReloadDeadTimeFraction float64 `json:"currentReloadDeadTimeFraction"`
	LegacyReloadDeadTimeFraction  float64 `json:"legacyReloadDeadTimeFraction"`
}

const (
	// These are the two constants removed on 2026-08-27. Keeping the values in
	// the report makes the before/after comparison reviewable without bringing
	// the hidden runtime multipliers back into game code.
	legacyAttackRateMultiplier = 1.55
	legacyReloadMultiplier     = 1.22
)

func BuildCombatRegressionReport() (CombatRegressionReport, error) {
	balance := BuildCombatBalanceMatrix()
	for _, row := range balance {
		if row.ReloadDeadTimeFraction > CombatReloadDeadTimeCeiling {
			return CombatRegressionReport{}, fmt.Errorf("%s reload dead time %.3f exceeds player-facing ceiling %.2f", row.Hero, row.ReloadDeadTimeFraction, CombatReloadDeadTimeCeiling)
		}
	}
	powerBudget, err := BuildCombatPowerBudgetMatrix()
	if err != nil {
		return CombatRegressionReport{}, err
	}
	if err := ValidateCombatPowerBudgetMatrix(powerBudget); err != nil {
		return CombatRegressionReport{}, err
	}
	cadence := make([]CombatCadenceDeltaRow, 0, len(balance))
	for _, row := range balance {
		legacyAttack := int64(math.Round(float64(row.AttackRateMs) * legacyAttackRateMultiplier))
		legacyReload := int64(math.Round(float64(row.ReloadMs) * legacyReloadMultiplier))
		legacyWindow := int64(0)
		if row.MaxAmmo > 1 {
			legacyWindow = int64(row.MaxAmmo-1) * legacyAttack
		}
		legacyCycle := legacyWindow + legacyReload
		legacyDeadTime := 0.0
		if legacyCycle > 0 {
			legacyDeadTime = float64(legacyReload) / float64(legacyCycle)
		}
		cadence = append(cadence, CombatCadenceDeltaRow{
			Hero: row.Hero, CurrentAttackRateMs: row.AttackRateMs, LegacyAttackRateMs: legacyAttack,
			CurrentReloadMs: row.ReloadMs, LegacyReloadMs: legacyReload,
			CurrentFullAmmoWindowMs: row.FullAmmoWindowMs, LegacyFullAmmoWindowMs: legacyWindow,
			CurrentReloadDeadTimeFraction: row.ReloadDeadTimeFraction,
			LegacyReloadDeadTimeFraction:  legacyDeadTime,
		})
	}
	if len(balance) != len(Heroes) || len(cadence) != len(Heroes) {
		return CombatRegressionReport{}, fmt.Errorf("combat regression coverage=%d/%d", len(cadence), len(Heroes))
	}
	return CombatRegressionReport{
		CombatProfileID: CombatProfileID, CombatRulesVersion: CombatRulesVersion,
		Fingerprint: CombatProfileFingerprint, Balance: balance, PowerBudget: powerBudget, Cadence: cadence,
	}, nil
}
