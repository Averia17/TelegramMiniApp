package geometry

import "testing"

func TestCircleToCircleOverlap(t *testing.T) {
	c1 := &CircleBody{X: 0, Y: 0, Radius: 10}
	c2 := &CircleBody{X: 15, Y: 0, Radius: 10}
	if !CircleToCircle(c1, c2) {
		t.Error("overlapping circles should collide")
	}
}

func TestCircleToCircleSeparate(t *testing.T) {
	c1 := &CircleBody{X: 0, Y: 0, Radius: 5}
	c2 := &CircleBody{X: 100, Y: 100, Radius: 5}
	if CircleToCircle(c1, c2) {
		t.Error("distant circles should not collide")
	}
}

func TestCircleToRectOverlap(t *testing.T) {
	c := &CircleBody{X: 5, Y: 5, Radius: 5}
	r := &RectangleBody{X: 8, Y: 8, Width: 10, Height: 10}
	if !CircleToRectangle(c, r) {
		t.Error("overlapping circle/rect should collide")
	}
}

func TestCircleToRectSeparate(t *testing.T) {
	c := &CircleBody{X: 0, Y: 0, Radius: 5}
	r := &RectangleBody{X: 100, Y: 100, Width: 10, Height: 10}
	if CircleToRectangle(c, r) {
		t.Error("distant circle/rect should not collide")
	}
}

func TestSpatialHashInsertAndQuery(t *testing.T) {
	sh := NewSpatialHash(32)
	wall := &WallTile{MinX: 0, MinY: 0, MaxX: 32, MaxY: 32, Type: "full"}
	sh.Insert(wall)

	results := sh.QueryRect(0, 0, 32, 32)
	if len(results) != 1 {
		t.Errorf("QueryRect returned %d results, want 1", len(results))
	}
}

func TestSpatialHashQueryNoMatch(t *testing.T) {
	sh := NewSpatialHash(32)
	wall := &WallTile{MinX: 0, MinY: 0, MaxX: 32, MaxY: 32, Type: "full"}
	sh.Insert(wall)

	results := sh.QueryRect(100, 100, 200, 200)
	if len(results) != 0 {
		t.Errorf("QueryRect returned %d results, want 0", len(results))
	}
}

func TestSpatialHashVisitRectDeduplicatesAndCanStopEarly(t *testing.T) {
	sh := NewSpatialHash(32)
	first := &WallTile{MinX: 0, MinY: 0, MaxX: 64, MaxY: 32, Type: "full"}
	second := &WallTile{MinX: 32, MinY: 32, MaxX: 64, MaxY: 64, Type: "full"}
	sh.Insert(first)
	sh.Insert(second)

	visited := make([]*WallTile, 0, 2)
	sh.VisitRect(0, 0, 64, 64, func(wall *WallTile) bool {
		visited = append(visited, wall)
		return len(visited) < 2
	})

	if len(visited) != 2 || visited[0] == visited[1] {
		t.Fatalf("VisitRect visited %d unique walls, want 2: %#v", len(visited), visited)
	}
}

func TestSpatialHashContainsPointUsesNearbyWalls(t *testing.T) {
	sh := NewSpatialHash(32)
	sh.Insert(&WallTile{MinX: 20, MinY: 20, MaxX: 40, MaxY: 40, Type: "bush"})
	sh.Insert(&WallTile{MinX: 64, MinY: 20, MaxX: 84, MaxY: 40, Type: "half"})

	if !sh.ContainsPoint(30, 30, "bush") {
		t.Fatal("expected point inside bush to be found")
	}
	if sh.ContainsPoint(30, 30, "half") {
		t.Fatal("did not expect type-filtered point hit")
	}
	if !sh.ContainsPoint(70, 30, "half") {
		t.Fatal("expected point inside half wall to be found")
	}
	if sh.ContainsPoint(200, 200, "bush") {
		t.Fatal("did not expect distant point to be found")
	}
}

func TestSpatialHashFindPointReturnsTheMatchingWallFromNearbyCell(t *testing.T) {
	sh := NewSpatialHash(32)
	bush := &WallTile{MinX: 20, MinY: 20, MaxX: 40, MaxY: 40, Type: "bush", BushGroup: 7}
	sh.Insert(bush)
	sh.Insert(&WallTile{MinX: 64, MinY: 20, MaxX: 84, MaxY: 40, Type: "half", BushGroup: 8})

	found := sh.FindPoint(30, 30, func(wall *WallTile) bool { return wall.Type == "bush" })
	if found != bush {
		t.Fatalf("FindPoint returned %#v, want bush wall %#v", found, bush)
	}
	if sh.FindPoint(30, 30, func(wall *WallTile) bool { return wall.Type == "half" }) != nil {
		t.Fatal("FindPoint returned a wall that did not match the predicate")
	}
}

func TestCollidesCircleWithWallsFull(t *testing.T) {
	sh := NewSpatialHash(32)
	sh.Insert(&WallTile{MinX: 50, MinY: 50, MaxX: 82, MaxY: 82, Type: "full"})

	c := &CircleBody{X: 60, Y: 60, Radius: 10}
	if !CollidesCircleWithWalls(c, sh, "full") {
		t.Error("circle inside full wall should collide")
	}
}

func TestCollidesCircleWithWallsNoCollision(t *testing.T) {
	sh := NewSpatialHash(32)
	sh.Insert(&WallTile{MinX: 200, MinY: 200, MaxX: 232, MaxY: 232, Type: "full"})

	c := &CircleBody{X: 10, Y: 10, Radius: 5}
	if CollidesCircleWithWalls(c, sh, "full") {
		t.Error("circle far from walls should not collide")
	}
}

func TestMoveCircleWithBlockingWallsCannotTunnelThroughWall(t *testing.T) {
	sh := NewSpatialHash(40)
	sh.Insert(&WallTile{MinX: 100, MinY: 0, MaxX: 140, MaxY: 200, Type: "wall"})
	body := &CircleBody{X: 50, Y: 80, Radius: 10}

	MoveCircleWithBlockingWalls(body, sh, 320, 0)

	if body.X != 90 || body.Y != 80 {
		t.Fatalf("swept move ended at %.2f,%.2f, want 90,80 before the wall", body.X, body.Y)
	}
}

func TestMoveCircleWithBlockingWallsAndCirclesCannotEnterDynamicObstacle(t *testing.T) {
	body := &CircleBody{X: 50, Y: 80, Radius: 10}
	crate := &CircleBody{X: 140, Y: 80, Radius: 22}

	MoveCircleWithBlockingWallsAndCircles(body, NewSpatialHash(40), []*CircleBody{crate}, 120, 0)

	if CircleToCircle(body, crate) {
		t.Fatalf("body entered dynamic obstacle at %.2f,%.2f", body.X, body.Y)
	}
}

func TestMoveCircleWithBlockingWallsAllowsBushes(t *testing.T) {
	sh := NewSpatialHash(40)
	sh.Insert(&WallTile{MinX: 100, MinY: 0, MaxX: 140, MaxY: 200, Type: "bush"})
	body := &CircleBody{X: 50, Y: 80, Radius: 10}

	MoveCircleWithBlockingWalls(body, sh, 120, 0)

	if body.X != 170 || body.Y != 80 {
		t.Fatalf("move through bush ended at %.2f,%.2f, want 170,80", body.X, body.Y)
	}
}

func TestBlockingWallColliderInsetsAllowApproachingSmallerProps(t *testing.T) {
	sh := NewSpatialHash(40)
	sh.Insert(&WallTile{
		MinX: 100, MinY: 100, MaxX: 140, MaxY: 140, Type: "tree",
		ColliderInsetX: 10, ColliderInsetY: 8,
	})
	body := &CircleBody{X: 70, Y: 120, Radius: 10}

	MoveCircleWithBlockingWalls(body, sh, 50, 0)

	if body.X != 100 {
		t.Fatalf("body stopped at x=%.2f, want 100 beside inset collider", body.X)
	}
}

func TestBlockingWallCorrectionDoesNotCatchCircleOutsideRectangleCorner(t *testing.T) {
	sh := NewSpatialHash(40)
	sh.Insert(&WallTile{MinX: 100, MinY: 100, MaxX: 140, MaxY: 140, Type: "wall"})
	body := &CircleBody{X: 90, Y: 90, Radius: 14}

	CorrectCircleWithBlockingWalls(body, sh)

	if body.X != 90 || body.Y != 90 {
		t.Fatalf("non-colliding circle corner was corrected to %.2f,%.2f, want 90,90", body.X, body.Y)
	}
}

func TestMoveCircleWithBlockingWallsAllowsMoonMist(t *testing.T) {
	sh := NewSpatialHash(40)
	sh.Insert(&WallTile{MinX: 100, MinY: 0, MaxX: 140, MaxY: 200, Type: "moon_mist"})
	body := &CircleBody{X: 50, Y: 80, Radius: 10}

	MoveCircleWithBlockingWalls(body, sh, 120, 0)

	if body.X != 170 || body.Y != 80 {
		t.Fatalf("move through moon mist ended at %.2f,%.2f, want 170,80 past the concealment", body.X, body.Y)
	}
}

func BenchmarkCollidesCircleWithBlockingWalls(b *testing.B) {
	sh := NewSpatialHash(32)
	for x := 0; x < 256; x += 32 {
		for y := 0; y < 256; y += 32 {
			sh.Insert(&WallTile{MinX: float64(x), MinY: float64(y), MaxX: float64(x + 32), MaxY: float64(y + 32), Type: "full"})
		}
	}
	body := &CircleBody{X: 124, Y: 124, Radius: 14}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = CollidesCircleWithBlockingWalls(body, sh)
	}
}
