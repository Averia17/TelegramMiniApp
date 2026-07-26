package main

import (
	"context"
	"fmt"
	"leaderboard/config"
	"leaderboard/handler"
	"leaderboard/provider"
	"leaderboard/service"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	cfg := config.Load()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	store := provider.NewRedisProvider(cfg.RedisAddr)
	store.StartPeriodicSync(ctx)

	svc := service.New(store)

	kafka := provider.NewKafkaConsumer(cfg.KafkaAddr, svc.ApplyBattleResult)
	kafka.Start(ctx)
	defer kafka.Close()

	h := handler.NewHandler(svc)
	mux := http.NewServeMux()
	h.SetupRoutes(mux)

	corsMux := corsMiddleware(mux)

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		cancel()
	}()

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Leaderboard server starting on %s", addr)
	server := &http.Server{
		Addr:              addr,
		Handler:           corsMux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 * 1024,
	}
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal("Server error:", err)
	}
}
