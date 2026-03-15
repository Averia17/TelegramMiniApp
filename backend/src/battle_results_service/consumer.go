package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"battle_results/common"
	"battle_results/models"

	"github.com/segmentio/kafka-go"
)

// RunConsumer starts the Kafka consumer and processes battle_ended messages
func RunConsumer(ctx context.Context, repo *BattleResultRepository) error {
	brokers := common.Config.KafkaBrokers
	if len(brokers) == 0 {
		brokers = []string{"localhost:9092"}
	}
	topic := common.Config.KafkaTopic
	if topic == "" {
		topic = "battle_ended"
	}
	groupID := common.Config.KafkaGroup
	if groupID == "" {
		groupID = "battle-results-service"
	}

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        brokers,
		Topic:          topic,
		GroupID:        groupID,
		MinBytes:       10e3, // 10KB
		MaxBytes:       10e6, // 10MB
		MaxWait:        1 * time.Second,
		CommitInterval: time.Second,
		StartOffset:    kafka.FirstOffset,
	})
	defer reader.Close()

	log.Printf("Kafka consumer started: topic=%s group=%s", topic, groupID)

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		cancel()
	}()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		msg, err := reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			log.Printf("Kafka fetch error: %v", err)
			time.Sleep(time.Second)
			continue
		}

		if err := processMessage(ctx, repo, msg.Value); err != nil {
			log.Printf("Process message error: %v (payload: %s)", err, string(msg.Value))
			// Continue anyway - could implement dead letter queue
		} else {
			if err := reader.CommitMessages(ctx, msg); err != nil {
				log.Printf("Commit error: %v", err)
			}
		}
	}
}

func processMessage(ctx context.Context, repo *BattleResultRepository, payload []byte) error {
	var m models.BattleEndedMessage
	if err := json.Unmarshal(payload, &m); err != nil {
		return err
	}

	if m.WinnerID == "" {
		return nil
	}

	br := &models.BattleResult{
        WinnerID:  m.WinnerID,
        Players:   m.Players,
        RoomID:    m.BattleID,
        FinishedAt: m.FinishedAt,
	}
	return repo.Insert(ctx, br)
}
