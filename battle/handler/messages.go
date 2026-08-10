package handler

import (
	"battle/model/game"
	mroom "battle/model/room"
	"battle/observability"
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
		Id: uuid.New().String(), Conn: conn, Send: make(chan []byte, 256), State: make(chan []byte, 1), MapRevision: -1,
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
		case "find_match":
			if !c.Authenticated {
				sendError(c, "Authentication required")
				continue
			}
			HandleFindMatch(c, message)
		case "cancel_match":
			HandleCancelMatch(c)
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
	// State updates are latest-only and time-sensitive. Drain one before the
	// event channel so a burst of combat notifications cannot make snapshots
	// wait behind an unbounded Send queue.
	select {
	case message, ok := <-c.State:
		return message, ok
	default:
	}
	select {
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
	}
	if err := json.Unmarshal(data, &req); err != nil {
		sendError(c, "Invalid join request")
		return
	}

	if req.RoomName == "" {
		req.RoomName = "room_" + shortID(c.Id)
	}
	req.RoomName = boundedText(req.RoomName, 32)
	if req.RoomMap != "small" && req.RoomMap != "battle-royale" {
		req.RoomMap = "battle-royale"
	}
	if req.Mode != string(game.ModeDeathmatch) && req.Mode != string(game.ModeTeamDeathmatch) {
		req.Mode = "deathmatch"
	}
	if req.MaxPlayers <= 0 {
		req.MaxPlayers = 8
	} else if req.MaxPlayers > 8 {
		req.MaxPlayers = 8
	}
	if req.PlayerName == "" {
		req.PlayerName = shortID(c.Id)
	}
	req.PlayerName = boundedText(req.PlayerName, 32)
	req.HeroName = game.CanonicalHeroName(req.HeroName)
	if req.HeroName == "" {
		req.HeroName = "Needle"
	}

	r := mroom.GetOrCreateRoom(req.RoomName, req.RoomName, req.RoomMap, req.Mode, req.MaxPlayers)
	c.Room = r
	c.Name = req.PlayerName
	c.HeroName = req.HeroName

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

	c.Room = r
	c.Name = req.PlayerName
	c.HeroName = req.HeroName

	r.Register <- c

	sendRoomJoined(c, r)
}

func HandleFindMatch(c *mroom.Client, data []byte) {
	var req struct {
		Type       string `json:"type"`
		PlayerName string `json:"playerName"`
		HeroName   string `json:"heroName"`
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

	sroom.AddToMatchQueue(c)
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
	params := game.RoomJoinedParams{
		PlayerId:   c.Id,
		RoomId:     r.Id,
		RoomName:   r.Name,
		MapName:    r.MapName,
		Mode:       r.Mode,
		MaxPlayers: r.MaxPlayers,
	}
	msg := game.NewServerMessage("room_joined", params)
	msgData, _ := json.Marshal(msg)
	c.Send <- msgData
}

func sendError(c *mroom.Client, msg string) {
	params := game.ErrorParams{Message: msg}
	data, _ := json.Marshal(game.NewServerMessage("error", params))
	c.Send <- data
}
