package config

import "os"

type Config struct {
	Port       string
	RedisAddr  string
	KafkaAddr  string
	AccountURL string
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
	return &Config{
		Port:       port,
		RedisAddr:  redisAddr,
		KafkaAddr:  kafkaAddr,
		AccountURL: accountURL,
	}
}
