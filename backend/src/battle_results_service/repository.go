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

func (r *BattleResultRepository) GetByPlayerID(ctx context.Context, id string) ([]*models.BattleResult, error) {
	query := `SELECT battle_id, players, winner_id, finished_at FROM battle_results WHERE $1 = ANY(players)`

	rows, err := r.db.QueryContext(ctx, query, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*models.BattleResult

	for rows.Next() {
		var br models.BattleResult
		err := rows.Scan(
			&br.BattleID,
			pq.Array(&br.Players),
			&br.WinnerID,
			&br.FinishedAt,
		)
		if err != nil {
			return nil, err
		}
		results = append(results, &br)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return results, nil
}
