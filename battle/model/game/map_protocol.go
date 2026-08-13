package game

import (
	"battle/model/gamemap"
	"battle/service/geometry"
)

// NewMapJSON is the single serializer used by both the preview endpoint and
// live battle snapshots. Compact snapshots retain identity and revision while
// omitting the unchanged wall list.
func NewMapJSON(name string, source *gamemap.GameMap, revision int, includeWalls bool) MapJSON {
	id := name
	seed := int64(0)
	if name == "battle-royale" {
		id = gamemap.CanonicalBattleRoyaleID
		seed = gamemap.CanonicalBattleRoyaleSeed
	}
	result := MapJSON{ID: id, Name: name, Seed: seed, Revision: revision}
	if source == nil {
		return result
	}
	result.Width = source.WidthInPixels
	result.Height = source.HeightInPixels
	result.TileSize = TileSize
	if !includeWalls {
		return result
	}
	result.Walls = make([]WallJSON, 0, len(source.Collisions))
	for _, wall := range source.Collisions {
		result.Walls = append(result.Walls, WallJSON{
			MinX: wall.MinX, MinY: wall.MinY, MaxX: wall.MaxX, MaxY: wall.MaxY,
			Type: wall.Type, Blocking: geometry.IsBlockingWall(wall.Type), BushGroup: wall.BushGroup,
			ColliderInsetX: wall.ColliderInsetX, ColliderInsetY: wall.ColliderInsetY,
		})
	}
	return result
}
