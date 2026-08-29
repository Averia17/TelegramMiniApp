package main

import (
	"battle/config"
	"battle/handler"
	mroom "battle/model/room"
	"battle/observability"
	"battle/provider"
	"battle/service/economy"
	sroom "battle/service/room"
	"fmt"
	"log"
	"net/http"
	"net/http/pprof"
	"os"
	"strings"
	"time"
)

func main() {
	cfg := config.Load()
	version := os.Getenv("APP_VERSION")
	if version == "" {
		version = "dev"
	}
	commit := os.Getenv("GIT_SHA")
	if commit == "" {
		commit = "unknown"
	}
	observability.SetBuildInfo(observability.Default, version, commit)
	sroom.ConfigureTeamMatchConfig(sroom.TeamMatchConfig{TeamSize: cfg.TeamSize, PartyMaxSize: cfg.PartyMaxSize})

	store := provider.NewRedisProvider(cfg.RedisAddr)
	mroom.SetStore(store)
	mroom.SetTauntSpender(economy.NewClient(cfg.AccountURL))

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
		Handler:           observability.HTTPMiddleware(observability.Default, mux),
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
	if strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "production") {
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
