package main

import (
	"battle_results/models"
	"context"
	"database/sql"

	"github.com/lib/pq"
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
	query := `INSERT INTO battle_results (battle_id, players, winner_id, finished_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id`

	err := r.db.QueryRowContext(ctx, query,
		br.BattleID,
		pq.Array(br.Players),
		br.WinnerID,
		br.FinishedAt,
	).Scan(&br.ID)

	return err
}

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
