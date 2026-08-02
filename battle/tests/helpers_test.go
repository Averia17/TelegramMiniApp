package integration

import (
	"battle/handler"
	mroom "battle/model/room"
	"battle/provider"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

const testAuthSecret = "test-auth-secret-with-at-least-32-characters"

var testUserSequence int64 = 9_000_000_000

func testAccessToken(userID int64) string {
	payload, _ := json.Marshal(map[string]int64{"sub": userID, "exp": time.Now().Add(time.Minute).Unix()})
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(testAuthSecret))
	_, _ = mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func setupTest(t *testing.T) (*httptest.Server, *provider.MockStore) {
	t.Helper()

	store := provider.NewMockStore()
	t.Setenv("APP_AUTH_SECRET", testAuthSecret)
	mroom.SetStore(store)
	mroom.ResetRooms()

	h := handler.NewHandler()
	mux := http.NewServeMux()
	h.SetupRoutes(mux)
	ts := httptest.NewServer(mux)

	t.Cleanup(func() {
		ts.Close()
		mroom.ResetRooms()
	})

	return ts, store
}

func wsDial(t *testing.T, ts *httptest.Server) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
	dialer := websocket.Dialer{HandshakeTimeout: 5 * time.Second}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	userID := atomic.AddInt64(&testUserSequence, 1)
	if err := conn.WriteJSON(map[string]string{"type": "auth", "token": testAccessToken(userID)}); err != nil {
		conn.Close()
		t.Fatalf("auth: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

func wsJoin(t *testing.T, conn *websocket.Conn, name, room, roomMap string) string {
	t.Helper()
	msg := fmt.Sprintf(`{"type":"join","playerName":%q,"heroName":"Needle","roomName":%q,"roomMap":%q,"maxPlayers":4,"mode":"deathmatch"}`, name, room, roomMap)
	if err := conn.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
		t.Fatalf("write join: %v", err)
	}
	return waitForMsg(t, conn, "room_joined")
}

func waitForMsg(t *testing.T, conn *websocket.Conn, msgType string) string {
	t.Helper()
	for i := 0; i < 30; i++ {
		conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		_, data, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		s := string(data)
		if strings.Contains(s, msgType) {
			return s
		}
	}
	t.Fatalf("timeout waiting for %q", msgType)
	return ""
}

func waitState(t *testing.T, conn *websocket.Conn, timeout time.Duration, fn func(map[string]interface{}) bool) map[string]interface{} {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn.SetReadDeadline(deadline)
		_, data, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		var msg map[string]interface{}
		if json.Unmarshal(data, &msg) == nil && msg["type"] == "state" {
			if fn(msg) {
				return msg
			}
		}
	}
	t.Fatalf("state condition not met in %v", timeout)
	return nil
}

func pollUntil(t *testing.T, timeout time.Duration, desc string, fn func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if fn() {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("poll condition %q not met in %v", desc, timeout)
}

func parseRoomId(resp string) string {
	var msg struct {
		Params struct {
			RoomId string `json:"roomId"`
		} `json:"params"`
	}
	json.Unmarshal([]byte(resp), &msg)
	return msg.Params.RoomId
}

func joinTwo(t *testing.T, ts *httptest.Server, room, mapName string) (*websocket.Conn, *websocket.Conn, string) {
	t.Helper()
	c1 := wsDial(t, ts)
	resp := wsJoin(t, c1, "P1", room, mapName)
	roomId := parseRoomId(resp)
	c2 := wsDial(t, ts)
	wsJoin(t, c2, "P2", room, mapName)
	return c1, c2, roomId
}

func waitForGame(t *testing.T, conn *websocket.Conn) map[string]interface{} {
	t.Helper()
	return waitState(t, conn, 20*time.Second, func(msg map[string]interface{}) bool {
		game, _ := msg["game"].(map[string]interface{})
		return game != nil && game["state"] == "game"
	})
}
