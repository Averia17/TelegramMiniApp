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

	BattlePhaseSpeed   = 2
	LobbyDuration      = 10 * time.Second / BattlePhaseSpeed
	TeamBattleDuration = 5 * time.Minute
	// The beacon is a real final combat phase. Keep the match alive long
	// enough for sudden death to reduce the field to one survivor.
	GameDuration = OpeningCombatDuration + ChallengeDuration + CollapseDuration + FinalPhaseDuration

	FlasksCount       = 8
	LunarCratesCount  = 12
	HealthCratesCount = 6
	MonstersCount     = 8

	HealthBoostFraction                 = .05
	TeamHealthBoostFraction             = .02
	MonsterHealthBoostDropChancePercent = 20

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
	BotStormSafetyMargin    = 80.0
	BotVisionRange          = 620.0
	BotRevealRange          = 900.0
	BotRecentThreatDuration = 2 * time.Second
	BotFocusFireDuration    = 1800 * time.Millisecond
	BotTargetStickDuration  = 1200 * time.Millisecond
	BotPathRefreshInterval  = 240 * time.Millisecond
	BotStuckTimeout         = 650 * time.Millisecond
	BotProgressDistance     = 1.0
	BotMovementTurnBlend    = 0.22
	BotMovementRelease      = 0.84
	BotMovementStopScale    = 0.045
	BotSearchDuration       = 2800 * time.Millisecond
	BotExploreDuration      = 2600 * time.Millisecond
	// Bots should react quickly enough to feel active, but not so quickly that
	// they look like they have access to the whole authoritative state.
	BotReactionDelayMin = 140 * time.Millisecond
	BotReactionDelayMax = 320 * time.Millisecond
	AttackRateScale     = 1.55
	ReloadTimeScale     = 1.22
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
	WallsSource             []*geometry.WallTile
	Players                 map[string]*player.Player
	Objectives              map[string]*ObjectiveState
	Monsters                map[string]*monster.Monster
	Bullets                 []*bullet.Bullet
	Props                   []*prop.Prop
	Actions                 []Action
	Broadcast               func(msgType string, params interface{})
	SendToPlayer            func(playerID, msgType string, params interface{})
	OnGameEnd               func(players map[string]*player.Player, winner string, duration int64)
	OnPlayerKilled          func(playerId, killerName string)
	EndReason               string
	MapRevision             int
	rules                   MatchRules
	mapProvider             MapProvider
	heroCatalog             HeroCatalog
	combatRegistry          *CombatRegistry
	Effects                 []*BattleEffect
	DelayedEffects          []*DelayedBattleEffect
	ScheduledShots          []*ScheduledShot
	DamageZones             []*DamageZone
	PendingMandySupers      []*PendingMandySuper
	HeroZones               []*HeroZone
	KattyPaintStacks        map[string]map[string]int
	KattyPaintUntil         map[string]map[string]int64
	LightMarkedUntil        map[string]int64
	AbilityTargets          map[string]string
	LightningStrikes        []*LightningStrike
	Skyfalls                []*Skyfall
	TemporaryWalls          map[*geometry.WallTile]int64
	BotMemory               map[string]*BotPerception
	botAI                   BotAIStrategy
	IslandVoiceNextAt       map[string]int64
	IslandVoiceKillClaimed  map[string]bool
	CombatEvents            []CombatEvent
	randomHealthBoostDrop   func() bool
	NextCombatEventID       uint64
	activeCommandID         string
	activeSourceID          string
	activeProjectileID      uint64
	commandHasProjectile    bool
	activeAutoAim           bool
	autoAimTargetX          float64
	autoAimTargetY          float64
	autoAimTargetID         string
	hasAutoAimTarget        bool
	botWallCacheRevision    int
	botWallCache            map[string][]*geometry.WallTile
	botTerrainCacheRevision int
	botTerrainCache         map[int][]bool
	botPathQueue            []botPathCell
	botPathVisited          []uint32
	botPathParents          []botPathCell
	botPathSearchID         uint32
}

type ObjectiveState struct {
	ID, Type, Team  string
	X, Y, Radius    float64
	Lives, MaxLives int
	AttackRange     float64
	AttackAt        int64
	AttackTargetID  string
	AttackTargetX   float64
	AttackTargetY   float64
	AttackReleaseAt int64
	LastDamagedAt   int64
	LastDamagedBy   string
}

type botPathCell struct {
	x, y int
}

type BotPerception struct {
	TargetType               string
	TargetID                 string
	LastSeenX, LastSeenY     float64
	LastSeenAt, SearchUntil  int64
	ExploreX, ExploreY       float64
	ExploreUntil             int64
	ExploreIndex             int
	Path                     []geometry.Vector2
	PathGoalX, PathGoalY     int
	PathMapRevision          int
	PathRefreshAt            int64
	PathLastX, PathLastY     float64
	PathLastAt               int64
	PathStuckSince           int64
	PathReplanCount          int
	DecisionUntil            int64
	IntentMoveX, IntentMoveY float64
	StrafeSign               float64
	StrafeUntil              int64
	MoveX, MoveY             float64
	MoveScale                float64
	MoveCommandAt            int64
}

type DelayedBattleEffect struct {
	Owner     string
	X, Y      float64
	TriggerAt int64
}

type BattleEffect struct {
	Kind                                      string
	Phase                                     CombatEffectPhase
	X, Y, ToX, ToY, Radius, Angle, Range, Arc float64
	Color                                     string
	Damage                                    int
	CreatedAt, ExpiresAt                      int64
}
