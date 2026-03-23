package main

import (
	"battle_results/models"
	"context"
	"database/sql"

	"github.com/lib/pq"
)

type BattleResultRepository struct {
	db *sql.DB
}

func NewBattleResultRepository(pg *PostgreSQL) *BattleResultRepository {
	return &BattleResultRepository{db: pg.DB}
}

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

func (r *BattleResultRepository) GetByID(ctx context.Context, id string) (*models.BattleResult, error) {
	var br models.BattleResult
	query := `SELECT battle_id, players, winner_id, finished_at FROM battle_results WHERE battle_id = $1`

	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&br.BattleID,
		pq.Array(&br.Players),
		&br.WinnerID,
		&br.FinishedAt,
	)
	if err != nil {
		return nil, err
	}
	return &br, nil
}
