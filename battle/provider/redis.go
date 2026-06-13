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
	CreatedAt   int64  `json:"createdAt"`
}

type PlayerRecord struct {
	PlayerId string `json:"playerId"`
	RoomId   string `json:"roomId"`
	Name     string `json:"name"`
	JoinedAt int64  `json:"joinedAt"`
}

var ctx = context.Background()

const (
	roomPrefix     = "battle:room:"
	roomListKey    = "battle:rooms"
	playerPrefix   = "battle:player:"
	roomPlayersKey = "battle:room_players:"
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

func (p *RedisProvider) UpdateRoom(room *RoomRecord) error {
	return p.SaveRoom(room)
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
