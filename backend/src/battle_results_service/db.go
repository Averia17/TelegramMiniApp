package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"battle_results/common"

	_ "github.com/lib/pq"
)

// PostgreSQL manages PostgreSQL connection
type PostgreSQL struct {
	DB           *sql.DB
	Databasename string
}

// Init initializes postgres database
func (db *PostgreSQL) Init() error {
	db.Databasename = common.Config.PgDbName

	// Connection string for PostgreSQL
	// Format: postgres://username:password@host:port/database?sslmode=disable
	connStr := fmt.Sprintf("postgres://%s:%s@%s/%s?sslmode=disable",
		common.Config.PgDbUsername,
		common.Config.PgDbPassword,
		common.Config.PgAddrs,
		db.Databasename,
	)

	// Open database connection
	var err error
	db.DB, err = sql.Open("postgres", connStr)
	if err != nil {
		return err
	}

	// Set connection pool settings
	db.DB.SetMaxOpenConns(25)
	db.DB.SetMaxIdleConns(25)
	db.DB.SetConnMaxLifetime(5 * time.Minute)

	// Verify connection with a ping
	err = db.DB.Ping()
	if err != nil {
		return err
	}

	return nil
}

// Close the existing connection
func (db *PostgreSQL) Close() error {
	if db.DB != nil {
		return db.DB.Close()
	}
	return nil
}

// initSchema runs init.sql to create tables
func initSchema(db *sql.DB) error {
	sqlPath := "init.sql"
	if _, err := os.Stat(sqlPath); os.IsNotExist(err) {
		sqlPath = filepath.Join(filepath.Dir(os.Args[0]), "init.sql")
	}
	data, err := os.ReadFile(sqlPath)
	if err != nil {
		return err
	}
	// Split by semicolon, filter empty and comments
	stmts := strings.Split(string(data), ";")
	for _, stmt := range stmts {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" || strings.HasPrefix(stmt, "--") {
			continue
		}
		if _, err := db.Exec(stmt); err != nil {
			log.Printf("Exec SQL: %s ... error: %v", stmt[:min(50, len(stmt))], err)
			return err
		}
	}
	return nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
