package main

import (
	"battle/config"
	"battle/handler"
	mroom "battle/model/room"
	"battle/provider"
	"fmt"
	"log"
	"net/http"
	"time"
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
	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 * 1024,
	}
	if err := server.ListenAndServe(); err != nil {
		log.Fatal("Server error:", err)
	}
}
