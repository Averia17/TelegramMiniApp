package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"leaderboard/model"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

var ctx = context.Background()

const (
	scoresKey      = "leaderboard:scores"
	playerPrefix   = "leaderboard:player:"
	processedKey   = "leaderboard:processed"
	playerTTL      = 30 * 24 * time.Hour
	processedTTL   = 7 * 24 * time.Hour
	syncInterval   = 5 * time.Minute
	scanCount      = 100
)

type RedisProvider struct {
	client    *redis.Client
	connected bool
}

func NewRedisProvider(addr string) *RedisProvider {
	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: "",
		DB:       0,
	})

	connected := client.Ping(ctx).Err() == nil
	if connected {
		fmt.Printf("Leaderboard Redis connected: %s\n", addr)
	} else {
		fmt.Printf("Leaderboard Redis not available, running without persistence\n")
	}

	return &RedisProvider{
		client:    client,
		connected: connected,
	}
}

func (p *RedisProvider) IsProcessed(messageId string) bool {
	if !p.connected {
		return false
	}
	exists, err := p.client.SIsMember(ctx, processedKey, messageId).Result()
	return err == nil && exists
}

func (p *RedisProvider) MarkProcessed(messageId string) {
	if !p.connected {
		return
	}
	p.client.SAdd(ctx, processedKey, messageId)
}

func (p *RedisProvider) Save(score *model.Score) error {
	if !p.connected {
		return nil
	}

	existing, _ := p.Get(score.PlayerId)
	if existing != nil {
		existing.Score += score.Score
		existing.Wins += score.Wins
		existing.Games += score.Games
		if score.Name != "" {
			existing.Name = score.Name
		}
		score = existing
	}

	data, err := json.Marshal(score)
	if err != nil {
		return err
	}

	pipe := p.client.Pipeline()
	pipe.Set(ctx, playerPrefix+score.PlayerId, data, playerTTL)
	pipe.ZAdd(ctx, scoresKey, redis.Z{
		Score:  float64(score.Score),
		Member: score.PlayerId,
	})
	_, err = pipe.Exec(ctx)
	return err
}

func (p *RedisProvider) Get(playerId string) (*model.Score, error) {
	if !p.connected {
		return nil, fmt.Errorf("redis not available")
	}
	data, err := p.client.Get(ctx, playerPrefix+playerId).Bytes()
	if err != nil {
		return nil, err
	}
	var s model.Score
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func (p *RedisProvider) Top(limit int) ([]model.Score, error) {
	if !p.connected {
		return nil, nil
	}
	ids, err := p.client.ZRevRange(ctx, scoresKey, 0, int64(limit-1)).Result()
	if err != nil {
		return nil, err
	}
	var scores []model.Score
	for _, id := range ids {
		s, err := p.Get(id)
		if err != nil {
			continue
		}
		scores = append(scores, *s)
	}
	return scores, nil
}

func (p *RedisProvider) RebuildSortedSet() error {
	if !p.connected {
		return nil
	}

	newSet := make([]redis.Z, 0)
	var cursor uint64
	for {
		keys, nextCursor, err := p.client.Scan(ctx, cursor, playerPrefix+"*", scanCount).Result()
		if err != nil {
			return err
		}
		for _, key := range keys {
			data, err := p.client.Get(ctx, key).Bytes()
			if err != nil {
				continue
			}
			var s model.Score
			if err := json.Unmarshal(data, &s); err != nil {
				continue
			}
			newSet = append(newSet, redis.Z{
				Score:  float64(s.Score),
				Member: s.PlayerId,
			})
		}
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	pipe := p.client.Pipeline()
	pipe.Del(ctx, scoresKey)
	if len(newSet) > 0 {
		pipe.ZAdd(ctx, scoresKey, newSet...)
	}
	_, err := pipe.Exec(ctx)
	if err == nil {
		log.Printf("Rebuilt sorted set: %d entries", len(newSet))
	}
	return err
}

func (p *RedisProvider) StartPeriodicSync(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(syncInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := p.RebuildSortedSet(); err != nil {
					log.Printf("Leaderboard sync error: %v", err)
				}
			}
		}
	}()
}
