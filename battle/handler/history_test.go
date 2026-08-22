package handler

import (
	"battle/model/room"
	"battle/provider"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func TestHandleBattleHistoryPaginatesWithCursor(t *testing.T) {
	const secret = "test-auth-secret-with-at-least-32-characters"
	t.Setenv("APP_AUTH_SECRET", secret)
	store := provider.NewMockStore()
	room.SetStore(store)
	t.Cleanup(func() { room.SetStore(nil) })

	for _, result := range []*provider.BattleResult{
		{RoomId: "room-c", EndedAt: 3000, Mode: "team", MapName: "team-battle", Duration: 65000, Players: []provider.PlayerResult{{PlayerId: "1", Won: true, Kills: 4}}},
		{RoomId: "room-b", EndedAt: 2000, Mode: "deathmatch", MapName: "battle-royale", Duration: 42000, Players: []provider.PlayerResult{{PlayerId: "1", Won: false, Place: 4, Deaths: 2}}},
		{RoomId: "room-a", EndedAt: 1000, Mode: "team", MapName: "team-battle", Duration: 31000, Players: []provider.PlayerResult{{PlayerId: "1", Won: true}}},
	} {
		if err := store.SaveBattleResult(result); err != nil {
			t.Fatal(err)
		}
	}

	mux := http.NewServeMux()
	NewHandler().SetupRoutes(mux)
	token := historyAccessToken(secret, 1)
	request := func(target string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, target, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, req)
		return response
	}

	first := request("/history?limit=2")
	if first.Code != http.StatusOK {
		t.Fatalf("first status = %v, body = %s", first.Code, first.Body.String())
	}
	var firstPayload struct {
		Items      []battleHistoryItem `json:"items"`
		NextCursor string              `json:"nextCursor"`
		HasMore    bool                `json:"hasMore"`
	}
	if err := json.Unmarshal(first.Body.Bytes(), &firstPayload); err != nil {
		t.Fatal(err)
	}
	if len(firstPayload.Items) != 2 || firstPayload.Items[0].ID != "room-c" || firstPayload.Items[1].ID != "room-b" {
		t.Fatalf("first page = %#v, want room-c, room-b", firstPayload.Items)
	}
	if firstPayload.Items[1].Place != 4 {
		t.Fatalf("solo place = %v, want 4", firstPayload.Items[1].Place)
	}
	if !firstPayload.HasMore || firstPayload.NextCursor == "" {
		t.Fatalf("first page cursor = %#v, want hasMore with cursor", firstPayload)
	}

	second := request("/history?limit=2&cursor=" + url.QueryEscape(firstPayload.NextCursor))
	if second.Code != http.StatusOK {
		t.Fatalf("second status = %v, body = %s", second.Code, second.Body.String())
	}
	var secondPayload struct {
		Items   []battleHistoryItem `json:"items"`
		HasMore bool                `json:"hasMore"`
	}
	if err := json.Unmarshal(second.Body.Bytes(), &secondPayload); err != nil {
		t.Fatal(err)
	}
	if len(secondPayload.Items) != 1 || secondPayload.Items[0].ID != "room-a" || secondPayload.HasMore {
		t.Fatalf("second page = %#v, want room-a without more pages", secondPayload)
	}

	unauthorized := httptest.NewRecorder()
	mux.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/history", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %v, want 401", unauthorized.Code)
	}
}

func historyAccessToken(secret string, userID int64) string {
	payload, _ := json.Marshal(map[string]int64{"sub": userID, "exp": time.Now().Add(time.Minute).Unix()})
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
