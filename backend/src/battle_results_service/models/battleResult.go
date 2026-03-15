package models

import "time"

// BattleResult represents a completed battle record for PostgreSQL
type BattleResult struct {
	ID        int64     `json:"id"`
	WinnerID  string    `json:"winner_id"`
	LoserID   string    `json:"loser_id,omitempty"`
	RoomID    string    `json:"room_id,omitempty"`
	Score     string    `json:"score"`
	Mode      string    `json:"mode,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// BattleEndedMessage represents the Kafka message format
type BattleEndedMessage struct {
	WinnerID string `json:"winner_id"`
	LoserID  string `json:"loser_id,omitempty"`
	RoomID   string `json:"room_id,omitempty"`
	Score    string `json:"score,omitempty"`
	Mode     string `json:"mode,omitempty"`
}
