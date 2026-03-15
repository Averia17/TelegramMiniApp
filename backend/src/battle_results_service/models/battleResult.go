package models

import "time"

// BattleResult represents a completed battle record for PostgreSQL
type BattleResult struct {
	ID        int64     `json:"id"`
    BattleID  string   `json:"battle_id"`
    Players   []string `json:"players"`
    WinnerID    string   `json:"winner_id"`
    FinishedAt string   `json:"timestamp"`
}

// BattleEndedMessage represents the Kafka message format
type BattleEndedMessage struct {
    BattleID  string   `json:"battle_id"`
    Players   []string `json:"players"`
    WinnerID    string   `json:"winner_id"`
    FinishedAt string   `json:"timestamp"`
}
