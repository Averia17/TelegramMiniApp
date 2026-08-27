package main

import (
	"battle/model/game"
	"encoding/json"
	"fmt"
	"os"
)

type combatBalanceReport struct {
	CombatProfileID          string                      `json:"combatProfileId"`
	CombatRulesVersion       string                      `json:"combatRulesVersion"`
	CombatProfileFingerprint string                      `json:"combatProfileFingerprint"`
	Balance                  []game.CombatBalanceRow     `json:"balance"`
	PowerBudget              []game.CombatPowerBudgetRow `json:"powerBudget"`
}

func main() {
	powerBudget, err := game.BuildCombatPowerBudgetMatrix()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := game.ValidateCombatPowerBudgetMatrix(powerBudget); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	report := combatBalanceReport{
		CombatProfileID:          game.CombatProfileID,
		CombatRulesVersion:       game.CombatRulesVersion,
		CombatProfileFingerprint: game.CombatProfileFingerprint,
		Balance:                  game.BuildCombatBalanceMatrix(),
		PowerBudget:              powerBudget,
	}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(string(data))
}
