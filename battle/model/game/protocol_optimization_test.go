package game

import (
	"encoding/json"
	"testing"
)

func TestCooldownsJSONKeepsObjectContract(t *testing.T) {
	data, err := json.Marshal(PlayerJSON{
		Cooldowns: CooldownsJSON{Primary: 1.25, Secondary: 0.5},
	})
	if err != nil {
		t.Fatalf("marshal player snapshot: %v", err)
	}

	var decoded struct {
		Cooldowns CooldownsJSON `json:"cooldowns"`
	}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("decode player snapshot: %v", err)
	}
	if decoded.Cooldowns.Primary != 1.25 || decoded.Cooldowns.Secondary != 0.5 {
		t.Fatalf("cooldowns JSON = %#v, want primary/secondary object", decoded.Cooldowns)
	}
}

func TestAbilityCooldownMsKeepsHeroValues(t *testing.T) {
	tests := []struct {
		hero string
		slot string
		want int64
	}{
		{hero: "Needle", slot: "primary", want: 12000},
		{hero: "Mandy", slot: "primary", want: 15000},
		{hero: "Kaze", slot: "primary", want: 10000},
		{hero: "Unknown", slot: "primary", want: 12000},
		{hero: "Needle", slot: "secondary", want: 6500},
	}
	for _, test := range tests {
		if got := AbilityCooldownMs(test.hero, test.slot); got != test.want {
			t.Errorf("AbilityCooldownMs(%q, %q) = %d, want %d", test.hero, test.slot, got, test.want)
		}
	}
}

func TestGetAttackConfigUsesCatalogValues(t *testing.T) {
	config := GetAttackConfig("Brock Zeus")
	if config.Archetype != AttackProjectile || config.Range != 760 || config.SplashRadius != 80 {
		t.Fatalf("Brock Zeus attack config = %#v, want projectile/760/80", config)
	}
	if unknown := GetAttackConfig("Unknown"); unknown != (AttackConfig{}) {
		t.Fatalf("unknown attack config = %#v, want zero value", unknown)
	}
}

func TestStateUpdateIncludesCombatContractVersion(t *testing.T) {
	state := NewStateUpdate(
		&GameStateJSON{},
		&MapJSON{},
		map[string]PlayerJSON{},
		map[string]MonsterJSON{},
		nil,
		nil,
		nil,
	)

	if state.CombatProfileID != CombatProfileID {
		t.Fatalf("state combat profile id = %q, want %q", state.CombatProfileID, CombatProfileID)
	}
	if state.CombatRulesVersion != CombatRulesVersion {
		t.Fatalf("state combat rules version = %q, want %q", state.CombatRulesVersion, CombatRulesVersion)
	}
	data, err := json.Marshal(state)
	if err != nil {
		t.Fatalf("marshal state update: %v", err)
	}
	var wire struct {
		CombatProfileID    string `json:"combatProfileId"`
		CombatRulesVersion string `json:"combatRulesVersion"`
		EventSchemaVersion int    `json:"eventSchemaVersion"`
	}
	if err := json.Unmarshal(data, &wire); err != nil {
		t.Fatalf("decode state update contract fields: %v", err)
	}
	if wire.CombatProfileID != CombatProfileID || wire.CombatRulesVersion != CombatRulesVersion || wire.EventSchemaVersion != CombatEventSchemaVersion {
		t.Fatalf("wire combat contract = %#v, want profile=%q version=%q", wire, CombatProfileID, CombatRulesVersion)
	}
}

func TestStateUpdateIncludesCompactTeamRoster(t *testing.T) {
	state := NewStateUpdate(
		&GameStateJSON{Mode: string(ModeTeamDeathmatch)},
		&MapJSON{},
		map[string]PlayerJSON{},
		map[string]MonsterJSON{},
		nil,
		nil,
		nil,
	)
	state.TeamRoster = []TeamRosterPlayerJSON{{
		PlayerId: "enemy-1", Name: "Enemy", Hero: "Kaze", Team: "Red",
		Alive: false, Kills: 2, RespawnAt: 12_500,
	}}

	data, err := json.Marshal(state)
	if err != nil {
		t.Fatalf("marshal team roster state: %v", err)
	}
	var wire struct {
		TeamRoster []TeamRosterPlayerJSON `json:"teamRoster"`
	}
	if err := json.Unmarshal(data, &wire); err != nil {
		t.Fatalf("decode team roster state: %v", err)
	}
	if len(wire.TeamRoster) != 1 || wire.TeamRoster[0].Hero != "Kaze" || wire.TeamRoster[0].Alive || wire.TeamRoster[0].RespawnAt != 12_500 {
		t.Fatalf("team roster wire = %#v, want compact dead Kaze roster entry", wire.TeamRoster)
	}
}

func TestMonsterJSONCarriesNoticeWindow(t *testing.T) {
	data, err := json.Marshal(MonsterJSON{
		State: "notice", NoticeUntil: 10_350, WindupUntil: 0,
	})
	if err != nil {
		t.Fatalf("marshal monster notice: %v", err)
	}
	var wire struct {
		State       string `json:"state"`
		NoticeUntil int64  `json:"noticeUntil"`
	}
	if err := json.Unmarshal(data, &wire); err != nil {
		t.Fatalf("decode monster notice: %v", err)
	}
	if wire.State != "notice" || wire.NoticeUntil != 10_350 {
		t.Fatalf("monster notice wire = %#v, want state/noticeUntil", wire)
	}
}

func TestRejectedCombatEventKeepsExplicitOutcomeFields(t *testing.T) {
	data, err := json.Marshal(CombatEventJSON{
		ID: 1, Ts: 100, MatchID: "match-1", Hero: "Needle", Kind: "ability", AbilitySlot: "primary",
		Reason: "super_not_ready", Phase: "rejected", Accepted: false, Resolved: true,
		ResourceKind: "super_charge", ResourceBefore: 40, ResourceAfter: 40,
		EventSchemaVersion: CombatEventSchemaVersion,
	})
	if err != nil {
		t.Fatalf("marshal rejected combat event: %v", err)
	}
	var wire map[string]interface{}
	if err := json.Unmarshal(data, &wire); err != nil {
		t.Fatalf("decode rejected combat event: %v", err)
	}
	if accepted, ok := wire["accepted"].(bool); !ok || accepted {
		t.Fatalf("rejected event accepted field = %#v, want explicit false", wire["accepted"])
	}
	if resolved, ok := wire["resolved"].(bool); !ok || !resolved {
		t.Fatalf("rejected event resolved field = %#v, want explicit true", wire["resolved"])
	}
	if wire["reason"] != "super_not_ready" {
		t.Fatalf("rejected event reason = %#v, want super_not_ready", wire["reason"])
	}
	if wire["phase"] != "rejected" {
		t.Fatalf("rejected event phase = %#v, want rejected", wire["phase"])
	}
	if version, ok := wire["eventSchemaVersion"].(float64); !ok || int(version) != CombatEventSchemaVersion {
		t.Fatalf("combat event schema version = %#v, want %d", wire["eventSchemaVersion"], CombatEventSchemaVersion)
	}
	if wire["matchId"] != "match-1" || wire["hero"] != "Needle" || wire["resourceBefore"] != float64(40) || wire["resourceAfter"] != float64(40) {
		t.Fatalf("combat event context = %#v", wire)
	}
}

func TestResolvedCombatAbilityKeepsMissOutcomeFields(t *testing.T) {
	data, err := json.Marshal(CombatEventJSON{
		ID: 2, Ts: 200, MatchID: "match-1", Hero: "Brock Zeus", Kind: "ability", AbilitySlot: "primary",
		Reason: "ability_missed", Phase: "miss", CommandID: "ability-2", SourceID: "player-1",
		Accepted: false, Resolved: true, EventSchemaVersion: CombatEventSchemaVersion,
	})
	if err != nil {
		t.Fatalf("marshal ability miss event: %v", err)
	}
	var wire struct {
		Reason    string `json:"reason"`
		Phase     string `json:"phase"`
		CommandID string `json:"commandId"`
		Accepted  bool   `json:"accepted"`
		Resolved  bool   `json:"resolved"`
	}
	if err := json.Unmarshal(data, &wire); err != nil {
		t.Fatalf("decode ability miss event: %v", err)
	}
	if wire.Reason != "ability_missed" || wire.Phase != "miss" || wire.CommandID != "ability-2" || wire.Accepted || !wire.Resolved {
		t.Fatalf("ability miss wire = %#v, want explicit miss outcome", wire)
	}
}
