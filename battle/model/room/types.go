package room

import (
	"battle/model/game"
	"github.com/gorilla/websocket"
	"sync"
)

type Client struct {
	Id          string
	Name        string
	HeroName    string
	Conn        *websocket.Conn
	Room        *Room
	Send        chan []byte
	MapRevision int
}

type Room struct {
	Id         string
	Name       string
	MapName    string
	Mode       string
	MaxPlayers int
	Clients    map[string]*Client
	State      *game.GameState
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client
	mu         sync.RWMutex
}
