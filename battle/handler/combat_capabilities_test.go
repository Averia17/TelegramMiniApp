package handler

import "testing"

func TestValidateCombatCapabilitiesAcceptsCurrentClient(t *testing.T) {
	if err := validateCombatCapabilities(CombatCapabilities{
		ProfileID: CombatProfileID, RulesVersion: CombatRulesVersion, EventSchemaVersion: CombatEventSchemaVersion,
	}); err != nil {
		t.Fatalf("current capabilities rejected: %v", err)
	}
}

func TestValidateCombatCapabilitiesRejectsExplicitlyUnsupportedClient(t *testing.T) {
	cases := []CombatCapabilities{
		{ProfileID: "old-profile", RulesVersion: CombatRulesVersion, EventSchemaVersion: CombatEventSchemaVersion},
		{ProfileID: CombatProfileID, RulesVersion: "old-rules", EventSchemaVersion: CombatEventSchemaVersion},
		{ProfileID: CombatProfileID, RulesVersion: CombatRulesVersion, EventSchemaVersion: CombatEventSchemaVersion + 1},
	}
	for _, capabilities := range cases {
		if err := validateCombatCapabilities(capabilities); err == nil {
			t.Fatalf("unsupported capabilities accepted: %#v", capabilities)
		}
	}
}

func TestValidateCombatCapabilitiesKeepsLegacyClientsCompatible(t *testing.T) {
	if err := validateCombatCapabilities(CombatCapabilities{}); err != nil {
		t.Fatalf("legacy capability omission should remain compatible: %v", err)
	}
}
