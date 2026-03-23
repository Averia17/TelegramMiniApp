package main

import (
	"encoding/json"
	"net/http"
)

type BattleHandler struct {
	repo *BattleResultRepository
}

func NewBattleHandler(repo *BattleResultRepository) *BattleHandler {
	return &BattleHandler{repo: repo}
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
