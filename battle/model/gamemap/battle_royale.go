package gamemap

import (
	"math"
	"math/rand"

	"battle/service/geometry"
)

// GenerateBattleRoyale builds the natural island arena for «Остров Первого Испытания».
// The broad terrain is generated from low-frequency noise so every match keeps
// the same readable landing zones without looking like a four-way mirror.
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

	// Water is a real collision boundary, not just an edge clamp. Noise on the
	// shoreline makes the island feel hand-shaped instead of perfectly circular.
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			distance := math.Hypot(float64(x)+0.5-float64(center), float64(y)+0.5-float64(center))
			shoreline := 26.0 +
				gradientNoise(seed+0x1b873593, float64(x)/5.2, float64(y)/5.2)*2.1 +
				gradientNoise(seed+0x85ebca6b, float64(x)/11.0, float64(y)/11.0)*1.2
			if distance > shoreline {
				add(x, y, "water")
			}
		}
	}

	// Interior ponds break up the grass without cutting the four approach lanes.
	for y := 8; y < size-8; y++ {
		for x := 8; x < size-8; x++ {
			if occupied[[2]int{x, y}] {
				continue
			}
			distance := math.Hypot(float64(x)-center, float64(y)-center)
			waterNoise := gradientNoise(seed+0x517cc1b7, float64(x)/4.5, float64(y)/4.5) +
				gradientNoise(seed+0x68e31da4, float64(x)/10.0, float64(y)/10.0)*.55
			if distance > 8 && distance < 23 && waterNoise < -.5 {
				add(x, y, "water")
			}
		}
	}

	// Grass is non-blocking concealment, laid down in large irregular patches.
	// The two noise scales prevent a repetitive checkerboard. Keep the threshold
	// high enough that combat lanes and landmarks remain readable at the battle
	// camera angle; the QA map preview consumes this same generator.
	for y := 4; y < size-4; y++ {
		for x := 4; x < size-4; x++ {
			if occupied[[2]int{x, y}] {
				continue
			}
			distance := math.Hypot(float64(x)-center, float64(y)-center)
			grassNoise := gradientNoise(seed+0x9e3779b9, float64(x)/5.8, float64(y)/5.8) +
				gradientNoise(seed+0x243f6a88, float64(x)/13.0, float64(y)/13.0)*.5
			if distance > 5 && grassNoise > .3 {
				add(x, y, "bush")
			}
		}
	}

	// Stone and timber walls follow the same terrain noise, creating cover
	// clusters and winding sightlines instead of isolated symmetric pillars.
	for y := 7; y < size-7; y++ {
		for x := 7; x < size-7; x++ {
			if occupied[[2]int{x, y}] {
				continue
			}
			distance := math.Hypot(float64(x)-center, float64(y)-center)
			wallNoise := gradientNoise(seed+0x632be59b, float64(x)/4.8, float64(y)/4.8) +
				gradientNoise(seed+0x85157af5, float64(x)/9.5, float64(y)/9.5)*.6
			if distance < 6 || wallNoise < .28 {
				continue
			}
			kind := "destructible"
			switch {
			case wallNoise > .62:
				kind = "tree"
			case wallNoise > .45 && rng.Float64() < .55:
				kind = "wall"
			case rng.Float64() < .18:
				kind = "dead_tree"
			}
			add(x, y, kind)
		}
	}

	// A few irregular shipwreck frames act as landmarks without dominating the
	// whole island. Their rotation varies per seed.
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
	addWreck(17, 23, rng.Intn(2) == 0)
	addWreck(37, 34, rng.Intn(2) == 0)
	addWreck(21, 38, rng.Intn(2) == 0)

	// Small beach grass clusters and old crates add visual texture around the
	// outer ring, while remaining separate from combat booster drops.
	for _, patch := range [][2]int{{11, 13}, {46, 15}, {12, 44}, {45, 47}, {18, 9}, {41, 50}} {
		for _, offset := range [][2]int{{0, 0}, {1, 0}, {0, 1}} {
			add(patch[0]+offset[0], patch[1]+offset[1], "bush")
		}
	}
	for _, crate := range [][2]int{{19, 11}, {40, 12}, {11, 22}, {48, 38}, {12, 39}, {40, 48}, {22, 50}, {49, 20}} {
		add(crate[0], crate[1], "crates")
	}

	// Four broad approach lanes are cleared after dressing. A tiny seeded bend
	// makes their edges organic while leaving enough room for every spawn.
	for i := 8; i <= 27; i++ {
		bend := int(math.Round(gradientNoise(seed+int64(i)*0x9e37, float64(i)/3.5, 0) * 1.1))
		clear(center+bend, i)
		clear(center+bend+1, i)
		clear(center-bend, size-1-i)
		clear(center-bend-1, size-1-i)
		clear(i, center-bend)
		clear(i, center-bend-1)
		clear(size-1-i, center+bend)
		clear(size-1-i, center+bend+1)
	}
	clearDisc(center, center, 4.0)
	for _, mist := range [][2]int{{17, 10}, {43, 12}, {12, 43}, {47, 47}} {
		clear(mist[0], mist[1])
		add(mist[0], mist[1], "moon_mist")
	}

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
