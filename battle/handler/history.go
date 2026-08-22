package handler

import (
	mroom "battle/model/room"
	"battle/provider"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	defaultBattleHistoryLimit = 20
	maxBattleHistoryLimit     = 50
)

type battleHistoryCursor struct {
	EndedAt int64  `json:"endedAt"`
	RoomID  string `json:"roomId"`
}

type battleHistoryResponse struct {
	Items      []battleHistoryItem `json:"items"`
	NextCursor string              `json:"nextCursor,omitempty"`
	HasMore    bool                `json:"hasMore"`
}

type battleHistoryItem struct {
	ID           string                     `json:"id"`
	FinishedAt   string                     `json:"finishedAt"`
	Mode         string                     `json:"mode"`
	MapName      string                     `json:"mapName"`
	Duration     int                        `json:"duration"`
	Place        int                        `json:"place,omitempty"`
	Kills        int                        `json:"kills"`
	Deaths       int                        `json:"deaths"`
	PlayerDamage int                        `json:"playerDamage,omitempty"`
	Won          bool                       `json:"won"`
	Draw         bool                       `json:"draw"`
	PartyMembers []battleHistoryPartyMember `json:"partyMembers,omitempty"`
}

type battleHistoryPartyMember struct {
	Name string `json:"name"`
	Hero string `json:"hero,omitempty"`
}

func encodeBattleHistoryCursor(cursor battleHistoryCursor) (string, error) {
	data, err := json.Marshal(cursor)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func decodeBattleHistoryCursor(value string) (battleHistoryCursor, error) {
	if value == "" {
		return battleHistoryCursor{}, nil
	}
	data, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return battleHistoryCursor{}, errors.New("invalid history cursor")
	}
	var cursor battleHistoryCursor
	if json.Unmarshal(data, &cursor) != nil || cursor.EndedAt <= 0 || cursor.RoomID == "" {
		return battleHistoryCursor{}, errors.New("invalid history cursor")
	}
	return cursor, nil
}

func (h *Handler) HandleBattleHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeBattleHistoryError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	playerID, err := authenticatedPlayerID(r)
	if err != nil {
		writeBattleHistoryError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	limit := defaultBattleHistoryLimit
	if rawLimit := r.URL.Query().Get("limit"); rawLimit != "" {
		limit, err = strconv.Atoi(rawLimit)
		if err != nil || limit < 1 || limit > maxBattleHistoryLimit {
			writeBattleHistoryError(w, http.StatusBadRequest, "limit must be between 1 and 50")
			return
		}
	}
	cursor, err := decodeBattleHistoryCursor(r.URL.Query().Get("cursor"))
	if err != nil {
		writeBattleHistoryError(w, http.StatusBadRequest, err.Error())
		return
	}
	results, err := mroom.ListBattleResultsForPlayer(playerID, cursor.EndedAt, cursor.RoomID, limit+1)
	if err != nil {
		writeBattleHistoryError(w, http.StatusServiceUnavailable, "battle history is temporarily unavailable")
		return
	}
	hasMore := len(results) > limit
	if hasMore {
		results = results[:limit]
	}
	items := make([]battleHistoryItem, 0, len(results))
	for _, result := range results {
		if item, ok := battleHistoryItemForPlayer(result, playerID); ok {
			items = append(items, item)
		}
	}
	response := battleHistoryResponse{Items: items, HasMore: hasMore}
	if hasMore && len(results) > 0 {
		last := results[len(results)-1]
		response.NextCursor, err = encodeBattleHistoryCursor(battleHistoryCursor{EndedAt: last.EndedAt, RoomID: last.RoomId})
		if err != nil {
			writeBattleHistoryError(w, http.StatusInternalServerError, "could not create history cursor")
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}

func authenticatedPlayerID(r *http.Request) (string, error) {
	value := strings.TrimSpace(r.Header.Get("Authorization"))
	parts := strings.SplitN(value, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || strings.TrimSpace(parts[1]) == "" {
		return "", errors.New("missing bearer token")
	}
	return verifyAccessToken(strings.TrimSpace(parts[1]))
}

func battleHistoryItemForPlayer(result *provider.BattleResult, playerID string) (battleHistoryItem, bool) {
	if result == nil {
		return battleHistoryItem{}, false
	}
	var local *provider.PlayerResult
	for index := range result.Players {
		if result.Players[index].PlayerId == playerID {
			local = &result.Players[index]
			break
		}
	}
	if local == nil {
		return battleHistoryItem{}, false
	}
	partyMembers := make([]battleHistoryPartyMember, 0)
	if local.PartyID != "" {
		for _, player := range result.Players {
			if player.PlayerId != playerID && player.PartyID == local.PartyID && player.Name != "" {
				partyMembers = append(partyMembers, battleHistoryPartyMember{Name: player.Name, Hero: player.Hero})
			}
		}
	}
	duration := int(result.Duration / 1000)
	if result.Duration > 0 && duration == 0 {
		duration = 1
	}
	return battleHistoryItem{
		ID:           result.RoomId,
		FinishedAt:   time.UnixMilli(result.EndedAt).UTC().Format(time.RFC3339Nano),
		Mode:         result.Mode,
		MapName:      result.MapName,
		Duration:     duration,
		Place:        battleHistoryPlace(*local),
		Kills:        local.Kills,
		Deaths:       local.Deaths,
		PlayerDamage: local.PlayerDamage,
		Won:          local.Won,
		Draw:         result.Draw,
		PartyMembers: partyMembers,
	}, true
}

func battleHistoryPlace(player provider.PlayerResult) int {
	if player.Place > 0 {
		return player.Place
	}
	if player.Won {
		return 1
	}
	return 0
}

func writeBattleHistoryError(w http.ResponseWriter, status int, message string) {
	http.Error(w, message, status)
}
