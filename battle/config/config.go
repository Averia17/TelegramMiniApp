package config

import "os"

type Config struct {
	Port      string
	RedisAddr string
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
	return &Config{
		Port:      port,
		RedisAddr: redisAddr,
	}
}
