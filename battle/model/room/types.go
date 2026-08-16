package room

import (
	"battle/model/game"
	"github.com/gorilla/websocket"
	"sync"
	"time"
)

type Client struct {
	Id            string
	AccessToken   string
	Name          string
	HeroName      string
	Conn          *websocket.Conn
	Room          *Room
	Send          chan []byte
	State         chan []byte
	MapRevision   int
	MapSyncFrames int
	Authenticated bool
	MessageWindow time.Time
	MessageCount  int
	LastTauntAt   int64
	Profile       MatchProfile
	PartyID       string
	PartySize     int
	AssignedTeam  string
}

type Room struct {
	Id           string
	Name         string
	MapName      string
	Mode         string
	MaxPlayers   int
	Clients      map[string]*Client
	Disconnected map[string]time.Time
	State        *game.GameState
	Broadcast    chan []byte
	Register     chan *Client
	Unregister   chan *Client
	TauntSpender TauntSpender
	mu           sync.RWMutex
}
