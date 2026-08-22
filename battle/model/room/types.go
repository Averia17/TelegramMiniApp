package room

import (
	"battle/model/game"
	"github.com/gorilla/websocket"
	"sync"
	"time"
)

type Client struct {
	Id          string
	AccessToken string
	Name        string
	HeroName    string
	Conn        *websocket.Conn
	Room        *Room
	Send        chan []byte
	// Handshake carries the room binding message separately from the latest-only
	// state queue. The writer must deliver it before any snapshot so the client
	// can identify its local player before rendering the first frame.
	Handshake     chan []byte
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
	PendingRoomID string
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

func (r *Room) hasActivePlayer(playerID string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.State == nil || r.State.State == game.GameStateFinished {
		return false
	}
	player, ok := r.State.Players[playerID]
	return ok && player != nil && !player.IsBot
}

func (r *Room) hasConnectedPlayer(playerID string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.State == nil || r.State.State == game.GameStateFinished {
		return false
	}
	if _, connected := r.Clients[playerID]; !connected {
		return false
	}
	player, ok := r.State.Players[playerID]
	return ok && player != nil && !player.IsBot
}

func (r *Room) HasPlayer(playerID string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.State == nil {
		return false
	}
	player, ok := r.State.Players[playerID]
	return ok && player != nil && !player.IsBot
}

func (r *Room) PartyIDForPlayer(playerID string) string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.State == nil {
		return ""
	}
	player, ok := r.State.Players[playerID]
	if !ok || player == nil {
		return ""
	}
	return player.PartyID
}

// JoinSnapshot returns the map metadata needed by the initial room_joined
// message without exposing GameState to concurrent transport readers.
func (r *Room) JoinSnapshot() (mapRevision int, mapReady bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.State == nil {
		return 0, false
	}
	return r.State.MapRevision, r.State.Map != nil
}
