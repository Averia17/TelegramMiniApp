package game

import (
	"battle/model/gamemap"
	"battle/service/geometry"
	"testing"
)

func TestBotPathRefreshIsThrottled(t *testing.T) {
	walls := geometry.NewSpatialHash(TileSize)
	walls.Insert(&geometry.WallTile{MinX: 200, MinY: 80, MaxX: 240, MaxY: 200, Type: "wall"})
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

func TestBotReplansAfterRemainingStuckOnTheSamePosition(t *testing.T) {
	gs := &GameState{
		Map:   &gamemap.GameMap{WidthInPixels: 480, HeightInPixels: 480},
		Walls: geometry.NewSpatialHash(TileSize),
	}
	body := &geometry.CircleBody{X: 100, Y: 120, Radius: 14}
	firstNow := int64(1_000)
	gs.botTravelDirection("bot-1", body, 360, 120, firstNow)
	memory := gs.BotMemory["bot-1"]

	gs.botTravelDirection("bot-1", body, 360, 120, firstNow+BotPathRefreshInterval.Milliseconds()+BotStuckTimeout.Milliseconds())

	if memory.PathReplanCount != 1 {
		t.Fatalf("stuck path replans=%d, want 1", memory.PathReplanCount)
	}
	if memory.PathRefreshAt <= firstNow+BotStuckTimeout.Milliseconds() {
		t.Fatalf("replanned path refresh=%d was not scheduled after the stuck timeout", memory.PathRefreshAt)
	}
}

func TestBotPathUsesNearestWalkableCellWhenGoalIsInsideWall(t *testing.T) {
	wall := &geometry.WallTile{MinX: 160, MinY: 0, MaxX: 200, MaxY: 280, Type: "wall"}
	walls := geometry.NewSpatialHash(TileSize)
	walls.Insert(wall)
	gs := &GameState{
		Map:   &gamemap.GameMap{WidthInPixels: 480, HeightInPixels: 480, Collisions: []*geometry.WallTile{wall}},
		Walls: walls,
	}
	body := &geometry.CircleBody{X: 100, Y: 120, Radius: 14}

	path := gs.findBotPath(body, 180, 120)

	if len(path) == 0 {
		t.Fatal("bot path disappeared when the requested goal was inside a wall")
	}
	last := path[len(path)-1]
	if geometry.CollidesCircleWithBlockingWalls(&geometry.CircleBody{X: last.X, Y: last.Y, Radius: body.Radius + 2}, walls) {
		t.Fatalf("nearest fallback waypoint is still inside wall: (%.1f, %.1f)", last.X, last.Y)
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

func TestBotPathSearchReusesScratchStorage(t *testing.T) {
	gs := &GameState{
		Map:   &gamemap.GameMap{WidthInPixels: 480, HeightInPixels: 480},
		Walls: geometry.NewSpatialHash(TileSize),
	}
	body := &geometry.CircleBody{X: 100, Y: 120, Radius: 14}

	gs.findBotPath(body, 360, 120)
	if len(gs.botPathQueue) == 0 || len(gs.botPathVisited) == 0 || len(gs.botPathParents) == 0 {
		t.Fatal("path search did not initialize reusable scratch storage")
	}
	queueStart := &gs.botPathQueue[0]
	visitedStart := &gs.botPathVisited[0]
	parentsStart := &gs.botPathParents[0]

	gs.findBotPath(body, 400, 360)
	if &gs.botPathQueue[0] != queueStart {
		t.Fatal("path queue backing storage was reallocated")
	}
	if &gs.botPathVisited[0] != visitedStart {
		t.Fatal("path visited backing storage was reallocated")
	}
	if &gs.botPathParents[0] != parentsStart {
		t.Fatal("path parent backing storage was reallocated")
	}
}

func BenchmarkBushGroupAt(b *testing.B) {
	collisions := make([]*geometry.WallTile, 0, 2601)
	for x := 0; x < 2080; x += 40 {
		for y := 0; y < 2000; y += 40 {
			collisions = append(collisions, &geometry.WallTile{
				MinX: float64(x), MinY: float64(y), MaxX: float64(x + 40), MaxY: float64(y + 40), Type: "wall",
			})
		}
	}
	bush := &geometry.WallTile{MinX: 100, MinY: 100, MaxX: 140, MaxY: 140, Type: "bush", BushGroup: 7}
	collisions = append(collisions, bush)
	walls := geometry.NewSpatialHash(TileSize)
	for _, wall := range collisions {
		walls.Insert(wall)
	}
	gs := &GameState{
		Map:         &gamemap.GameMap{Collisions: collisions},
		Walls:       walls,
		WallsSource: collisions,
	}

	b.Run("spatial-hash", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			_, _ = gs.bushGroupAt(120, 120)
		}
	})
	b.Run("full-scan-fallback", func(b *testing.B) {
		gs.WallsSource = nil
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			_, _ = gs.bushGroupAt(120, 120)
		}
	})
}

func BenchmarkFindBotPath(b *testing.B) {
	gs := &GameState{
		Map:   &gamemap.GameMap{WidthInPixels: 2160, HeightInPixels: 2160},
		Walls: geometry.NewSpatialHash(TileSize),
	}
	body := &geometry.CircleBody{X: 100, Y: 120, Radius: 14}
	gs.findBotPath(body, 2000, 2000)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		gs.findBotPath(body, 2000, 2000)
	}
}
