package main

import (
	"context"
	"log"
	"net/http"
	_ "net/http"

	"battle_results/common"
	"go.uber.org/fx"
)

func main() {
	fx.New(
		fx.Provide(
			ProvidePostgreSQL,         // Возвращает *PostgreSQL
			NewBattleResultRepository, // Берет *PostgreSQL, возвращает *BattleResultRepository
			NewBattleHandler,          // Берет *BattleResultRepository, возвращает *BattleHandler
			NewHTTPServer,             // Берет *BattleHandler, возвращает *http.Server
		),
		fx.Invoke(
			func(lc fx.Lifecycle, repo *BattleResultRepository, pg *PostgreSQL, srv *http.Server) {
				ctx, cancel := context.WithCancel(context.Background())

				lc.Append(fx.Hook{
					OnStart: func(_ context.Context) error {
						go func() {
							if err := RunConsumer(ctx, repo); err != nil {
								log.Printf("Consumer stopped: %v", err)
							}
						}()
						return nil
					},
					OnStop: func(_ context.Context) error {
						cancel()
						pg.Close()
						return nil
					},
				})
			},
		),
	).Run()
}

func ProvidePostgreSQL() (*PostgreSQL, error) {
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
	return pgDB, nil
}

func NewHTTPServer(lc fx.Lifecycle, handler *BattleHandler) *http.Server {
	mux := http.NewServeMux()
	srv := &http.Server{Addr: ":8080", Handler: mux}

	mux.HandleFunc("/battle/result", handler.GetResult)

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
