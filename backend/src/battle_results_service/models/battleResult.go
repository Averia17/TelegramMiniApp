package models

import "time"

// BattleResult represents a completed battle record for PostgreSQL
type BattleResult struct {
	ID         int64     `json:"id"`
	BattleID   string    `json:"battle_id"`
	Players    []string  `json:"players"`
	WinnerID   string    `json:"winner_id"`
	FinishedAt time.Time `json:"finished_at"`
}

// BattleEndedMessage represents the Kafka message format
type BattleEndedMessage struct {
	BattleID   string    `json:"battle_id"`
	Players    []string  `json:"players"`
	WinnerID   string    `json:"winner_id"`
	FinishedAt time.Time `json:"finished_at"`
}
