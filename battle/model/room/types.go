package room

import (
	"battle/model/game"
	"errors"
	"github.com/gorilla/websocket"
	"sync"
	"time"
)

var (
	ErrRoomFull     = errors.New("room is full")
	ErrRoomFinished = errors.New("room has finished")
)

type BattleSessionStatus string

const (
	BattleSessionActive          BattleSessionStatus = "active"
	BattleSessionDisconnected    BattleSessionStatus = "disconnected"
	BattleSessionLeftVoluntarily BattleSessionStatus = "left_voluntarily"
	BattleSessionFinished        BattleSessionStatus = "finished"
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
	Handshake      chan []byte
	State          chan []byte
	MapRevision    int
	MapSyncFrames  int
	Authenticated  bool
	MessageWindow  time.Time
	MessageCount   int
	LastTauntAt    int64
	Profile        MatchProfile
	PartyID        string
	PartySize      int
	AssignedTeam   string
	PendingRoomID  string
	RegisterResult chan error
	sendMu         sync.RWMutex
	sendClosed     bool
}

// TrySend is the single non-blocking write path for server-owned client
// queues. Room teardown can close Send while handlers and matchmaking are
// still finishing a request; the read lock makes close/send atomic and avoids
// a transport race turning into a process-wide panic.
func (c *Client) TrySend(data []byte) (sent bool) {
	if c == nil {
		return false
	}
	c.sendMu.RLock()
	defer c.sendMu.RUnlock()
	if c.Send == nil || c.sendClosed {
		return false
	}
	select {
	case c.Send <- data:
		return true
	default:
		return false
	}
}

func (c *Client) CloseSend() {
	if c == nil {
		return
	}
	c.sendMu.Lock()
	defer c.sendMu.Unlock()
	if c.Send != nil && !c.sendClosed {
		close(c.Send)
		c.sendClosed = true
	}
}

type Room struct {
	Id           string
	Name         string
	MapName      string
	Mode         string
	MaxPlayers   int
	Clients      map[string]*Client
	Disconnected map[string]time.Time
	PlayerStates map[string]BattleSessionStatus
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
	if status, ok := r.PlayerStates[playerID]; ok && (status == BattleSessionLeftVoluntarily || status == BattleSessionFinished) {
		return false
	}
	player, ok := r.State.Players[playerID]
	return ok && player != nil && !player.IsBot
}

func (r *Room) hasJoinablePlayer(playerID string) bool {
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
	if status, ok := r.PlayerStates[playerID]; ok && status != BattleSessionActive {
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
	if status, ok := r.PlayerStates[playerID]; ok && status == BattleSessionFinished {
		return false
	}
	if r.State.State == game.GameStateFinished {
		return false
	}
	player, ok := r.State.Players[playerID]
	return ok && player != nil && !player.IsBot
}

func (r *Room) PlayerStatus(playerID string) BattleSessionStatus {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.PlayerStates[playerID]
}

func (r *Room) MonsterCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.State == nil {
		return 0
	}
	return len(r.State.Monsters)
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
