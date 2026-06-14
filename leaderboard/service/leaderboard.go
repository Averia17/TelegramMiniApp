package service

import (
	"fmt"
	"leaderboard/model"
	"leaderboard/provider"
	"log"
)

type LeaderboardService struct {
	store provider.Store
	redis *provider.RedisProvider
}

func New(store provider.Store) *LeaderboardService {
	rp, ok := store.(*provider.RedisProvider)
	if !ok {
		rp = nil
	}
	return &LeaderboardService{store: store, redis: rp}
}

func (s *LeaderboardService) Update(playerId, name string, score, wins, games int) error {
	return s.store.Save(&model.Score{
		PlayerId: playerId,
		Name:     name,
		Score:    score,
		Wins:     wins,
		Games:    games,
	})
}

func (s *LeaderboardService) ApplyBattleResult(result *model.BattleResult) error {
	messageId := fmt.Sprintf("%s:%s:%d", result.RoomId, result.Mode, result.Duration)

	if s.redis != nil && s.redis.IsProcessed(messageId) {
		log.Printf("Skipping duplicate battle result: %s", messageId)
		return nil
	}

	for _, p := range result.Players {
		wins := 0
		if p.Won {
			wins = 1
		}
		if err := s.store.Save(&model.Score{
			PlayerId: p.PlayerId,
			Name:     p.Name,
			Score:    p.Kills * 100,
			Wins:     wins,
			Games:    1,
		}); err != nil {
			log.Printf("Failed to save score for %s: %v", p.PlayerId, err)
			return err
		}
	}

	if s.redis != nil {
		s.redis.MarkProcessed(messageId)
	}

	return nil
}

func (s *LeaderboardService) Top(limit int) ([]model.Score, error) {
	if limit <= 0 {
		limit = 100
	}
	return s.store.Top(limit)
}

func (s *LeaderboardService) Get(playerId string) (*model.Score, error) {
	return s.store.Get(playerId)
}
