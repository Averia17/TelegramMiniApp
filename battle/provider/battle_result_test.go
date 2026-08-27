package provider

import (
	"encoding/json"
	"testing"
)

func TestBattleResultJSONIncludesTeamBattleStats(t *testing.T) {
	data, err := json.Marshal(BattleResult{
		RoomId: "room-1",
		Mode:   "team deathmatch",
		Reason: "Ничья: у ратуш одинаковое здоровье.",
		Draw:   true,
		Players: []PlayerResult{{
			PlayerId:             "player-1",
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
			Deaths:               2,
			PlayerDamage:         480,
			TowerDamage:          1200,
			TownHallDamage:       350,
			TowersDestroyed:      1,
			TownHallsDestroyed:   0,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}

	var payload struct {
		Reason  string                   `json:"reason"`
		Draw    bool                     `json:"draw"`
		Players []map[string]interface{} `json:"players"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatal(err)
	}
	player := payload.Players[0]
	if payload.Reason != "Ничья: у ратуш одинаковое здоровье." || !payload.Draw {
		t.Fatalf("result outcome = reason %q draw %v, want draw with reason", payload.Reason, payload.Draw)
	}
	for key, want := range map[string]float64{
		"deaths": 2, "playerDamage": 480, "towerDamage": 1200,
		"townHallDamage": 350, "towersDestroyed": 1, "townHallsDestroyed": 0,
		"basicDamage": 120, "skillDamage": 480, "basicOnlyKills": 1, "skillAssistedKills": 2,
		"healingDone": 80, "healingBlocked": 20, "healWindowMs": 1500, "shieldProvided": 500, "damagePrevented": 120, "assists": 1,
		"controlAppliedMs": 800, "batDamage": 90, "batContests": 1, "cubeClaims": 2,
		"escapeSaves": 1, "timeToFirstContactMs": 4500, "combatUptimeMs": 9200, "respawnDowntimeMs": 3000,
		"uncontestedTravelMs": 12500,
	} {
		if got, ok := player[key].(float64); !ok || got != want {
			t.Fatalf("payload[%q] = %#v, want %v", key, player[key], want)
		}
	}
}
