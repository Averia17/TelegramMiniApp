package handler

import (
	"battle/model/game"
	"battle/model/gamemap"
	"battle/service/geometry"
	"encoding/json"
	"net/http"
)

type mapPreviewSpawnerJSON struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type mapPreviewResponse struct {
	Seed     int64                   `json:"seed"`
	Map      game.MapJSON            `json:"map"`
	Spawners []mapPreviewSpawnerJSON `json:"spawners"`
}

func (h *Handler) HandleMapPreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	seed := gamemap.CanonicalBattleRoyaleSeed

	canonical := gamemap.GenerateBattleRoyale(seed)
	walls := make([]game.WallJSON, 0, len(canonical.Collisions))
	for _, wall := range canonical.Collisions {
		walls = append(walls, game.WallJSON{
			MinX: wall.MinX, MinY: wall.MinY, MaxX: wall.MaxX, MaxY: wall.MaxY,
			Type: wall.Type, Blocking: geometry.IsBlockingWall(wall.Type), BushGroup: wall.BushGroup,
		})
	}
	spawners := make([]mapPreviewSpawnerJSON, 0, len(canonical.Spawners))
	for _, spawner := range canonical.Spawners {
		spawners = append(spawners, mapPreviewSpawnerJSON{
			X: spawner.X, Y: spawner.Y, Width: spawner.Width, Height: spawner.Height,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(mapPreviewResponse{
		Seed: seed,
		Map: game.MapJSON{
			Width: canonical.WidthInPixels, Height: canonical.HeightInPixels,
			TileSize: game.TileSize, Walls: walls,
		},
		Spawners: spawners,
	})
}
