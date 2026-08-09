package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	mroom "battle/model/room"
	"battle/observability"
	"github.com/gorilla/websocket"
)

func TestNextClientMessagePrioritizesFreshState(t *testing.T) {
	client := &mroom.Client{
		Send:  make(chan []byte, 1),
		State: make(chan []byte, 1),
	}
	client.Send <- []byte("event")
	client.State <- []byte("state")

	message, ok := nextClientMessage(client)
	if !ok || string(message) != "state" {
		t.Fatalf("next client message = %q, %v; want state, true", message, ok)
	}
}

func TestRecordWebSocketWritePublishesDurationAndSlowSignal(t *testing.T) {
	registry := observability.NewRegistry()
	recordWebSocketWrite(registry, 25*time.Millisecond, 4096, nil)
	recordWebSocketWrite(registry, 1*time.Millisecond, 128, assertWriteError{})

	metrics := httptest.NewRecorder()
	registry.ServeHTTP(metrics, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := metrics.Body.String()
	for _, want := range []string{
		"battle_websocket_writes_total 2",
		"battle_websocket_write_bytes_total 4224",
		"battle_websocket_write_seconds_count 2",
		"battle_websocket_slow_writes_total 1",
		"battle_websocket_write_errors_total 1",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("WebSocket write metric missing %q:\n%s", want, body)
		}
	}
}

type assertWriteError struct{}

func (assertWriteError) Error() string { return "write failed" }

func dialAuthenticated(t *testing.T, wsURL string, userID int64) *websocket.Conn {
	t.Helper()
	const secret = "test-auth-secret-with-at-least-32-characters"
	t.Setenv("APP_AUTH_SECRET", secret)
	payload, _ := json.Marshal(map[string]int64{"sub": userID, "exp": time.Now().Add(time.Minute).Unix()})
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(encoded))
	token := encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial error: %v", err)
	}
	if err := conn.WriteJSON(map[string]string{"type": "auth", "token": token}); err != nil {
		conn.Close()
		t.Fatalf("WebSocket auth error: %v", err)
	}
	return conn
}

func TestHandleHealth(t *testing.T) {
	h := NewHandler()
	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	h.HandleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %v, want 200", w.Code)
	}

	body := w.Body.String()
	if !strings.Contains(body, `"status":"ok"`) {
		t.Errorf("body = %v, want contains status:ok", body)
	}

	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type = %v, want application/json", ct)
	}
}

func TestNewHandler(t *testing.T) {
	h := NewHandler()
	if h == nil {
		t.Fatal("NewHandler returned nil")
	}

	mux := http.NewServeMux()
	h.SetupRoutes(mux)

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET /health: status = %v, want 200", w.Code)
	}
}

func TestWebSocketUpgrade(t *testing.T) {
	h := NewHandler()
	mux := http.NewServeMux()
	h.SetupRoutes(mux)
	ts := httptest.NewServer(observability.HTTPMiddleware(observability.NewRegistry(), mux))
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"

	conn := dialAuthenticated(t, wsURL, 1001)
	defer conn.Close()

	joinMsg := `{"type":"join","playerName":"TestPlayer","roomName":"test1","roomMap":"small","maxPlayers":4,"mode":"deathmatch"}`
	err := conn.WriteMessage(websocket.TextMessage, []byte(joinMsg))
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}

	found := false
	for i := 0; i < 5; i++ {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("Read error: %v", err)
		}
		resp := string(msg)
		if strings.Contains(resp, "room_joined") {
			found = true
			if !strings.Contains(resp, "test1") {
				t.Errorf("response = %v, want contain room name 'test1'", resp)
			}
			break
		}
	}

	if !found {
		t.Error("did not receive room_joined message")
	}
}

func TestWebSocketJoinDefaults(t *testing.T) {
	h := NewHandler()
	mux := http.NewServeMux()
	h.SetupRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"

	conn := dialAuthenticated(t, wsURL, 1002)
	defer conn.Close()

	joinMsg := `{"type":"join"}`
	err := conn.WriteMessage(websocket.TextMessage, []byte(joinMsg))
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}

	found := false
	for i := 0; i < 5; i++ {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("Read error: %v", err)
		}
		resp := string(msg)
		if strings.Contains(resp, "room_joined") {
			found = true
			break
		}
	}

	if !found {
		t.Error("did not receive room_joined message")
	}
}

func TestWebSocketFindMatch(t *testing.T) {
	h := NewHandler()
	mux := http.NewServeMux()
	h.SetupRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"

	conn := dialAuthenticated(t, wsURL, 1003)
	defer conn.Close()

	findMsg := `{"type":"find_match","playerName":"Matcher"}`
	err := conn.WriteMessage(websocket.TextMessage, []byte(findMsg))
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
}

func TestWebSocketInvalidJSON(t *testing.T) {
	h := NewHandler()
	mux := http.NewServeMux()
	h.SetupRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"

	conn := dialAuthenticated(t, wsURL, 1004)
	defer conn.Close()

	err := conn.WriteMessage(websocket.TextMessage, []byte(`not json`))
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}

	err = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"join","playerName":"Recovery"}`))
	if err != nil {
		t.Fatalf("Write after invalid should succeed: %v", err)
	}
}

func TestWebSocketMove(t *testing.T) {
	h := NewHandler()
	mux := http.NewServeMux()
	h.SetupRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"

	conn := dialAuthenticated(t, wsURL, 1005)
	defer conn.Close()

	joinMsg := `{"type":"join","playerName":"Mover","roomName":"movetest","roomMap":"small","mode":"deathmatch"}`
	err := conn.WriteMessage(websocket.TextMessage, []byte(joinMsg))
	if err != nil {
		t.Fatalf("Write join: %v", err)
	}

	for i := 0; i < 5; i++ {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("Read error: %v", err)
		}
		if strings.Contains(string(msg), "room_joined") {
			break
		}
	}

	moveMsg := `{"type":"move","ts":1000,"value":{"x":1,"y":0}}`
	err = conn.WriteMessage(websocket.TextMessage, []byte(moveMsg))
	if err != nil {
		t.Fatalf("Write move: %v", err)
	}
}

func TestWebSocketMultipleClients(t *testing.T) {
	h := NewHandler()
	mux := http.NewServeMux()
	h.SetupRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
	conn1 := dialAuthenticated(t, wsURL, 1006)
	defer conn1.Close()

	joinMsg1 := `{"type":"join","playerName":"P1","roomName":"multitest","roomMap":"small","mode":"deathmatch"}`
	conn1.WriteMessage(websocket.TextMessage, []byte(joinMsg1))

	for i := 0; i < 5; i++ {
		_, msg, err := conn1.ReadMessage()
		if err != nil {
			t.Fatalf("Client 1 read: %v", err)
		}
		if strings.Contains(string(msg), "room_joined") {
			break
		}
	}

	conn2 := dialAuthenticated(t, wsURL, 1007)
	defer conn2.Close()

	joinMsg2 := `{"type":"join","playerName":"P2","roomName":"multitest","roomMap":"small","mode":"deathmatch"}`
	conn2.WriteMessage(websocket.TextMessage, []byte(joinMsg2))

	for i := 0; i < 5; i++ {
		_, msg, err := conn2.ReadMessage()
		if err != nil {
			t.Fatalf("Client 2 read: %v", err)
		}
		if strings.Contains(string(msg), "room_joined") {
			break
		}
	}
}
