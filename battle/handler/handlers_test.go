package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

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
	ts := httptest.NewServer(mux)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"

	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial error: %v", err)
	}
	defer conn.Close()

	joinMsg := `{"type":"join","playerName":"TestPlayer","roomName":"test1","roomMap":"small","maxPlayers":4,"mode":"deathmatch"}`
	err = conn.WriteMessage(websocket.TextMessage, []byte(joinMsg))
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

	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial error: %v", err)
	}
	defer conn.Close()

	joinMsg := `{"type":"join"}`
	err = conn.WriteMessage(websocket.TextMessage, []byte(joinMsg))
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

	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial error: %v", err)
	}
	defer conn.Close()

	findMsg := `{"type":"find_match","playerName":"Matcher"}`
	err = conn.WriteMessage(websocket.TextMessage, []byte(findMsg))
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

	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial error: %v", err)
	}
	defer conn.Close()

	err = conn.WriteMessage(websocket.TextMessage, []byte(`not json`))
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

	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial error: %v", err)
	}
	defer conn.Close()

	joinMsg := `{"type":"join","playerName":"Mover","roomName":"movetest","roomMap":"small","mode":"deathmatch"}`
	err = conn.WriteMessage(websocket.TextMessage, []byte(joinMsg))
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
	dialer := websocket.Dialer{}

	conn1, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Client 1 dial: %v", err)
	}
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

	conn2, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Client 2 dial: %v", err)
	}
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
