package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"strconv"
	"strings"
	"time"
)

func verifyAccessToken(token string) (string, error) {
	secret := os.Getenv("APP_AUTH_SECRET")
	if secret == "" && strings.ToLower(os.Getenv("APP_ENV")) != "production" {
		secret = "local-development-auth-secret-change-before-production"
	}
	if len(secret) < 32 {
		return "", errors.New("authentication is not configured")
	}
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return "", errors.New("invalid token")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(parts[0]))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(parts[1])) {
		return "", errors.New("invalid signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", errors.New("invalid payload")
	}
	var claims struct {
		Sub int64 `json:"sub"`
		Exp int64 `json:"exp"`
	}
	if json.Unmarshal(payload, &claims) != nil || claims.Sub <= 0 || claims.Exp < time.Now().Unix() {
		return "", errors.New("expired or invalid token")
	}
	return strconv.FormatInt(claims.Sub, 10), nil
}
