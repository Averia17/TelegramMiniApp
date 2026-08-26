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

// correctCircleWithRectangle resolves the same circle-to-rectangle overlap
// used by client prediction. Using the circle's bounding box here creates
// square, invisible snag zones around rectangle corners.
func correctCircleWithRectangle(body *CircleBody, rect *RectangleBody) {
	closestX := Clamp(body.X, rect.Left(), rect.Right())
	closestY := Clamp(body.Y, rect.Top(), rect.Bottom())
	dx, dy := body.X-closestX, body.Y-closestY
	distance := math.Hypot(dx, dy)
	if distance >= body.Radius {
		return
	}
	if distance > .0001 {
		push := body.Radius - distance
		body.X += dx / distance * push
		body.Y += dy / distance * push
		return
	}

	left := math.Abs(body.X - rect.Left())
	right := math.Abs(rect.Right() - body.X)
	top := math.Abs(body.Y - rect.Top())
	bottom := math.Abs(rect.Bottom() - body.Y)
	nearest := math.Min(math.Min(left, right), math.Min(top, bottom))
	switch nearest {
	case left:
		body.X = rect.Left() - body.Radius
	case right:
		body.X = rect.Right() + body.Radius
	case top:
		body.Y = rect.Top() - body.Radius
	default:
		body.Y = rect.Bottom() + body.Radius
	}
}

func correctCircleWithCircle(body, obstacle *CircleBody) {
	if body == nil || obstacle == nil {
		return
	}
	minDistance := body.Radius + obstacle.Radius
	dx, dy := body.X-obstacle.X, body.Y-obstacle.Y
	distance := math.Hypot(dx, dy)
	if distance >= minDistance {
		return
	}
	if distance > .0001 {
		push := minDistance - distance
		body.X += dx / distance * push
		body.Y += dy / distance * push
		return
	}
	body.X = obstacle.X + minDistance
}

// CorrectCircleWithBlockingCircles resolves overlap with dynamic circular
// obstacles such as active crates. These obstacles are kept outside the map
// spatial hash because they can be created and destroyed during a match.
func CorrectCircleWithBlockingCircles(body *CircleBody, obstacles []*CircleBody) {
	for _, obstacle := range obstacles {
		correctCircleWithCircle(body, obstacle)
	}
}

type WallTile struct {
	MinX           float64
	MinY           float64
	MaxX           float64
	MaxY           float64
	Type           string
	BushGroup      int
	ColliderInsetX float64
	ColliderInsetY float64
	ColliderRadius float64
}

func (wall *WallTile) ColliderRect() RectangleBody {
	insetX := Clamp(wall.ColliderInsetX, 0, math.Max(0, (wall.MaxX-wall.MinX)/2-.001))
	insetY := Clamp(wall.ColliderInsetY, 0, math.Max(0, (wall.MaxY-wall.MinY)/2-.001))
	return RectangleBody{
		X: wall.MinX + insetX, Y: wall.MinY + insetY,
		Width:  wall.MaxX - wall.MinX - insetX*2,
		Height: wall.MaxY - wall.MinY - insetY*2,
	}
}

func (wall *WallTile) ColliderCircle() *CircleBody {
	if wall == nil || wall.ColliderRadius <= 0 {
		return nil
	}
	return &CircleBody{
		X:      (wall.MinX + wall.MaxX) / 2,
		Y:      (wall.MinY + wall.MaxY) / 2,
		Radius: wall.ColliderRadius,
	}
}

func CorrectCircleWithWall(body *CircleBody, wall *WallTile) {
	if body == nil || wall == nil {
		return
	}
	if collider := wall.ColliderCircle(); collider != nil {
		correctCircleWithCircle(body, collider)
		return
	}
	wallRect := wall.ColliderRect()
	correctCircleWithRectangle(body, &wallRect)
}

func CollidesCircleWithWall(body *CircleBody, wall *WallTile) bool {
	if body == nil || wall == nil {
		return false
	}
	if collider := wall.ColliderCircle(); collider != nil {
		return CircleToCircle(body, collider)
	}
	wallRect := wall.ColliderRect()
	return CircleToRectangle(body, &wallRect)
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
	walls.VisitRect(body.Left(), body.Top(), body.Right(), body.Bottom(), func(wall *WallTile) bool {
		if collisionType != "" && wall.Type != collisionType {
			return true
		}
		CorrectCircleWithWall(body, wall)
		return true
	})
}

func CollidesCircleWithWalls(body *CircleBody, walls *SpatialHash, collisionType string) bool {
	collides := false
	walls.VisitRect(body.Left(), body.Top(), body.Right(), body.Bottom(), func(wall *WallTile) bool {
		if collisionType != "" && wall.Type != collisionType {
			return true
		}
		if CollidesCircleWithWall(body, wall) {
			collides = true
			return false
		}
		return true
	})
	return collides
}

func IsBlockingWall(wallType string) bool {
	return wallType != "half" && wallType != "bush" && wallType != "vine" && wallType != "moon_mist" && wallType != "river_bridge"
}

func CorrectCircleWithBlockingWalls(body *CircleBody, walls *SpatialHash) {
	walls.VisitRect(body.Left(), body.Top(), body.Right(), body.Bottom(), func(wall *WallTile) bool {
		if !IsBlockingWall(wall.Type) {
			return true
		}
		CorrectCircleWithWall(body, wall)
		return true
	})
}

func CollidesCircleWithBlockingWalls(body *CircleBody, walls *SpatialHash) bool {
	collides := false
	walls.VisitRect(body.Left(), body.Top(), body.Right(), body.Bottom(), func(wall *WallTile) bool {
		if !IsBlockingWall(wall.Type) {
			return true
		}
		if CollidesCircleWithWall(body, wall) {
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
	MoveCircleWithBlockingWallsAndCircles(body, walls, nil, deltaX, deltaY)
}

// MoveCircleWithBlockingWallsAndCircles sweeps a body against static walls
// and dynamic circular obstacles in small increments so neither kind of
// collider can be crossed by a single movement step.
func MoveCircleWithBlockingWallsAndCircles(body *CircleBody, walls *SpatialHash, obstacles []*CircleBody, deltaX, deltaY float64) {
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
		CorrectCircleWithBlockingCircles(body, obstacles)
	}
}
