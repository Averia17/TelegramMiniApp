package game

import (
	"battle/model/bullet"
	"battle/model/gamemap"
	"battle/model/monster"
	"battle/model/player"
	"battle/model/prop"
	"battle/service/geometry"
	"time"
)

const (
	GameStateWaiting  = "waiting"
	GameStateLobby    = "lobby"
	GameStateGame     = "game"
	GameStateFinished = "finished"

	BattlePhaseSpeed = 2
	LobbyDuration    = 10 * time.Second / BattlePhaseSpeed
	GameDuration     = 5 * time.Minute / BattlePhaseSpeed

	FlasksCount      = 8
	LunarCratesCount = 12
	MonstersCount    = 5

	PlayerSize = 32.0

	BulletSize  = 8.0
	BulletSpeed = 4.0
	BulletRate  = 800

	FlaskSize = 24.0
	TileSize  = 40.0
	MaxBots   = 3

	SpawnProtectionDuration = 3 * time.Second
	BotCombatGraceDuration  = 5 * time.Second
	BotNavigationProbe      = 28.0
	BotVisionRange          = 620.0
	BotRevealRange          = 900.0
	BotPathRefreshInterval  = 240 * time.Millisecond
	AttackRateScale         = 1.55
	ReloadTimeScale         = 1.22
	// Public hero stats stay compact for the UX; these keep their combat pace
	// in the same world-unit range as before the catalog compaction.
	RuntimeMovementSpeedScale   = 12.0
	RuntimeProjectileSpeedScale = 20.0
)

type GameMode string

const (
	ModeDeathmatch     GameMode = "deathmatch"
	ModeTeamDeathmatch GameMode = "team deathmatch"
)

type GameState struct {
	State                   string
	RoomName                string
	MapName                 string
	MaxPlayers              int
	Mode                    GameMode
	LobbyEndsAt             int64
	GameEndsAt              int64
	MatchStartedAt          int64
	IslandPhase             IslandPhase
	PhaseStartedAt          int64
	PhaseEndsAt             int64
	IslandEvent             string
	StormRadius             float64
	StormDamage             int
	StormNextTickAt         int64
	BeaconOpen              bool
	BeaconHolder            string
	BeaconHoldStartedAt     map[string]int64
	SuddenDeathStartedAt    int64
	SuddenDeathNextTickAt   int64
	SuddenDeathDamage       int
	Map                     *gamemap.GameMap
	Walls                   *geometry.SpatialHash
	Players                 map[string]*player.Player
	Monsters                map[string]*monster.Monster
	Bullets                 []*bullet.Bullet
	Props                   []*prop.Prop
	Actions                 []Action
	Broadcast               func(msgType string, params interface{})
	SendToPlayer            func(playerID, msgType string, params interface{})
	OnGameEnd               func(players map[string]*player.Player, winner string, duration int64)
	OnPlayerKilled          func(playerId, killerName string)
	MapRevision             int
	Effects                 []*BattleEffect
	DelayedEffects          []*DelayedBattleEffect
	ScheduledShots          []*ScheduledShot
	DamageZones             []*DamageZone
	PendingMandySupers      []*PendingMandySuper
	HeroZones               []*HeroZone
	DoomedUntil             map[string]int64
	DamianDebuffUntil       map[string]int64
	LightMarkedUntil        map[string]int64
	AbilityTargets          map[string]string
	LightningStrikes        []*LightningStrike
	Totems                  map[string]*Totem
	Skyfalls                []*Skyfall
	TemporaryWalls          map[*geometry.WallTile]int64
	BotMemory               map[string]*BotPerception
	IslandVoiceNextAt       map[string]int64
	IslandVoiceKillClaimed  map[string]bool
	CombatEvents            []CombatEvent
	NextCombatEventID       uint64
	activeCommandID         string
	activeSourceID          string
	activeProjectileID      uint64
	commandHasProjectile    bool
	botWallCacheRevision    int
	botWallCache            map[string][]*geometry.WallTile
	botTerrainCacheRevision int
	botTerrainCache         map[int][]bool
}

type BotPerception struct {
	TargetID                string
	LastSeenX, LastSeenY    float64
	LastSeenAt, SearchUntil int64
	Path                    []geometry.Vector2
	PathGoalX, PathGoalY    int
	PathMapRevision         int
	PathRefreshAt           int64
}

type DelayedBattleEffect struct {
	Owner     string
	X, Y      float64
	TriggerAt int64
}

type BattleEffect struct {
	Kind                                      string
	X, Y, ToX, ToY, Radius, Angle, Range, Arc float64
	Color                                     string
	Damage                                    int
	CreatedAt, ExpiresAt                      int64
}
