package game

import "testing"

func TestTeamBattleTracksPersonalCombatAndObjectiveStats(t *testing.T) {
	state := newTeamObjectiveState()
	attacker := state.Players["blue"]
	target := state.Players["red"]
	target.Lives = 100

	if dealt := state.dealPlayerDamage(attacker, target, 40); dealt != 40 {
		t.Fatalf("player damage = %d, want 40", dealt)
	}
	if dealt := state.dealPlayerDamage(attacker, target, 100); dealt != 60 {
		t.Fatalf("lethal player damage = %d, want remaining 60", dealt)
	}

	tower := state.Objectives["red-tower-west"]
	tower.Lives = 100
	if !state.damageObjective(attacker, tower, 25) || !state.damageObjective(attacker, tower, 100) {
		t.Fatal("expected valid damage against the enemy tower")
	}
	state.Objectives["red-tower-east"].Lives = 0
	hall := state.Objectives["red-town-hall"]
	hall.Lives = 100
	if !state.damageObjective(attacker, hall, 50) {
		t.Fatal("expected valid damage against the exposed enemy town hall")
	}

	if attacker.Kills != 1 || attacker.PlayerDamage != 100 {
		t.Fatalf("attacker combat stats = kills %d damage %d, want 1/100", attacker.Kills, attacker.PlayerDamage)
	}
	if target.Deaths != 1 {
		t.Fatalf("target deaths = %d, want 1", target.Deaths)
	}
	if attacker.TowerDamage != 100 || attacker.TowersDestroyed != 1 {
		t.Fatalf("attacker tower stats = damage %d destroyed %d, want 100/1", attacker.TowerDamage, attacker.TowersDestroyed)
	}
	if attacker.TownHallDamage != 50 {
		t.Fatalf("attacker town hall damage = %d, want 50", attacker.TownHallDamage)
	}
}
