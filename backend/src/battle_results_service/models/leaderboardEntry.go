package models

type LeaderboardEntry struct {
	PlayerID string  `json:"player_id"`
	Score    float64 `json:"score"`
	Rank     int     `json:"rank"`
}
