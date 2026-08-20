package provider

import (
	"encoding/json"
	"testing"
)

func TestBattleResultJSONIncludesTeamBattleStats(t *testing.T) {
	data, err := json.Marshal(BattleResult{
		RoomId: "room-1",
		Mode:   "team deathmatch",
		Players: []PlayerResult{{
			PlayerId:           "player-1",
			Deaths:             2,
			PlayerDamage:       480,
			TowerDamage:        1200,
			TownHallDamage:     350,
			TowersDestroyed:    1,
			TownHallsDestroyed: 0,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}

	var payload struct {
		Players []map[string]interface{} `json:"players"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatal(err)
	}
	player := payload.Players[0]
	for key, want := range map[string]float64{
		"deaths": 2, "playerDamage": 480, "towerDamage": 1200,
		"townHallDamage": 350, "towersDestroyed": 1, "townHallsDestroyed": 0,
	} {
		if got, ok := player[key].(float64); !ok || got != want {
			t.Fatalf("payload[%q] = %#v, want %v", key, player[key], want)
		}
	}
}
