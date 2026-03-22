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
              ON CONFLICT (battle_id) DO NOTHING`

	_, err := r.db.ExecContext(ctx, query,
		br.BattleID,
		pq.Array(br.Players),
		br.WinnerID,
		br.FinishedAt,
	)
	return err
}
