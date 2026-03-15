package main

import (
	"battle_results/models"
	"context"
	"database/sql"
	"time"
)

const battleResultsTable = "battle_results"

// BattleResultRepository handles battle result persistence
type BattleResultRepository struct {
	db *sql.DB
}

// NewBattleResultRepository creates a new repository
func NewBattleResultRepository(db *sql.DB) *BattleResultRepository {
	return &BattleResultRepository{db: db}
}

// Insert saves a battle result to the database
func (r *BattleResultRepository) Insert(ctx context.Context, br *models.BattleResult) error {
	query := `INSERT INTO battle_results (winner_id, loser_id, room_id, score, mode, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id`

	br.CreatedAt = time.Now()
	err := r.db.QueryRowContext(ctx, query,
		br.WinnerID,
		nullString(br.LoserID),
		nullString(br.RoomID),
		br.Score,
		nullString(br.Mode),
		br.CreatedAt,
	).Scan(&br.ID)
	return err
}

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
