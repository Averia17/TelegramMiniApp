package gamemap

import (
	"math"
	"math/rand"

	"battle/service/geometry"
)

// GenerateBattleRoyale builds the authoritative arena used by the new client.
// It is symmetric for fairness, while the seed keeps matches visually varied.
func GenerateBattleRoyale(seed int64) *GameMap {
	const size = 60
	const tile = 40.0
	rng := rand.New(rand.NewSource(seed))
	gm := &GameMap{
		WidthInPixels: size * tile, HeightInPixels: size * tile,
		Tileset: make(map[int]TilesetEntry),
	}

	occupied := make(map[[2]int]bool)
	add := func(x, y int, kind string) {
		if x < 2 || y < 2 || x >= size-2 || y >= size-2 {
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

	// Coherent two-octave gradient noise creates broad terrain clusters;
	// mirroring the quadrant keeps competitive spawns fair.
	for y := 3; y < size/2; y++ {
		for x := 3; x < size/2; x++ {
			if math.Hypot(float64(x-size/2), float64(y-size/2)) < 5 {
				continue
			}
			edge := minInt(x, y)
			noise := gradientNoise(seed, float64(x)/6.5, float64(y)/6.5) + gradientNoise(seed+0x517cc1b727220a95, float64(x)/14, float64(y)/14)*.45
			kind := ""
			switch {
			case edge > 2 && noise > .22:
				if rng.Float64() < .68 {
					kind = "destructible"
				} else {
					kind = "wall"
				}
			case edge > 1 && noise > -.04:
				kind = "bush"
			case edge > 3 && noise < -.43:
				kind = "water"
			}
			if kind == "" {
				continue
			}
			for _, point := range [][2]int{{x, y}, {size - 1 - x, y}, {x, size - 1 - y}, {size - 1 - x, size - 1 - y}} {
				add(point[0], point[1], kind)
			}
		}
	}

	angleOffset := rng.Float64() * math.Pi * 2
	for index := 0; index < 8; index++ {
		angle := angleOffset + float64(index)*math.Pi/4
		radius := float64(size) * (.36 + rng.Float64()*.05)
		x := int(math.Round(float64(size)/2 + math.Cos(angle)*radius))
		y := int(math.Round(float64(size)/2 + math.Sin(angle)*radius))
		for clearY := y - 2; clearY <= y+2; clearY++ {
			for clearX := x - 2; clearX <= x+2; clearX++ {
				if math.Hypot(float64(clearX-x), float64(clearY-y)) <= 2.2 {
					delete(occupied, [2]int{clearX, clearY})
				}
			}
		}
		gm.Spawners = append(gm.Spawners, &geometry.RectangleBody{X: float64(x) * tile, Y: float64(y) * tile, Width: tile, Height: tile})
	}

	// Remove obstacles cleared around spawns from the serialized/collision map.
	filtered := gm.Collisions[:0]
	for _, wall := range gm.Collisions {
		key := [2]int{int(wall.MinX / tile), int(wall.MinY / tile)}
		if occupied[key] {
			filtered = append(filtered, wall)
		}
	}
	gm.Collisions = filtered

	// Distribute 12 central and 18 outer crates after spawn repair.
	placeCrates := func(count int, central bool) {
		placed := 0
		for attempts := 0; placed < count && attempts < 3000; attempts++ {
			angle := rng.Float64() * math.Pi * 2
			radius := float64(size) * (.24 + rng.Float64()*.18)
			if central {
				radius = math.Sqrt(rng.Float64()) * float64(size) * .18
			}
			x := clampInt(int(math.Round(float64(size)/2+math.Cos(angle)*radius)), 2, size-3)
			y := clampInt(int(math.Round(float64(size)/2+math.Sin(angle)*radius)), 2, size-3)
			if occupied[[2]int{x, y}] {
				continue
			}
			nearSpawn := false
			for _, spawn := range gm.Spawners {
				if math.Hypot(float64(x)-spawn.X/tile, float64(y)-spawn.Y/tile) < 3 {
					nearSpawn = true
					break
				}
			}
			if nearSpawn {
				continue
			}
			add(x, y, "crates")
			placed++
		}
	}
	placeCrates(12, true)
	placeCrates(18, false)
	assignBushGroups(gm.Collisions, tile)
	return gm
}

func assignBushGroups(walls []*geometry.WallTile, tile float64) {
	byCell := make(map[[2]int]*geometry.WallTile)
	for _, wall := range walls {
		if wall.Type == "bush" {
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
