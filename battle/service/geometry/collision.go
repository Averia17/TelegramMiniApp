package geometry

import "math"

func CircleToCircle(c1, c2 *CircleBody) bool {
	dist := GetDistance(c1.X, c1.Y, c2.X, c2.Y)
	return dist < c1.Radius+c2.Radius
}

func CircleToRectangle(c *CircleBody, r *RectangleBody) bool {
	testX := c.X
	testY := c.Y

	if c.X < r.X {
		testX = r.X
	} else if c.X > r.Right() {
		testX = r.Right()
	}

	if c.Y < r.Y {
		testY = r.Y
	} else if c.Y > r.Bottom() {
		testY = r.Bottom()
	}

	distX := c.X - testX
	distY := c.Y - testY
	return math.Sqrt(distX*distX+distY*distY) <= c.Radius
}

func rectangleToRectangleSide(r1, r2 *RectangleBody) string {
	dx := r1.CenterX() - r2.CenterX()
	dy := r1.CenterY() - r2.CenterY()
	width := (r1.Width + r2.Width) / 2
	height := (r1.Height + r2.Height) / 2
	crossWidth := width * dy
	crossHeight := height * dx

	if math.Abs(dx) <= width && math.Abs(dy) <= height {
		if crossWidth > crossHeight {
			if crossWidth > -crossHeight {
				return "bottom"
			}
			return "left"
		}
		if crossWidth > -crossHeight {
			return "right"
		}
		return "top"
	}
	return "none"
}

func circleToRectangleSide(c *CircleBody, r *RectangleBody) string {
	return rectangleToRectangleSide(c.Box(), r)
}

type WallTile struct {
	MinX      float64
	MinY      float64
	MaxX      float64
	MaxY      float64
	Type      string
	BushGroup int
}

type SpatialHash struct {
	cellSize float64
	cells    map[int][]*WallTile
}

func NewSpatialHash(cellSize float64) *SpatialHash {
	return &SpatialHash{
		cellSize: cellSize,
		cells:    make(map[int][]*WallTile),
	}
}

func (sh *SpatialHash) Insert(wall *WallTile) {
	minCX := int(math.Floor(wall.MinX / sh.cellSize))
	maxCX := int(math.Floor(wall.MaxX / sh.cellSize))
	minCY := int(math.Floor(wall.MinY / sh.cellSize))
	maxCY := int(math.Floor(wall.MaxY / sh.cellSize))

	for cx := minCX; cx <= maxCX; cx++ {
		for cy := minCY; cy <= maxCY; cy++ {
			key := cx*73856093 ^ cy*19349663
			sh.cells[key] = append(sh.cells[key], wall)
		}
	}
}

func (sh *SpatialHash) QueryRect(minX, minY, maxX, maxY float64) []*WallTile {
	// A query usually spans only a handful of cells. Keeping the already
	// returned walls in a small slice avoids allocating a map on every
	// collision probe while preserving deduplication for walls crossing cells.
	result := make([]*WallTile, 0, 8)

	minCX := int(math.Floor(minX / sh.cellSize))
	maxCX := int(math.Floor(maxX / sh.cellSize))
	minCY := int(math.Floor(minY / sh.cellSize))
	maxCY := int(math.Floor(maxY / sh.cellSize))

	for cx := minCX; cx <= maxCX; cx++ {
		for cy := minCY; cy <= maxCY; cy++ {
			key := cx*73856093 ^ cy*19349663
			for _, wall := range sh.cells[key] {
				duplicate := false
				for _, existing := range result {
					if existing == wall {
						duplicate = true
						break
					}
				}
				if !duplicate && wall.MinX < maxX && wall.MaxX > minX && wall.MinY < maxY && wall.MaxY > minY {
					result = append(result, wall)
				}
			}
		}
	}
	return result
}

func (sh *SpatialHash) QueryCircle(c *CircleBody) []*WallTile {
	return sh.QueryRect(c.Left(), c.Top(), c.Right(), c.Bottom())
}

// ContainsPoint checks only the spatial-hash cell containing the point. It is
// used for visibility checks where scanning every map wall for every player
// would otherwise happen on every network snapshot.
func (sh *SpatialHash) ContainsPoint(x, y float64, collisionType string) bool {
	if sh == nil || sh.cellSize <= 0 {
		return false
	}
	cx := int(math.Floor(x / sh.cellSize))
	cy := int(math.Floor(y / sh.cellSize))
	key := cx*73856093 ^ cy*19349663
	for _, wall := range sh.cells[key] {
		if collisionType != "" && wall.Type != collisionType {
			continue
		}
		if x >= wall.MinX && x <= wall.MaxX && y >= wall.MinY && y <= wall.MaxY {
			return true
		}
	}
	return false
}

func CorrectCircleWithWalls(body *CircleBody, walls *SpatialHash, collisionType string) {
	candidates := walls.QueryCircle(body)
	box := body.Box()

	for _, wall := range candidates {
		if collisionType != "" && wall.Type != collisionType {
			continue
		}
		wallRect := &RectangleBody{X: wall.MinX, Y: wall.MinY, Width: wall.MaxX - wall.MinX, Height: wall.MaxY - wall.MinY}
		side := circleToRectangleSide(body, wallRect)
		switch side {
		case "left":
			box.SetRight(wallRect.Left())
			body.X = box.CenterX()
		case "top":
			box.SetBottom(wallRect.Top())
			body.Y = box.CenterY()
		case "right":
			box.SetLeft(wallRect.Right())
			body.X = box.CenterX()
		case "bottom":
			box.SetTop(wallRect.Bottom())
			body.Y = box.CenterY()
		}
	}
}

func CollidesCircleWithWalls(body *CircleBody, walls *SpatialHash, collisionType string) bool {
	candidates := walls.QueryCircle(body)
	for _, wall := range candidates {
		if collisionType != "" && wall.Type != collisionType {
			continue
		}
		wallRect := &RectangleBody{X: wall.MinX, Y: wall.MinY, Width: wall.MaxX - wall.MinX, Height: wall.MaxY - wall.MinY}
		if CircleToRectangle(body, wallRect) {
			return true
		}
	}
	return false
}

func IsBlockingWall(wallType string) bool {
	return wallType != "half" && wallType != "bush" && wallType != "moon_mist"
}

func CorrectCircleWithBlockingWalls(body *CircleBody, walls *SpatialHash) {
	candidates := walls.QueryCircle(body)
	box := body.Box()
	for _, wall := range candidates {
		if !IsBlockingWall(wall.Type) {
			continue
		}
		wallRect := &RectangleBody{X: wall.MinX, Y: wall.MinY, Width: wall.MaxX - wall.MinX, Height: wall.MaxY - wall.MinY}
		switch circleToRectangleSide(body, wallRect) {
		case "left":
			box.SetRight(wallRect.Left())
			body.X = box.CenterX()
		case "top":
			box.SetBottom(wallRect.Top())
			body.Y = box.CenterY()
		case "right":
			box.SetLeft(wallRect.Right())
			body.X = box.CenterX()
		case "bottom":
			box.SetTop(wallRect.Bottom())
			body.Y = box.CenterY()
		}
	}
}

func CollidesCircleWithBlockingWalls(body *CircleBody, walls *SpatialHash) bool {
	for _, wall := range walls.QueryCircle(body) {
		if !IsBlockingWall(wall.Type) {
			continue
		}
		wallRect := &RectangleBody{X: wall.MinX, Y: wall.MinY, Width: wall.MaxX - wall.MinX, Height: wall.MaxY - wall.MinY}
		if CircleToRectangle(body, wallRect) {
			return true
		}
	}
	return false
}

// MoveCircleWithBlockingWalls sweeps long moves in small increments so a body
// cannot finish on the far side of a wall without ever overlapping it.
func MoveCircleWithBlockingWalls(body *CircleBody, walls *SpatialHash, deltaX, deltaY float64) {
	distance := math.Hypot(deltaX, deltaY)
	if distance == 0 {
		return
	}
	maxStep := math.Max(1, body.Radius*.5)
	steps := int(math.Ceil(distance / maxStep))
	stepX := deltaX / float64(steps)
	stepY := deltaY / float64(steps)
	for step := 0; step < steps; step++ {
		body.X += stepX
		body.Y += stepY
		CorrectCircleWithBlockingWalls(body, walls)
	}
}
