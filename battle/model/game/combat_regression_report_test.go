package game

import (
	"reflect"
	"testing"
)

func TestCombatRegressionReportIsDeterministicAndCoversEveryHero(t *testing.T) {
	first, err := BuildCombatRegressionReport()
	if err != nil {
		t.Fatalf("build combat regression report: %v", err)
	}
	second, err := BuildCombatRegressionReport()
	if err != nil {
		t.Fatalf("build second combat regression report: %v", err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("combat regression report is not deterministic:\nfirst=%#v\nsecond=%#v", first, second)
	}
	if len(first.Balance) != len(Heroes) || len(first.PowerBudget) != len(Heroes) || len(first.Cadence) != len(Heroes) {
		t.Fatalf("report coverage = balance %d power %d cadence %d, want %d each", len(first.Balance), len(first.PowerBudget), len(first.Cadence), len(Heroes))
	}
	if first.CombatProfileID != CombatProfileID || first.CombatRulesVersion != CombatRulesVersion || first.Fingerprint != CombatProfileFingerprint {
		t.Fatalf("report version = %#v, want profile=%q rules=%q fingerprint=%q", first, CombatProfileID, CombatRulesVersion, CombatProfileFingerprint)
	}
	for _, row := range first.Cadence {
		if row.CurrentAttackRateMs <= 0 || row.CurrentReloadMs <= 0 || row.CurrentFullAmmoWindowMs <= 0 {
			t.Fatalf("invalid current cadence row: %#v", row)
		}
		if row.LegacyAttackRateMs <= row.CurrentAttackRateMs || row.LegacyReloadMs <= row.CurrentReloadMs {
			t.Fatalf("legacy baseline does not describe the pre-catalog hidden multipliers: %#v", row)
		}
		if row.CurrentReloadMs >= row.LegacyReloadMs {
			t.Fatalf("catalog cadence did not reduce absolute reload downtime: %#v", row)
		}
		if row.CurrentFullAmmoWindowMs >= row.LegacyFullAmmoWindowMs {
			t.Fatalf("catalog cadence did not shorten the full-ammo firing window: %#v", row)
		}
	}
}

func TestCombatRegressionReportRejectsUnboundedPowerBudget(t *testing.T) {
	rows, err := BuildCombatPowerBudgetMatrix()
	if err != nil {
		t.Fatalf("build power budget: %v", err)
	}
	rows[0].Vector.Threat = 2
	if err := ValidateCombatPowerBudgetMatrix(rows); err == nil {
		t.Fatal("power budget validator accepted a vector outside the normalized range")
	}
}
