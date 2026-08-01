package gamemap

import (
	"math"
	"math/rand"

	"battle/service/geometry"
)

// GenerateBattleRoyale builds the authored arena for «Остров Первого Испытания».
// The layout is rotationally fair: four landing pads feed four readable routes
// into the forest, while the altar, sacrifice stone and beacon remain fixed landmarks.
func GenerateBattleRoyale(seed int64) *GameMap {
	const size = 60
	const tile = 40.0
	const center = 30
	rng := rand.New(rand.NewSource(seed))
	gm := &GameMap{
		WidthInPixels: size * tile, HeightInPixels: size * tile,
		Tileset: make(map[int]TilesetEntry),
	}

	occupied := make(map[[2]int]bool)
	add := func(x, y int, kind string) {
		if x < 0 || y < 0 || x >= size || y >= size {
			return
		}
		key := [2]int{x, y}
		if occupied[key] {
			return
		}
		occupied[key] = true
		gm.Collisions = append(gm.Collisions, &geometry.WallTile{
			MinX: float64(x) * tile, MinY: float64(y) * tile,
			MaxX: float64(x+1) * tile, MaxY: float64(y+1) * tile, Type: kind,
		})
	}
	addRect := func(minX, minY, maxX, maxY int, kind string) {
		for y := minY; y <= maxY; y++ {
			for x := minX; x <= maxX; x++ {
				add(x, y, kind)
			}
		}
	}
	clear := func(x, y int) { delete(occupied, [2]int{x, y}) }
	clearDisc := func(cx, cy int, radius float64) {
		for y := cy - int(radius) - 1; y <= cy+int(radius)+1; y++ {
			for x := cx - int(radius) - 1; x <= cx+int(radius)+1; x++ {
				if math.Hypot(float64(x-cx), float64(y-cy)) <= radius {
					clear(x, y)
				}
			}
		}
	}

	// Water is a real collision boundary, not just an edge clamp. The island
	// is circular inside the 60x60 playable canvas, creating the atoll silhouette.
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			if math.Hypot(float64(x)+0.5-float64(center), float64(y)+0.5-float64(center)) > 27.25 {
				add(x, y, "water")
			}
		}
	}

	// Outer ring: beach cover, tide fog and rune crates. These are mirrored
	// across the four landing approaches so no spawn has a privileged route.
	for _, patch := range [][2]int{{10, 12}, {14, 10}, {46, 12}, {50, 16}, {10, 46}, {14, 50}, {46, 48}, {50, 44}} {
		add(patch[0], patch[1], "bush")
		add(patch[0]+1, patch[1], "bush")
		add(patch[0], patch[1]+1, "bush")
	}
	for _, patch := range [][2]int{{19, 8}, {41, 8}, {8, 21}, {51, 39}, {8, 39}, {51, 21}, {19, 51}, {41, 51}} {
		add(patch[0], patch[1], "moon_mist")
	}
	for _, crate := range [][2]int{{20, 11}, {23, 9}, {37, 9}, {40, 11}, {11, 20}, {9, 23}, {51, 37}, {48, 40}, {11, 40}, {9, 37}, {49, 20}, {51, 23}, {20, 49}, {23, 51}, {37, 51}, {40, 49}} {
		add(crate[0], crate[1], "crates")
	}

	// Forest ring: ancient trees are permanent cover, dead trees are destructible.
	for _, tree := range [][2]int{
		{15, 16}, {20, 14}, {25, 12}, {35, 12}, {40, 14}, {45, 16},
		{13, 25}, {17, 21}, {43, 21}, {47, 25}, {13, 35}, {17, 39},
		{43, 39}, {47, 35}, {15, 44}, {20, 46}, {25, 48}, {35, 48}, {40, 46}, {45, 44},
	} {
		add(tree[0], tree[1], "tree")
	}
	for _, dead := range [][2]int{{22, 18}, {38, 18}, {18, 30}, {42, 30}, {22, 42}, {38, 42}, {27, 15}, {33, 15}} {
		add(dead[0], dead[1], "dead_tree")
	}

	// Two shipwreck labyrinths: outlines leave walkable rooms and narrow sightlines.
	addWreck := func(x, y int, flip bool) {
		addRect(x, y, x+4, y, "shipwreck")
		addRect(x, y+4, x+4, y+4, "shipwreck")
		if flip {
			addRect(x, y+1, x, y+3, "shipwreck")
			add(x+4, y+2, "shipwreck")
		} else {
			addRect(x+4, y+1, x+4, y+3, "shipwreck")
			add(x, y+2, "shipwreck")
		}
	}
	addWreck(20, 24, rng.Intn(2) == 0)
	addWreck(35, 31, rng.Intn(2) == 0)

	// Narrow water channels separate the forest pockets; the client dresses the
	// two open crossings as glowing root bridges.
	for y := 16; y <= 44; y++ {
		if y != 29 && y != 30 && y != 31 {
			add(11, y, "water")
			add(48, y, "water")
		}
	}

	// Heart moat: only north and south openings remain reachable in the finale.
	for y := center - 6; y <= center+6; y++ {
		for x := center - 6; x <= center+6; x++ {
			distance := math.Hypot(float64(x-center), float64(y-center))
			bridge := (y == center-5 || y == center+5) && x >= center-1 && x <= center+1
			if distance >= 4.0 && distance <= 5.35 && !bridge {
				add(x, y, "water")
			}
		}
	}

	// Four broad, readable approach lanes. Clearing them after dressing keeps
	// the forest interesting without creating an accidental soft-lock.
	for i := 8; i <= 27; i++ {
		for offset := -1; offset <= 1; offset++ {
			clear(center+offset, i)
			clear(center+offset, size-1-i)
			clear(i, center+offset)
			clear(size-1-i, center+offset)
		}
	}
	clearDisc(center, center, 3.4)

	// Story landmarks sit in open, memorable spaces.
	add(center, 18, "altar_three_moons")
	add(18, center, "sacrificial_stone")
	for _, menhir := range [][2]int{{24, 25}, {35, 25}, {24, 35}, {35, 35}, {27, 23}, {33, 23}} {
		add(menhir[0], menhir[1], "menhir")
	}

	// Four landing zones, two spawn pads each. The paired pads make a clean
	// beach zone for each direction while preserving eight-player capacity.
	spawnCenters := [][2]int{{center, 8}, {51, center}, {center, 51}, {8, center}}
	for _, spawn := range spawnCenters {
		clearDisc(spawn[0], spawn[1], 2.5)
		for _, offset := range [][2]int{{-1, 0}, {1, 0}} {
			x, y := spawn[0]+offset[0], spawn[1]+offset[1]
			gm.Spawners = append(gm.Spawners, &geometry.RectangleBody{X: float64(x) * tile, Y: float64(y) * tile, Width: tile, Height: tile})
		}
	}

	// Filter cleared cells from the authored collision list and keep bush groups
	// stable for visibility, healing and bot perception.
	filtered := gm.Collisions[:0]
	for _, wall := range gm.Collisions {
		key := [2]int{int(wall.MinX / tile), int(wall.MinY / tile)}
		if occupied[key] {
			filtered = append(filtered, wall)
		}
	}
	gm.Collisions = filtered
	assignBushGroups(gm.Collisions, tile)
	return gm
}

func assignBushGroups(walls []*geometry.WallTile, tile float64) {
	byCell := make(map[[2]int]*geometry.WallTile)
	for _, wall := range walls {
		if wall.Type == "bush" || wall.Type == "moon_mist" {
			byCell[[2]int{int(math.Round(wall.MinX / tile)), int(math.Round(wall.MinY / tile))}] = wall
		}
	}
	group := 0
	for cell, start := range byCell {
		if start.BushGroup != 0 {
			continue
		}
		group++
		start.BushGroup = group
		queue := [][2]int{cell}
		for len(queue) > 0 {
			current := queue[0]
			queue = queue[1:]
			for _, delta := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
				nextCell := [2]int{current[0] + delta[0], current[1] + delta[1]}
				if next := byCell[nextCell]; next != nil && next.BushGroup == 0 {
					next.BushGroup = group
					queue = append(queue, nextCell)
				}
			}
		}
	}
}

func fade(t float64) float64       { return t * t * t * (t*(t*6-15) + 10) }
func lerp(a, b, t float64) float64 { return a + (b-a)*t }

func gradientNoise(seed int64, x, y float64) float64 {
	x0, y0 := int(math.Floor(x)), int(math.Floor(y))
	dot := func(gx, gy int) float64 {
		h := uint64(seed) ^ uint64(int64(gx)*0x9e3779b1) ^ uint64(int64(gy)*0x85ebca77)
		h ^= h >> 30
		h *= 0xbf58476d1ce4e5b9
		h ^= h >> 27
		h *= 0x94d049bb133111eb
		h ^= h >> 31
		angle := float64(h&0xffffffff) / float64(uint64(1)<<32) * math.Pi * 2
		return math.Cos(angle)*(x-float64(gx)) + math.Sin(angle)*(y-float64(gy))
	}
	sx, sy := fade(x-float64(x0)), fade(y-float64(y0))
	return lerp(lerp(dot(x0, y0), dot(x0+1, y0), sx), lerp(dot(x0, y0+1), dot(x0+1, y0+1), sx), sy)
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
func clampInt(value, low, high int) int {
	if value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}
