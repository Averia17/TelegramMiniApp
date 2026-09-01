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

	FlasksCount      = 8
	LunarCratesCount = 12
	MonstersCount    = 8

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
	combatActivityWindow    = 2 * time.Second
	combatAssistWindow      = 3 * time.Second
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
	// Public hero stats stay compact for the UX; these keep their combat pace
	// in the same world-unit range as before the catalog compaction.
	RuntimeMovementSpeedScale   = 12.0
	RuntimeProjectileSpeedScale = 20.0
)

var (
	SuperMaxChargePercent          = loadedCombatProfileRuntimeDefaults.Defaults.Super.MaxChargePercent
	SuperStartChargePercent        = loadedCombatProfileRuntimeDefaults.Defaults.Super.StartChargePercent
	MaxGadgetCharges               = loadedCombatProfileRuntimeDefaults.Defaults.Gadget.MaxCharges
	GadgetChargesOnSpawn           = loadedCombatProfileRuntimeDefaults.Defaults.Gadget.ChargesOnSpawn
	BotLowHealthRetreatFraction    = loadedCombatProfileRuntimeDefaults.Defaults.AI.LowHealthRetreatFraction
	BotCriticalHealthFraction      = loadedCombatProfileRuntimeDefaults.Defaults.AI.CriticalHealthRetreatFraction
	BotSuperUseAdvantageFraction   = loadedCombatProfileRuntimeDefaults.Defaults.AI.SuperUseAdvantageFraction
	BotPickupContestHealthFraction = loadedCombatProfileRuntimeDefaults.Defaults.AI.PickupContestHealthFraction
	HealthBoostFraction            = loadedCombatProfileRuntimeDefaults.Defaults.HealthBoost.Fraction
	TeamHealthBoostFraction        = loadedCombatProfileRuntimeDefaults.Defaults.HealthBoost.TeamFraction
	HealthBoostMaxStacks           = loadedCombatProfileRuntimeDefaults.Defaults.HealthBoost.MaxStacks
	BatCampRespawnDuration         = 20 * time.Second
	HealthBoostTTL                 = time.Duration(loadedCombatProfileRuntimeDefaults.Defaults.HealthBoost.TTLMS) * time.Millisecond
	HealthBoostHealsCurrentLives   = loadedCombatProfileRuntimeDefaults.Defaults.HealthBoost.HealsCurrentLives
	// Bound visible green-cube clutter. A full budget drops no new cube until
	// one of the existing claims or expires, preserving a meaningful contest.
	MaxActiveHealthBoosts = loadedCombatProfileRuntimeDefaults.Defaults.HealthBoost.MaxActivePickups
)

type GameMode string

const (
	ModeDeathmatch     GameMode = "deathmatch"
	ModeTeamDeathmatch GameMode = "team deathmatch"
)

type GameState struct {
	// MatchID is the stable room/match correlation key used by combat events
	// and result telemetry. RoomName remains a display-oriented field.
	MatchID                 string
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
	MonsterRespawns         map[string]MonsterRespawn
	Bullets                 []*bullet.Bullet
	Props                   []*prop.Prop
	Actions                 []Action
	Broadcast               func(msgType string, params interface{})
	SendToPlayer            func(playerID, msgType string, params interface{})
	OnGameEnd               func(players map[string]*player.Player, winner string, duration int64)
	OnPlayerKilled          func(playerId, killerName string)
	EndReason               string
	WinnerPlayerID          string
	MapRevision             int
	rules                   MatchRules
	mapProvider             MapProvider
	heroCatalog             HeroCatalog
	combatRegistry          *CombatRegistry
	Effects                 []*BattleEffect
	DelayedEffects          []*DelayedBattleEffect
	ScheduledShots          []*ScheduledShot
	DamageZones             []*DamageZone
	MonsterZones            []*MonsterZone
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
	botMetrics              BotAIMetrics
	botMetricsFlushed       bool
	batMetrics              BatLifecycleMetrics
	batMetricsFlushed       bool
	batDamageTeams          map[string]string
	batDamageSeen           map[string]bool
	batContested            map[string]bool
	batTimeline             []BatTimelineEvent
	botAI                   BotAIStrategy
	IslandVoiceNextAt       map[string]int64
	IslandVoiceKillClaimed  map[string]bool
	CombatEvents            []CombatEvent
	NextCombatEventID       uint64
	NextCombatEffectID      uint64
	abilityResolutions      map[string]*abilityResolution
	activeCommandID         string
	activeSourceID          string
	activeAbilitySlot       string
	activeBotAttackID       string
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
	// clockNow is nil in production and can be injected by deterministic
	// scenario runners. Keeping it on the authoritative state avoids a global
	// test clock that would make concurrent simulations interfere with each
	// other.
	clockNow func() int64
}

// MonsterRespawn is the deterministic lifecycle record for one neutral bat
// camp. The id is preserved across cycles so snapshots and telemetry can
// correlate a camp's contest and reward history.
type MonsterRespawn struct {
	RespawnAt       int64
	X, Y            float64
	Radius          float64
	Kind            monster.MonsterKind
	CampID          string
	TerritoryRadius float64
	Tier            int
	MaxLives        int
}

// BotAIMetrics are match-local counters. They are deliberately kept out of
// the wire snapshot and exported only as an aggregate at match end, so AI
// diagnostics cannot become a per-frame network payload.
type BotAIMetrics struct {
	Decisions                 uint64
	ActionSelections          map[string]uint64
	ActionScoreSums           map[string]float64
	ActionScoreSamples        map[string]uint64
	ActionSwitches            uint64
	TargetSwitches            uint64
	HardInterrupts            uint64
	RetreatDecisions          uint64
	AbilityUses               uint64
	AttackAttempts            uint64
	AttackHits                uint64
	PeelDecisions             uint64
	ResourceContestDecisions  uint64
	ResourceContestByRole     map[string]uint64
	BatFarmDecisions          uint64
	SpawnProtectionAvoidances uint64
	StuckReplans              uint64
	IdleDecisionTicks         uint64
	attackHitKeys             map[string]struct{}
}

// BatLifecycleMetrics are match-local counters for the neutral camp loop.
// They intentionally describe world events rather than bot decisions, so a
// replay can distinguish a readable bat encounter from an AI that merely
// chose to farm it.
type BatLifecycleMetrics struct {
	NoticeStarts       uint64
	NoticeCancels      uint64
	WindupStarts       uint64
	Strikes            uint64
	Rewards            uint64
	Respawns           uint64
	RewardClaims       uint64
	RewardDenials      uint64
	RewardClaimsByRole map[string]uint64
	FirstDamageEvents  uint64
	ContestStarts      uint64
	DamageEvents       uint64
	EffectiveDamage    uint64
	RewardExpiries     uint64
	DamageByRole       map[string]uint64
}

// BatTimelineEvent is a bounded, match-local audit record for one neutral-camp
// outcome. It is intentionally absent from the live snapshot and exported
// metrics: scenario reports may retain claimant/source IDs, while production
// telemetry stays aggregate-only.
type BatTimelineEvent struct {
	AtMs       int64  `json:"atMs"`
	BatID      string `json:"batId"`
	Kind       string `json:"kind"`
	SourceID   string `json:"sourceId,omitempty"`
	ClaimantID string `json:"claimantId,omitempty"`
	KillerID   string `json:"killerId,omitempty"`
	Team       string `json:"team,omitempty"`
	Role       string `json:"role,omitempty"`
	Damage     int    `json:"damage,omitempty"`
}

const maxBatTimelineEvents = 256

func newBotAIMetrics() BotAIMetrics {
	return BotAIMetrics{
		ActionSelections:      make(map[string]uint64),
		ActionScoreSums:       make(map[string]float64),
		ActionScoreSamples:    make(map[string]uint64),
		ResourceContestByRole: make(map[string]uint64),
		attackHitKeys:         make(map[string]struct{}),
	}
}

func newBatLifecycleMetrics() BatLifecycleMetrics {
	return BatLifecycleMetrics{
		RewardClaimsByRole: make(map[string]uint64),
		DamageByRole:       make(map[string]uint64),
	}
}

// BotAIMetricsSnapshot returns a copy safe for scenario reports and telemetry
// exporters. The internal maps remain owned by the simulation goroutine.
func (gs *GameState) BotAIMetricsSnapshot() BotAIMetrics {
	if gs == nil {
		return BotAIMetrics{}
	}
	snapshot := gs.botMetrics
	snapshot.ActionSelections = make(map[string]uint64, len(gs.botMetrics.ActionSelections))
	for action, count := range gs.botMetrics.ActionSelections {
		snapshot.ActionSelections[action] = count
	}
	snapshot.ActionScoreSums = make(map[string]float64, len(gs.botMetrics.ActionScoreSums))
	for action, sum := range gs.botMetrics.ActionScoreSums {
		snapshot.ActionScoreSums[action] = sum
	}
	snapshot.ActionScoreSamples = make(map[string]uint64, len(gs.botMetrics.ActionScoreSamples))
	for action, count := range gs.botMetrics.ActionScoreSamples {
		snapshot.ActionScoreSamples[action] = count
	}
	snapshot.ResourceContestByRole = make(map[string]uint64, len(gs.botMetrics.ResourceContestByRole))
	for role, count := range gs.botMetrics.ResourceContestByRole {
		snapshot.ResourceContestByRole[role] = count
	}
	return snapshot
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
	UtilityAction            string
	UtilityActionUntil       int64
	UtilityScore             float64
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
	ID                                        uint64
	Kind                                      string
	Phase                                     CombatEffectPhase
	CommandID                                 string
	SourceID                                  string
	AbilitySlot                               string
	TargetType                                string
	TargetID                                  string
	X, Y, ToX, ToY, Radius, Angle, Range, Arc float64
	Color                                     string
	Damage                                    int
	CreatedAt, ExpiresAt                      int64
}
