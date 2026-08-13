package gamemap

import (
	_ "embed"
	"encoding/json"

	"battle/service/geometry"
)

// CanonicalBattleRoyaleSeed keeps gameplay, map previews, and QA on one arena.
const CanonicalBattleRoyaleSeed int64 = 20260810

// CanonicalBattleRoyaleID is the stable identity published by every transport
// that exposes the generated battle-royale arena.
const CanonicalBattleRoyaleID = "battle-royale@20260810"

//go:embed assets/maps/small.json
var smallMapJSON []byte

//go:embed assets/maps/huge.json
var hugeMapJSON []byte

//go:embed assets/maps/arena.json
var arenaMapJSON []byte

var mapData = map[string][]byte{
	"small": smallMapJSON,
	"huge":  hugeMapJSON,
	"arena": arenaMapJSON,
}

type TiledMap struct {
	Width      int            `json:"width"`
	Height     int            `json:"height"`
	TileWidth  int            `json:"tilewidth"`
	TileHeight int            `json:"tileheight"`
	Tilesets   []TiledTileset `json:"tilesets"`
	Layers     []TiledLayer   `json:"layers"`
}

type TiledTileset struct {
	Name        string      `json:"name"`
	FirstGID    int         `json:"firstgid"`
	Image       string      `json:"image"`
	ImageWidth  int         `json:"imagewidth"`
	ImageHeight int         `json:"imageheight"`
	TileWidth   int         `json:"tilewidth"`
	TileHeight  int         `json:"tileheight"`
	TileCount   int         `json:"tilecount"`
	Columns     int         `json:"columns"`
	Tiles       []TiledTile `json:"tiles"`
}

type TiledTile struct {
	ID   int              `json:"id"`
	Type string           `json:"type,omitempty"`
	Anim []TiledAnimFrame `json:"animation,omitempty"`
}

type TiledAnimFrame struct {
	Duration int `json:"duration"`
	TileID   int `json:"tileid"`
}

type TiledLayer struct {
	Name   string `json:"name"`
	Data   []int  `json:"data"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

type ParsedTile struct {
	TileID int
	MinX   float64
	MinY   float64
	MaxX   float64
	MaxY   float64
	Type   string
}

type GameMap struct {
	WidthInPixels  float64
	HeightInPixels float64
	Collisions     []*geometry.WallTile
	Spawners       []*geometry.RectangleBody
	Tileset        map[int]TilesetEntry
}

type TilesetEntry struct {
	TileID int
	MinX   float64
	MinY   float64
	MaxX   float64
	MaxY   float64
	Type   string
}

func propColliderInsets(kind string) (float64, float64) {
	switch kind {
	case "tree":
		return 10, 10
	case "dead_tree":
		return 9, 9
	case "menhir":
		return 9, 7
	case "crates":
		return 6, 6
	case "sacrificial_stone":
		return 6, 6
	case "altar_three_moons":
		return 4, 4
	case "wall", "destructible", "shipwreck":
		return 4, 4
	default:
		return 0, 0
	}
}

func LoadMap(name string) (*GameMap, error) {
	if name == "battle-royale" {
		return GenerateBattleRoyale(CanonicalBattleRoyaleSeed), nil
	}
	data, ok := mapData[name]
	if !ok {
		data = smallMapJSON
	}

	var tiled TiledMap
	if err := json.Unmarshal(data, &tiled); err != nil {
		return nil, err
	}

	tileSize := float64(tiled.TileWidth)
	if tileSize == 0 {
		tileSize = 32
	}

	gm := &GameMap{
		WidthInPixels:  float64(tiled.Width) * tileSize,
		HeightInPixels: float64(tiled.Height) * tileSize,
		Tileset:        make(map[int]TilesetEntry),
	}

	if len(tiled.Tilesets) > 0 {
		ts := tiled.Tilesets[0]
		offset := ts.FirstGID
		tileW := ts.TileWidth
		tileH := ts.TileHeight
		imageWUnits := ts.ImageWidth / tileW

		col := 0
		row := 0
		for i := 0; i < ts.TileCount; i++ {
			tileID := i + offset
			x := float64(col * tileW)
			y := float64(row * tileH)
			gm.Tileset[tileID] = TilesetEntry{
				TileID: tileID,
				MinX:   x,
				MinY:   y,
				MaxX:   x + float64(tileW),
				MaxY:   y + float64(tileH),
			}
			col++
			if col == imageWUnits {
				col = 0
				row++
			}
		}

		for _, tile := range ts.Tiles {
			tileID := tile.ID + offset
			if entry, ok := gm.Tileset[tileID]; ok {
				entry.Type = tile.Type
				gm.Tileset[tileID] = entry
			}
		}
	}

	for _, layer := range tiled.Layers {
		tiles := parseLayer(layer.Data, tiled.Width, tileSize, gm.Tileset)
		switch layer.Name {
		case "collisions":
			for _, t := range tiles {
				insetX, insetY := propColliderInsets(t.Type)
				gm.Collisions = append(gm.Collisions, &geometry.WallTile{
					MinX:           t.MinX,
					MinY:           t.MinY,
					MaxX:           t.MaxX,
					MaxY:           t.MaxY,
					Type:           t.Type,
					ColliderInsetX: insetX,
					ColliderInsetY: insetY,
				})
			}
		case "spawners":
			for _, t := range tiles {
				gm.Spawners = append(gm.Spawners, &geometry.RectangleBody{
					X:      t.MinX,
					Y:      t.MinY,
					Width:  t.MaxX - t.MinX,
					Height: t.MaxY - t.MinY,
				})
			}
		}
	}

	return gm, nil
}

func parseLayer(data []int, mapWidth int, tileSize float64, tileset map[int]TilesetEntry) []ParsedTile {
	if len(data) == 0 {
		return nil
	}

	var tiles []ParsedTile
	col := 0
	row := 0

	for _, tileID := range data {
		if tileID != 0 {
			x := float64(col) * tileSize
			y := float64(row) * tileSize
			entry, ok := tileset[tileID]
			t := ParsedTile{
				TileID: tileID,
				MinX:   x,
				MinY:   y,
				MaxX:   x + tileSize,
				MaxY:   y + tileSize,
			}
			if ok {
				t.Type = entry.Type
			}
			tiles = append(tiles, t)
		}
		col++
		if col == mapWidth {
			col = 0
			row++
		}
	}
	return tiles
}

func (gm *GameMap) ClampCircle(c *geometry.CircleBody) geometry.Vector2 {
	return geometry.Vector2{
		X: geometry.Clamp(c.X, c.Radius, gm.WidthInPixels-c.Radius),
		Y: geometry.Clamp(c.Y, c.Radius, gm.HeightInPixels-c.Radius),
	}
}

func (gm *GameMap) IsCircleOutside(c *geometry.CircleBody) bool {
	return c.Left() < 0 || c.Right() > gm.WidthInPixels || c.Top() < 0 || c.Bottom() > gm.HeightInPixels
}

func (gm *GameMap) GetRandomSpawner() *geometry.RectangleBody {
	if len(gm.Spawners) == 0 {
		return &geometry.RectangleBody{X: 100, Y: 100, Width: 32, Height: 32}
	}
	return gm.Spawners[geometry.GetRandomInt(0, len(gm.Spawners)-1)]
}
