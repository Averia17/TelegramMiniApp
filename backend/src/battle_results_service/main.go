package main

import (
	"context"
	"log"
	"os"

	"battle_results/common"
)

func main() {
	if err := common.LoadConfig(); err != nil {
		log.Fatalf("Load config: %v", err)
	}

	pgDB := &PostgreSQL{}
	if err := pgDB.Init(); err != nil {
		log.Fatalf("Init database: %v", err)
	}
	defer pgDB.Close()

	// Create battle_results table if not exists
	if err := initSchema(pgDB.DB); err != nil {
		log.Printf("Warning: init schema: %v", err)
	}

	repo := NewBattleResultRepository(pgDB.DB)
	ctx := context.Background()

	if err := RunConsumer(ctx, repo); err != nil && err != context.Canceled {
		log.Printf("Consumer stopped: %v", err)
		os.Exit(1)
	}
}
