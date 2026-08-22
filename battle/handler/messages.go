package handler

import (
	"battle/model/game"
	mroom "battle/model/room"
	"battle/observability"
	"battle/provider"
	sroom "battle/service/room"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Battle snapshots repeat the same field names and metadata for every
	// player. Negotiate one uniform per-message deflate policy for all clients
	// so team matches do not pay the full JSON payload on every snapshot.
	EnableCompression: true,
	CheckOrigin: func(r *http.Request) bool {
		if strings.ToLower(os.Getenv("APP_ENV")) != "production" {
			return true
		}
		origin, err := url.Parse(r.Header.Get("Origin"))
		if err != nil || origin.Host == "" {
			return false
		}
		if strings.EqualFold(origin.Host, r.Host) {
			return true
		}
		for _, allowed := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
			if strings.EqualFold(strings.TrimSpace(allowed), origin.Scheme+"://"+origin.Host) {
				return true
			}
		}
		return false
	},
}

type Handler struct{}

var websocketWriteDurationBuckets = []float64{.001, .0025, .005, .01, .0167, .025, .05, .1, .25, .5, 1, 2.5}

func recordWebSocketWrite(registry *observability.Registry, duration time.Duration, bytes int, err error) {
	registry.IncCounter("battle_websocket_writes_total", "Outbound WebSocket messages written by the battle service", nil)
	registry.AddCounter("battle_websocket_write_bytes_total", "Outbound WebSocket payload bytes written by the battle service", float64(bytes), nil)
	registry.ObserveHistogram("battle_websocket_write_seconds", "Outbound WebSocket write duration in seconds", duration.Seconds(), websocketWriteDurationBuckets, nil)
	if duration >= 20*time.Millisecond {
		registry.IncCounter("battle_websocket_slow_writes_total", "Outbound WebSocket writes exceeding one simulation frame", nil)
	}
	if err != nil {
		registry.IncCounter("battle_websocket_write_errors_total", "Outbound WebSocket writes that failed", nil)
	}
}

func NewHandler() *Handler {
	return &Handler{}
}

func (h *Handler) SetupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/ws", h.HandleWebSocket)
	mux.HandleFunc("/health", h.HandleHealth)
	mux.HandleFunc("/heroes", h.HandleHeroes)
	mux.HandleFunc("/map-preview", h.HandleMapPreview)
	mux.HandleFunc("/history", h.HandleBattleHistory)
	mux.Handle("/metrics", observability.Default)
}

func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	observability.Default.IncCounter("battle_websocket_connections_total", "WebSocket connections accepted by the battle service", nil)
	observability.Default.AddGauge("battle_websocket_active", "Currently open battle WebSocket connections", 1, nil)

	client := &mroom.Client{
		Id: uuid.New().String(), Conn: conn, Send: make(chan []byte, 256), Handshake: make(chan []byte, 1), State: make(chan []byte, 1), MapRevision: -1,
	}
	conn.SetReadLimit(16 * 1024)
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))

	go clientWritePump(client)
	go clientReadPump(client)
}

func (h *Handler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}

func (h *Handler) HandleHeroes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	data, _ := json.Marshal(game.Heroes)
	w.Write(data)
}

func clientReadPump(c *mroom.Client) {
	defer func() {
		observability.Default.AddGauge("battle_websocket_active", "Currently open battle WebSocket connections", -1, nil)
		observability.Default.IncCounter("battle_websocket_disconnects_total", "Battle WebSocket connections closed", nil)
		teamParties.Leave(c.Id)
		if c.Room != nil {
			c.Room.Unregister <- c
		}
		c.Conn.Close()
	}()

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}
		observability.Default.IncCounter("battle_websocket_messages_total", "Inbound WebSocket messages received by the battle service", nil)
		now := time.Now()
		if c.MessageWindow.IsZero() || now.Sub(c.MessageWindow) >= time.Second {
			c.MessageWindow, c.MessageCount = now, 0
		}
		c.MessageCount++
		if c.MessageCount > 120 {
			observability.Default.IncCounter("battle_websocket_rate_limited_total", "WebSocket connections closed after exceeding the inbound message budget", nil)
			_ = c.Conn.WriteControl(
				websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "message rate exceeded"),
				time.Now().Add(time.Second),
			)
			return
		}

		var msg struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "auth":
			var request struct {
				Token string `json:"token"`
			}
			if json.Unmarshal(message, &request) != nil {
				sendError(c, "Invalid authentication request")
				return
			}
			userID, err := verifyAccessToken(request.Token)
			if err != nil {
				sendError(c, "Authentication failed")
				return
			}
			c.Id = userID
			c.AccessToken = request.Token
			c.Authenticated = true
			_ = c.Conn.SetReadDeadline(time.Time{})
		case "join":
			if !c.Authenticated {
				sendError(c, "Authentication required")
				continue
			}
			HandleJoin(c, message)
		case "join_by_id":
			if !c.Authenticated {
				sendError(c, "Authentication required")
				continue
			}
			HandleJoinById(c, message)
		case "recover_battle":
			if !c.Authenticated {
				sendError(c, "Authentication required")
				continue
			}
			HandleRecoverBattle(c, message)
		case "find_match":
			if !c.Authenticated {
				sendError(c, "Authentication required")
				continue
			}
			HandleFindMatch(c, message)
		case "party_create":
			if !c.Authenticated {
				sendError(c, "Authentication required")
				continue
			}
			HandlePartyCreate(c, message)
		case "party_join":
			if !c.Authenticated {
				sendError(c, "Authentication required")
				continue
			}
			HandlePartyJoin(c, message)
		case "party_leave":
			if !c.Authenticated {
				sendError(c, "Authentication required")
				continue
			}
			HandlePartyLeave(c)
		case "cancel_match":
			HandleCancelMatch(c)
		case "leave_battle":
			HandleLeaveBattle(c)
			return
		case "list_rooms":
			HandleListRooms(c)
		default:
			if c.Room != nil {
				c.Room.HandleMessage(c, message)
			}
		}
	}
}

func nextClientMessage(c *mroom.Client) ([]byte, bool) {
	// The room binding must win over snapshots. Without this dedicated lane a
	// tick can publish the first state before room_joined, leaving the frontend
	// to render an arbitrary player until the next snapshot arrives.
	select {
	case message, ok := <-c.Handshake:
		return message, ok
	default:
	}
	// State updates are latest-only and time-sensitive. Drain one before the
	// event channel so a burst of combat notifications cannot make snapshots
	// wait behind an unbounded Send queue.
	select {
	case message, ok := <-c.State:
		return message, ok
	default:
	}
	select {
	case message, ok := <-c.Handshake:
		return message, ok
	case message, ok := <-c.State:
		return message, ok
	case message, ok := <-c.Send:
		return message, ok
	}
}

func clientWritePump(c *mroom.Client) {
	defer c.Conn.Close()
	for {
		message, ok := nextClientMessage(c)
		if !ok {
			return
		}
		_ = c.Conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
		writeStarted := time.Now()
		err := c.Conn.WriteMessage(websocket.TextMessage, message)
		recordWebSocketWrite(observability.Default, time.Since(writeStarted), len(message), err)
		if err != nil {
			return
		}
	}
}

func HandleJoin(c *mroom.Client, data []byte) {
	var req struct {
		Type       string `json:"type"`
		PlayerName string `json:"playerName"`
		HeroName   string `json:"heroName"`
		RoomName   string `json:"roomName"`
		RoomMap    string `json:"roomMap"`
		MaxPlayers int    `json:"maxPlayers"`
		Mode       string `json:"mode"`
		PartyID    string `json:"partyId"`
		PartySize  int    `json:"partySize"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		sendError(c, "Invalid join request")
		return
	}

	if req.RoomName == "" {
		req.RoomName = "room_" + shortID(c.Id)
	}
	req.RoomName = boundedText(req.RoomName, 32)
	profile := mroom.NormalizeMatchProfile(req.Mode, req.RoomMap, req.MaxPlayers)
	if req.PlayerName == "" {
		req.PlayerName = shortID(c.Id)
	}
	req.PlayerName = boundedText(req.PlayerName, 32)
	req.HeroName = game.CanonicalHeroName(req.HeroName)
	if req.HeroName == "" {
		req.HeroName = "Needle"
	}

	r := mroom.GetOrCreateRoomFor(req.RoomName, req.RoomName, profile)
	c.Room = r
	c.Profile = profile
	c.Name = req.PlayerName
	c.HeroName = req.HeroName
	teamParties.Leave(c.Id)
	c.PartyID = ""
	c.PartySize = 0

	r.Register <- c

	sendRoomJoined(c, r)
}

func HandleJoinById(c *mroom.Client, data []byte) {
	var req struct {
		Type       string `json:"type"`
		RoomId     string `json:"roomId"`
		PlayerName string `json:"playerName"`
		HeroName   string `json:"heroName"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		sendError(c, "Invalid join request")
		return
	}

	if req.RoomId == "" {
		sendError(c, "Room ID required")
		return
	}
	if req.PlayerName == "" {
		req.PlayerName = shortID(c.Id)
	}
	req.PlayerName = boundedText(req.PlayerName, 32)
	req.HeroName = game.CanonicalHeroName(req.HeroName)
	if req.HeroName == "" {
		req.HeroName = "Needle"
	}

	r := mroom.FindRoom(req.RoomId)
	if r == nil {
		sendError(c, "Room not found")
		return
	}
	if !r.HasPlayer(c.Id) && c.PendingRoomID != req.RoomId {
		sendError(c, "Room access denied")
		return
	}
	c.PendingRoomID = ""

	c.Name = req.PlayerName
	c.HeroName = req.HeroName
	partyID := c.PartyID
	partySize := c.PartySize
	if r.HasPlayer(c.Id) {
		partyID = r.PartyIDForPlayer(c.Id)
		if partyID != "" && partySize <= 0 {
			partySize = mroom.DefaultPartyMaxSize
		}
	}
	teamParties.Leave(c.Id)
	c.PartyID = partyID
	c.PartySize = partySize
	if c.PartyID != "" {
		snapshot, err := teamParties.Join(c.PartyID, c.Id, c.PartySize)
		if err != nil {
			sendError(c, partyErrorMessage(err))
			return
		}
		c.PartySize = snapshot.MaxSize
	}
	c.Room = r

	r.Register <- c

	sendRoomJoined(c, r)
}

func HandleRecoverBattle(c *mroom.Client, data []byte) {
	var req struct {
		RoomID string `json:"roomId"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		sendError(c, "Invalid recovery request")
		return
	}
	if r := mroom.FindRoomForPlayer(c.Id, req.RoomID); r != nil {
		data, _ := json.Marshal(game.NewServerMessage("battle_recovered", map[string]interface{}{
			"status":   "active",
			"roomId":   r.Id,
			"playerId": c.Id,
		}))
		c.Send <- data
		return
	}

	result, err := mroom.GetLatestBattleResultForPlayer(c.Id)
	if err != nil {
		log.Printf("battle recovery result lookup error for player %s: %v", c.Id, err)
	}
	if result != nil {
		var playerResult *provider.PlayerResult
		for i := range result.Players {
			if result.Players[i].PlayerId == c.Id {
				candidate := result.Players[i]
				playerResult = &candidate
				break
			}
		}
		if playerResult != nil {
			data, _ := json.Marshal(game.NewServerMessage("battle_recovered", map[string]interface{}{
				"status":   "finished",
				"roomId":   result.RoomId,
				"playerId": c.Id,
				"result": map[string]interface{}{
					"won":                playerResult.Won,
					"winner":             result.Winner,
					"mode":               result.Mode,
					"duration":           result.Duration,
					"reason":             result.Reason,
					"draw":               result.Draw,
					"kills":              playerResult.Kills,
					"lives":              playerResult.Lives,
					"hero":               playerResult.Hero,
					"deaths":             playerResult.Deaths,
					"playerDamage":       playerResult.PlayerDamage,
					"towerDamage":        playerResult.TowerDamage,
					"townHallDamage":     playerResult.TownHallDamage,
					"towersDestroyed":    playerResult.TowersDestroyed,
					"townHallsDestroyed": playerResult.TownHallsDestroyed,
				},
			}))
			c.Send <- data
			return
		}
	}

	messageData, _ := json.Marshal(game.NewServerMessage("battle_recovered", map[string]interface{}{
		"status":   "none",
		"playerId": c.Id,
	}))
	c.Send <- messageData
}

func HandleFindMatch(c *mroom.Client, data []byte) {
	var req struct {
		Type        string `json:"type"`
		PlayerName  string `json:"playerName"`
		HeroName    string `json:"heroName"`
		RoomMap     string `json:"roomMap"`
		MaxPlayers  int    `json:"maxPlayers"`
		Mode        string `json:"mode"`
		PartyID     string `json:"partyId"`
		PartySize   int    `json:"partySize"`
		PartyTicket string `json:"partyTicket"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		sendError(c, "Invalid match request")
		return
	}

	if req.PlayerName == "" {
		req.PlayerName = shortID(c.Id)
	}
	req.PlayerName = boundedText(req.PlayerName, 32)
	req.HeroName = game.CanonicalHeroName(req.HeroName)
	if req.HeroName == "" {
		req.HeroName = "Needle"
	}
	c.Name = req.PlayerName
	c.HeroName = req.HeroName
	c.Profile = mroom.NormalizeMatchProfile(req.Mode, req.RoomMap, req.MaxPlayers)
	c.PartyID = ""
	c.PartySize = 0
	if c.Profile.Mode == game.ModeTeamDeathmatch {
		partyID := boundedText(req.PartyID, 64)
		if partyID != "" {
			claims, err := verifyBattleTicket(req.PartyTicket, partyID, c.Id)
			if err != nil {
				sendError(c, "Valid party battle ticket required")
				return
			}
			c.PartyID = claims.PartyID
			c.PartySize = claims.MaxSize
			if memberID := connectedPartyBattleMember(c.PartyID); memberID != "" {
				sendError(c, "Party member is already in battle")
				return
			}
			snapshot, err := teamParties.Join(c.PartyID, c.Id, c.PartySize)
			if err != nil {
				sendError(c, partyErrorMessage(err))
				return
			}
			if memberID := connectedPartyBattleMember(c.PartyID); memberID != "" {
				if memberID != c.Id {
					teamParties.Leave(c.Id)
				}
				sendError(c, "Party member is already in battle")
				return
			}
			c.PartySize = snapshot.MaxSize
			sendPartyState(c, snapshot)
		} else {
			c.PartySize = 1
		}
	}

	sroom.AddToMatchQueue(c)
}

func connectedPartyBattleMember(partyID string) string {
	snapshot, ok := teamParties.Snapshot(partyID)
	if !ok {
		return ""
	}
	for _, memberID := range snapshot.MemberIDs {
		if mroom.FindConnectedRoomForPlayer(memberID) != nil {
			return memberID
		}
	}
	return ""
}

func shortID(id string) string {
	if len(id) <= 8 {
		return id
	}
	return id[:8]
}

func boundedText(value string, maxRunes int) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) > maxRunes {
		runes = runes[:maxRunes]
	}
	return string(runes)
}

func HandleCancelMatch(c *mroom.Client) {
	sroom.RemoveFromMatchQueue(c.Id)
}

func HandleLeaveBattle(c *mroom.Client) {
	if c == nil {
		return
	}
	sroom.RemoveFromMatchQueue(c.Id)
	teamParties.Leave(c.Id)
	if c.Room != nil {
		room := c.Room
		c.Room = nil
		room.LeaveForReconnect(c)
	}
	c.PendingRoomID = ""
	c.PartyID = ""
	c.PartySize = 0
}

var teamParties = sroom.NewPartyRegistry()

func HandlePartyCreate(c *mroom.Client, data []byte) {
	sendError(c, "Party creation is managed by the party service")
}

func HandlePartyJoin(c *mroom.Client, data []byte) {
	var req struct {
		PartyID     string `json:"partyId"`
		PartyTicket string `json:"partyTicket"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		sendError(c, "Invalid party request")
		return
	}
	HandlePartyJoinRequest(c, boundedText(req.PartyID, 64), req.PartyTicket)
}

func HandlePartyJoinRequest(c *mroom.Client, partyID, ticket string) {
	claims, err := verifyBattleTicket(ticket, partyID, c.Id)
	if err != nil {
		sendError(c, "Valid party battle ticket required")
		return
	}
	snapshot, err := teamParties.Join(claims.PartyID, c.Id, claims.MaxSize)
	if err != nil {
		sendError(c, partyErrorMessage(err))
		return
	}
	c.PartyID = snapshot.ID
	c.PartySize = snapshot.MaxSize
	sendPartyState(c, snapshot)
}

func HandlePartyLeave(c *mroom.Client) {
	teamParties.Leave(c.Id)
	c.PartyID = ""
	c.PartySize = 0
	sendPartyState(c, sroom.PartySnapshot{MaxSize: mroom.DefaultPartyMaxSize})
}

func sendPartyState(c *mroom.Client, snapshot sroom.PartySnapshot) {
	data, _ := json.Marshal(game.NewServerMessage("party_state", game.PartyStateParams{
		PartyID: snapshot.ID, OwnerID: snapshot.OwnerID, MemberIDs: snapshot.MemberIDs,
		Count: snapshot.Count, MaxSize: snapshot.MaxSize,
	}))
	c.Send <- data
}

func partyErrorMessage(err error) string {
	switch err {
	case sroom.ErrPartyFull:
		return "Party is full"
	case sroom.ErrAlreadyInParty:
		return "You are already in another party"
	default:
		return "Party ID is required"
	}
}

func HandleListRooms(c *mroom.Client) {
	rooms, err := mroom.ListRoomsFromStore()
	if err != nil {
		sendError(c, "Failed to list rooms")
		return
	}

	type RoomListItem struct {
		RoomId      string `json:"roomId"`
		RoomName    string `json:"roomName"`
		MapName     string `json:"mapName"`
		Mode        string `json:"mode"`
		MaxPlayers  int    `json:"maxPlayers"`
		PlayerCount int    `json:"playerCount"`
		Status      string `json:"status"`
	}

	items := make([]RoomListItem, 0, len(rooms))
	for _, r := range rooms {
		items = append(items, RoomListItem{
			RoomId:      r.RoomId,
			RoomName:    r.RoomName,
			MapName:     r.MapName,
			Mode:        r.Mode,
			MaxPlayers:  r.MaxPlayers,
			PlayerCount: r.PlayerCount,
			Status:      r.Status,
		})
	}

	msg := game.NewServerMessage("room_list", items)
	msgData, _ := json.Marshal(msg)
	c.Send <- msgData
}

func sendRoomJoined(c *mroom.Client, r *mroom.Room) {
	mapRevision, mapReady := r.JoinSnapshot()
	mapID := ""
	if mapReady {
		mapID = r.MapName
	}
	params := game.RoomJoinedParams{
		PlayerId:    c.Id,
		RoomId:      r.Id,
		RoomName:    r.Name,
		MapName:     r.MapName,
		MapID:       mapID,
		MapRevision: mapRevision,
		Mode:        r.Mode,
		MaxPlayers:  r.MaxPlayers,
	}
	msg := game.NewServerMessage("room_joined", params)
	msgData, _ := json.Marshal(msg)
	if c.Handshake != nil {
		c.Handshake <- msgData
		return
	}
	// Keep lightweight/unit-test clients and older in-process callers working.
	c.Send <- msgData
}

func sendError(c *mroom.Client, msg string) {
	params := game.ErrorParams{Message: msg}
	data, _ := json.Marshal(game.NewServerMessage("error", params))
	c.Send <- data
}
