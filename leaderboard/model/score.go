package model

type Score struct {
	PlayerId string `json:"playerId"`
	Name     string `json:"name"`
	Score    int    `json:"score"`
	Wins     int    `json:"wins"`
	Games    int    `json:"games"`
}

type BattleResult struct {
	RoomId   string         `json:"roomId"`
	MapName  string         `json:"mapName"`
	Mode     string         `json:"mode"`
	Duration int64          `json:"duration"`
	Winner   string         `json:"winner,omitempty"`
	Players  []PlayerResult `json:"players"`
}

type PlayerResult struct {
	PlayerId string `json:"playerId"`
	Name     string `json:"name"`
	Hero     string `json:"hero"`
	Kills    int    `json:"kills"`
	Lives    int    `json:"lives"`
	Won      bool   `json:"won"`
}
