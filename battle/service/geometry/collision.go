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
	cellSize  float64
	cells     map[int][]*WallTile
	queryMark map[*WallTile]uint64
	queryID   uint64
}

func NewSpatialHash(cellSize float64) *SpatialHash {
	return &SpatialHash{
		cellSize:  cellSize,
		cells:     make(map[int][]*WallTile),
		queryMark: make(map[*WallTile]uint64),
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
	result := make([]*WallTile, 0, 8)
	sh.VisitRect(minX, minY, maxX, maxY, func(wall *WallTile) bool {
		result = append(result, wall)
		return true
	})
	return result
}

// VisitRect walks each intersecting wall once. A reusable mark table keeps
// collision probes out of the temporary-map and linear-deduplication paths.
// Returning false from visit stops the query immediately.
func (sh *SpatialHash) VisitRect(minX, minY, maxX, maxY float64, visit func(*WallTile) bool) {
	if sh == nil || sh.cellSize <= 0 || visit == nil {
		return
	}
	sh.queryID++
	if sh.queryID == 0 {
		sh.queryID = 1
		clear(sh.queryMark)
	}
	queryID := sh.queryID
	minCX := int(math.Floor(minX / sh.cellSize))
	maxCX := int(math.Floor(maxX / sh.cellSize))
	minCY := int(math.Floor(minY / sh.cellSize))
	maxCY := int(math.Floor(maxY / sh.cellSize))

	for cx := minCX; cx <= maxCX; cx++ {
		for cy := minCY; cy <= maxCY; cy++ {
			key := cx*73856093 ^ cy*19349663
			for _, wall := range sh.cells[key] {
				if wall.MinX >= maxX || wall.MaxX <= minX || wall.MinY >= maxY || wall.MaxY <= minY {
					continue
				}
				if sh.queryMark[wall] == queryID {
					continue
				}
				sh.queryMark[wall] = queryID
				if !visit(wall) {
					return
				}
			}
		}
	}
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

// FindPoint returns the first wall containing the point and accepted by match.
// Point queries touch one spatial-hash cell instead of scanning the map.
func (sh *SpatialHash) FindPoint(x, y float64, match func(*WallTile) bool) *WallTile {
	if sh == nil || sh.cellSize <= 0 || match == nil {
		return nil
	}
	cx := int(math.Floor(x / sh.cellSize))
	cy := int(math.Floor(y / sh.cellSize))
	key := cx*73856093 ^ cy*19349663
	for _, wall := range sh.cells[key] {
		if x < wall.MinX || x > wall.MaxX || y < wall.MinY || y > wall.MaxY {
			continue
		}
		if match(wall) {
			return wall
		}
	}
	return nil
}

func CorrectCircleWithWalls(body *CircleBody, walls *SpatialHash, collisionType string) {
	box := body.Box()
	walls.VisitRect(body.Left(), body.Top(), body.Right(), body.Bottom(), func(wall *WallTile) bool {
		if collisionType != "" && wall.Type != collisionType {
			return true
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
		return true
	})
}

func CollidesCircleWithWalls(body *CircleBody, walls *SpatialHash, collisionType string) bool {
	collides := false
	walls.VisitRect(body.Left(), body.Top(), body.Right(), body.Bottom(), func(wall *WallTile) bool {
		if collisionType != "" && wall.Type != collisionType {
			return true
		}
		wallRect := &RectangleBody{X: wall.MinX, Y: wall.MinY, Width: wall.MaxX - wall.MinX, Height: wall.MaxY - wall.MinY}
		if CircleToRectangle(body, wallRect) {
			collides = true
			return false
		}
		return true
	})
	return collides
}

func IsBlockingWall(wallType string) bool {
	return wallType != "half" && wallType != "bush"
}

func CorrectCircleWithBlockingWalls(body *CircleBody, walls *SpatialHash) {
	box := body.Box()
	walls.VisitRect(body.Left(), body.Top(), body.Right(), body.Bottom(), func(wall *WallTile) bool {
		if !IsBlockingWall(wall.Type) {
			return true
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
		return true
	})
}

func CollidesCircleWithBlockingWalls(body *CircleBody, walls *SpatialHash) bool {
	collides := false
	walls.VisitRect(body.Left(), body.Top(), body.Right(), body.Bottom(), func(wall *WallTile) bool {
		if !IsBlockingWall(wall.Type) {
			return true
		}
		wallRect := &RectangleBody{X: wall.MinX, Y: wall.MinY, Width: wall.MaxX - wall.MinX, Height: wall.MaxY - wall.MinY}
		if CircleToRectangle(body, wallRect) {
			collides = true
			return false
		}
		return true
	})
	return collides
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
