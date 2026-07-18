package handler

import (
	"battle/model/game"
	mroom "battle/model/room"
	sroom "battle/service/room"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Handler struct{}

func NewHandler() *Handler {
	return &Handler{}
}

func (h *Handler) SetupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/ws", h.HandleWebSocket)
	mux.HandleFunc("/health", h.HandleHealth)
	mux.HandleFunc("/heroes", h.HandleHeroes)
}

func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &mroom.Client{
		Id:   uuid.New().String(),
		Conn: conn,
		Send: make(chan []byte, 256),
	}

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

		var msg struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "join":
			HandleJoin(c, message)
		case "join_by_id":
			HandleJoinById(c, message)
		case "find_match":
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

func clientWritePump(c *mroom.Client) {
	defer c.Conn.Close()

	for message := range c.Send {
		if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
			break
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
		UserId     string `json:"userId"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		sendError(c, "Invalid join request")
		return
	}
	applyUserId(c, req.UserId)

	if req.RoomName == "" {
		req.RoomName = "room_" + c.Id[:8]
	}
	if req.RoomMap == "" {
		req.RoomMap = "arena"
	}
	if req.Mode == "" {
		req.Mode = "deathmatch"
	}
	if req.MaxPlayers <= 0 {
		req.MaxPlayers = 8
	} else if req.MaxPlayers > 8 {
		req.MaxPlayers = 8
	}
	if req.PlayerName == "" {
		req.PlayerName = c.Id[:8]
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
		UserId     string `json:"userId"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		sendError(c, "Invalid join request")
		return
	}
	applyUserId(c, req.UserId)

	if req.RoomId == "" {
		sendError(c, "Room ID required")
		return
	}
	if req.PlayerName == "" {
		req.PlayerName = c.Id[:8]
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
		UserId     string `json:"userId"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		sendError(c, "Invalid match request")
		return
	}
	applyUserId(c, req.UserId)

	if req.PlayerName == "" {
		req.PlayerName = c.Id[:8]
	}
	c.Name = req.PlayerName
	c.HeroName = req.HeroName

	sroom.AddToMatchQueue(c)
}

func applyUserId(c *mroom.Client, userId string) {
	if id, err := strconv.ParseInt(userId, 10, 64); err == nil && id > 0 {
		c.Id = userId
	}
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
