package provider

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/segmentio/kafka-go"
)

const BattleResultsTopic = "battle-results"

type KafkaProducer struct {
	writer *kafka.Writer
}

func NewKafkaProducer(brokerAddr string) *KafkaProducer {
	w := &kafka.Writer{
		Addr:         kafka.TCP(brokerAddr),
		Topic:        BattleResultsTopic,
		Balancer:     &kafka.LeastBytes{},
		RequiredAcks: kafka.RequireOne,
		Async:        false,
	}
	return &KafkaProducer{writer: w}
}

type BattleResult struct {
	RoomId                   string         `json:"roomId"`
	EndedAt                  int64          `json:"endedAt"`
	MapName                  string         `json:"mapName"`
	Mode                     string         `json:"mode"`
	Duration                 int64          `json:"duration"`
	Winner                   string         `json:"winner,omitempty"`
	Reason                   string         `json:"reason,omitempty"`
	Draw                     bool           `json:"draw"`
	CombatProfileID          string         `json:"combatProfileId"`
	CombatRulesVersion       string         `json:"combatRulesVersion"`
	CombatEventSchemaVersion int            `json:"combatEventSchemaVersion"`
	Players                  []PlayerResult `json:"players"`
}

type PlayerResult struct {
	PlayerId             string `json:"playerId"`
	PartyID              string `json:"partyId,omitempty"`
	Team                 string `json:"team,omitempty"`
	Name                 string `json:"name"`
	Hero                 string `json:"hero"`
	Kills                int    `json:"kills"`
	BasicDamage          int    `json:"basicDamage"`
	SkillDamage          int    `json:"skillDamage"`
	BasicOnlyKills       int    `json:"basicOnlyKills"`
	SkillAssistedKills   int    `json:"skillAssistedKills"`
	HealingDone          int    `json:"healingDone"`
	HealingBlocked       int    `json:"healingBlocked"`
	HealWindowMs         int64  `json:"healWindowMs"`
	ShieldProvided       int    `json:"shieldProvided"`
	DamagePrevented      int    `json:"damagePrevented"`
	Assists              int    `json:"assists"`
	ControlAppliedMs     int64  `json:"controlAppliedMs"`
	BatDamage            int    `json:"batDamage"`
	BatContests          int    `json:"batContests"`
	CubeClaims           int    `json:"cubeClaims"`
	EscapeSaves          int    `json:"escapeSaves"`
	TimeToFirstContactMs int64  `json:"timeToFirstContactMs"`
	CombatUptimeMs       int64  `json:"combatUptimeMs"`
	RespawnDowntimeMs    int64  `json:"respawnDowntimeMs"`
	UncontestedTravelMs  int64  `json:"uncontestedTravelMs"`
	Place                int    `json:"place,omitempty"`
	Lives                int    `json:"lives"`
	Deaths               int    `json:"deaths"`
	PlayerDamage         int    `json:"playerDamage"`
	TowerDamage          int    `json:"towerDamage"`
	TownHallDamage       int    `json:"townHallDamage"`
	TowersDestroyed      int    `json:"towersDestroyed"`
	TownHallsDestroyed   int    `json:"townHallsDestroyed"`
	Won                  bool   `json:"won"`
}

func (kp *KafkaProducer) PublishBattleResult(result *BattleResult) error {
	if kp == nil || kp.writer == nil {
		return nil
	}
	data, err := json.Marshal(result)
	if err != nil {
		log.Printf("Kafka marshal error: %v", err)
		return err
	}
	err = kp.writer.WriteMessages(context.Background(), kafka.Message{
		Key:   []byte(result.RoomId),
		Value: data,
	})
	if err != nil {
		log.Printf("Kafka publish error: %v", err)
	}
	return err
}

func (kp *KafkaProducer) Close() {
	if kp != nil && kp.writer != nil {
		kp.writer.Close()
	}
}

func NowMillis() int64 {
	return time.Now().UnixMilli()
}
