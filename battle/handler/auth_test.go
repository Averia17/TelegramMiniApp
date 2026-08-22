package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"
)

func signedBattleTicket(t *testing.T, claims battleTicketClaims) string {
	t.Helper()
	secret := "battle-ticket-test-secret-0123456789"
	t.Setenv("APP_AUTH_SECRET", secret)
	payload, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	encodedPayload := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(encodedPayload))
	return encodedPayload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TestVerifyBattleTicketRequiresMatchingActiveParticipant(t *testing.T) {
	ticket := signedBattleTicket(t, battleTicketClaims{
		PartyID:  "party-1",
		PlayerID: "player-1",
		Nonce:    "battle-1",
		MaxSize:  3,
		Exp:      time.Now().Add(time.Minute).Unix(),
	})

	if _, err := verifyBattleTicket(ticket, "party-1", "player-1"); err != nil {
		t.Fatalf("valid battle ticket rejected: %v", err)
	}
	if _, err := verifyBattleTicket(ticket, "party-1", "player-2"); err == nil {
		t.Fatal("battle ticket accepted for a different player")
	}
	tampered := ticket[:len(ticket)-1] + "A"
	if _, err := verifyBattleTicket(tampered, "party-1", "player-1"); err == nil {
		t.Fatal("tampered battle ticket accepted")
	}
}

func TestVerifyBattleTicketRejectsExpiredTicket(t *testing.T) {
	ticket := signedBattleTicket(t, battleTicketClaims{
		PartyID:  "party-1",
		PlayerID: "player-1",
		Nonce:    "battle-1",
		MaxSize:  3,
		Exp:      time.Now().Add(-time.Minute).Unix(),
	})

	if _, err := verifyBattleTicket(ticket, "party-1", "player-1"); err == nil {
		t.Fatal("expired battle ticket accepted")
	}
}
