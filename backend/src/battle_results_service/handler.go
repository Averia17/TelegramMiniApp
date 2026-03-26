package main

import (
	"battle_results/models"
	"encoding/json"
	"log"
	"net/http"

	"github.com/redis/go-redis/v9"
)

type BattleHandler struct {
	repo *BattleResultRepository
	rdb  *redis.Client
}

func NewBattleHandler(repo *BattleResultRepository, rdb *redis.Client) *BattleHandler {
	return &BattleHandler{
		repo: repo,
		rdb:  rdb,
	}
}

func (h *BattleHandler) GetBattleHistory(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("player_id")
	if id == "" {
		http.Error(w, "missing player_id", http.StatusBadRequest)
		return
	}

	results, err := h.repo.GetByPlayerID(r.Context(), id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (h *BattleHandler) GetLeaderboard(w http.ResponseWriter, r *http.Request) {
	zs, err := getLeaderboard(r.Context(), h.rdb)
	if err != nil {
		log.Printf("Leaderboard error: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	results := make([]models.LeaderboardEntry, len(zs))
	for i, z := range zs {
		results[i] = models.LeaderboardEntry{
			PlayerID: z.Member.(string),
			Score:    z.Score,
			Rank:     i + 1,
		}
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(results); err != nil {
		log.Printf("JSON encode error: %v", err)
	}
}
