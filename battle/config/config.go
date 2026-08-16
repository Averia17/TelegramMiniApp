package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port         string
	RedisAddr    string
	KafkaAddr    string
	AccountURL   string
	TeamSize     int
	PartyMaxSize int
}

func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6380"
	}
	kafkaAddr := os.Getenv("KAFKA_ADDR")
	if kafkaAddr == "" {
		kafkaAddr = "localhost:9092"
	}
	accountURL := os.Getenv("ACCOUNT_URL")
	if accountURL == "" {
		accountURL = "http://localhost:8000"
	}
	teamSize := configuredInt("TEAM_SIZE", 3)
	partyMaxSize := configuredInt("MAX_PARTY_SIZE", teamSize)
	if partyMaxSize > teamSize {
		partyMaxSize = teamSize
	}
	return &Config{
		Port:         port,
		RedisAddr:    redisAddr,
		KafkaAddr:    kafkaAddr,
		AccountURL:   accountURL,
		TeamSize:     teamSize,
		PartyMaxSize: partyMaxSize,
	}
}

func configuredInt(name string, fallback int) int {
	value, err := strconv.Atoi(os.Getenv(name))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}
