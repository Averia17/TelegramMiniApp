package game

import (
	"battle/model/gamemap"
	"battle/service/geometry"
	"testing"
)

func TestBotPathRefreshIsThrottled(t *testing.T) {
	walls := geometry.NewSpatialHash(TileSize)
	gs := &GameState{
		Map:   &gamemap.GameMap{WidthInPixels: 480, HeightInPixels: 480},
		Walls: walls,
	}
	body := &geometry.CircleBody{X: 100, Y: 120, Radius: 14}
	firstNow := int64(1_000)
	gs.botTravelDirection("bot-1", body, 360, 120, firstNow)
	memory := gs.BotMemory["bot-1"]
	if memory == nil {
		t.Fatal("bot path memory was not created")
	}
	if memory.PathRefreshAt != firstNow+BotPathRefreshInterval.Milliseconds() {
		t.Fatalf("path refresh deadline = %v, want %v", memory.PathRefreshAt, firstNow+BotPathRefreshInterval.Milliseconds())
	}
	firstRefreshAt := memory.PathRefreshAt

	gs.botTravelDirection("bot-1", body, 400, 120, firstNow+1)
	if memory.PathRefreshAt != firstRefreshAt || memory.PathGoalX != 9 {
		t.Fatalf("path rebuilt before throttle window: refresh=%v goalX=%v", memory.PathRefreshAt, memory.PathGoalX)
	}

	refreshNow := firstRefreshAt + 1
	gs.botTravelDirection("bot-1", body, 400, 120, refreshNow)
	if memory.PathGoalX != 10 || memory.PathRefreshAt <= refreshNow {
		t.Fatalf("path did not refresh after deadline: refresh=%v goalX=%v", memory.PathRefreshAt, memory.PathGoalX)
	}
}

func TestBotTerrainCacheInvalidatesWhenMapRevisionChanges(t *testing.T) {
	gs := &GameState{
		Map:   &gamemap.GameMap{WidthInPixels: 160, HeightInPixels: 160},
		Walls: geometry.NewSpatialHash(TileSize),
	}

	first := gs.botTerrain(14, 4, 4)
	second := gs.botTerrain(14, 4, 4)
	if &first[0] != &second[0] {
		t.Fatal("expected same cached terrain for an unchanged map revision")
	}

	gs.MapRevision++
	third := gs.botTerrain(14, 4, 4)
	if &first[0] == &third[0] {
		t.Fatal("expected terrain cache to refresh after map revision change")
	}
}
