package main

import (
	"battle/config"
	"battle/handler"
	mroom "battle/model/room"
	"battle/provider"
	"fmt"
	"log"
	"net/http"
	"net/http/pprof"
	"os"
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
	startPprofServer()

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

// startPprofServer keeps profiling traffic away from the gameplay HTTP server.
// It is intentionally development-only because pprof exposes runtime details
// that must not be reachable from a production deployment.
func startPprofServer() {
	if os.Getenv("APP_ENV") == "production" {
		return
	}

	port := os.Getenv("PPROF_PORT")
	if port == "" {
		port = "6060"
	}
	addr := fmt.Sprintf(":%s", port)
	pprofMux := http.NewServeMux()
	pprofMux.HandleFunc("/debug/pprof/", pprof.Index)
	pprofMux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	pprofMux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	pprofMux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	pprofMux.HandleFunc("/debug/pprof/trace", pprof.Trace)

	go func() {
		log.Printf("Battle pprof listening on %s", addr)
		if err := http.ListenAndServe(addr, pprofMux); err != nil {
			log.Printf("Battle pprof stopped: %v", err)
		}
	}()
}
