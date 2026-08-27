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
	sroom "battle/service/room"
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

func TestHandleFindMatchRejectsPartyWithConnectedBattleMember(t *testing.T) {
	teamParties = sroom.NewPartyRegistry()
	mroom.ResetRooms()
	defer mroom.ResetRooms()

	profile := mroom.NormalizeMatchProfile("team deathmatch", "team-battle", 6)
	activeRoom := mroom.GetOrCreateRoomFor("active-party-battle", "active-party-battle", profile)
	activeClient := &mroom.Client{Id: "player-1", Name: "Still fighting", HeroName: "Needle", Send: make(chan []byte, 8), State: make(chan []byte, 1)}
	activeRoom.Register <- activeClient
	deadline := time.Now().Add(time.Second)
	for mroom.FindConnectedRoomForPlayer("player-1") != activeRoom {
		if time.Now().After(deadline) {
			t.Fatal("active client was not registered in time")
		}
		time.Sleep(time.Millisecond)
	}
	if _, err := teamParties.Join("party-active", "player-1", 3); err != nil {
		t.Fatal(err)
	}

	searching := &mroom.Client{Id: "player-2", Send: make(chan []byte, 1)}
	ticket := signedBattleTicket(t, battleTicketClaims{PartyID: "party-active", PlayerID: "player-2", Nonce: "battle-1", MaxSize: 3, Exp: time.Now().Add(time.Minute).Unix()})
	request, _ := json.Marshal(map[string]any{
		"type": "find_match", "playerName": "New battle", "heroName": "Kaze", "mode": "team deathmatch",
		"roomMap": "team-battle", "maxPlayers": 6, "partyId": "party-active", "partySize": 3, "partyTicket": ticket,
	})
	HandleFindMatch(searching, request)

	select {
	case message := <-searching.Send:
		if !strings.Contains(string(message), "Party member is already in battle") {
			t.Fatalf("error message = %s, want active party member conflict", message)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("matchmaking should reject a party with a connected battle member")
	}
}

func TestHandleFindMatchRejectsPartyWithDisconnectedBattleMember(t *testing.T) {
	teamParties = sroom.NewPartyRegistry()
	mroom.ResetRooms()
	defer mroom.ResetRooms()

	profile := mroom.NormalizeMatchProfile("team deathmatch", "team-battle", 6)
	activeRoom := mroom.GetOrCreateRoomFor("disconnected-party-battle", "disconnected-party-battle", profile)
	activeClient := &mroom.Client{Id: "player-1", Name: "Disconnected fighter", HeroName: "Needle", Send: make(chan []byte, 8), State: make(chan []byte, 1)}
	activeRoom.Register <- activeClient
	deadline := time.Now().Add(time.Second)
	for !activeRoom.HasPlayer("player-1") {
		if time.Now().After(deadline) {
			t.Fatal("active client was not registered in time")
		}
		time.Sleep(time.Millisecond)
	}
	activeRoom.LeaveForReconnect(activeClient)
	if _, err := teamParties.Join("party-disconnected", "player-1", 3); err != nil {
		t.Fatal(err)
	}

	searching := &mroom.Client{Id: "player-2", Send: make(chan []byte, 1)}
	ticket := signedBattleTicket(t, battleTicketClaims{PartyID: "party-disconnected", PlayerID: "player-2", Nonce: "battle-1", MaxSize: 3, Exp: time.Now().Add(time.Minute).Unix()})
	request, _ := json.Marshal(map[string]any{
		"type": "find_match", "playerName": "New battle", "heroName": "Kaze", "mode": "team deathmatch",
		"roomMap": "team-battle", "maxPlayers": 6, "partyId": "party-disconnected", "partySize": 3, "partyTicket": ticket,
	})
	HandleFindMatch(searching, request)

	select {
	case message := <-searching.Send:
		if !strings.Contains(string(message), "Party member is already in battle") {
			t.Fatalf("error message = %s, want disconnected active member conflict", message)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("matchmaking should reject a party with a disconnected active battle member")
	}
}

func TestHandleFindMatchAllowsDisconnectedPlayerToStartANewBattle(t *testing.T) {
	teamParties = sroom.NewPartyRegistry()
	mroom.ResetRooms()
	defer mroom.ResetRooms()

	activeRoom := mroom.GetOrCreateRoom("disconnected-player-battle", "disconnected-player-battle", "small", "deathmatch", 4)
	activeClient := &mroom.Client{Id: "player-1", Name: "Disconnected fighter", HeroName: "Needle", Send: make(chan []byte, 8), State: make(chan []byte, 1)}
	activeRoom.Register <- activeClient
	deadline := time.Now().Add(time.Second)
	for !activeRoom.HasPlayer("player-1") {
		if time.Now().After(deadline) {
			t.Fatal("active client was not registered in time")
		}
		time.Sleep(time.Millisecond)
	}
	activeRoom.LeaveForReconnect(activeClient)

	searching := &mroom.Client{Id: "player-1", Send: make(chan []byte, 1)}
	HandleFindMatch(searching, []byte(`{"type":"find_match","playerName":"New battle"}`))
	sroom.RemoveFromMatchQueue(searching.Id)

	select {
	case message := <-searching.Send:
		if strings.Contains(string(message), "Already in battle") {
			t.Fatalf("new matchmaking request was rejected: %s", message)
		}
	default:
	}
}

func TestHandleFindMatchClearsPreviousTeamAssignmentForSoloRematch(t *testing.T) {
	teamParties = sroom.NewPartyRegistry()
	mroom.ResetRooms()
	defer mroom.ResetRooms()

	client := &mroom.Client{
		Id: "player-1", Name: "Solo fighter", HeroName: "Needle", AssignedTeam: "Blue",
		Send: make(chan []byte, 8), State: make(chan []byte, 1),
	}
	HandleFindMatch(client, []byte(`{"type":"find_match","playerName":"Solo fighter","heroName":"Needle","mode":"deathmatch","roomMap":"small","maxPlayers":4}`))
	sroom.RemoveFromMatchQueue(client.Id)

	var matchFound struct {
		Type   string `json:"type"`
		Params struct {
			RoomID string `json:"roomId"`
		} `json:"params"`
	}
	select {
	case message := <-client.Send:
		if err := json.Unmarshal(message, &matchFound); err != nil {
			t.Fatalf("decode match result: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("solo matchmaking did not return a room")
	}
	if matchFound.Type != "match_found" || matchFound.Params.RoomID == "" {
		t.Fatalf("match result = %+v, want match_found with a room", matchFound)
	}

	join, _ := json.Marshal(map[string]any{
		"type": "join_by_id", "roomId": matchFound.Params.RoomID,
		"playerName": "Solo fighter", "heroName": "Needle",
	})
	HandleJoinById(client, join)
	room := mroom.FindRoom(matchFound.Params.RoomID)
	deadline := time.Now().Add(time.Second)
	for room == nil || !room.HasPlayer(client.Id) {
		if time.Now().After(deadline) {
			t.Fatal("solo player was not registered in the matched room")
		}
		time.Sleep(time.Millisecond)
	}

	player := room.State.Players[client.Id]
	if player.Team != "" || player.TeamLocked {
		t.Fatalf("solo rematch retained team assignment: team=%q locked=%v", player.Team, player.TeamLocked)
	}
}

func TestHandleJoinByIdAllowsNewBattleAfterIntentionalLeave(t *testing.T) {
	teamParties = sroom.NewPartyRegistry()
	mroom.ResetRooms()
	defer mroom.ResetRooms()

	oldRoom := mroom.GetOrCreateRoom("old-battle", "old-battle", "small", "deathmatch", 4)
	oldClient := &mroom.Client{Id: "player-1", Name: "Defeated fighter", HeroName: "Needle", Send: make(chan []byte, 8), State: make(chan []byte, 1)}
	oldRoom.Register <- oldClient
	deadline := time.Now().Add(time.Second)
	for !oldRoom.HasPlayer(oldClient.Id) {
		if time.Now().After(deadline) {
			t.Fatal("player was not registered in the old battle")
		}
		time.Sleep(time.Millisecond)
	}
	oldClient.Room = oldRoom

	HandleLeaveBattle(oldClient)
	for len(oldClient.Send) > 0 {
		<-oldClient.Send
	}

	client := &mroom.Client{Id: "player-1", Name: "New battle", HeroName: "Needle", Send: make(chan []byte, 8), State: make(chan []byte, 1)}
	HandleFindMatch(client, []byte(`{"type":"find_match","playerName":"New battle","heroName":"Needle"}`))
	var matchFound struct {
		Type   string `json:"type"`
		Params struct {
			RoomID string `json:"roomId"`
		} `json:"params"`
	}
	select {
	case message := <-client.Send:
		if err := json.Unmarshal(message, &matchFound); err != nil {
			t.Fatalf("decode match result: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("matchmaking did not return a room")
	}
	if matchFound.Type != "match_found" || matchFound.Params.RoomID == "" {
		t.Fatalf("match result = %+v, want a new room", matchFound)
	}

	HandleJoinById(client, []byte(`{"type":"join_by_id","roomId":"`+matchFound.Params.RoomID+`","playerName":"New battle","heroName":"Needle"}`))
	if room := mroom.FindRoom(matchFound.Params.RoomID); room == nil || !room.HasPlayer(client.Id) {
		t.Fatal("player could not join a new battle after leaving the old one")
	}
	for len(client.Send) > 0 {
		message := <-client.Send
		if strings.Contains(string(message), "Already in battle") {
			t.Fatalf("new battle join was rejected: %s", message)
		}
	}
}

func TestHandleRecoverBattleRestoresVoluntarilyLeftBattleByRoomId(t *testing.T) {
	mroom.ResetRooms()
	defer mroom.ResetRooms()

	room := mroom.GetOrCreateRoom("reconnectable-battle", "reconnectable-battle", "small", "deathmatch", 4)
	oldClient := &mroom.Client{Id: "player-1", Name: "Player", HeroName: "Needle", Send: make(chan []byte, 8), State: make(chan []byte, 1)}
	room.Register <- oldClient
	deadline := time.Now().Add(time.Second)
	for !room.HasPlayer(oldClient.Id) {
		if time.Now().After(deadline) {
			t.Fatal("player was not registered in the battle")
		}
		time.Sleep(time.Millisecond)
	}
	oldClient.Room = room
	HandleLeaveBattle(oldClient)

	client := &mroom.Client{Id: "player-1", Send: make(chan []byte, 8), State: make(chan []byte, 1)}
	HandleRecoverBattle(client, []byte(`{"type":"recover_battle","roomId":"reconnectable-battle"}`))

	select {
	case message := <-client.Send:
		var recovered map[string]any
		if err := json.Unmarshal(message, &recovered); err != nil {
			t.Fatalf("decode recovery response: %v", err)
		}
		params, _ := recovered["params"].(map[string]any)
		if recovered["type"] != "battle_recovered" || params["status"] != "active" || params["roomId"] != room.Id {
			t.Fatalf("recovery response = %s, want active room recovery", message)
		}
	case <-time.After(time.Second):
		t.Fatal("battle recovery did not return a response")
	}

	HandleJoinById(client, []byte(`{"type":"join_by_id","roomId":"reconnectable-battle","playerName":"Player","heroName":"Needle"}`))
	if client.Room != room || !room.HasPlayer(client.Id) {
		t.Fatal("voluntarily left player could not rejoin the battle by room id")
	}
}

func TestHandleJoinDoesNotMoveOneConnectionIntoTwoRooms(t *testing.T) {
	mroom.ResetRooms()
	defer mroom.ResetRooms()

	client := &mroom.Client{Id: "single-room-player", Authenticated: true, Send: make(chan []byte, 8)}
	HandleJoin(client, []byte(`{"type":"join","roomName":"first-room","roomMap":"small","mode":"deathmatch"}`))
	first := mroom.FindRoom("first-room")
	if first == nil || !first.HasPlayer(client.Id) {
		t.Fatal("first room join did not register the player")
	}

	HandleJoin(client, []byte(`{"type":"join","roomName":"second-room","roomMap":"small","mode":"deathmatch"}`))
	if second := mroom.FindRoom("second-room"); second != nil && second.HasPlayer(client.Id) {
		t.Fatal("one connection was registered in two rooms")
	}
	foundError := false
	for len(client.Send) > 0 {
		message := <-client.Send
		if strings.Contains(string(message), "Already in battle") {
			foundError = true
		}
	}
	if !foundError {
		t.Fatal("second room join did not report the active battle")
	}
}

func TestHandleFindMatchRejectsPartyIDWithoutBattleTicket(t *testing.T) {
	teamParties = sroom.NewPartyRegistry()
	searching := &mroom.Client{Id: "attacker", Send: make(chan []byte, 2)}

	HandleFindMatch(searching, []byte(`{"type":"find_match","playerName":"Attacker","heroName":"Kaze","mode":"team deathmatch","roomMap":"team-battle","maxPlayers":6,"partyId":"party-owned-by-someone-else","partySize":3}`))

	if _, ok := teamParties.Snapshot("party-owned-by-someone-else"); ok {
		t.Fatal("raw party id was accepted into battle party registry")
	}
	select {
	case message := <-searching.Send:
		if !strings.Contains(string(message), "battle ticket") {
			t.Fatalf("error message = %s, want battle ticket error", message)
		}
	default:
		t.Fatal("missing party ticket error")
	}
}

func TestHandleLeaveBattleRemovesOnlyBattleSessionMembership(t *testing.T) {
	teamParties = sroom.NewPartyRegistry()
	if _, err := teamParties.Join("party-leave", "player-1", 3); err != nil {
		t.Fatal(err)
	}

	client := &mroom.Client{Id: "player-1", PendingRoomID: "old-room", PartyID: "party-leave", PartySize: 3, AssignedTeam: "Red", Send: make(chan []byte, 1)}
	HandleLeaveBattle(client)

	if _, ok := teamParties.Snapshot("party-leave"); ok {
		t.Fatal("intentional leave kept the player in the battle party session")
	}
	if client.PendingRoomID != "" || client.PartyID != "" || client.PartySize != 0 || client.AssignedTeam != "" {
		t.Fatalf("client battle session fields = %+v, want cleared", client)
	}
	select {
	case message := <-client.Send:
		if !strings.Contains(string(message), "battle_left") || !strings.Contains(string(message), "left_voluntarily") {
			t.Fatalf("leave acknowledgement = %s, want battle_left", message)
		}
	default:
		t.Fatal("intentional leave did not acknowledge battle cleanup")
	}
}

func TestHandleJoinByIdRestoresPartySessionForManualRecovery(t *testing.T) {
	teamParties = sroom.NewPartyRegistry()
	mroom.ResetRooms()
	defer mroom.ResetRooms()

	profile := mroom.NormalizeMatchProfile("team deathmatch", "team-battle", 6)
	activeRoom := mroom.GetOrCreateRoomFor("recover-party-battle", "recover-party-battle", profile)
	activeRoom.State.PlayerAdd("player-1", "Returning player", "Needle")
	activeRoom.State.Players["player-1"].PartyID = "party-recover"

	client := &mroom.Client{Id: "player-1", Send: make(chan []byte, 8)}
	HandleJoinById(client, []byte(`{"type":"join_by_id","roomId":"recover-party-battle","playerName":"Returning player","heroName":"Needle"}`))

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if snapshot, ok := teamParties.Snapshot("party-recover"); ok && len(snapshot.MemberIDs) == 1 && snapshot.MemberIDs[0] == "player-1" {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("manual recovery did not restore the player's party battle session")
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
	token := signedAccessToken(t, userID)

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

func signedAccessToken(t *testing.T, userID int64) string {
	t.Helper()
	const secret = "test-auth-secret-with-at-least-32-characters"
	t.Setenv("APP_AUTH_SECRET", secret)
	payload, _ := json.Marshal(map[string]int64{"sub": userID, "exp": time.Now().Add(time.Minute).Unix()})
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
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

func TestHandleMapPreviewReturnsSelectedTeamMapVariant(t *testing.T) {
	h := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/map-preview?mode=team&map=team-battle", nil)
	w := httptest.NewRecorder()
	h.HandleMapPreview(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %v, want 200", w.Code)
	}
	var payload mapPreviewResponse
	if err := json.NewDecoder(w.Body).Decode(&payload); err != nil {
		t.Fatalf("decode team map preview: %v", err)
	}
	classic := gamemap.GenerateTeamBattleClassic(gamemap.CanonicalTeamBattleSeed)
	if payload.Map.ID != gamemap.CanonicalTeamBattleClassicID || payload.Map.Name != "team-battle" || payload.Seed != gamemap.CanonicalTeamBattleSeed {
		t.Fatalf("classic team preview identity = %#v, seed %d", payload.Map, payload.Seed)
	}
	if len(payload.Map.Features) != len(classic.Features) || len(payload.Map.Walls) != len(classic.Collisions) {
		t.Fatalf("classic team preview geometry = features %d walls %d; want %d/%d", len(payload.Map.Features), len(payload.Map.Walls), len(classic.Features), len(classic.Collisions))
	}

	req = httptest.NewRequest(http.MethodGet, "/map-preview?mode=team&map=team-battle-northern", nil)
	w = httptest.NewRecorder()
	h.HandleMapPreview(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("northern status = %v, want 200", w.Code)
	}
	payload = mapPreviewResponse{}
	if err := json.NewDecoder(w.Body).Decode(&payload); err != nil {
		t.Fatalf("decode northern team map preview: %v", err)
	}
	northern := gamemap.GenerateTeamBattle(gamemap.CanonicalTeamBattleNorthernSeed)
	if payload.Map.ID != gamemap.CanonicalTeamBattleNorthernID || payload.Map.Name != "team-battle-northern" || payload.Seed != gamemap.CanonicalTeamBattleNorthernSeed {
		t.Fatalf("northern team preview identity = %#v, seed %d", payload.Map, payload.Seed)
	}
	if len(payload.Map.Features) != len(northern.Features) || len(payload.Map.Walls) != len(northern.Collisions) {
		t.Fatalf("northern team preview geometry = features %d walls %d; want %d/%d", len(payload.Map.Features), len(payload.Map.Walls), len(northern.Features), len(northern.Collisions))
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

func TestWebSocketRejectsRepeatedAuthentication(t *testing.T) {
	h := NewHandler()
	mux := http.NewServeMux()
	h.SetupRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
	conn := dialAuthenticated(t, wsURL, 1011)
	defer conn.Close()

	if err := conn.WriteJSON(map[string]string{"type": "auth", "token": signedAccessToken(t, 1012)}); err != nil {
		t.Fatalf("repeated auth write error: %v", err)
	}
	_ = conn.SetReadDeadline(time.Now().Add(time.Second))
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("repeated auth read error: %v", err)
		}
		if strings.Contains(string(message), "Authentication already completed") {
			return
		}
	}
}

func TestWebSocketUpgradeNegotiatesPerMessageCompression(t *testing.T) {
	h := NewHandler()
	mux := http.NewServeMux()
	h.SetupRoutes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
	dialer := websocket.Dialer{EnableCompression: true}
	conn, response, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("compressed WebSocket dial error: %v", err)
	}
	defer conn.Close()

	if !strings.Contains(response.Header.Get("Sec-WebSocket-Extensions"), "permessage-deflate") {
		t.Fatalf("compression extension = %q, want permessage-deflate", response.Header.Get("Sec-WebSocket-Extensions"))
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
