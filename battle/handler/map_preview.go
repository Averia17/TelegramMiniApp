package handler

import (
	"battle/model/game"
	"battle/model/gamemap"
	"encoding/json"
	"net/http"
	"strings"
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
	requestedMap := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("map")))
	teamMap := strings.EqualFold(r.URL.Query().Get("mode"), "team") || strings.HasPrefix(requestedMap, "team-battle")
	seed := gamemap.CanonicalBattleRoyaleSeed
	mapName := "battle-royale"
	canonical := gamemap.GenerateBattleRoyale(seed)
	if teamMap {
		mapName = "team-battle-northern"
		seed = gamemap.CanonicalTeamBattleNorthernSeed
		canonical = gamemap.GenerateTeamBattle(seed)
		if requestedMap == "team-battle" {
			mapName = "team-battle"
			seed = gamemap.CanonicalTeamBattleSeed
			canonical = gamemap.GenerateTeamBattleClassic(seed)
		}
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
		Seed:     seed,
		Map:      game.NewMapJSON(mapName, canonical, 0, true),
		Spawners: spawners,
	})
}
