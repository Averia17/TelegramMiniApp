package economy

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientSpendTauntForwardsBearerToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/economy/me/taunt" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer access-token" {
			t.Fatalf("authorization = %q", r.Header.Get("Authorization"))
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	if err := NewClient(server.URL).SpendTaunt("access-token", "clown_laugh"); err != nil {
		t.Fatalf("SpendTaunt() error = %v", err)
	}
}

func TestClientSpendTauntReturnsInsufficientCharges(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
	}))
	defer server.Close()

	err := NewClient(server.URL).SpendTaunt("access-token", "clown_laugh")
	if err == nil || err.Error() != "taunt access expired" {
		t.Fatalf("SpendTaunt() error = %v, want taunt access expired", err)
	}
}
