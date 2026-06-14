package provider

import (
	"context"
	"encoding/json"
	"leaderboard/model"
	"log"
	"time"

	"github.com/segmentio/kafka-go"
)

const BattleResultsTopic = "battle-results"

type BattleResultHandler func(result *model.BattleResult) error

type KafkaConsumer struct {
	reader  *kafka.Reader
	handler BattleResultHandler
}

func NewKafkaConsumer(brokerAddr string, handler BattleResultHandler) *KafkaConsumer {
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        []string{brokerAddr},
		Topic:          BattleResultsTopic,
		MinBytes:       1,
		MaxBytes:       10e6,
		StartOffset:    kafka.LastOffset,
		CommitInterval: 0,
	})
	return &KafkaConsumer{reader: r, handler: handler}
}

func (kc *KafkaConsumer) Start(ctx context.Context) {
	go func() {
		log.Printf("Kafka consumer started on topic %s", BattleResultsTopic)
		for {
			msg, err := kc.reader.ReadMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("Kafka read error: %v", err)
				continue
			}

			var result model.BattleResult
			if err := json.Unmarshal(msg.Value, &result); err != nil {
				log.Printf("Kafka unmarshal error: %v, skipping message", err)
				continue
			}

			if err := kc.handler(&result); err != nil {
				log.Printf("Handler error: %v, will retry message", err)
				time.Sleep(time.Second)
				continue
			}
		}
	}()
}

func (kc *KafkaConsumer) Close() {
	if kc != nil && kc.reader != nil {
		kc.reader.Close()
	}
}
