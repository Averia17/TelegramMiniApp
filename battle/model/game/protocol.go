package game

import (
	"encoding/json"
	"time"
)

type ClientMessage struct {
	Type  string          `json:"type"`
	Ts    int64           `json:"ts,omitempty"`
	Value json.RawMessage `json:"value,omitempty"`
}

type ServerMessage struct {
	Type   string      `json:"type"`
	Ts     int64       `json:"ts,omitempty"`
	Params interface{} `json:"params,omitempty"`
}

type GameStateJSON struct {
	State       string `json:"state"`
	RoomName    string `json:"roomName"`
	MapName     string `json:"mapName"`
	MaxPlayers  int    `json:"maxPlayers"`
	Mode        string `json:"mode"`
	LobbyEndsAt int64  `json:"lobbyEndsAt,omitempty"`
	GameEndsAt  int64  `json:"gameEndsAt,omitempty"`
}

type StateUpdate struct {
	Type     string                         `json:"type"`
	Ts       int64                          `json:"ts"`
	Game     GameStateJSON                  `json:"game"`
	Map      MapJSON                        `json:"map"`
	Players  map[string]PlayerJSON          `json:"players"`
	Monsters map[string]MonsterJSON         `json:"monsters"`
	Bullets  []BulletJSON                   `json:"bullets"`
	Props    []PropJSON                     `json:"props"`
}

type PlayerJSON struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Radius   float64 `json:"radius"`
	PlayerId string  `json:"playerId"`
	Name     string  `json:"name"`
	Lives    int     `json:"lives"`
	MaxLives int     `json:"maxLives"`
	Team     string  `json:"team,omitempty"`
	Color    string  `json:"color"`
	Kills    int     `json:"kills"`
	Rotation float64 `json:"rotation"`
	Ack      int64   `json:"ack"`
}

type MonsterJSON struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Radius   float64 `json:"radius"`
	Rotation float64 `json:"rotation"`
}

type BulletJSON struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Radius   float64 `json:"radius"`
	PlayerId string  `json:"playerId"`
	Team     string  `json:"team"`
	Rotation float64 `json:"rotation"`
	Active   bool    `json:"active"`
	Color    string  `json:"color"`
}

type PropJSON struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Radius float64 `json:"radius"`
	Type   string  `json:"type"`
	Active bool    `json:"active"`
}

type MapJSON struct {
	Width    float64    `json:"width"`
	Height   float64    `json:"height"`
	TileSize float64    `json:"tileSize"`
	Walls    []WallJSON `json:"walls"`
}

type WallJSON struct {
	MinX float64 `json:"minX"`
	MinY float64 `json:"minY"`
	MaxX float64 `json:"maxX"`
	MaxY float64 `json:"maxY"`
	Type string  `json:"type"`
}

type RoomJoinedParams struct {
	PlayerId   string `json:"playerId"`
	RoomId     string `json:"roomId"`
	RoomName   string `json:"roomName"`
	MapName    string `json:"mapName"`
	Mode       string `json:"mode"`
	MaxPlayers int    `json:"maxPlayers"`
}

type KillParams struct {
	KillerName string `json:"killerName"`
	KilledName string `json:"killedName"`
}

type WonParams struct {
	Name string `json:"name"`
}

type MatchFoundParams struct {
	RoomId string `json:"roomId"`
}

type ErrorParams struct {
	Message string `json:"message"`
}

func NewServerMessage(msgType string, params interface{}) *ServerMessage {
	return &ServerMessage{
		Type:   msgType,
		Ts:     time.Now().UnixMilli(),
		Params: params,
	}
}

func NewStateUpdate(g *GameStateJSON, m *MapJSON, players map[string]PlayerJSON, monsters map[string]MonsterJSON, bullets []BulletJSON, props []PropJSON) *StateUpdate {
	return &StateUpdate{
		Type:     "state",
		Ts:       time.Now().UnixMilli(),
		Game:     *g,
		Map:      *m,
		Players:  players,
		Monsters: monsters,
		Bullets:  bullets,
		Props:    props,
	}
}
