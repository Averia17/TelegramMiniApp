package model

type Score struct {
	PlayerId string `json:"playerId"`
	Name     string `json:"name"`
	Score    int    `json:"score"`
	Wins     int    `json:"wins"`
	Games    int    `json:"games"`
	Kills    int    `json:"kills"`
}

type PlayerProfile struct {
	Score
	Rank int `json:"rank"`
}

type BattleResult struct {
	RoomId   string         `json:"roomId"`
	EndedAt  int64          `json:"endedAt"`
	MapName  string         `json:"mapName"`
	Mode     string         `json:"mode"`
	Duration int64          `json:"duration"`
	Winner   string         `json:"winner,omitempty"`
	Players  []PlayerResult `json:"players"`
}

type PlayerResult struct {
	PlayerId string `json:"playerId"`
	PartyID  string `json:"partyId,omitempty"`
	Team     string `json:"team,omitempty"`
	Name     string `json:"name"`
	Hero     string `json:"hero"`
	Kills    int    `json:"kills"`
	Lives    int    `json:"lives"`
	Won      bool   `json:"won"`
}
