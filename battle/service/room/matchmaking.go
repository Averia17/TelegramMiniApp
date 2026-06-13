package room

import (
	"battle/model/game"
	"battle/model/room"
	"encoding/json"
	"sync"
	"time"
)

var matchQueue = &MatchQueue{}

func AddToMatchQueue(client *room.Client) {
	matchQueue.Add(client)
}

func RemoveFromMatchQueue(clientId string) {
	matchQueue.Remove(clientId)
}

type MatchQueue struct {
	queue []*room.Client
	mu    sync.Mutex
}

func (mq *MatchQueue) Add(client *room.Client) {
	mq.mu.Lock()
	defer mq.mu.Unlock()
	mq.queue = append(mq.queue, client)
	mq.tryMatch()
}

func (mq *MatchQueue) Remove(clientId string) {
	mq.mu.Lock()
	defer mq.mu.Unlock()
	for i, c := range mq.queue {
		if c.Id == clientId {
			mq.queue = append(mq.queue[:i], mq.queue[i+1:]...)
			return
		}
	}
}

func (mq *MatchQueue) tryMatch() {
	for len(mq.queue) >= 2 {
		p1 := mq.queue[0]
		p2 := mq.queue[1]
		mq.queue = mq.queue[2:]

		roomName := generateRoomId()
		r := room.GetOrCreateRoom(roomName, roomName, "small", "deathmatch", 8)

		data1, _ := json.Marshal(game.NewServerMessage("match_found", game.MatchFoundParams{RoomId: r.Id}))
		p1.Send <- data1

		data2, _ := json.Marshal(game.NewServerMessage("match_found", game.MatchFoundParams{RoomId: r.Id}))
		p2.Send <- data2
	}
}

func generateRoomId() string {
	b := make([]byte, 8)
	for i := range b {
		b[i] = "abcdefghijklmnopqrstuvwxyz0123456789"[time.Now().UnixNano()%36]
		time.Sleep(time.Nanosecond)
	}
	return string(b)
}
