package main

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"battle_results/models"

	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
)

func RunConsumer(ctx context.Context, repo *BattleResultRepository, rdb *redis.Client, reader *kafka.Reader) error {
	msgChan := make(chan []byte, 1000)

	for i := 0; i < 5; i++ {
		go worker(ctx, msgChan, repo, rdb)
	}

	for {
		msg, err := reader.ReadMessage(ctx)
		if err != nil {
			return err
		}
		msgChan <- msg.Value
	}
}

func worker(ctx context.Context, msgChan <-chan []byte, repo *BattleResultRepository, rdb *redis.Client) {
	const batchSize = 100
	const flushInterval = time.Second

	batch := make([]*models.BattleResult, 0, batchSize)
	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()

	flush := func() {
		if len(batch) == 0 {
			return
		}

		err := updateScore(ctx, rdb, batch)
		if err != nil {
			log.Printf("Redis pipeline error: %v", err)
		}

		if err := repo.BulkInsert(ctx, batch); err != nil {
			log.Printf("DB bulk insert error: %v", err)
		}

		batch = batch[:0]
	}

	for {
		select {
		case payload := <-msgChan:
			var m models.BattleEndedMessage

			if err := json.Unmarshal(payload, &m); err != nil {
				continue
			}

			batch = append(batch, &models.BattleResult{
				BattleID:   m.BattleID,
				Players:    m.Players,
				WinnerID:   m.WinnerID,
				FinishedAt: m.FinishedAt,
			})

			if len(batch) >= batchSize {
				flush()
			}

		case <-ticker.C:
			flush()

		case <-ctx.Done():
			flush()
			return
		}
	}
}
