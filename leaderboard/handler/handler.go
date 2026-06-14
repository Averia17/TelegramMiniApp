package handler

import (
	"encoding/json"
	"leaderboard/model"
	"leaderboard/service"
	"net/http"
	"strconv"
)

type Handler struct {
	svc *service.LeaderboardService
}

func NewHandler(svc *service.LeaderboardService) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) SetupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/health", h.HandleHealth)
	mux.HandleFunc("/leaderboard", h.HandleLeaderboard)
	mux.HandleFunc("/leaderboard/score", h.HandleUpdateScore)
	mux.HandleFunc("/leaderboard/player/", h.HandleGetPlayer)
}

func (h *Handler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"status": "ok"})
}

func (h *Handler) HandleLeaderboard(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 {
		limit = l
	}
	scores, err := h.svc.Top(limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if scores == nil {
		scores = []model.Score{}
	}
	writeJSON(w, scores)
}

func (h *Handler) HandleUpdateScore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		PlayerId string `json:"playerId"`
		Name     string `json:"name"`
		Score    int    `json:"score"`
		Wins     int    `json:"wins"`
		Games    int    `json:"games"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	if req.PlayerId == "" {
		http.Error(w, "playerId required", http.StatusBadRequest)
		return
	}
	if err := h.svc.Update(req.PlayerId, req.Name, req.Score, req.Wins, req.Games); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

func (h *Handler) HandleGetPlayer(w http.ResponseWriter, r *http.Request) {
	playerId := r.URL.Path[len("/leaderboard/player/"):]
	if playerId == "" {
		http.Error(w, "playerId required", http.StatusBadRequest)
		return
	}
	score, err := h.svc.Get(playerId)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, score)
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
