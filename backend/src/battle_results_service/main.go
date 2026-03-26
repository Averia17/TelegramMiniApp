package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	_ "net/http"
	"time"

	"battle_results/common"

	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
	"go.uber.org/fx"
)

func main() {
	fx.New(
		fx.Provide(
			ProvideRedisClient,        // Возвращает *redis.Client
			ProvidePostgreSQL,         // Возвращает *PostgreSQL
			ProvideKafkaReader,        // Возвращает *kafka.Reader
			NewBattleResultRepository, // Берет *PostgreSQL, возвращает *BattleResultRepository
			NewBattleHandler,          // Берет *BattleResultRepository, возвращает *BattleHandler
			NewHTTPServer,             // Берет *BattleHandler, возвращает *http.Server
		),
		fx.Invoke(
			func(lc fx.Lifecycle, repo *BattleResultRepository, pg *PostgreSQL, redis *redis.Client, srv *http.Server, kafka *kafka.Reader) {
				ctx, cancel := context.WithCancel(context.Background())

				lc.Append(fx.Hook{
					OnStart: func(_ context.Context) error {
						go func() {
							if err := RunConsumer(ctx, repo, redis, kafka); err != nil {
								log.Printf("Consumer stopped: %v", err)
							}
						}()
						return nil
					},
					OnStop: func(_ context.Context) error {
						cancel()
						return nil
					},
				})
			},
		),
	).Run()
}

func ProvidePostgreSQL(lc fx.Lifecycle) (*PostgreSQL, error) {
	if err := common.LoadConfig(); err != nil {
		return nil, err
	}
	pgDB := &PostgreSQL{}
	if err := pgDB.Init(); err != nil {
		return nil, err
	}
	if err := initSchema(pgDB.DB); err != nil {
		log.Printf("Warning: init schema: %v", err)
	}
	lc.Append(fx.Hook{
		OnStop: func(ctx context.Context) error {
			log.Println("Closing PostgreSQL...")
			return pgDB.Close()
		},
	})

	return pgDB, nil
}

func ProvideRedisClient(lc fx.Lifecycle) (*redis.Client, error) {
	if err := common.LoadConfig(); err != nil {
		return nil, err
	}

	addr := fmt.Sprintf("%s:%s", common.Config.RedisHost, common.Config.RedisPort)

	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: common.Config.RedisPass,
		DB:       common.Config.RedisDB,
	})

	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			log.Println("Connecting to Redis and loading scripts...")

			if err := rdb.Ping(ctx).Err(); err != nil {
				return fmt.Errorf("redis ping failed: %w", err)
			}

			if err := updateBattleScoresLua.Load(ctx, rdb).Err(); err != nil {
				return fmt.Errorf("failed to load lua script: %w", err)
			}

			return nil
		},
		OnStop: func(ctx context.Context) error {
			log.Println("Closing Redis...")
			return rdb.Close()
		},
	})

	return rdb, nil
}

func NewHTTPServer(lc fx.Lifecycle, handler *BattleHandler) *http.Server {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/battle_results/battle_history", handler.GetBattleHistory)
	mux.HandleFunc("/api/battle_results/leaderboard", handler.GetLeaderboard)

	srv := &http.Server{Addr: ":8000", Handler: mux}

	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			go srv.ListenAndServe()
			return nil
		},
		OnStop: func(ctx context.Context) error {
			return srv.Shutdown(ctx)
		},
	})
	return srv
}

func ProvideKafkaReader(lc fx.Lifecycle) (*kafka.Reader, error) {
	if common.Config == nil {
		if err := common.LoadConfig(); err != nil {
			return nil, err
		}
	}

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        common.Config.KafkaBrokers,
		Topic:          common.Config.KafkaTopic,
		GroupID:        common.Config.KafkaGroup,
		MinBytes:       10e3, // 10KB
		MaxBytes:       10e6, // 10MB
		MaxWait:        1 * time.Second,
		CommitInterval: time.Second,
		StartOffset:    kafka.FirstOffset,
	})

	lc.Append(fx.Hook{
		OnStop: func(ctx context.Context) error {
			log.Println("Closing Kafka Reader...")
			return reader.Close()
		},
	})
	return reader, nil
}
