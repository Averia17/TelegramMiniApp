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

	// Generate one quadrant and mirror it to keep all spawn sectors equivalent.
	for y := 3; y < size/2; y++ {
		for x := 3; x < size/2; x++ {
			if math.Hypot(float64(x-size/2), float64(y-size/2)) < 5 {
				continue
			}
			roll := rng.Float64()
			kind := ""
			switch {
			case roll < .05:
				kind = "destructible"
			case roll < .075:
				kind = "full"
			case roll < .19:
				kind = "half"
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
	return gm
}
