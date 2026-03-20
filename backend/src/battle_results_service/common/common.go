package common

import (
	"os"
	"strings"

	"github.com/joho/godotenv"
)

// Configuration stores setting values (loaded from environment)
type Configuration struct {
	PgAddrs      string
	PgDbName     string
	PgDbUsername string
	PgDbPassword string

	KafkaBrokers []string
	KafkaTopic   string
	KafkaGroup   string
}

// Config shares the global configuration
var Config *Configuration

// LoadConfig loads configuration from .env file and environment variables
func LoadConfig() error {
	// Загрузка .env: сначала из директории сервиса, затем из родительских каталогов
	paths := []string{".env", "../.env", "../../.env"}
	for _, p := range paths {
		if err := godotenv.Load(p); err == nil {
			break
		}
	}

	Config = &Configuration{
		PgAddrs:      getEnv("BATTLE_RESULTS_DB_HOST", "localhost") + ":" + getEnv("BATTLE_RESULTS_DB_PORT", "5462"),
		PgDbName:     getEnv("BATTLE_RESULTS_DB_NAME", "battle_results"),
		PgDbUsername: getEnv("BATTLE_RESULTS_DB_USER", "battle_results_user"),
		PgDbPassword: getEnv("BATTLE_RESULTS_DB_PASSWORD", "battle_results_pass"),
		KafkaBrokers: splitEnv("KAFKA_BROKERS", []string{"localhost:9092"}),
		KafkaTopic:   getEnv("KAFKA_TOPIC", "battle_finished"),
		KafkaGroup:   getEnv("KAFKA_GROUP", "battle-results-service"),
	}

	return nil
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func splitEnv(key string, defaultVal []string) []string {
	if v := os.Getenv(key); v != "" {
		parts := strings.Split(v, ",")
		for i := range parts {
			parts[i] = strings.TrimSpace(parts[i])
		}
		return parts
	}
	return defaultVal
}
