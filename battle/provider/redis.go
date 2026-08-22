package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RoomRecord struct {
	RoomId      string `json:"roomId"`
	RoomName    string `json:"roomName"`
	MapName     string `json:"mapName"`
	Mode        string `json:"mode"`
	MaxPlayers  int    `json:"maxPlayers"`
	PlayerCount int    `json:"playerCount"`
	Status      string `json:"status"`
}

type PlayerRecord struct {
	PlayerId string `json:"playerId"`
	RoomId   string `json:"roomId"`
	Name     string `json:"name"`
}

var ctx = context.Background()

const (
	roomPrefix          = "battle:room:"
	roomListKey         = "battle:rooms"
	playerPrefix        = "battle:player:"
	roomPlayersKey      = "battle:room_players:"
	resultPrefix        = "battle:result:"
	playerResultsPrefix = "battle:player_results:"
	resultRetention     = 90 * 24 * time.Hour
)

type RedisProvider struct {
	client    *redis.Client
	connected bool
}

func NewRedisProvider(addr string) *RedisProvider {
	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: "",
		DB:       0,
	})

	connected := client.Ping(ctx).Err() == nil
	if connected {
		fmt.Printf("Redis connected: %s\n", addr)
	} else {
		fmt.Printf("Redis not available, running without persistence\n")
	}

	return &RedisProvider{
		client:    client,
		connected: connected,
	}
}

func (p *RedisProvider) SaveRoom(room *RoomRecord) error {
	if !p.connected {
		return nil
	}
	data, err := json.Marshal(room)
	if err != nil {
		return err
	}
	key := roomPrefix + room.RoomId
	pipe := p.client.Pipeline()
	pipe.Set(ctx, key, data, 30*time.Minute)
	pipe.SAdd(ctx, roomListKey, room.RoomId)
	_, err = pipe.Exec(ctx)
	return err
}

func (p *RedisProvider) GetRoom(roomId string) (*RoomRecord, error) {
	if !p.connected {
		return nil, fmt.Errorf("redis not available")
	}
	data, err := p.client.Get(ctx, roomPrefix+roomId).Bytes()
	if err != nil {
		return nil, err
	}
	var room RoomRecord
	if err := json.Unmarshal(data, &room); err != nil {
		return nil, err
	}
	return &room, nil
}

func (p *RedisProvider) ListRooms() ([]RoomRecord, error) {
	if !p.connected {
		return nil, nil
	}
	roomIds, err := p.client.SMembers(ctx, roomListKey).Result()
	if err != nil {
		return nil, err
	}
	var rooms []RoomRecord
	for _, id := range roomIds {
		room, err := p.GetRoom(id)
		if err != nil {
			continue
		}
		rooms = append(rooms, *room)
	}
	return rooms, nil
}

func (p *RedisProvider) AddPlayerToRoom(roomId string, player *PlayerRecord) error {
	if !p.connected {
		return nil
	}
	data, err := json.Marshal(player)
	if err != nil {
		return err
	}
	pipe := p.client.Pipeline()
	pipe.Set(ctx, playerPrefix+player.PlayerId, data, 30*time.Minute)
	pipe.SAdd(ctx, roomPlayersKey+roomId, player.PlayerId)
	room, err := p.GetRoom(roomId)
	if err == nil {
		room.PlayerCount++
		p.SaveRoom(room)
	}
	_, err = pipe.Exec(ctx)
	return err
}

func (p *RedisProvider) RemovePlayerFromRoom(roomId, playerId string) error {
	if !p.connected {
		return nil
	}
	pipe := p.client.Pipeline()
	pipe.Del(ctx, playerPrefix+playerId)
	pipe.SRem(ctx, roomPlayersKey+roomId, playerId)
	room, err := p.GetRoom(roomId)
	if err == nil {
		if room.PlayerCount > 0 {
			room.PlayerCount--
		}
		if room.PlayerCount == 0 {
			pipe.Del(ctx, roomPrefix+roomId)
			pipe.SRem(ctx, roomListKey, roomId)
		} else {
			data, _ := json.Marshal(room)
			pipe.Set(ctx, roomPrefix+roomId, data, 30*time.Minute)
		}
	}
	_, err = pipe.Exec(ctx)
	return err
}

func (p *RedisProvider) SaveBattleResult(result *BattleResult) error {
	if !p.connected || result == nil {
		return nil
	}
	data, err := json.Marshal(result)
	if err != nil {
		return err
	}
	pipe := p.client.Pipeline()
	pipe.Set(ctx, resultPrefix+result.RoomId, data, resultRetention)
	for _, player := range result.Players {
		pipe.ZAdd(ctx, playerResultsPrefix+player.PlayerId, redis.Z{Score: float64(result.EndedAt), Member: result.RoomId})
		pipe.Expire(ctx, playerResultsPrefix+player.PlayerId, resultRetention)
	}
	_, err = pipe.Exec(ctx)
	return err
}

func (p *RedisProvider) ListBattleResults(playerId string, beforeEndedAt int64, beforeRoomId string, limit int) ([]*BattleResult, error) {
	if !p.connected {
		return nil, fmt.Errorf("redis not available")
	}
	if limit <= 0 {
		limit = 20
	}
	// Fetch a small look-ahead window so the API can distinguish an exact page
	// from a page that has more records. The cursor filter below also handles
	// the rare case where two matches share the same millisecond timestamp.
	fetchLimit := int64(limit * 4)
	if fetchLimit < int64(limit+1) {
		fetchLimit = int64(limit + 1)
	}
	maxScore := "+inf"
	if beforeEndedAt > 0 {
		maxScore = fmt.Sprintf("%d", beforeEndedAt)
	}
	entries, err := p.client.ZRevRangeByScoreWithScores(ctx, playerResultsPrefix+playerId, &redis.ZRangeBy{
		Max:    maxScore,
		Min:    "-inf",
		Offset: 0,
		Count:  fetchLimit,
	}).Result()
	if err != nil {
		return nil, err
	}

	page := make([]*BattleResult, 0, limit)
	for _, entry := range entries {
		roomId, ok := entry.Member.(string)
		if !ok || (beforeEndedAt > 0 && (int64(entry.Score) > beforeEndedAt || (int64(entry.Score) == beforeEndedAt && roomId >= beforeRoomId))) {
			continue
		}
		data, err := p.client.Get(ctx, resultPrefix+roomId).Bytes()
		if err == redis.Nil {
			continue
		}
		if err != nil {
			return nil, err
		}
		var result BattleResult
		if err := json.Unmarshal(data, &result); err != nil {
			return nil, err
		}
		page = append(page, &result)
		if len(page) == limit {
			break
		}
	}
	return page, nil
}

func (p *RedisProvider) GetLatestBattleResult(playerId string) (*BattleResult, error) {
	if !p.connected {
		return nil, fmt.Errorf("redis not available")
	}
	roomIds, err := p.client.ZRevRange(ctx, playerResultsPrefix+playerId, 0, 0).Result()
	if err != nil {
		return nil, err
	}
	if len(roomIds) == 0 {
		return nil, nil
	}
	data, err := p.client.Get(ctx, resultPrefix+roomIds[0]).Bytes()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, err
	}
	var result BattleResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
