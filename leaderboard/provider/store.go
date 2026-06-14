package provider

import "leaderboard/model"

type Store interface {
	Save(score *model.Score) error
	Get(playerId string) (*model.Score, error)
	Top(limit int) ([]model.Score, error)
}
