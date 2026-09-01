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
	} else if name == "team-battle" {
		id = gamemap.CanonicalTeamBattleClassicID
		seed = gamemap.CanonicalTeamBattleSeed
	} else if name == "team-battle-northern" {
		id = gamemap.CanonicalTeamBattleNorthernID
		seed = gamemap.CanonicalTeamBattleNorthernSeed
	}
	result := MapJSON{ID: id, Name: name, Seed: seed, Revision: revision}
	if source == nil {
		return result
	}
	result.Width = source.WidthInPixels
	result.Height = source.HeightInPixels
	result.TileSize = TileSize
	if len(source.TeamSpawners) > 0 {
		result.TeamSpawns = make(map[string][]SpawnJSON, len(source.TeamSpawners))
		for team, spawners := range source.TeamSpawners {
			for _, spawner := range spawners {
				result.TeamSpawns[team] = append(result.TeamSpawns[team], SpawnJSON{X: spawner.X, Y: spawner.Y, Width: spawner.Width, Height: spawner.Height})
			}
		}
	}
	for _, objective := range source.Objectives {
		result.Objectives = append(result.Objectives, ObjectiveJSON{ID: objective.ID, Type: objective.Type, Team: objective.Team, X: objective.X, Y: objective.Y, Radius: objective.Radius})
	}
	for _, feature := range source.Features {
		result.Features = append(result.Features, FeatureJSON{ID: feature.ID, Type: feature.Type, X: feature.X, Y: feature.Y, Rotation: feature.Rotation, Scale: feature.Scale})
	}
	for _, spawn := range source.MonsterSpawns {
		result.MonsterCamps = append(result.MonsterCamps, MonsterCampJSON{ID: spawn.ID, Kind: string(spawn.Kind), X: spawn.X, Y: spawn.Y, TerritoryRadius: spawn.TerritoryRadius})
	}
	if !includeWalls {
		return result
	}
	result.Walls = make([]WallJSON, 0, len(source.Collisions))
	for _, wall := range source.Collisions {
		result.Walls = append(result.Walls, WallJSON{
			MinX: wall.MinX, MinY: wall.MinY, MaxX: wall.MaxX, MaxY: wall.MaxY,
			Type: wall.Type, Rotation: wall.Rotation, LinkedFeatureID: wall.LinkedFeatureID, Blocking: geometry.IsBlockingWall(wall.Type), BushGroup: wall.BushGroup,
			ColliderInsetX: wall.ColliderInsetX, ColliderInsetY: wall.ColliderInsetY,
			ColliderRadius: wall.ColliderRadius,
		})
	}
	return result
}
