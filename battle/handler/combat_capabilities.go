package handler

import (
	"battle/model/game"
	"fmt"
)

const (
	CombatProfileID          = game.CombatProfileID
	CombatRulesVersion       = game.CombatRulesVersion
	CombatEventSchemaVersion = game.CombatEventSchemaVersion
)

type CombatCapabilities struct {
	ProfileID          string `json:"combatProfileId"`
	RulesVersion       string `json:"combatRulesVersion"`
	EventSchemaVersion int    `json:"eventSchemaVersion"`
}

// validateCombatCapabilities rejects only an explicit incompatible claim. An
// omitted capability remains accepted for older clients; those clients still
// receive the versioned room/snapshot metadata and can be retired separately.
func validateCombatCapabilities(capabilities CombatCapabilities) error {
	if capabilities.ProfileID == "" && capabilities.RulesVersion == "" && capabilities.EventSchemaVersion == 0 {
		return nil
	}
	if capabilities.ProfileID != "" && capabilities.ProfileID != game.CombatProfileID {
		return fmt.Errorf("unsupported combat profile %q", capabilities.ProfileID)
	}
	if capabilities.RulesVersion != "" && capabilities.RulesVersion != game.CombatRulesVersion {
		return fmt.Errorf("unsupported combat rules version %q", capabilities.RulesVersion)
	}
	if capabilities.EventSchemaVersion != 0 && capabilities.EventSchemaVersion != game.CombatEventSchemaVersion {
		return fmt.Errorf("unsupported combat event schema version %d", capabilities.EventSchemaVersion)
	}
	return nil
}
