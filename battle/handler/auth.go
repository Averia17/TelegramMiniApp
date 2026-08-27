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

type battleTicketClaims struct {
	PartyID  string `json:"partyId"`
	PlayerID string `json:"playerId"`
	Nonce    string `json:"nonce"`
	MaxSize  int    `json:"maxSize"`
	Exp      int64  `json:"exp"`
}

func authSecret() string {
	secret := os.Getenv("APP_AUTH_SECRET")
	if secret == "" && strings.ToLower(os.Getenv("APP_ENV")) != "production" {
		secret = "local-development-auth-secret-change-before-production"
	}
	return secret
}

func verifyAccessToken(token string) (string, error) {
	secret := authSecret()
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
	if json.Unmarshal(payload, &claims) != nil || claims.Sub <= 0 || claims.Exp <= time.Now().Unix() {
		return "", errors.New("expired or invalid token")
	}
	return strconv.FormatInt(claims.Sub, 10), nil
}

func verifyBattleTicket(token, expectedPartyID, expectedPlayerID string) (battleTicketClaims, error) {
	var claims battleTicketClaims
	secret := authSecret()
	if len(secret) < 32 {
		return claims, errors.New("battle ticket authentication is not configured")
	}
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return claims, errors.New("invalid battle ticket")
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return claims, errors.New("invalid battle ticket signature")
	}
	// Raw base64url has unused pad bits when encoding a 32-byte HMAC. Reject
	// alternate spellings so changing the final character cannot preserve the
	// decoded signature while bypassing tamper detection.
	if base64.RawURLEncoding.EncodeToString(signature) != parts[1] {
		return claims, errors.New("invalid battle ticket signature")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(parts[0]))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return claims, errors.New("invalid battle ticket signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || json.Unmarshal(payload, &claims) != nil {
		return claims, errors.New("invalid battle ticket payload")
	}
	if claims.PartyID == "" || claims.PlayerID == "" || claims.Nonce == "" || claims.MaxSize <= 0 || claims.Exp <= time.Now().Unix() {
		return claims, errors.New("expired or incomplete battle ticket")
	}
	if claims.PartyID != expectedPartyID || claims.PlayerID != expectedPlayerID {
		return claims, errors.New("battle ticket does not belong to player")
	}
	return claims, nil
}
