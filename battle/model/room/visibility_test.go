package room

import (
	"battle/model/game"
	"battle/model/gamemap"
	"battle/model/player"
	"battle/service/geometry"
	"testing"
)

func TestVisiblePlayersForClientOmitsConcealedEnemyCoordinates(t *testing.T) {
	viewer := &player.Player{PlayerId: "viewer", Team: "Blue", CircleBody: geometry.CircleBody{X: 100, Y: 100}, Lives: 1}
	enemy := &player.Player{PlayerId: "enemy", Team: "Red", CircleBody: geometry.CircleBody{X: 500, Y: 500}, Lives: 1}
	ally := &player.Player{PlayerId: "ally", Team: "Blue", CircleBody: geometry.CircleBody{X: 520, Y: 500}, Lives: 1}
	state := &game.GameState{
		Players: map[string]*player.Player{"viewer": viewer, "enemy": enemy, "ally": ally},
		Map:     &gamemap.GameMap{Collisions: []*geometry.WallTile{{MinX: 450, MinY: 450, MaxX: 560, MaxY: 560, Type: "bush"}}},
	}
	snapshots := map[string]game.PlayerJSON{
		"viewer": {PlayerId: "viewer", X: 100, Y: 100},
		"enemy":  {PlayerId: "enemy", X: 500, Y: 500},
		"ally":   {PlayerId: "ally", X: 520, Y: 500},
	}

	visible := visiblePlayersForClient(state, "viewer", snapshots, 1_000)
	if _, leaked := visible["enemy"]; leaked {
		t.Fatal("concealed enemy coordinates leaked into personalized snapshot")
	}
	if _, ok := visible["ally"]; !ok {
		t.Fatal("ally in bush must remain visible")
	}

	enemy.LastContactAt = 900
	enemy.LastContactBy = "viewer"
	enemy.LastContactX, enemy.LastContactY = 480, 490
	enemy.LastContactDirX, enemy.LastContactDirY = 0.8, 0.6
	visible = visiblePlayersForClient(state, "viewer", snapshots, 1_000)
	lastSeen, ok := visible["enemy"]
	if !ok || !lastSeen.Hidden || lastSeen.X != 480 || lastSeen.LastContact == nil {
		t.Fatalf("last contact snapshot = %#v, want hidden marker at the contact position", lastSeen)
	}
	if lastSeen.Lives != 0 || lastSeen.MaxLives != 0 || lastSeen.Ammo != 0 || lastSeen.SuperCharge != 0 {
		t.Fatalf("last contact snapshot leaked combat state: %#v", lastSeen)
	}

	enemy.RevealedUntil = 2_500
	visible = visiblePlayersForClient(state, "viewer", snapshots, 1_000)
	if _, ok := visible["enemy"]; !ok {
		t.Fatal("recently revealed enemy must be visible")
	}
}

func TestActivePlayerCountIncludesConcealedPlayers(t *testing.T) {
	state := &game.GameState{
		Players: map[string]*player.Player{
			"viewer": {Lives: 100},
			"hidden": {Lives: 100},
			"dead":   {Lives: 0},
		},
	}

	if got := activePlayerCount(state); got != 2 {
		t.Fatalf("active player count = %d, want 2", got)
	}
}

func TestCombatEventsForClientFiltersWithoutEmptyAllocation(t *testing.T) {
	events := []game.CombatEvent{
		{ID: 1, Ts: 900, SourceID: "viewer", Kind: "attack"},
		{ID: 2, Ts: 900, SourceID: "enemy", TargetID: "other", Kind: "attack"},
		{ID: 3, Ts: 900, TargetID: "viewer", Kind: "damage"},
	}

	visible := combatEventsForClient(events, "viewer", 1_000)
	if len(visible) != 2 || visible[0].ID != 1 || visible[1].ID != 3 {
		t.Fatalf("visible combat events = %#v, want events 1 and 3", visible)
	}
	if visible[0].CombatProfileID != game.CombatProfileID || visible[0].CombatRulesVersion != game.CombatRulesVersion {
		t.Fatalf("combat event version = %#v, want profile=%q version=%q", visible[0], game.CombatProfileID, game.CombatRulesVersion)
	}
	if empty := combatEventsForClient(nil, "viewer", 1_000); empty != nil {
		t.Fatalf("empty combat events = %#v, want nil", empty)
	}
}

func TestCombatEventsForClientCapsSnapshotBudgetAtNewestEvents(t *testing.T) {
	now := int64(10_000)
	events := make([]game.CombatEvent, 0, game.MaxCombatEventsPerSnapshot+3)
	for id := uint64(1); id <= game.MaxCombatEventsPerSnapshot+3; id++ {
		events = append(events, game.CombatEvent{ID: id, Ts: now, SourceID: "local", Kind: "hit", Accepted: true, Resolved: true})
	}

	got := combatEventsForClient(events, "local", now)
	if len(got) != game.MaxCombatEventsPerSnapshot {
		t.Fatalf("combat event snapshot size = %d, want %d", len(got), game.MaxCombatEventsPerSnapshot)
	}
	if got[0].ID != 4 || got[len(got)-1].ID != game.MaxCombatEventsPerSnapshot+3 {
		t.Fatalf("combat event ids = (%d, %d), want newest range 4..%d", got[0].ID, got[len(got)-1].ID, game.MaxCombatEventsPerSnapshot+3)
	}
}

func TestLastContactIsVisibleOnlyToTheAttackerForAShortWindow(t *testing.T) {
	contact := &player.Player{
		PlayerId:        "enemy",
		LastContactAt:   900,
		LastContactBy:   "viewer",
		LastContactX:    500,
		LastContactY:    500,
		LastContactDirX: 0.6,
		LastContactDirY: 0.8,
	}

	if got := lastContactForClient(contact, "viewer", 1_500); got == nil || got.X != 500 || got.DirectionY != 0.8 {
		t.Fatalf("attacker last contact = %#v, want recent contact", got)
	}
	if got := lastContactForClient(contact, "other", 1_500); got != nil {
		t.Fatalf("unrelated player received last contact: %#v", got)
	}
	if got := lastContactForClient(contact, "viewer", 3_001); got != nil {
		t.Fatalf("expired last contact = %#v, want nil", got)
	}
}
