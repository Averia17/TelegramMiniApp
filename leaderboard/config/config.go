package config

import "os"

type Config struct {
	Port      string
	RedisAddr string
	KafkaAddr string
}

func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8001"
	}
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6380"
	}
	kafkaAddr := os.Getenv("KAFKA_ADDR")
	if kafkaAddr == "" {
		kafkaAddr = "localhost:9092"
	}
	return &Config{
		Port:      port,
		RedisAddr: redisAddr,
		KafkaAddr: kafkaAddr,
	}
}
