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
