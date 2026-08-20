package gamemap

import (
	"math"

	"battle/service/geometry"
)

const CanonicalTeamBattleSeed int64 = 20260816

const (
	teamBattleRiverCenter    = 0.0
	teamBattleRiverHalfWidth = 2.2
	// Objective visuals are smaller than their gameplay target radius. Keep a
	// compact physical footprint so heroes can stand close enough to attack
	// without being stopped by a tile-sized square around the building.
	teamBattleTownHallCollisionRadius = 72.0
	teamBattleTowerCollisionRadius    = 36.0
	// The river spans the whole playable island. The outer water ring owns the
	// cells beyond these banks, so the river meets the ocean without drawing a
	// second river strip through open water.
	teamBattleRiverStart = 10.0
	teamBattleRiverMouth = 70.0
)

// GenerateTeamBattle builds an authored 3v3 arena. The two bases sit on
// opposite sides of the main diagonal, and every authored cell is reflected
// across that diagonal so both teams get the same readable combat language.
func GenerateTeamBattle(seed int64) *GameMap {
	const size, tile = 80, 40.0
	gm := &GameMap{
		WidthInPixels: size * tile, HeightInPixels: size * tile,
		Tileset: make(map[int]TilesetEntry), TeamSpawners: map[string][]*geometry.RectangleBody{},
	}

	occupied := make(map[[2]int]bool)
	add := func(x, y int, kind string) {
		if x < 0 || y < 0 || x >= size || y >= size {
			return
		}
		if kind != "water" && (x < 1 || y < 1 || x >= size-1 || y >= size-1) {
			return
		}
		cell := [2]int{x, y}
		if occupied[cell] {
			return
		}
		occupied[cell] = true
		gm.Collisions = append(gm.Collisions, &geometry.WallTile{
			MinX: float64(x) * tile, MinY: float64(y) * tile,
			MaxX: float64(x+1) * tile, MaxY: float64(y+1) * tile, Type: kind,
		})
	}
	// The arena is an island, not a rectangular lawn. Water is authored first
	// so every later prop is automatically trimmed to the circular shoreline.
	const islandCenter, islandRadius = 40.0, 35.5
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			distance := math.Hypot(float64(x)+.5-islandCenter, float64(y)+.5-islandCenter)
			if distance > islandRadius {
				add(x, y, "water")
			}
		}
	}
	mirror := func(x, y int) (int, int) { return y, x }
	addMirrored := func(x, y int, kind string) {
		add(x, y, kind)
		mx, my := mirror(x, y)
		add(mx, my, kind)
	}
	addMirroredRect := func(minX, minY, maxX, maxY int, kind string) {
		for y := minY; y <= maxY; y++ {
			for x := minX; x <= maxX; x++ {
				addMirrored(x, y, kind)
			}
		}
	}
	clear := func(x, y int) { delete(occupied, [2]int{x, y}) }
	clearMirrored := func(x, y int) {
		clear(x, y)
		mx, my := mirror(x, y)
		clear(mx, my)
	}
	clearAreaMirrored := func(cx, cy, radius int) {
		for y := cy - radius; y <= cy+radius; y++ {
			for x := cx - radius; x <= cx+radius; x++ {
				if math.Hypot(float64(x-cx), float64(y-cy)) <= float64(radius)+.35 {
					clearMirrored(x, y)
				}
			}
		}
	}
	bridgeCenters := [][2]int{{22, 22}, {39, 39}, {57, 57}}
	bridgeCorridorCell := func(center, cell [2]int) bool {
		alongBridge := absInt((cell[0] - center[0]) + (cell[1] - center[1]))
		acrossBridge := absInt((cell[0] - center[0]) - (cell[1] - center[1]))
		return alongBridge <= 1 && acrossBridge <= 8
	}
	clearBridgeApproaches := func() {
		for _, center := range bridgeCenters {
			for y := center[1] - 6; y <= center[1]+6; y++ {
				for x := center[0] - 6; x <= center[0]+6; x++ {
					if bridgeCorridorCell(center, [2]int{x, y}) {
						clear(x, y)
					}
				}
			}
		}
	}
	addFeature := func(id, kind string, x, y, rotation, scale float64) {
		gm.Features = append(gm.Features, MapFeature{ID: id, Type: kind, X: x * tile, Y: y * tile, Rotation: rotation, Scale: scale})
	}
	addFeature("team-river", "river", 39.5, 39.5, -math.Pi/4, 1)
	addFeature("team-bridge-north", "river_bridge", 22, 22, -math.Pi/4, 1)
	addFeature("team-bridge-center", "river_bridge", 39.5, 39.5, -math.Pi/4, 1)
	addFeature("team-bridge-south", "river_bridge", 57, 57, -math.Pi/4, 1)

	// Cluster primitives keep the arena dressed with connected silhouettes.
	// The mirror wrapper is used at the primitive boundary so a future layout
	// edit cannot accidentally give one team a different obstacle pattern.
	addRuin := func(cx, cy int) {
		addMirroredRect(cx-2, cy-1, cx+2, cy-1, "wall")
		addMirroredRect(cx-2, cy+1, cx-2, cy+2, "destructible")
		addMirroredRect(cx+1, cy+1, cx+2, cy+2, "destructible")
		addMirrored(cx, cy+2, "crates")
	}
	addGrove := func(cx, cy int) {
		for _, offset := range [][2]int{{-2, -1}, {0, -2}, {2, -1}, {-2, 1}, {2, 1}, {0, 2}} {
			addMirrored(cx+offset[0], cy+offset[1], "tree")
		}
		addMirroredRect(cx-1, cy-1, cx+1, cy+1, "bush")
	}
	addBarricade := func(cx, cy int) {
		addMirroredRect(cx-3, cy, cx+3, cy, "destructible")
		addMirrored(cx-2, cy-1, "crates")
		addMirrored(cx+2, cy-1, "crates")
		addMirrored(cx, cy+1, "wall")
	}
	addRuinLair := func(cx, cy int) {
		// Broken three-sided chambers create readable cover while keeping a
		// diagonal firing lane through the middle of every mirrored complex.
		for _, offset := range [][2]int{{-2, -1}, {-1, -1}, {0, -1}, {2, -1}, {-2, 0}, {2, 0}, {-2, 1}, {-1, 1}, {1, 1}, {2, 1}} {
			addMirrored(cx+offset[0], cy+offset[1], "ruin_wall")
		}
		for _, offset := range [][2]int{{-3, -1}, {3, -1}, {-3, 1}, {3, 1}, {-1, 2}, {1, 2}} {
			addMirrored(cx+offset[0], cy+offset[1], "thorn_vine")
		}
	}
	addPond := func(cx, cy int) {
		for y := cy - 3; y <= cy+3; y++ {
			for x := cx - 4; x <= cx+4; x++ {
				dx := float64(x-cx) / 4.1
				dy := float64(y-cy) / 2.7
				if dx*dx+dy*dy <= 1 {
					addMirrored(x, y, "water")
				}
			}
		}
	}
	addBushPatch := func(cx, cy int) {
		for dy := -4; dy <= 4; dy++ {
			span := 5
			if absInt(dy) >= 3 {
				span = 3
			}
			for dx := -span; dx <= span; dx++ {
				if dx*dx+dy*dy <= 30 {
					addMirrored(cx+dx, cy+dy, "bush")
				}
			}
		}
	}

	// Solid cover first, then broad bush fields around it. The authored half
	// stays on the Blue side; addMirrored creates the exact Red-side twin.
	addRuin(13, 70)
	addGrove(23, 61)
	addBarricade(33, 56)
	addGrove(43, 52)
	addRuin(54, 43)
	addBarricade(65, 28)
	addPond(18, 66)
	addPond(35, 52)
	// The upper bank gets three distinct ruin lairs instead of another broad
	// bush field: each has a broken wall, a thorn perimeter, and a nearby bat
	// route. Their diagonal twins keep both teams' approaches equivalent.
	addRuinLair(18, 44)
	addRuinLair(29, 58)
	addRuinLair(43, 67)
	// Neutral north-west / south-east flanks sit on the mirror axis itself.
	// They keep the default inspector view from opening onto an empty corner.
	addGrove(14, 14)
	addGrove(66, 66)
	addRuin(22, 22)
	addRuin(58, 58)
	for _, patch := range [][2]int{{14, 70}, {22, 62}, {31, 57}, {40, 53}, {49, 45}, {58, 35}, {67, 25}} {
		addBushPatch(patch[0], patch[1])
	}
	for _, patch := range [][2]int{{14, 14}, {22, 22}, {58, 58}, {66, 66}} {
		addBushPatch(patch[0], patch[1])
	}

	// Open plazas and spawn pockets are cleared symmetrically after dressing so
	// no procedural cluster can seal a base or the central crossing.
	clearAreaMirrored(16, 63, 3)
	clearAreaMirrored(39, 40, 5)
	clearAreaMirrored(20, 54, 3)
	clearAreaMirrored(58, 35, 3)

	// Each base gets a two-block stone arc instead of a rectangular perimeter.
	// The arc wraps around the back of the base and opens toward the opposing
	// town hall, leaving a broad readable approach while preserving room for the
	// hall, both towers, and the team spawn pocket. The authored Blue arc is
	// mirrored below, so Red receives the same enclosure on the opposite side.
	addFortress := func(cx, cy int) {
		clearAreaMirrored(cx, cy, 8)
		const innerRadius, outerRadius = 7.5, 10.5
		isFortressArcCell := func(x, y int) bool {
			dx, dy := float64(x-cx), float64(y-cy)
			radius := math.Hypot(dx, dy)
			// Keep the entrance open toward the enemy, but carry the arc a few
			// cells farther around both side shoulders.
			return radius >= innerRadius && radius <= outerRadius && dx-dy < 4.5
		}
		for y := cy - 11; y <= cy+11; y++ {
			for x := cx - 11; x <= cx+11; x++ {
				if !isFortressArcCell(x, y) {
					continue
				}
				// Clear only the cells occupied by the arc. This prevents an
				// existing bush or prop from punching a hole without disturbing
				// nearby river-approach dressing.
				clearMirrored(x, y)
			}
		}
		for y := cy - 11; y <= cy+11; y++ {
			for x := cx - 11; x <= cx+11; x++ {
				if !isFortressArcCell(x, y) {
					continue
				}
				addMirrored(x, y, "fortress_wall")
			}
		}
	}
	addFortress(16, 63)
	clearBridgeApproaches()
	// Frame every bridge with the same small bank landmark. The cover stays
	// outside the bridge corridor, so the crossing remains the obvious route
	// while each approach has a readable tactical pocket instead of empty lawn.
	addBridgeBank := func(cx, cy int) {
		for _, offset := range [][2]int{{5, -5}, {6, -5}, {5, -4}, {6, -4}, {7, -5}} {
			addMirrored(cx+offset[0], cy+offset[1], "bush")
		}
		for _, offset := range [][2]int{{7, -7}, {8, -6}} {
			addMirrored(cx+offset[0], cy+offset[1], "tree")
		}
		for _, offset := range [][2]int{{8, -4}, {9, -4}, {9, -3}} {
			addMirrored(cx+offset[0], cy+offset[1], "ruin_wall")
		}
	}
	for _, center := range bridgeCenters {
		addBridgeBank(center[0], center[1])
	}
	// Clearing the shoreline can replace an old water tile with fortress stone;
	// collapse those authored cells before the river pass so no cell publishes
	// two conflicting collision types.
	filterOccupied := func(collisions []*geometry.WallTile) []*geometry.WallTile {
		byCell := make(map[[2]int]*geometry.WallTile)
		for _, wall := range collisions {
			cell := [2]int{int(wall.MinX / tile), int(wall.MinY / tile)}
			if occupied[cell] {
				byCell[cell] = wall
			}
		}
		filtered := make([]*geometry.WallTile, 0, len(byCell))
		for y := 0; y < size; y++ {
			for x := 0; x < size; x++ {
				if wall := byCell[[2]int{x, y}]; wall != nil {
					filtered = append(filtered, wall)
				}
			}
		}
		return filtered
	}
	gm.Collisions = filterOccupied(gm.Collisions)

	isRiverCell := func(x, y int) bool {
		alongRiver := (float64(x) + .5 + float64(y) + .5) * .5
		return alongRiver >= teamBattleRiverStart && alongRiver <= teamBattleRiverMouth &&
			math.Abs((float64(x)+.5)-(float64(y)+.5)-teamBattleRiverCenter) <= teamBattleRiverHalfWidth &&
			math.Hypot(float64(x)+.5-islandCenter, float64(y)+.5-islandCenter) <= islandRadius
	}
	riverProps := make(map[[2]int]string)
	for _, wall := range gm.Collisions {
		cell := [2]int{int(wall.MinX / tile), int(wall.MinY / tile)}
		if isRiverCell(cell[0], cell[1]) && wall.Type != "water" {
			riverProps[cell] = wall.Type
		}
	}
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			if isRiverCell(x, y) && x >= 1 && y >= 1 && x < size-1 && y < size-1 {
				clear(x, y)
			}
		}
	}
	filteredRiver := gm.Collisions[:0]
	for _, wall := range gm.Collisions {
		cell := [2]int{int(wall.MinX / tile), int(wall.MinY / tile)}
		if occupied[cell] {
			filteredRiver = append(filteredRiver, wall)
		}
	}
	gm.Collisions = filteredRiver
	movedRiverProps := make(map[[2]int]bool)
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			cell := [2]int{x, y}
			if movedRiverProps[cell] || !isRiverCell(x, y) {
				continue
			}
			kind, exists := riverProps[cell]
			if !exists {
				continue
			}
			mirrorCell := [2]int{y, x}
			mirrorKind, mirrorExists := riverProps[mirrorCell]
			if x == y || !mirrorExists {
				movedRiverProps[cell] = true
				continue
			}
			sideX, sideY := 1, -1
			if x < y {
				sideX, sideY = -1, 1
			}
			for distance := 3; distance <= 10; distance++ {
				targetX, targetY := x+sideX*distance, y+sideY*distance
				mirrorTargetX, mirrorTargetY := targetY, targetX
				if targetX < 1 || targetY < 1 || mirrorTargetX >= size-1 || mirrorTargetY >= size-1 || isRiverCell(targetX, targetY) || isRiverCell(mirrorTargetX, mirrorTargetY) || occupied[[2]int{targetX, targetY}] || occupied[[2]int{mirrorTargetX, mirrorTargetY}] {
					continue
				}
				add(targetX, targetY, kind)
				add(mirrorTargetX, mirrorTargetY, mirrorKind)
				break
			}
			movedRiverProps[cell] = true
			movedRiverProps[mirrorCell] = true
		}
	}
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			if isRiverCell(x, y) && x >= 1 && y >= 1 && x < size-1 && y < size-1 {
				add(x, y, "river")
			}
		}
	}
	// Keep the river as a complete blocking surface and publish the bridge deck
	// as a separate, explicitly passable collision layer. The deck follows the
	// bridge's diagonal instead of clearing a square around its center; this
	// prevents players from walking along the river beside the bridge.
	for _, center := range bridgeCenters {
		for y := center[1] - 6; y <= center[1]+6; y++ {
			for x := center[0] - 6; x <= center[0]+6; x++ {
				cell := [2]int{x, y}
				if !bridgeCorridorCell(center, cell) {
					continue
				}
				if !isRiverCell(x, y) {
					add(x, y, "river_bridge")
					continue
				}
				for _, wall := range gm.Collisions {
					if int(wall.MinX/tile) == x && int(wall.MinY/tile) == y {
						wall.Type = "river_bridge"
						break
					}
				}
			}
		}
	}

	// Neutral resources are authored in four positions and mirrored through the
	// map center. The order is intentional: each first-half
	// entry has its exact counterpart at index+4, which makes balance checks and
	// future map edits straightforward.
	addMonster := func(tileX, tileY float64) {
		x, y := tileX*tile, tileY*tile
		gm.MonsterSpawns = append(gm.MonsterSpawns, MapMonsterSpawn{X: x, Y: y})
	}
	monsterPoints := [][2]float64{{18.5, 47.5}, {29.5, 61.5}, {43.5, 70.5}, {22.5, 40.5}}
	for _, point := range monsterPoints {
		addMonster(point[0], point[1])
	}
	for _, point := range monsterPoints {
		addMonster(point[1], point[0])
	}
	addPickup := func(tileX, tileY float64) {
		x, y := tileX*tile, tileY*tile
		gm.PickupSpawns = append(gm.PickupSpawns, MapPickupSpawn{X: x, Y: y, Radius: 12, Type: "potion-red"})
	}
	// Keep only two authored pickup pairs. The general match health crates still
	// provide occasional sustain, while these fixed points mark the two most
	// important rotations instead of covering every route with healing.
	pickupPoints := [][2]float64{{31.5, 42.5}, {40.5, 34.5}}
	for _, point := range pickupPoints {
		addPickup(point[0], point[1])
	}
	for _, point := range pickupPoints {
		addPickup(80-point[0], 80-point[1])
	}

	addSpawnPair := func(team string, x, y int) {
		spawner := &geometry.RectangleBody{X: float64(x) * tile, Y: float64(y) * tile, Width: tile, Height: tile}
		gm.Spawners = append(gm.Spawners, spawner)
		gm.TeamSpawners[team] = append(gm.TeamSpawners[team], spawner)
	}
	// Keep the three team pockets close to the hall, but outside its physical
	// footprint plus the largest hero radius. The old offsets were inside the
	// hall collider and made heroes appear to spawn from the building.
	for _, offset := range [][2]int{{-3, 0}, {-3, -2}, {0, 3}} {
		x, y := 16+offset[0], 63+offset[1]
		addSpawnPair("Blue", x, y)
		mx, my := mirror(x, y)
		addSpawnPair("Red", mx, my)
	}

	filtered := gm.Collisions[:0]
	for _, wall := range gm.Collisions {
		cell := [2]int{int(wall.MinX / tile), int(wall.MinY / tile)}
		if occupied[cell] {
			filtered = append(filtered, wall)
		}
	}
	gm.Collisions = filtered

	gm.Objectives = []MapObjective{
		{ID: "blue-town-hall", Type: "town_hall", Team: "Blue", X: 16.5 * tile, Y: 63.5 * tile, Radius: 96},
		{ID: "red-town-hall", Type: "town_hall", Team: "Red", X: 63.5 * tile, Y: 16.5 * tile, Radius: 96},
		{ID: "blue-tower-west", Type: "tower", Team: "Blue", X: 19.5 * tile, Y: 60.5 * tile, Radius: 52},
		{ID: "blue-tower-east", Type: "tower", Team: "Blue", X: 15.5 * tile, Y: 58.5 * tile, Radius: 52},
		{ID: "red-tower-west", Type: "tower", Team: "Red", X: 60.5 * tile, Y: 19.5 * tile, Radius: 52},
		{ID: "red-tower-east", Type: "tower", Team: "Red", X: 58.5 * tile, Y: 15.5 * tile, Radius: 52},
	}
	for _, objective := range gm.Objectives {
		collisionRadius := teamBattleObjectiveCollisionRadius(objective)
		gm.Collisions = append(gm.Collisions, &geometry.WallTile{
			MinX: objective.X - collisionRadius,
			MinY: objective.Y - collisionRadius,
			MaxX: objective.X + collisionRadius,
			MaxY: objective.Y + collisionRadius,
			Type: "objective",
		})
	}
	_ = seed
	return gm
}

func teamBattleObjectiveCollisionRadius(objective MapObjective) float64 {
	if objective.Type == "town_hall" {
		return teamBattleTownHallCollisionRadius
	}
	return teamBattleTowerCollisionRadius
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
