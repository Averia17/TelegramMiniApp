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

func (h *BattleHandler) GetResult(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}

	result, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
