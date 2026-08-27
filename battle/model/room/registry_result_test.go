package room

import (
	"battle/model/game"
	"battle/model/player"
	"battle/provider"
	"encoding/json"
	"testing"
)

func TestBattleResultCarriesCombatVersion(t *testing.T) {
	result := provider.BattleResult{
		RoomId: "room-1", CombatProfileID: game.CombatProfileID,
		CombatRulesVersion:       game.CombatRulesVersion,
		CombatEventSchemaVersion: game.CombatEventSchemaVersion,
	}
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal battle result: %v", err)
	}
	var wire map[string]any
	if err := json.Unmarshal(data, &wire); err != nil {
		t.Fatalf("decode battle result: %v", err)
	}
	if wire["combatProfileId"] != game.CombatProfileID || wire["combatRulesVersion"] != game.CombatRulesVersion || wire["combatEventSchemaVersion"] != float64(game.CombatEventSchemaVersion) {
		t.Fatalf("battle result combat version = %#v", wire)
	}
}

func TestBuildPlayerResultCarriesTeamBattleStats(t *testing.T) {
	p := &player.Player{
		PlayerId:             "player-1",
		PartyID:              "party-1",
		Team:                 "Red",
		Name:                 "Alice",
		HeroName:             "Needle",
		Kills:                3,
		BasicDamage:          120,
		SkillDamage:          480,
		BasicOnlyKills:       1,
		SkillAssistedKills:   2,
		HealingDone:          80,
		HealingBlocked:       20,
		HealWindowMs:         1500,
		ShieldProvided:       500,
		DamagePrevented:      120,
		Assists:              1,
		ControlAppliedMs:     800,
		BatDamage:            90,
		BatContests:          1,
		CubeClaims:           2,
		EscapeSaves:          1,
		TimeToFirstContactMs: 4500,
		CombatUptimeMs:       9200,
		RespawnDowntimeMs:    3000,
		UncontestedTravelMs:  12500,
		Place:                2,
		Lives:                420,
		Deaths:               2,
		PlayerDamage:         600,
		TowerDamage:          900,
		TownHallDamage:       250,
		TowersDestroyed:      1,
		TownHallsDestroyed:   0,
	}

	result := buildPlayerResult(p, "Red team")

	if result.PlayerId != p.PlayerId || result.Team != p.Team || !result.Won {
		t.Fatalf("identity/win result = %#v, want player Red team winner", result)
	}
	if result.Deaths != 2 || result.PlayerDamage != 600 || result.TowerDamage != 900 || result.TownHallDamage != 250 || result.TowersDestroyed != 1 {
		t.Fatalf("team battle stats = %#v, want deaths/damage/destruction copied", result)
	}
	if result.BasicDamage != 120 || result.SkillDamage != 480 || result.BasicOnlyKills != 1 || result.SkillAssistedKills != 2 {
		t.Fatalf("combat contribution stats = %#v, want basic/skill damage and kill split", result)
	}
	if result.HealingDone != 80 || result.HealingBlocked != 20 || result.HealWindowMs != 1500 || result.ShieldProvided != 500 || result.DamagePrevented != 120 || result.Assists != 1 || result.ControlAppliedMs != 800 || result.BatDamage != 90 || result.BatContests != 1 || result.CubeClaims != 2 || result.EscapeSaves != 1 || result.TimeToFirstContactMs != 4500 || result.CombatUptimeMs != 9200 || result.RespawnDowntimeMs != 3000 || result.UncontestedTravelMs != 12500 {
		t.Fatalf("role/pacing metrics = %#v, want copied authoritative counters", result)
	}
	if result.Place != 2 {
		t.Fatalf("place = %v, want 2", result.Place)
	}
}
