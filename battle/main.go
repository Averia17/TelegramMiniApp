package main

import (
	"battle/config"
	"battle/handler"
	mroom "battle/model/room"
	"battle/provider"
	"fmt"
	"log"
	"net/http"
)

func main() {
	cfg := config.Load()

	store := provider.NewRedisProvider(cfg.RedisAddr)
	mroom.SetStore(store)

	kafka := provider.NewKafkaProducer(cfg.KafkaAddr)
	mroom.SetKafka(kafka)
	defer kafka.Close()

	mux := http.NewServeMux()
	h := handler.NewHandler()
	h.SetupRoutes(mux)

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Battle server starting on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal("Server error:", err)
	}
}
