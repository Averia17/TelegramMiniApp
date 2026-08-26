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
