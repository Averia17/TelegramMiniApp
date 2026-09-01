package gamemap

import (
	"fmt"
	"math"

	"battle/service/geometry"
)

const CanonicalTeamBattleSeed int64 = 20260816

const (
	CanonicalTeamBattleClassicID          = "team-battle@20260816"
	CanonicalTeamBattleNorthernID         = "team-battle-northern@20260827"
	CanonicalTeamBattleNorthernSeed int64 = 20260827
)

const (
	teamBattleDesignGridSize = 80
	teamBattleCompactSize    = 70
	teamBattleCropTiles      = 5
)

const (
	teamBattleRiverCenter    = 0.0
	teamBattleRiverHalfWidth = 2.2
	// Objective visuals are smaller than their gameplay target radius. Keep a
	// compact physical footprint so heroes can stand close enough to attack
	// without being stopped by a tile-sized square around the building.
	teamBattleTownHallCollisionRadius = 56.0
	teamBattleTowerCollisionRadius    = 34.0
	// The river spans the whole playable island. The outer water ring owns the
	// cells beyond these banks, so the river meets the ocean without drawing a
	// second river strip through open water.
	teamBattleRiverStart = 10.0
	teamBattleRiverMouth = 70.0
)

// The authored grid is cropped by five design cells before publication. Keep
// the shoreline centred on the compact cell grid so the stepped water ring is
// symmetric on all four sides of the 70x70 map.
const (
	teamBattleIslandCenter = float64(teamBattleCropTiles) + float64(teamBattleCompactSize)/2
	teamBattleIslandRadius = 35.5
)

const teamBattleCityObjectCollisionType = "city_object"

// teamBattleCityColliderSpec is expressed in the local tile-space of a city
// feature. Keeping the source dimensions beside the feature composition makes
// it hard to accidentally grow a prop's collision into an invisible building
// sized blocker.
type teamBattleCityColliderSpec struct {
	X, Y          float64
	Width, Height float64
	Radius        float64
}

func teamBattleCityObjectCollider(featureID string, cx, cy, rotation, scale float64, spec teamBattleCityColliderSpec) *geometry.WallTile {
	const tile = 40.0
	cos, sin := math.Cos(rotation), math.Sin(rotation)
	centerX, centerY := cx*tile, cy*tile
	if spec.Radius > 0 {
		centerLocalX, centerLocalY := spec.X*scale*tile, spec.Y*scale*tile
		worldX := centerX + centerLocalX*cos - centerLocalY*sin
		worldY := centerY + centerLocalX*sin + centerLocalY*cos
		radius := spec.Radius * scale * tile
		return &geometry.WallTile{
			MinX: worldX - radius, MinY: worldY - radius,
			MaxX: worldX + radius, MaxY: worldY + radius,
			Type: teamBattleCityObjectCollisionType, LinkedFeatureID: featureID, ColliderRadius: radius,
		}
	}

	minX, minY := math.MaxFloat64, math.MaxFloat64
	maxX, maxY := -math.MaxFloat64, -math.MaxFloat64
	for _, corner := range [][2]float64{
		{spec.X - spec.Width/2, spec.Y - spec.Height/2},
		{spec.X + spec.Width/2, spec.Y - spec.Height/2},
		{spec.X - spec.Width/2, spec.Y + spec.Height/2},
		{spec.X + spec.Width/2, spec.Y + spec.Height/2},
	} {
		localX, localY := corner[0]*scale*tile, corner[1]*scale*tile
		worldX := centerX + localX*cos - localY*sin
		worldY := centerY + localX*sin + localY*cos
		minX, minY = math.Min(minX, worldX), math.Min(minY, worldY)
		maxX, maxY = math.Max(maxX, worldX), math.Max(maxY, worldY)
	}
	return &geometry.WallTile{MinX: minX, MinY: minY, MaxX: maxX, MaxY: maxY, Type: teamBattleCityObjectCollisionType, LinkedFeatureID: featureID}
}

func teamBattleCityColliderSpecs(archetype string, includeStructuralBodies bool) []teamBattleCityColliderSpec {
	// Elevated balconies, open gate spans, and small visual eaves intentionally
	// do not appear here. Opaque roof footprints do: otherwise a hero can walk
	// under an apparently solid roof and disappear into its texture. Roof
	// colliders are inset slightly so the eave remains a visual overhang rather
	// than an invisible extra wall.
	switch archetype {
	case "depot":
		return []teamBattleCityColliderSpec{
			{X: -1.35, Y: -.2, Radius: .32}, // left barrel
			{X: -.82, Y: -.2, Radius: .22},  // loose sack
			// The right barrel and wheel form one small ground cluster.
			{X: 1.55, Y: -.2, Width: .82, Height: .82},
			{X: -.78, Y: .95, Width: .7, Height: .34}, // opaque rear roof
		}
	case "market":
		return []teamBattleCityColliderSpec{
			{X: -1.35, Y: -.45, Width: 1.58, Height: .74},
			{X: 1.7, Y: -.35, Width: 1.58, Height: .74},
			{X: .8, Y: 1.6, Width: 1.58, Height: .74},
			// Offset from the court centre so the landmark does not occupy the
			// principal entry cell while remaining a readable market anchor.
			{X: 1.4, Y: .42, Radius: .72},
		}
	case "apartments":
		return []teamBattleCityColliderSpec{
			{X: -1.22, Y: .05, Width: .2, Height: 1.36}, // side wall
			{X: 1.35, Y: .75, Width: .9, Height: 1.2},   // annex body
			{X: 1.72, Y: .48, Width: .16, Height: .16},  // ladder feet
			{X: -.86, Y: .9, Width: .86, Height: .64},   // main opaque roof
			{X: 1.0, Y: .52, Width: .58, Height: .52},   // annex roof
		}
	case "north_gate":
		return []teamBattleCityColliderSpec{
			{X: -1.35, Y: 0, Width: .95, Height: 1.12},
			{X: 1.35, Y: 0, Width: .95, Height: 1.12},
		}
	case "south_ward":
		return []teamBattleCityColliderSpec{
			{X: -.48, Y: .52, Width: 1.55, Height: .2},  // forge wall
			{X: -.62, Y: -.58, Width: .46, Height: .46}, // hearth
			{X: .15, Y: -.72, Width: .52, Height: .28},  // anvil base
			// Moved to the right side of the yard in the visual composition;
			// this keeps the forge's central fighting cell open.
			{X: 1.65, Y: .72, Width: .9, Height: .34},
			{X: -.62, Y: .52, Width: .82, Height: .58}, // house roof
			{X: 1.0, Y: -.35, Width: 1.2, Height: .96}, // opaque forge canopy
		}
	case "inn":
		specs := []teamBattleCityColliderSpec{
			{X: -.54, Y: .66, Width: 1.08, Height: .76}, // left gable roof
			{X: .54, Y: .66, Width: 1.08, Height: .76},  // right gable roof
			{X: -.86, Y: .76, Width: .32, Height: .32},  // chimney base
			{X: -1.45, Y: -.78, Radius: .3},             // left barrel
			{X: 1.42, Y: -.72, Radius: .3},              // right barrel
		}
		if includeStructuralBodies {
			// The inn's rear wall is wider than one safe collider. Three
			// contacts preserve the complete silhouette without making a giant
			// square blocker in front of the veranda.
			specs = append([]teamBattleCityColliderSpec{
				{X: -.73, Y: .62, Width: .82, Height: .24},
				{X: 0, Y: .62, Width: .82, Height: .24},
				{X: .73, Y: .62, Width: .82, Height: .24},
			}, specs...)
		}
		return specs
	case "harbour_row":
		// The harbour row is three connected timber fronts with a covered
		// loading edge. Keep each ground contact narrow so the south bridge
		// approach remains a real lane instead of one invisible rectangle.
		return []teamBattleCityColliderSpec{
			{X: -1.55, Y: .42, Width: 1.22, Height: 1.12},
			{X: 0, Y: .42, Width: 1.22, Height: 1.12},
			{X: 1.55, Y: .42, Width: 1.22, Height: 1.12},
			{X: -1.55, Y: -.72, Width: 1.16, Height: .42},
			{X: 1.55, Y: -.72, Width: 1.16, Height: .42},
			{X: 2.38, Y: .05, Radius: .24},              // mooring post / physical dressing
			{X: 1.12, Y: -.52, Width: .72, Height: .46}, // loading crate
			{X: -1.12, Y: -.52, Radius: .2},             // tied sack
		}
	case "dock_warehouse":
		// Three connected warehouse bays form one solid frontage. The loading
		// edge stays narrow, while the hoist, crate and sack remain physical.
		return []teamBattleCityColliderSpec{
			{X: -1.45, Y: .36, Width: 1.18, Height: 1.08},
			{X: 0, Y: .36, Width: 1.18, Height: 1.08},
			{X: 1.45, Y: .36, Width: 1.18, Height: 1.08},
			{X: -1.45, Y: -.76, Width: .9, Height: .32},
			{X: 1.45, Y: -.76, Width: .9, Height: .32},
			{X: 2.2, Y: -.54, Radius: .2}, // hoist post
			{X: .82, Y: -.82, Width: .72, Height: .42},
			{X: -.82, Y: -.82, Radius: .2},
		}
	case "guildhall":
		// The guildhall is a connected three-bay civic facade. Each bay gets its
		// own body contact, while the front steps and notice board remain small
		// physical anchors so the plaza approach stays open.
		return []teamBattleCityColliderSpec{
			{X: -1.55, Y: .38, Width: 1.18, Height: 1.08},
			{X: 0, Y: .38, Width: 1.18, Height: 1.08},
			{X: 1.55, Y: .38, Width: 1.18, Height: 1.08},
			{X: -1.55, Y: -.76, Width: .92, Height: .32},
			{X: 1.55, Y: -.76, Width: .92, Height: .32},
			{X: 0, Y: -1.02, Width: .5, Height: .24}, // civic steps
			{X: 2.28, Y: -.65, Radius: .16},          // notice post
		}
	case "north_townhouses":
		// Three narrow homes share one frontage, but their contacts stay split so
		// the north-gate street can run past the row instead of becoming one
		// invisible rectangle. The rear band closes the visible shells; the two
		// steps and lantern remain small physical details at the street edge.
		return []teamBattleCityColliderSpec{
			{X: -1.9, Y: .28, Width: 1.38, Height: 1.08},
			{X: 0, Y: .28, Width: 1.38, Height: 1.08},
			{X: 1.9, Y: .28, Width: 1.38, Height: 1.08},
			{X: -1.7, Y: .94, Width: 1.18, Height: .34},
			{X: 0, Y: .94, Width: 1.18, Height: .34},
			{X: 1.7, Y: .94, Width: 1.18, Height: .34},
			{X: -1.85, Y: -.74, Width: .68, Height: .24},
			{X: 1.85, Y: -.74, Width: .68, Height: .24},
			{X: 0, Y: -.9, Radius: .16},
			{X: 2.48, Y: -.52, Radius: .2},
		}
	case "castle_keep":
		// The keep is assembled from several tight footprints rather than one
		// giant invisible rectangle. The courtyard and gate remain walkable.
		specs := []teamBattleCityColliderSpec{
			{X: 0, Y: -1.9, Width: 1.42, Height: .78},
			{X: -1.62, Y: -1.72, Radius: .42},
			{X: 1.62, Y: -1.72, Radius: .42},
			{X: 0, Y: -.62, Width: .72, Height: .34},
		}
		if includeStructuralBodies {
			// Close the visible keep body in three columns and two depth bands.
			// The short bands stay under the collider-size budget even after the
			// keep rotation is converted to an axis-aligned world rectangle.
			body := make([]teamBattleCityColliderSpec, 0, 6)
			for bandIndex, y := range []float64{-1.65, -.65} {
				for _, x := range []float64{-1.0, 0, 1.0} {
					// The courtyard-facing band keeps a central gate notch. The
					// rear band is fully closed, so entering the doorway does not
					// turn into walking through the keep.
					if bandIndex == 1 && x == 0 {
						continue
					}
					body = append(body, teamBattleCityColliderSpec{X: x, Y: y, Width: 1.05, Height: 1.0})
				}
			}
			specs = append(body, specs...)
		}
		return specs
	case "castle_house":
		// Compact ward houses have a doorway notch on the lane-facing edge,
		// with the body and rear wall covered by small overlapping contacts.
		// This keeps the alley readable without letting a hero cross the house
		// diagonally as if the whole model were ground.
		specs := []teamBattleCityColliderSpec{}
		if includeStructuralBodies {
			specs = append(specs,
				teamBattleCityColliderSpec{X: -.82, Y: -.22, Width: 1.0, Height: 1.0},
				teamBattleCityColliderSpec{X: .82, Y: -.22, Width: 1.0, Height: 1.0},
				teamBattleCityColliderSpec{X: -.72, Y: .65, Width: 1.1, Height: .65},
				teamBattleCityColliderSpec{X: 0, Y: .65, Width: .35, Height: .65},
				teamBattleCityColliderSpec{X: .72, Y: .65, Width: 1.1, Height: .65},
			)
		}
		// The classic map keeps its original prop-only contacts; Northern Ash
		// opts into the complete house shell above.
		return specs
	default:
		return nil
	}
}

func teamBattleBaseColliderSpecs(archetype string) []teamBattleCityColliderSpec {
	if archetype == "base_compound" {
		// The base is published as one authored settlement, but its three visible
		// structures remain separate contacts so the courtyard and approach stay
		// playable instead of becoming one invisible square.
		return []teamBattleCityColliderSpec{
			// Keep these contacts compact because the authored compound is rotated
			// 45 degrees toward the river; an axis-aligned wall box otherwise grows
			// into the open lanes when its corners are projected.
			{X: -4.8, Y: 2.1, Width: 1.2, Height: 1.2}, // workshop wing
			{X: -3.55, Y: 2.1, Width: 1.2, Height: 1.2},
			{X: 3.55, Y: 2.1, Width: 1.2, Height: 1.2}, // storehouse wing
			{X: 4.8, Y: 2.1, Width: 1.2, Height: 1.2},
			{X: -1.2, Y: 5.2, Width: 1.2, Height: 1.2}, // rear chapel hall
			{X: 0, Y: 5.2, Width: 1.2, Height: 1.2},
			{X: 1.2, Y: 5.2, Width: 1.2, Height: 1.2},
			{X: -4.2, Y: -4.5, Width: .75, Height: 1.1}, // gate towers
			{X: 4.2, Y: -4.5, Width: .75, Height: 1.1},
		}
	}
	// Base dressing is physical too, but each footprint is deliberately kept
	// to the visible ground contact of the authored model. Roof eaves, banners,
	// wagon poles, and open stable fronts stay outside the collider.
	switch archetype {
	case "base_well":
		return []teamBattleCityColliderSpec{{X: 0, Y: 0, Radius: .48}}
	case "base_workshop":
		return []teamBattleCityColliderSpec{{X: 0, Y: 0, Width: 1.28, Height: .82}}
	case "base_wagon":
		return []teamBattleCityColliderSpec{{X: 0, Y: 0, Width: 1.2, Height: .76}}
	case "base_barracks":
		// The barracks model has a broad roof overhang. Keep the body contact
		// narrower so the adjacent tower lane remains a real hero-width route.
		return []teamBattleCityColliderSpec{{X: 0, Y: .02, Width: 1.22, Height: 1.08}}
	case "base_storehouse":
		return []teamBattleCityColliderSpec{{X: 0, Y: .02, Width: 1.5, Height: .92}}
	case "base_stable":
		return []teamBattleCityColliderSpec{{X: 0, Y: .03, Width: 1.56, Height: 1.02}}
	case "base_chapel":
		return []teamBattleCityColliderSpec{{X: 0, Y: .04, Width: 1.38, Height: .98}}
	case "base_courtyard":
		return nil
	default:
		return nil
	}
}

func teamBattleFeatureColliderSpecs(archetype, _ string) []teamBattleCityColliderSpec {
	switch archetype {
	case "city_plaza":
		// The square itself is passable. These contacts cover only its physical
		// anchors: the well, two market tables, bench, notice board, basket,
		// lantern and cart wheel. Paving, weeds and torch poles remain passable.
		return []teamBattleCityColliderSpec{
			{X: 0, Y: 0, Radius: .88},
			{X: -2.15, Y: 1.65, Width: 1.45, Height: .45},
			{X: 2.05, Y: -1.58, Width: 1.45, Height: .45},
			{X: 2.15, Y: 1.5, Width: 1.65, Height: .32},
			{X: -2.78, Y: -2.7, Width: 1.05, Height: .35},
			{X: 1.62, Y: -2.72, Radius: .31},
			{X: -1.78, Y: 2.52, Radius: .65},
			{X: 2.86, Y: 2.54, Radius: .16},
		}
	case "city_street":
		// Street paving is open ground, but its cart, barrels, crate and lamp
		// are solid authored dressing and therefore get explicit contacts.
		return []teamBattleCityColliderSpec{
			{X: 1.35, Y: -.48, Width: 1.35, Height: .68},
			{X: 1.69, Y: -.6, Width: .48, Height: .46},
			{X: -1.8, Y: .62, Radius: .24},
			{X: -1.28, Y: .65, Radius: .24},
			{X: -2.55, Y: .43, Radius: .12},
		}
	case "city_lane":
		// The lane surface is passable. Only its paired lamps, drain cover and
		// parked handcart occupy ground, each as a small authored contact.
		return []teamBattleCityColliderSpec{
			{X: -2.35, Y: .72, Radius: .14},
			{X: 2.35, Y: .72, Radius: .14},
			{X: 0, Y: -.72, Radius: .2},
			{X: 1.25, Y: -.78, Width: .62, Height: .36},
		}
	case "city_avenue":
		// The avenue is a long passable route. Only its four lamps, harbour
		// drain, loading crate and handcart occupy ground along the ribbon.
		return []teamBattleCityColliderSpec{
			{X: -3.5, Y: .92, Radius: .16},
			{X: -1.15, Y: .92, Radius: .16},
			{X: 1.15, Y: .92, Radius: .16},
			{X: 3.5, Y: .92, Radius: .16},
			{X: 0, Y: -1.12, Radius: .2},
			{X: 2.55, Y: -.82, Width: .72, Height: .42},
			{X: 3.65, Y: -.82, Width: 1.08, Height: .48},
		}
	case "city_dockyard":
		// The loading court itself is open ground. Its only blockers are the
		// large dock props visible on the perimeter and loading edge.
		return []teamBattleCityColliderSpec{
			{X: 2.2, Y: .9, Width: 1.0, Height: .5}, // handcart
			{X: .95, Y: .86, Width: .8, Height: .5}, // crate stack
			{X: -1.8, Y: .88, Radius: .28},
			{X: -2.3, Y: .9, Radius: .28},
			{X: 2.72, Y: .9, Radius: .2}, // mooring post
		}
	case "castle_courtyard":
		// The court paving stays open. These contacts match the visible well,
		// paired benches, braziers and four loose stones without turning the
		// inner ward into a square invisible blocker.
		return []teamBattleCityColliderSpec{
			{X: 0, Y: .1, Radius: .8},
			{X: -1.8, Y: 1.03, Width: .92, Height: .42},
			{X: 1.8, Y: 1.03, Width: .92, Height: .42},
			{X: -1.82, Y: -.95, Radius: .22},
			{X: 1.82, Y: -.95, Radius: .22},
			{X: -2.1, Y: 1.25, Radius: .18},
			{X: 2.15, Y: 1.2, Radius: .18},
			{X: -2.25, Y: -.95, Radius: .18},
			{X: 2.2, Y: -.98, Radius: .18},
		}
	case "castle_gate":
		// The gate opening stays clear, while both visible gate towers remain
		// solid at their ground contact. Inset the contacts slightly from the
		// visual shell so the side passage beside the gate remains usable.
		return []teamBattleCityColliderSpec{
			{X: -1.55, Y: 0, Width: .82, Height: 1.08},
			{X: 1.55, Y: 0, Width: .82, Height: 1.08},
		}
	case "city_tower":
		// The tower body is round and larger than a single decorative tile, but
		// stay within the collider budget so the surrounding lane remains usable.
		return []teamBattleCityColliderSpec{{X: 0, Y: 0, Radius: .86}}
	default:
		return nil
	}
}

// GenerateTeamBattle builds the current northern variant of the authored 3v3
// arena. The two bases sit on opposite sides of the main diagonal, and every
// authored cell is reflected across that diagonal so both teams get the same
// readable combat language.
func GenerateTeamBattle(seed int64) *GameMap {
	gm := generateTeamBattle(seed, true)
	applyEditedTeamBattleNorthernMap(gm)
	return gm
}

// GenerateTeamBattleClassic is the stable map snapshot from the previous
// revision. Keep this branch deliberately free of the northern additions so
// selecting the classic map really returns the old map, not a darkened subset
// of the current one.
func GenerateTeamBattleClassic(seed int64) *GameMap {
	gm := generateTeamBattle(seed, false)
	applyEditedTeamBattleClassicMap(gm)
	return gm
}

func generateTeamBattle(seed int64, northernVariant bool) *GameMap {
	const tile = 40.0
	const size = teamBattleDesignGridSize
	gm := &GameMap{
		WidthInPixels: teamBattleCompactSize * tile, HeightInPixels: teamBattleCompactSize * tile,
		Tileset: make(map[int]TilesetEntry), TeamSpawners: map[string][]*geometry.RectangleBody{},
	}

	occupied := make(map[[2]int]bool)
	liquidCells := make(map[[2]int]bool)
	add := func(x, y int, kind string) {
		if x < 0 || y < 0 || x >= size || y >= size {
			return
		}
		if kind != "water" && (x < 1 || y < 1 || x >= size-1 || y >= size-1) {
			return
		}
		cell := [2]int{x, y}
		if liquidCells[cell] && kind != "water" && kind != "pond" && kind != "river" && kind != "river_bridge" {
			return
		}
		if occupied[cell] {
			return
		}
		occupied[cell] = true
		if kind == "water" || kind == "pond" || kind == "river" {
			liquidCells[cell] = true
		}
		gm.Collisions = append(gm.Collisions, &geometry.WallTile{
			MinX: float64(x) * tile, MinY: float64(y) * tile,
			MaxX: float64(x+1) * tile, MaxY: float64(y+1) * tile, Type: kind,
		})
	}
	// The arena is an island, not a rectangular lawn. Water is authored first
	// so every later prop is automatically trimmed to the circular shoreline.
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			distance := math.Hypot(float64(x)+.5-teamBattleIslandCenter, float64(y)+.5-teamBattleIslandCenter)
			if distance > teamBattleIslandRadius {
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
	addLinkedMirrored := func(x, y int, kind, featureID string) {
		before := len(gm.Collisions)
		add(x, y, kind)
		for _, wall := range gm.Collisions[before:] {
			wall.LinkedFeatureID = featureID
		}
		mx, my := mirror(x, y)
		before = len(gm.Collisions)
		add(mx, my, kind)
		for _, wall := range gm.Collisions[before:] {
			wall.LinkedFeatureID = featureID + "-mirror"
		}
	}
	addMirroredRect := func(minX, minY, maxX, maxY int, kind string) {
		for y := minY; y <= maxY; y++ {
			for x := minX; x <= maxX; x++ {
				addMirrored(x, y, kind)
			}
		}
	}
	clear := func(x, y int) {
		if liquidCells[[2]int{x, y}] {
			return
		}
		delete(occupied, [2]int{x, y})
	}
	clearLiquid := func(x, y int) { delete(occupied, [2]int{x, y}) }
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
	// Urban pockets own their immediate ground readability, but they must not
	// erase authored fortress/building walls. Remove only soft natural dressing
	// from the existing collision list and leave all structural contacts intact.
	isNaturalUrbanDressing := func(kind string) bool {
		switch kind {
		case "bush", "tree", "dead_tree", "vine", "thorn_vine", "ruin_wall":
			return true
		default:
			return false
		}
	}
	clearNaturalAt := func(x, y int) {
		cell := [2]int{x, y}
		if liquidCells[cell] {
			return
		}
		collisions := gm.Collisions
		kept := make([]*geometry.WallTile, 0, len(collisions))
		occupiedByStructural := false
		for _, wall := range collisions {
			wallCell := [2]int{int(wall.MinX / tile), int(wall.MinY / tile)}
			if wallCell == cell && isNaturalUrbanDressing(wall.Type) {
				continue
			}
			if wallCell == cell {
				occupiedByStructural = true
			}
			kept = append(kept, wall)
		}
		gm.Collisions = kept
		if !occupiedByStructural {
			delete(occupied, cell)
		}
	}
	clearCityCell := func(x, y int) {
		cell := [2]int{x, y}
		if liquidCells[cell] {
			return
		}
		collisions := gm.Collisions
		kept := make([]*geometry.WallTile, 0, len(collisions))
		occupiedByStructural := false
		for _, wall := range collisions {
			wallCell := [2]int{int(wall.MinX / tile), int(wall.MinY / tile)}
			if wallCell != cell {
				kept = append(kept, wall)
				continue
			}
			if isNaturalUrbanDressing(wall.Type) || wall.Type == "building_rubble" || wall.Type == "destructible" || wall.Type == "crates" {
				continue
			}
			occupiedByStructural = true
			kept = append(kept, wall)
		}
		gm.Collisions = kept
		if !occupiedByStructural {
			delete(occupied, cell)
		}
	}
	clearNaturalAreaMirrored := func(cx, cy, radius int) {
		for y := cy - radius; y <= cy+radius; y++ {
			for x := cx - radius; x <= cx+radius; x++ {
				if math.Hypot(float64(x-cx), float64(y-cy)) <= float64(radius)+.35 {
					clearNaturalAt(x, y)
					clearNaturalAt(y, x)
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
	addFeature("team-bridge-north", "river_bridge", 22.5, 22.5, -math.Pi/4, 1)
	addFeature("team-bridge-center", "river_bridge", 39.5, 39.5, -math.Pi/4, 1)
	addFeature("team-bridge-south", "river_bridge", 57.5, 57.5, -math.Pi/4, 1)
	var cityObjectColliders []*geometry.WallTile
	addCityObjectColliders := func(featureID string, cx, cy int, rotation, scale float64, archetype string) {
		for _, spec := range teamBattleCityColliderSpecs(archetype, northernVariant) {
			cityObjectColliders = append(cityObjectColliders,
				teamBattleCityObjectCollider(featureID, float64(cx), float64(cy), rotation, scale, spec))
		}
	}
	addFeatureColliders := func(id, archetype string, x, y, rotation, scale float64) {
		for _, spec := range teamBattleFeatureColliderSpecs(archetype, id) {
			cityObjectColliders = append(cityObjectColliders,
				teamBattleCityObjectCollider(id, x, y, rotation, scale, spec))
		}
	}

	// Cluster primitives keep the arena dressed with connected silhouettes.
	// The mirror wrapper is used at the primitive boundary so a future layout
	// edit cannot accidentally give one team a different obstacle pattern.
	addRuin := func(cx, cy int) {
		addMirroredRect(cx-2, cy-1, cx+2, cy-1, "wall")
		addMirroredRect(cx-2, cy+1, cx-2, cy+2, "destructible")
		addMirroredRect(cx+1, cy+1, cx+2, cy+2, "destructible")
		if !northernVariant {
			addMirrored(cx, cy+2, "crates")
		}
	}
	addGrove := func(cx, cy int) {
		for _, offset := range [][2]int{{-2, -1}, {0, -2}, {2, -1}, {-2, 1}, {2, 1}, {0, 2}} {
			addMirrored(cx+offset[0], cy+offset[1], "tree")
		}
		addMirroredRect(cx-1, cy-1, cx+1, cy+1, "bush")
	}
	addBarricade := func(cx, cy int) {
		addMirroredRect(cx-3, cy, cx+3, cy, "destructible")
		if !northernVariant {
			addMirrored(cx-2, cy-1, "crates")
			addMirrored(cx+2, cy-1, "crates")
		}
		addMirrored(cx, cy+1, "wall")
	}
	addRuinLairVines := func(cx, cy int) {
		// Keep a complete, one-cell-wide soft perimeter around the ruin body.
		// This is passable decoration, so it can outline the landmark without
		// closing the diagonal firing lane or its approach.
		for x := cx - 3; x <= cx+3; x++ {
			addMirrored(x, cy-2, "thorn_vine")
			addMirrored(x, cy+2, "thorn_vine")
		}
		for y := cy - 1; y <= cy+1; y++ {
			addMirrored(cx-3, y, "thorn_vine")
			addMirrored(cx+3, y, "thorn_vine")
		}
	}
	addRuinLair := func(cx, cy int) {
		// Broken three-sided chambers create readable cover while keeping a
		// diagonal firing lane through the middle of every mirrored complex.
		for _, offset := range [][2]int{{-2, -1}, {-1, -1}, {0, -1}, {2, -1}, {-2, 0}, {2, 0}, {-2, 1}, {-1, 1}, {1, 1}, {2, 1}} {
			addMirrored(cx+offset[0], cy+offset[1], "ruin_wall")
		}
		addRuinLairVines(cx, cy)
	}
	addPond := func(cx, cy int) {
		for y := cy - 3; y <= cy+3; y++ {
			for x := cx - 3; x <= cx+3; x++ {
				dx := float64(x-cx) / 4.1
				dy := float64(y-cy) / 2.7
				if dx*dx+dy*dy <= 1 {
					// Ponds own their footprint. Earlier meadow dressing may have
					// occupied one of these cells, but water must win over a bush,
					// ruin, or loose prop instead of leaving it stranded in the pool.
					for _, cell := range [][2]int{{x, y}, {y, x}} {
						clearLiquid(cell[0], cell[1])
						liquidCells[[2]int{cell[0], cell[1]}] = true
					}
					addMirrored(x, y, "pond")
				}
			}
		}
		addFeature(fmt.Sprintf("team-pond-%d-%d", cx, cy), "pond", float64(cx), float64(cy), 0, 1)
		mx, my := mirror(cx, cy)
		addFeature(fmt.Sprintf("team-pond-%d-%d-mirror", cx, cy), "pond", float64(mx), float64(my), 0, 1)
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
	// Keep the base courtyard and the Northern castle ward dry. This pond sits
	// on the lower outer approach, clear of the ward gate's visual footprint.
	addPond(33, 68)
	// Keep the second pond on the open side lane. The former (35,52) anchor
	// sat under the Northern castle ward after the castle was introduced, so
	// its water surface visually cut through the gate houses.
	addPond(38, 16)
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

	// The natural cover is interrupted by compact abandoned-city courtyards.
	// These are not sealed houses: collision walls stay on the edges, while the
	// centre and approach lanes remain usable fighting space. The authored half
	// is mirrored across the main diagonal for team fairness.
	clearCityFootprint := func(cx, cy int) {
		for y := cy - 4; y <= cy+4; y++ {
			for x := cx - 4; x <= cx+4; x++ {
				clearCityCell(x, y)
				clearCityCell(y, x)
			}
		}
	}
	addCityBlock := func(id string, cx, cy int, rotation, scale float64, wallOffsets, rubbleOffsets [][2]int) {
		clearCityFootprint(cx, cy)
		for _, offset := range wallOffsets {
			addLinkedMirrored(cx+offset[0], cy+offset[1], "building_wall", id)
		}
		if !northernVariant {
			for _, offset := range rubbleOffsets {
				addLinkedMirrored(cx+offset[0], cy+offset[1], "building_rubble", id)
			}
		}
		addFeature(id, "city_building", float64(cx), float64(cy), rotation, scale)
		mx, my := mirror(cx, cy)
		addFeature(id+"-mirror", "city_building", float64(mx), float64(my), -rotation, scale)
		archetype := "depot"
		switch id {
		case "city-market":
			archetype = "market"
		case "city-apartments":
			archetype = "apartments"
		case "city-north-gate":
			archetype = "north_gate"
		case "city-south-ward":
			archetype = "south_ward"
		case "city-inn":
			archetype = "inn"
		case "city-harbour-row":
			archetype = "harbour_row"
		case "city-guildhall":
			archetype = "guildhall"
		case "city-dock-warehouse":
			archetype = "dock_warehouse"
		case "city-north-townhouses":
			archetype = "north_townhouses"
		}
		addCityObjectColliders(id, cx, cy, rotation, scale, archetype)
		addCityObjectColliders(id+"-mirror", mx, my, -rotation, scale, archetype)
	}
	// District footprints intentionally differ and leave a broad playable core:
	// the market is almost entirely open, the depot has a loading-yard gap, and
	// the homes form two offset cover wings instead of a closed ring.
	addCityBlock("city-depot", 13, 52, -.08, 1.05,
		[][2]int{{-2, -2}, {-1, -2}, {0, -2}, {1, -2}, {2, -2}, {2, -1}, {2, 0}, {-2, 0}},
		[][2]int{{-3, -2}, {3, 0}, {-2, 1}, {2, 1}})
	if !northernVariant {
		addCityBlock("city-market", 30, 47, .16, .92,
			[][2]int{{-2, -2}, {-1, -2}, {0, -2}, {1, -2}, {2, -2}},
			[][2]int{{-3, -2}, {3, -2}, {-2, -1}, {2, -1}})
	}
	addCityBlock("city-apartments", 44, 60, -.18, 1.12,
		[][2]int{{-2, -2}, {-1, -2}, {0, -2}, {1, -2}, {-2, -1}, {1, -1}, {-2, 0}, {1, 0}},
		[][2]int{{-3, -2}, {2, -2}, {-3, 0}, {2, -1}})
	// The outer bridges are the entry points into the abandoned town. Give
	// both approaches a small gate-side house so the playable lanes read as
	// districts instead of three bridges floating in a meadow.
	addCityBlock("city-north-gate", 16, 31, -.12, .9,
		[][2]int{{-2, -2}, {-2, -1}, {-2, 0}, {2, -3}, {2, -2}, {2, -1}, {2, 0}, {-1, 2}, {0, 2}, {1, 2}},
		[][2]int{{-3, -2}, {3, -2}, {-3, 0}, {3, 0}})
	if northernVariant {
		// A continuous residential frontage turns the north gate into a real
		// neighbourhood edge. Its rear wall faces the outer bank; the street
		// side remains open around the gate approach and the north bridge route.
		addCityBlock("city-north-townhouses", 22, 36, .02, 1.0,
			[][2]int{{-2, 1}, {-1, 1}, {0, 1}, {1, 1}, {2, 1}, {-2, 0}, {2, 0}},
			[][2]int{{-3, 1}, {3, 1}, {-3, 0}, {3, 0}})
	}
	addCityBlock("city-south-ward", 49, 64, .14, .96,
		[][2]int{{-2, -2}, {-1, -2}, {0, -2}, {1, -2}, {2, -2}, {-2, -1}, {2, -1}, {-2, 0}},
		[][2]int{{-3, -2}, {3, -2}, {-3, -1}, {3, -1}})
	if northernVariant {
		// A civic hall frames the western edge of the central square. Its twin
		// on the diagonal makes the plaza read as a connected urban node rather
		// than a lone market prop in a clearing.
		addCityBlock("city-guildhall", 38, 52, -.04, 1.02,
			[][2]int{{-2, -2}, {-1, -2}, {0, -2}, {1, -2}, {2, -2}, {-2, -1}, {2, -1}, {-2, 0}, {2, 0}, {-1, 1}, {0, 1}, {1, 1}},
			[][2]int{{-3, -2}, {3, -2}, {-3, 0}, {3, 0}})
		// The civic lane is a passable cobbled ribbon from the guildhall steps
		// into the central plaza. Its mirrored twin keeps the same approach on
		// the opposite diagonal side of the city.
		addFeature("city-lane-guildhall", "city_lane", 41, 52, 0, 1)
		addFeature("city-lane-guildhall-mirror", "city_lane", 52, 41, math.Pi/2, 1)
		addFeatureColliders("city-lane-guildhall", "city_lane", 41, 52, 0, 1)
		addFeatureColliders("city-lane-guildhall-mirror", "city_lane", 52, 41, math.Pi/2, 1)
		// A continuous warehouse/boathouse row frames the south crossing. The
		// rear wall and two end wings read as one district landmark, while the
		// centre-facing loading edge stays open for combat movement.
		addCityBlock("city-harbour-row", 60, 50, -.08, 1.04,
			[][2]int{{-3, -2}, {-2, -2}, {-1, -2}, {0, -2}, {1, -2}, {2, -2}, {3, -2}, {-3, -1}, {3, -1}},
			[][2]int{{-4, -2}, {4, -2}, {-4, 0}, {4, 0}})
		// Extend the boathouse row with a second large warehouse frontage. Its
		// loading face sits one dry terrace above the river bank avenue.
		addCityBlock("city-dock-warehouse", 65, 54, .04, 1.0,
			[][2]int{{-2, -2}, {-1, -2}, {0, -2}, {1, -2}, {2, -2}, {-2, -1}, {2, -1}, {-2, 0}, {2, 0}},
			[][2]int{{-3, -2}, {3, -2}, {-3, 0}, {3, 0}})
		// One broad dockyard court joins the two large waterfront frontages and
		// keeps the middle of the loading district open for combat movement.
		addFeature("city-dockyard", "city_dockyard", 62.5, 52, 0, 1)
		addFeature("city-dockyard-mirror", "city_dockyard", 52, 62.5, 0, 1)
		addFeatureColliders("city-dockyard", "city_dockyard", 62.5, 52, 0, 1)
		addFeatureColliders("city-dockyard-mirror", "city_dockyard", 52, 62.5, 0, 1)
		// A broad harbour avenue carries the boathouse row along the dry bank
		// terrace. The opposite diagonal receives the same axis as a fair route;
		// the river crossing remains owned by the authored bridge feature.
		addFeature("city-avenue-harbour", "city_avenue", 57, 48.5, 0, 1)
		addFeature("city-avenue-harbour-mirror", "city_avenue", 48.5, 57, 0, 1)
		addFeatureColliders("city-avenue-harbour", "city_avenue", 57, 48.5, 0, 1)
		addFeatureColliders("city-avenue-harbour-mirror", "city_avenue", 48.5, 57, 0, 1)
		// Keep the inn on the ward's east shoulder. At the old centre-adjacent
		// anchor its roof and rear wall occupied the only hero-width approach
		// between the inner and outer gates.
		addCityBlock("city-inn", 22, 55, .1, .92,
			[][2]int{{-2, -2}, {-1, -2}, {0, -2}, {1, -2}, {2, -2}, {-2, -1}, {2, -1}, {-2, 0}, {2, 0}},
			[][2]int{{-3, -2}, {3, -2}, {-3, 0}, {3, 0}})
	}
	// Northern Ash is built around a real destination instead of a loose
	// collection of city props: a broken castle court guards the approach to
	// the centre. Its diagonal twin preserves the team-readable combat lanes.
	addCastleCompound := func(id string, cx, cy int, rotation, scale float64) {
		clearAreaMirrored(cx, cy, 6)
		for x := -5; x <= 5; x++ {
			if x < -1 || x > 1 {
				addMirrored(cx+x, cy+5, "fortress_wall")
			}
			addMirrored(cx+x, cy-5, "fortress_wall")
		}
		for y := -4; y <= 4; y++ {
			addMirrored(cx-5, cy+y, "fortress_wall")
			addMirrored(cx+5, cy+y, "fortress_wall")
		}
		addFeature(id, "castle_keep", float64(cx), float64(cy), rotation, scale)
		addFeature(id+"-mirror", "castle_keep", float64(cy), float64(cx), -rotation, scale)
		mx, my := mirror(cx, cy)
		addCityObjectColliders(id, cx, cy, rotation, scale, "castle_keep")
		addCityObjectColliders(id+"-mirror", mx, my, -rotation, scale, "castle_keep")
	}
	if northernVariant {
		// The keep is the second defensive layer. The outer ward makes the
		// Northern variant read as a compact castle town rather than a lone
		// prop in a clearing; the south/east gate points toward each team's
		// approach and is mirrored for fair access.
		addCastleWard := func(id string, cx, cy int, rotation, scale float64) {
			clearAreaMirrored(cx, cy, 10)
			for x := -10; x <= 10; x++ {
				if x < -2 || x > 2 {
					addMirrored(cx+x, cy+9, "fortress_wall")
				}
				addMirrored(cx+x, cy-9, "fortress_wall")
			}
			for y := -8; y <= 8; y++ {
				addMirrored(cx-10, cy+y, "fortress_wall")
				addMirrored(cx+10, cy+y, "fortress_wall")
			}
			for _, offset := range [][2]int{{-10, -9}, {10, -9}, {-10, 9}, {10, 9}} {
				addMirrored(cx+offset[0], cy+offset[1], "fortress_wall")
			}
			// Lift the gatehouse into the visible opening in the ward's outer wall.
			// The model has a shallow depth, so its centre sits a little inside the
			// wall line rather than on the outer stones themselves.
			gateY := float64(cy) + 5.8
			addFeature(id+"-gate", "castle_gate", float64(cx), gateY, 0, scale*1.08)
			addFeature(id+"-gate-mirror", "castle_gate", gateY, float64(cx), 0, scale*1.08)
			addFeatureColliders(id+"-gate", "castle_gate", float64(cx), gateY, 0, scale*1.08)
			addFeatureColliders(id+"-gate-mirror", "castle_gate", gateY, float64(cx), 0, scale*1.08)
			// The keep-facing court is a broad, readable rest pocket between the
			// inner keep and the outer gate. Its centre stays open around the well
			// and its diagonal twin preserves the same approach for the other team.
			courtyardY := float64(cy) + 3.5
			addFeature(id+"-courtyard", "castle_courtyard", float64(cx), courtyardY, rotation, scale)
			addFeature(id+"-courtyard-mirror", "castle_courtyard", courtyardY, float64(cx), -rotation, scale)
			addFeatureColliders(id+"-courtyard", "castle_courtyard", float64(cx), courtyardY, rotation, scale)
			addFeatureColliders(id+"-courtyard-mirror", "castle_courtyard", courtyardY, float64(cx), -rotation, scale)
			// Four compact ward houses sit against the inner faces of the
			// outer ring. Their mirrored twins complete the same residential
			// rhythm on the opposite castle district without sealing the court.
			for index, house := range [][2]int{{23, 42}, {28, 40}, {33, 40}, {23, 50}} {
				houseID := fmt.Sprintf("%s-house-%d", id, index)
				addFeature(houseID, "castle_house", float64(house[0]), float64(house[1]), 0, .86)
				addFeature(houseID+"-mirror", "castle_house", float64(house[1]), float64(house[0]), 0, .86)
				addCityObjectColliders(houseID, house[0], house[1], 0, .86, "castle_house")
				addCityObjectColliders(houseID+"-mirror", house[1], house[0], 0, .86, "castle_house")
			}
		}
		addCastleWard("castle-ashen-ward", 30, 47, -.12, 1.08)
		addCastleCompound("castle-ashen-keep", 30, 47, -.12, 1.08)
	}
	addCityTower := func(id string, cx, cy int, rotation, scale float64) {
		clearAreaMirrored(cx, cy, 2)
		if !northernVariant {
			for y := cy - 1; y <= cy+1; y++ {
				for x := cx - 1; x <= cx+1; x++ {
					addLinkedMirrored(x, y, "building_wall", id)
				}
			}
		}
		if !northernVariant {
			for _, offset := range [][2]int{{-2, -1}, {2, -1}, {-2, 1}, {2, 1}} {
				addLinkedMirrored(cx+offset[0], cy+offset[1], "building_rubble", id)
			}
		}
		addFeature(id, "city_tower", float64(cx), float64(cy), rotation, scale)
		mx, my := mirror(cx, cy)
		addFeature(id+"-mirror", "city_tower", float64(mx), float64(my), -rotation, scale)
		addFeatureColliders(id, "city_tower", float64(cx), float64(cy), rotation, scale)
		addFeatureColliders(id+"-mirror", "city_tower", float64(mx), float64(my), -rotation, scale)
	}
	// Keep the watchtower as a landmark beside the central crossing, not on its
	// hero route. Its circular footprint otherwise overlaps the bridge landing
	// on both mirrored sides and turns an authored passage into a dead stop.
	addCityTower("city-watchtower", 33, 47, .08, 1)
	if northernVariant {
		// The central city square and diagonal street segments connect the
		// authored districts. Their surfaces remain walkable, while their
		// physical market/transport anchors use the same city_object contract.
		addFeature("city-plaza", "city_plaza", 44, 52, 0, 1.0)
		addFeature("city-plaza-mirror", "city_plaza", 52, 44, 0, 1.0)
		addFeatureColliders("city-plaza", "city_plaza", 44, 52, 0, 1)
		addFeatureColliders("city-plaza-mirror", "city_plaza", 52, 44, 0, 1)
		for index, street := range [][2]int{{22, 30}, {24, 60}, {58, 67}} {
			streetID := fmt.Sprintf("city-street-%d", index)
			addFeature(streetID, "city_street", float64(street[0]), float64(street[1]), -math.Pi/4, 1)
			mx, my := mirror(street[0], street[1])
			addFeature(streetID+"-mirror", "city_street", float64(mx), float64(my), math.Pi/4, 1)
			addFeatureColliders(streetID, "city_street", float64(street[0]), float64(street[1]), -math.Pi/4, 1)
			addFeatureColliders(streetID+"-mirror", "city_street", float64(mx), float64(my), math.Pi/4, 1)
		}
	} else {
		addFeature("city-plaza", "city_plaza", 42, 48, 0, 1.0)
		addFeature("city-plaza-mirror", "city_plaza", 48, 42, 0, 1.0)
		for index, street := range [][2]int{{20, 27}, {22, 45}, {55, 61}} {
			addFeature(fmt.Sprintf("city-street-%d", index), "city_street", float64(street[0]), float64(street[1]), -math.Pi/4, 1)
			mx, my := mirror(street[0], street[1])
			addFeature(fmt.Sprintf("city-street-%d-mirror", index), "city_street", float64(mx), float64(my), math.Pi/4, 1)
		}
	}

	// Open plazas and spawn pockets are cleared symmetrically after dressing so
	// no procedural cluster can seal a base or the central crossing.
	clearAreaMirrored(42, 48, 5)
	if northernVariant {
		// Keep authored urban anchors readable above the surrounding cover field.
		// This pass removes only natural dressing, while the structural grid and
		// city_object contacts remain available for gameplay and readability.
		clearNaturalAreaMirrored(44, 52, 4)
		for _, street := range [][2]int{{22, 30}, {24, 60}, {58, 67}} {
			clearNaturalAreaMirrored(street[0], street[1], 2)
		}
	}
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
	// The compact crop brings the old base courtyard close to the island
	// shoreline. Turn that approach into a dry fortified promontory so the
	// retained well, chapel, and stone arc never stand in the sea.
	for y := 16 - 11; y <= 63+11; y++ {
		for x := 16 - 11; x <= 16+11; x++ {
			if math.Hypot(float64(x-16), float64(y-63)) <= 10.75 {
				delete(liquidCells, [2]int{x, y})
				delete(liquidCells, [2]int{y, x})
				clearLiquid(x, y)
				clearLiquid(y, x)
			}
		}
	}
	addFortress(16, 63)
	// The inner courtyard is intentionally dressed with passable landmarks.
	// They give the base a lived-in medieval identity without stealing cover
	// cells from the three spawn pockets or changing the combat geometry.
	addBaseFeature := func(id, kind string, x, y, rotation, scale float64) {
		addFeature(id, kind, x, y, rotation, scale)
		mx, my := y, x
		addFeature(id+"-mirror", kind, mx, my, -rotation, scale)
		for _, spec := range teamBattleBaseColliderSpecs(kind) {
			mirrorSpec := spec
			mirrorSpec.X, mirrorSpec.Y = spec.Y, spec.X
			mirrorSpec.Width, mirrorSpec.Height = spec.Height, spec.Width
			cityObjectColliders = append(cityObjectColliders,
				teamBattleCityObjectCollider(id, x, y, rotation, scale, spec),
				teamBattleCityObjectCollider(id+"-mirror", mx, my, -rotation, scale, mirrorSpec))
		}
	}
	if northernVariant {
		addBaseFeature("blue-base-compound", "base_compound", 16.5, 63.5, -math.Pi/4, 1)
	} else {
		// Keep the classic map snapshot stable; the cohesive compound is the
		// Northern Ash revision's base language.
		addBaseFeature("blue-base-well", "base_well", 11.5, 66, .08, .95)
		addBaseFeature("blue-base-workshop", "base_workshop", 11.5, 59.5, -.04, .95)
		addBaseFeature("blue-base-wagon", "base_wagon", 20.5, 69, -.16, .95)
		addBaseFeature("blue-base-barracks", "base_barracks", 13, 57.5, .08, 1)
		addBaseFeature("blue-base-storehouse", "base_storehouse", 21, 65, -.12, 1)
		addBaseFeature("blue-base-stable", "base_stable", 23, 63, .14, 1)
		addBaseFeature("blue-base-chapel", "base_chapel", 16, 69, -.08, .96)
		addBaseFeature("blue-base-courtyard", "base_courtyard", 16.5, 63.5, -math.Pi/4, 1)
	}
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
	// City/castle cleanup can remove natural dressing near an authored lair.
	// Re-apply only the passable perimeter after those clears so every ruin
	// keeps its readable vine outline without restoring any blocking prop.
	for _, lair := range [][2]int{{18, 44}, {29, 58}, {43, 67}} {
		addRuinLairVines(lair[0], lair[1])
	}
	if northernVariant {
		// The castle should offer more than one forced entrance. Break the west
		// shoulder of both wall layers in two adjacent cells; clearMirrored keeps
		// the same side passage on the Red side without removing the main gates.
		for _, gap := range [][2]int{{20, 47}, {20, 48}, {25, 47}, {25, 48}, {35, 47}, {35, 48}, {40, 47}, {40, 48}} {
			clearMirrored(gap[0], gap[1])
		}
		// The outer corner of the castle road is a walking lane, not a rubble
		// pocket. Remove the brown rubble cell from both mirrored road corners.
		clearMirrored(36, 52)
		// A few city rubble piles also pin the outer lanes against nearby
		// buildings. Remove only their outside corner cells so each district has
		// a short bypass while its main cover and structural colliders remain.
		for _, gap := range [][2]int{{28, 53}, {46, 63}, {41, 60}, {13, 29}, {10, 50}, {16, 52}, {19, 29}, {46, 58}, {34, 53}, {52, 62}, {9, 60}, {10, 60}, {30, 18}, {31, 19}, {18, 31}, {34, 45}, {36, 43}} {
			clearMirrored(gap[0], gap[1])
		}
		// Removing the northern crate dressing leaves the depot's outer corner
		// disconnected from the remaining structural cover; clear that dangling
		// wall cell along with its mirrored counterpart.
		clearMirrored(11, 52)
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
			math.Hypot(float64(x)+.5-teamBattleIslandCenter, float64(y)+.5-teamBattleIslandCenter) <= teamBattleIslandRadius
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
				clearLiquid(x, y)
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

	// Broad vine clumps are passable soft terrain: they add a readable medieval
	// overgrowth route without turning into another wall. Their cells are
	// mirrored exactly, and the gameplay package applies the movement penalty
	// while a hero's feet are inside one of these cells.
	addVineClump := func(cx, cy int) {
		for _, offset := range [][2]int{
			{-1, -1}, {0, -1}, {1, -1},
			{-1, 0}, {0, 0}, {1, 0},
			{-1, 1}, {0, 1}, {1, 1},
			{-4, 0}, {-3, 0}, {-2, 0}, {2, 0}, {3, 0}, {4, 0},
		} {
			addMirrored(cx+offset[0], cy+offset[1], "vine")
		}
	}
	for _, clump := range [][2]int{{10, 47}, {25, 65}, {36, 52}, {56, 67}} {
		addVineClump(clump[0], clump[1])
	}
	if northernVariant {
		// The river relocation pass can move a natural cell after the first
		// urban cleanup. Reassert the envelope once all water/bridge dressing is
		// final, including the passable vine clumps.
		clearNaturalAreaMirrored(44, 52, 4)
		for _, street := range [][2]int{{22, 30}, {24, 60}, {58, 67}} {
			clearNaturalAreaMirrored(street[0], street[1], 2)
		}
		// Every authored anchor owns a readable ground envelope. This keeps the
		// city from reading as isolated models hidden in a procedural field and
		// removes late-relocated loose cover, while preserving structural walls,
		// water and the tight authored object contacts appended below.
		for _, feature := range gm.Features {
			radius := 0
			switch feature.Type {
			case "city_building":
				radius = 4
			case "castle_house":
				radius = 3
			case "city_plaza":
				radius = 4
			case "city_street":
				radius = 2
			case "city_lane":
				radius = 3
			case "city_avenue":
				// The avenue is a route, not a district-sized clearing. Keep its
				// immediate pavement readable while retaining outer bank cover.
				radius = 2
			case "city_dockyard":
				radius = 4
			case "castle_courtyard":
				radius = 3
			default:
				continue
			}
			cx := int(math.Round(feature.X / tile))
			cy := int(math.Round(feature.Y / tile))
			for y := cy - radius; y <= cy+radius; y++ {
				for x := cx - radius; x <= cx+radius; x++ {
					if math.Hypot(float64(x-cx), float64(y-cy)) <= float64(radius)+.35 {
						clearCityCell(x, y)
					}
				}
			}
		}
	}

	// Neutral resources use three mirrored side-lane pairs plus two camps on the
	// central diagonal. The diagonal camps are deliberately contestable from
	// both bases; the side lanes provide safer rewards and invasion routes. The
	// order keeps the first two mirrored pairs at index+4 for stable map checks.
	addMonster := func(tileX, tileY float64, kind string, territoryRadius float64) {
		x, y := tileX*tile, tileY*tile
		gm.MonsterSpawns = append(gm.MonsterSpawns, MapMonsterSpawn{
			ID: fmt.Sprintf("camp-%02d", len(gm.MonsterSpawns)+1), Kind: kind,
			X: x, Y: y, TerritoryRadius: territoryRadius,
		})
	}
	monsterPoints := [][2]float64{{18.5, 47.5}, {29.5, 61.5}, {43.5, 70.5}, {39.5, 39.5}}
	monsterKinds := []struct {
		kind      string
		territory float64
	}{
		{kind: "bat", territory: 240},
		{kind: "ash_hound", territory: 280},
		{kind: "root_guardian", territory: 300},
		{kind: "bat", territory: 240},
	}
	for index, point := range monsterPoints {
		camp := monsterKinds[index]
		addMonster(point[0], point[1], camp.kind, camp.territory)
	}
	// The centre-line camps are their own mirrors. Add a second diagonal camp so
	// the team map keeps eight authored slots without duplicating one position.
	for index, point := range monsterPoints[:3] {
		camp := monsterKinds[index]
		addMonster(point[1], point[0], camp.kind, camp.territory)
	}
	addMonster(22.5, 22.5, "root_guardian", 300)
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
	// City dressing is authored before the final bridge pass. Reassert the
	// bridge corridor here so a later wall cluster cannot reclaim a walkable
	// landing cell. Explicit bridge cells are retained; only blocking tile
	// props are removed from the corridor.
	bridgeClearanceCell := func(cell [2]int) bool {
		for _, center := range bridgeCenters {
			if bridgeCorridorCell(center, cell) {
				return true
			}
		}
		return false
	}
	filtered := gm.Collisions[:0]
	for _, wall := range gm.Collisions {
		cell := [2]int{int(wall.MinX / tile), int(wall.MinY / tile)}
		if bridgeClearanceCell(cell) && geometry.IsBlockingWall(wall.Type) {
			delete(occupied, cell)
			continue
		}
		if occupied[cell] {
			filtered = append(filtered, wall)
		}
	}
	gm.Collisions = filtered

	gm.Objectives = []MapObjective{
		{ID: "blue-town-hall", Type: "town_hall", Team: "Blue", X: 16.5 * tile, Y: 63.5 * tile, Radius: 96},
		{ID: "red-town-hall", Type: "town_hall", Team: "Red", X: 63.5 * tile, Y: 16.5 * tile, Radius: 96},
		// The two towers flank the town hall on its authored left/right axis.
		// They are equally distant from the hall, while the centered gate stays
		// readable as the single forward entrance of the compound.
		{ID: "blue-tower-west", Type: "tower", Team: "Blue", X: 13.5 * tile, Y: 59.5 * tile, Radius: 52},
		{ID: "blue-tower-east", Type: "tower", Team: "Blue", X: 19.5 * tile, Y: 67.5 * tile, Radius: 52},
		{ID: "red-tower-west", Type: "tower", Team: "Red", X: 59.5 * tile, Y: 13.5 * tile, Radius: 52},
		{ID: "red-tower-east", Type: "tower", Team: "Red", X: 67.5 * tile, Y: 19.5 * tile, Radius: 52},
	}
	// Feature colliders are appended only after the authored cell pass. This is
	// deliberate: their sub-cell footprints must not be rounded up or removed
	// by the tile occupancy filters above.
	gm.Collisions = append(gm.Collisions, cityObjectColliders...)

	for _, objective := range gm.Objectives {
		collisionRadius := teamBattleObjectiveCollisionRadius(objective)
		collider := &geometry.WallTile{
			MinX: objective.X - collisionRadius,
			MinY: objective.Y - collisionRadius,
			MaxX: objective.X + collisionRadius,
			MaxY: objective.Y + collisionRadius,
			Type: "objective",
		}
		if objective.Type == "tower" {
			collider.ColliderRadius = collisionRadius
		}
		gm.Collisions = append(gm.Collisions, collider)
	}
	// The authored layout is kept in its original 80x80 design grid so all
	// props, routes, and mirrored placements remain intact. Publish the compact
	// 70x70 canvas by cropping five empty design tiles from every side. This is
	// a translation, not a scale: houses, cover spacing, and collider sizes keep
	// their gameplay metrics while the unused outer water/field is removed.
	compactOffset := float64(teamBattleCropTiles) * tile
	for _, wall := range gm.Collisions {
		wall.MinX -= compactOffset
		wall.MinY -= compactOffset
		wall.MaxX -= compactOffset
		wall.MaxY -= compactOffset
	}
	clippedCollisions := gm.Collisions[:0]
	for _, wall := range gm.Collisions {
		if wall.MaxX <= 0 || wall.MaxY <= 0 || wall.MinX >= gm.WidthInPixels || wall.MinY >= gm.HeightInPixels {
			continue
		}
		wall.MinX = math.Max(0, wall.MinX)
		wall.MinY = math.Max(0, wall.MinY)
		wall.MaxX = math.Min(gm.WidthInPixels, wall.MaxX)
		wall.MaxY = math.Min(gm.HeightInPixels, wall.MaxY)
		if wall.MinX < wall.MaxX && wall.MinY < wall.MaxY {
			clippedCollisions = append(clippedCollisions, wall)
		}
	}
	gm.Collisions = clippedCollisions
	for index := range gm.Features {
		gm.Features[index].X -= compactOffset
		gm.Features[index].Y -= compactOffset
	}
	for index := range gm.MonsterSpawns {
		gm.MonsterSpawns[index].X -= compactOffset
		gm.MonsterSpawns[index].Y -= compactOffset
	}
	for _, spawn := range gm.Spawners {
		spawn.X -= compactOffset
		spawn.Y -= compactOffset
	}
	for index := range gm.Objectives {
		gm.Objectives[index].X -= compactOffset
		gm.Objectives[index].Y -= compactOffset
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
