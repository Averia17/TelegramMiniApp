package game

import (
	"battle/model/gamemap"
	"battle/model/player"
	"battle/service/geometry"
	"testing"
)

func perceptionPlayer(id string, x, y float64) *player.Player {
	return &player.Player{CircleBody: geometry.CircleBody{X: x, Y: y, Radius: 14}, PlayerId: id, Lives: 100, MaxLives: 100}
}

func TestBotCannotSeeDistantPlayerInsideBush(t *testing.T) {
	gs := &GameState{Map: &gamemap.GameMap{Collisions: []*geometry.WallTile{{MinX: 200, MinY: 200, MaxX: 280, MaxY: 280, Type: "bush", BushGroup: 4}}}}
	bot, hidden := perceptionPlayer("bot", 40, 40), perceptionPlayer("hidden", 230, 230)
	if gs.botCanSee(bot, hidden, 10_000) {
		t.Fatal("bot must not read the coordinates of a distant player hidden in grass")
	}
}

func TestBotSeesBushPlayerOnlyWhenCloseSameGroupOrRevealed(t *testing.T) {
	gs := &GameState{Map: &gamemap.GameMap{Collisions: []*geometry.WallTile{
		{MinX: 200, MinY: 200, MaxX: 260, MaxY: 260, Type: "bush", BushGroup: 7},
		{MinX: 280, MinY: 200, MaxX: 340, MaxY: 260, Type: "bush", BushGroup: 7},
	}}}
	hidden := perceptionPlayer("hidden", 220, 220)
	if !gs.botCanSee(perceptionPlayer("same", 300, 220), hidden, 10_000) {
		t.Fatal("bot in the same connected grass must see the target")
	}
	closeBot := perceptionPlayer("close", 150, 220)
	if !gs.botCanSee(closeBot, hidden, 10_000) {
		t.Fatal("bot must discover a hidden target at close range")
	}
	farBot := perceptionPlayer("far", 20, 20)
	hidden.LastShootAt = 9_100
	if !gs.botCanSee(farBot, hidden, 10_000) {
		t.Fatal("attacking from grass must briefly reveal the target")
	}
}

func TestBotMemoryStoresOnlyLastVisiblePosition(t *testing.T) {
	gs := &GameState{BotMemory: make(map[string]*BotPerception)}
	target := perceptionPlayer("human", 310, 420)
	memory := gs.rememberBotTarget("bot-1", target, 5_000)
	target.X, target.Y = 800, 900
	if memory.LastSeenX != 310 || memory.LastSeenY != 420 {
		t.Fatalf("memory followed hidden coordinates: got %.0f,%.0f", memory.LastSeenX, memory.LastSeenY)
	}
	if memory.SearchUntil <= 5_000 {
		t.Fatal("bot must search for a recently lost target")
	}
}
