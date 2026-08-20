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

	"battle/model/gamemap"
	mroom "battle/model/room"
	"battle/observability"
	"battle/provider"
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

func TestNextClientMessagePrioritizesRoomHandshake(t *testing.T) {
	client := &mroom.Client{
		Handshake: make(chan []byte, 1),
		Send:      make(chan []byte, 1),
		State:     make(chan []byte, 1),
	}
	client.Handshake <- []byte(`{"type":"room_joined","params":{"playerId":"p1"}}`)
	client.State <- []byte(`{"type":"state","players":{"p1":{"x":1,"y":2}}}`)

	message, ok := nextClientMessage(client)
	if !ok || string(message) != `{"type":"room_joined","params":{"playerId":"p1"}}` {
		t.Fatalf("next client message = %q, %v; want room_joined handshake, true", message, ok)
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

func TestHandleMapPreviewReturnsCanonicalBattleMap(t *testing.T) {
	h := NewHandler()
	// A caller-provided seed must not drift QA away from the gameplay arena.
	req := httptest.NewRequest(http.MethodGet, "/map-preview?seed=42", nil)
	w := httptest.NewRecorder()

	h.HandleMapPreview(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %v, want 200", w.Code)
	}
	var payload struct {
		Seed int64 `json:"seed"`
		Map  struct {
			ID       string  `json:"id"`
			Name     string  `json:"name"`
			Seed     int64   `json:"seed"`
			Revision int     `json:"revision"`
			Width    float64 `json:"width"`
			Height   float64 `json:"height"`
			TileSize float64 `json:"tileSize"`
			Walls    []struct {
				MinX           float64 `json:"minX"`
				MinY           float64 `json:"minY"`
				Blocking       bool    `json:"blocking"`
				Type           string  `json:"type"`
				ColliderInsetX float64 `json:"colliderInsetX"`
				ColliderInsetY float64 `json:"colliderInsetY"`
			} `json:"walls"`
		} `json:"map"`
		Spawners []struct {
			X      float64 `json:"x"`
			Y      float64 `json:"y"`
			Width  float64 `json:"width"`
			Height float64 `json:"height"`
		} `json:"spawners"`
	}
	if err := json.NewDecoder(w.Body).Decode(&payload); err != nil {
		t.Fatalf("decode map preview: %v", err)
	}
	canonical := gamemap.GenerateBattleRoyale(gamemap.CanonicalBattleRoyaleSeed)
	if payload.Map.ID != gamemap.CanonicalBattleRoyaleID || payload.Map.Name != "battle-royale" || payload.Map.Seed != gamemap.CanonicalBattleRoyaleSeed || payload.Map.Revision != 0 {
		t.Fatalf("preview identity = %#v, want canonical battle-royale revision 0", payload.Map)
	}
	if payload.Seed != gamemap.CanonicalBattleRoyaleSeed || payload.Map.Width != canonical.WidthInPixels || payload.Map.Height != canonical.HeightInPixels {
		t.Fatalf("preview header = %#v, want canonical seed %d and %.0fx%.0f", payload, gamemap.CanonicalBattleRoyaleSeed, canonical.WidthInPixels, canonical.HeightInPixels)
	}
	if payload.Map.TileSize != 40 || len(payload.Map.Walls) != len(canonical.Collisions) || len(payload.Spawners) != len(canonical.Spawners) {
		t.Fatalf("preview geometry = tile %.0f, walls %d, spawners %d; want tile 40, walls %d, spawners %d", payload.Map.TileSize, len(payload.Map.Walls), len(payload.Spawners), len(canonical.Collisions), len(canonical.Spawners))
	}
	if payload.Map.Walls[0].MinX != canonical.Collisions[0].MinX || payload.Map.Walls[0].MinY != canonical.Collisions[0].MinY || payload.Map.Walls[0].Type != canonical.Collisions[0].Type {
		t.Fatalf("first wall = %#v, want %.0f,%.0f,%s", payload.Map.Walls[0], canonical.Collisions[0].MinX, canonical.Collisions[0].MinY, canonical.Collisions[0].Type)
	}
	if !payload.Map.Walls[0].Blocking {
		t.Fatal("map preview did not publish the authoritative blocking flag")
	}
	foundSizedProp := false
	for _, wall := range payload.Map.Walls {
		if wall.Blocking && (wall.ColliderInsetX > 0 || wall.ColliderInsetY > 0) {
			foundSizedProp = true
			break
		}
	}
	if !foundSizedProp {
		t.Fatal("map preview did not publish any prop-sized collider insets")
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

	var roomID string
	for i := 0; i < 10; i++ {
		_, message, readErr := conn.ReadMessage()
		if readErr != nil {
			t.Fatalf("Read match error: %v", readErr)
		}
		if !strings.Contains(string(message), "match_found") {
			continue
		}
		var response struct {
			Params struct {
				RoomID string `json:"roomId"`
			} `json:"params"`
		}
		if err := json.Unmarshal(message, &response); err != nil {
			t.Fatalf("decode match response: %v", err)
		}
		roomID = response.Params.RoomID
		break
	}
	if roomID == "" {
		t.Fatal("matchmaking did not return a room id")
	}
	if err := conn.WriteJSON(map[string]string{"type": "join_by_id", "roomId": roomID, "playerName": "Matcher", "heroName": "Needle"}); err != nil {
		t.Fatalf("Write join_by_id: %v", err)
	}
	for i := 0; i < 10; i++ {
		_, message, readErr := conn.ReadMessage()
		if readErr != nil {
			t.Fatalf("Read room join error: %v", readErr)
		}
		if strings.Contains(string(message), "room_joined") {
			return
		}
	}
	t.Fatal("matched player could not join the room it was assigned")
}

func TestWebSocketJoinByIdRejectsPlayerOutsideRoom(t *testing.T) {
	h := NewHandler()
	mux := http.NewServeMux()
	h.SetupRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()
	mroom.ResetRooms()
	defer mroom.ResetRooms()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
	owner := dialAuthenticated(t, wsURL, 1010)
	defer owner.Close()
	if err := owner.WriteJSON(map[string]string{"type": "join", "roomName": "private-room", "roomMap": "small"}); err != nil {
		t.Fatalf("owner join: %v", err)
	}
	joined := false
	for i := 0; i < 5; i++ {
		_, message, err := owner.ReadMessage()
		if err != nil {
			t.Fatalf("owner read: %v", err)
		}
		if strings.Contains(string(message), "room_joined") {
			joined = true
			break
		}
	}
	if !joined {
		t.Fatal("owner did not join room")
	}

	foreign := dialAuthenticated(t, wsURL, 1011)
	defer foreign.Close()
	if err := foreign.WriteJSON(map[string]interface{}{
		"type": "join_by_id", "roomId": "private-room", "playerName": "Foreign",
	}); err != nil {
		t.Fatalf("foreign join: %v", err)
	}
	for i := 0; i < 5; i++ {
		_, message, err := foreign.ReadMessage()
		if err != nil {
			t.Fatalf("foreign read: %v", err)
		}
		if strings.Contains(string(message), "Room access denied") {
			return
		}
	}
	t.Fatal("foreign player was not rejected")
}

func TestHandleRecoverBattleReturnsActiveFinishedOrNone(t *testing.T) {
	mroom.ResetRooms()
	defer mroom.ResetRooms()
	store := provider.NewMockStore()
	mroom.SetStore(store)
	defer mroom.SetStore(nil)

	active := mroom.GetOrCreateRoom("active-recovery", "active-recovery", "small", "deathmatch", 4)
	active.State.PlayerAdd("active-player", "Active", "Needle")
	client := &mroom.Client{Id: "active-player", Send: make(chan []byte, 1)}
	HandleRecoverBattle(client, []byte(`{"roomId":"wrong-room"}`))
	var activeMessage map[string]interface{}
	if err := json.Unmarshal(<-client.Send, &activeMessage); err != nil {
		t.Fatalf("decode active recovery: %v", err)
	}
	if activeMessage["type"] != "battle_recovered" || activeMessage["params"].(map[string]interface{})["status"] != "active" {
		t.Fatalf("active recovery = %#v", activeMessage)
	}

	if err := store.SaveBattleResult(&provider.BattleResult{
		RoomId:   "finished-recovery",
		EndedAt:  100,
		Duration: 12500,
		Winner:   "Winner",
		Players: []provider.PlayerResult{{
			PlayerId: "finished-player", Won: true, Kills: 2, Deaths: 1,
			PlayerDamage: 400, TowerDamage: 900, TownHallDamage: 120,
			TowersDestroyed: 1,
		}},
	}); err != nil {
		t.Fatalf("save finished result: %v", err)
	}
	finishedClient := &mroom.Client{Id: "finished-player", Send: make(chan []byte, 1)}
	HandleRecoverBattle(finishedClient, []byte(`{"roomId":"missing-room"}`))
	var finishedMessage map[string]interface{}
	if err := json.Unmarshal(<-finishedClient.Send, &finishedMessage); err != nil {
		t.Fatalf("decode finished recovery: %v", err)
	}
	finishedParams := finishedMessage["params"].(map[string]interface{})
	finishedResult := finishedParams["result"].(map[string]interface{})
	if finishedParams["status"] != "finished" || finishedResult["won"] != true ||
		finishedResult["deaths"] != float64(1) || finishedResult["towerDamage"] != float64(900) ||
		finishedResult["towersDestroyed"] != float64(1) {
		t.Fatalf("finished recovery = %#v", finishedMessage)
	}

	noneClient := &mroom.Client{Id: "missing-player", Send: make(chan []byte, 1)}
	HandleRecoverBattle(noneClient, []byte(`{}`))
	var noneMessage map[string]interface{}
	if err := json.Unmarshal(<-noneClient.Send, &noneMessage); err != nil {
		t.Fatalf("decode empty recovery: %v", err)
	}
	if noneMessage["params"].(map[string]interface{})["status"] != "none" {
		t.Fatalf("empty recovery = %#v", noneMessage)
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
