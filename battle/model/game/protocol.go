package game

import (
	"encoding/json"
	"time"
)

type ClientMessage struct {
	Type  string          `json:"type"`
	Ts    int64           `json:"ts,omitempty"`
	Value json.RawMessage `json:"value,omitempty"`
}

type ClockSyncValue struct {
	ClientTs int64 `json:"clientTs"`
}

type ClockSyncParams struct {
	ClientTs int64 `json:"clientTs"`
	ServerTs int64 `json:"serverTs"`
}

type TauntValue struct {
	TauntID  string `json:"tauntId"`
	TargetID string `json:"targetId"`
}

type TauntParams struct {
	PlayerID   string `json:"playerId"`
	PlayerName string `json:"playerName"`
	TauntID    string `json:"tauntId"`
	TargetID   string `json:"targetId"`
	TargetName string `json:"targetName"`
}

type ServerMessage struct {
	Type   string      `json:"type"`
	Ts     int64       `json:"ts,omitempty"`
	Params interface{} `json:"params,omitempty"`
}

type GameStateJSON struct {
	State             string  `json:"state"`
	RoomName          string  `json:"roomName"`
	MapName           string  `json:"mapName"`
	IslandName        string  `json:"islandName,omitempty"`
	MaxPlayers        int     `json:"maxPlayers"`
	Mode              string  `json:"mode"`
	AlivePlayers      int     `json:"alivePlayers"`
	LobbyEndsAt       int64   `json:"lobbyEndsAt,omitempty"`
	GameEndsAt        int64   `json:"gameEndsAt,omitempty"`
	Phase             string  `json:"phase,omitempty"`
	PhaseStartedAt    int64   `json:"phaseStartedAt,omitempty"`
	PhaseEndsAt       int64   `json:"phaseEndsAt,omitempty"`
	IslandEvent       string  `json:"islandEvent,omitempty"`
	StormRadius       float64 `json:"stormRadius,omitempty"`
	StormDamage       int     `json:"stormDamage,omitempty"`
	BeaconOpen        bool    `json:"beaconOpen,omitempty"`
	BeaconHolder      string  `json:"beaconHolder,omitempty"`
	BeaconProgress    float64 `json:"beaconProgress,omitempty"`
	SuddenDeath       bool    `json:"suddenDeath,omitempty"`
	SuddenDeathDamage int     `json:"suddenDeathDamage,omitempty"`
}

type StateUpdate struct {
	Type         string                 `json:"type"`
	Ts           int64                  `json:"ts"`
	Game         GameStateJSON          `json:"game"`
	Map          MapJSON                `json:"map"`
	Players      map[string]PlayerJSON  `json:"players"`
	Monsters     map[string]MonsterJSON `json:"monsters"`
	Bullets      []BulletJSON           `json:"bullets"`
	Props        []PropJSON             `json:"props"`
	Effects      []EffectJSON           `json:"effects,omitempty"`
	CombatEvents []CombatEventJSON      `json:"combatEvents,omitempty"`
	Objectives   []ObjectiveStateJSON   `json:"objectives,omitempty"`
}

type CombatEventJSON struct {
	ID           uint64 `json:"id"`
	Ts           int64  `json:"ts"`
	Kind         string `json:"kind"`
	CommandID    string `json:"commandId,omitempty"`
	SourceID     string `json:"sourceId,omitempty"`
	TargetType   string `json:"targetType,omitempty"`
	TargetID     string `json:"targetId,omitempty"`
	ProjectileID uint64 `json:"projectileId,omitempty"`
	Damage       int    `json:"damage,omitempty"`
	Accepted     bool   `json:"accepted,omitempty"`
	Resolved     bool   `json:"resolved,omitempty"`
}

type EffectJSON struct {
	Id      string  `json:"id"`
	Kind    string  `json:"kind,omitempty"`
	Phase   string  `json:"phase,omitempty"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	ToX     float64 `json:"toX,omitempty"`
	ToY     float64 `json:"toY,omitempty"`
	Radius  float64 `json:"radius,omitempty"`
	Angle   float64 `json:"angle,omitempty"`
	Range   float64 `json:"range,omitempty"`
	Arc     float64 `json:"arc,omitempty"`
	Color   string  `json:"color,omitempty"`
	Damage  int     `json:"damage,omitempty"`
	Life    float64 `json:"life"`
	MaxLife float64 `json:"maxLife"`
}

type PlayerJSON struct {
	X                  float64          `json:"x"`
	Y                  float64          `json:"y"`
	Radius             float64          `json:"radius"`
	PlayerId           string           `json:"playerId"`
	Name               string           `json:"name"`
	Lives              int              `json:"lives"`
	MaxLives           int              `json:"maxLives"`
	Team               string           `json:"team,omitempty"`
	Color              string           `json:"color"`
	Kills              int              `json:"kills"`
	Deaths             int              `json:"deaths,omitempty"`
	PlayerDamage       int              `json:"playerDamage,omitempty"`
	TowerDamage        int              `json:"towerDamage,omitempty"`
	TownHallDamage     int              `json:"townHallDamage,omitempty"`
	TowersDestroyed    int              `json:"towersDestroyed,omitempty"`
	TownHallsDestroyed int              `json:"townHallsDestroyed,omitempty"`
	Rotation           float64          `json:"rotation"`
	MoveX              float64          `json:"moveX"`
	MoveY              float64          `json:"moveY"`
	Speed              float64          `json:"speed"`
	MovementSpeed      float64          `json:"movementSpeed"`
	AttackDamage       int              `json:"attackDamage"`
	AttackRate         int64            `json:"attackRateMs"`
	AttackCooldown     float64          `json:"attackCooldown,omitempty"`
	AttackReady        bool             `json:"attackReady"`
	Ack                int64            `json:"ack"`
	Hero               string           `json:"hero"`
	AttackType         string           `json:"attackType,omitempty"`
	AttackArchetype    string           `json:"attackArchetype,omitempty"`
	AttackRange        float64          `json:"attackRange,omitempty"`
	AttackHalfArc      float64          `json:"attackHalfArcDegrees,omitempty"`
	ShieldHP           int              `json:"shieldHp,omitempty"`
	ShieldStacks       int              `json:"shieldStacks,omitempty"`
	Marks              int              `json:"marks,omitempty"`
	PaintStacks        int              `json:"paintStacks,omitempty"`
	SuperCharge        int              `json:"superCharge"`
	Heat               int              `json:"heat,omitempty"`
	AttackPulse        int              `json:"attackPulse,omitempty"`
	SuperPulse         int              `json:"superPulse,omitempty"`
	GadgetPulse        int              `json:"gadgetPulse,omitempty"`
	FocusCharge        int              `json:"focusCharge,omitempty"`
	SuppressedRage     int              `json:"suppressedRage,omitempty"`
	MicoRage           int              `json:"micoRage,omitempty"`
	LumiFlowers        int              `json:"lumiFlowers,omitempty"`
	KazeCombo          int              `json:"kazeCombo,omitempty"`
	GadgetArmed        bool             `json:"gadgetArmed,omitempty"`
	GadgetCharges      int              `json:"gadgetCharges,omitempty"`
	Ammo               int              `json:"ammo"`
	MaxAmmo            int              `json:"maxAmmo"`
	ReloadProgress     float64          `json:"reloadProgress,omitempty"`
	HitImpulseX        float64          `json:"hitImpulseX,omitempty"`
	HitImpulseY        float64          `json:"hitImpulseY,omitempty"`
	Aiming             bool             `json:"aiming,omitempty"`
	AimDistance        float64          `json:"aimDistance,omitempty"`
	Shield             float64          `json:"shield,omitempty"`
	Haste              float64          `json:"haste,omitempty"`
	LunarSpeed         float64          `json:"lunarSpeed,omitempty"`
	LunarDamage        float64          `json:"lunarDamage,omitempty"`
	LunarShield        bool             `json:"lunarShield,omitempty"`
	Stealth            float64          `json:"stealth,omitempty"`
	Invulnerable       float64          `json:"invulnerable,omitempty"`
	Blind              float64          `json:"blind,omitempty"`
	Stun               float64          `json:"stun,omitempty"`
	Slow               float64          `json:"slow,omitempty"`
	AntiHeal           float64          `json:"antiHeal,omitempty"`
	SporeStacks        int              `json:"sporeStacks,omitempty"`
	Channel            float64          `json:"channel,omitempty"`
	Vine               float64          `json:"vine,omitempty"`
	Vortex             float64          `json:"vortex,omitempty"`
	Flying             float64          `json:"flying,omitempty"`
	Evolution          int              `json:"evolution,omitempty"`
	Souls              int              `json:"souls,omitempty"`
	Deflect            int              `json:"deflect,omitempty"`
	PowerCores         int              `json:"powerCores,omitempty"`
	DamageMultiplier   float64          `json:"damageMultiplier,omitempty"`
	Poisoned           bool             `json:"poisoned,omitempty"`
	Cooldowns          CooldownsJSON    `json:"cooldowns"`
	AbilityAck         string           `json:"abilityAck,omitempty"`
	AbilityAccepted    bool             `json:"abilityAccepted,omitempty"`
	RegenRate          float64          `json:"regenRate,omitempty"`
	RespawnAt          int64            `json:"respawnAt,omitempty"`
	Hidden             bool             `json:"hidden,omitempty"`
	LastContact        *LastContactJSON `json:"lastContact,omitempty"`
}

type LastContactJSON struct {
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	At         int64   `json:"at"`
	DirectionX float64 `json:"directionX"`
	DirectionY float64 `json:"directionY"`
}

type ObjectiveStateJSON struct {
	ID          string  `json:"id"`
	Type        string  `json:"type"`
	Team        string  `json:"team"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	Lives       int     `json:"lives"`
	MaxLives    int     `json:"maxLives"`
	AttackRange float64 `json:"attackRange,omitempty"`
}

// CooldownsJSON keeps the public object shape while avoiding a per-snapshot
// map allocation and map encoding for the two fixed ability slots.
type CooldownsJSON struct {
	Primary   float64 `json:"primary"`
	Secondary float64 `json:"secondary"`
}

type MonsterJSON struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Radius   float64 `json:"radius"`
	Rotation float64 `json:"rotation"`
	Lives    int     `json:"lives"`
	MaxLives int     `json:"maxLives"`
	Tier     int     `json:"tier,omitempty"`
}

type BulletJSON struct {
	ID        uint64  `json:"id"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Z         float64 `json:"z,omitempty"`
	Radius    float64 `json:"radius"`
	PlayerId  string  `json:"playerId"`
	CommandID string  `json:"commandId,omitempty"`
	Team      string  `json:"team"`
	Rotation  float64 `json:"rotation"`
	Color     string  `json:"color"`
	Kind      string  `json:"kind,omitempty"`
	Damage    int     `json:"damage,omitempty"`
	Speed     float64 `json:"speed,omitempty"`
	MaxRange  float64 `json:"maxRange,omitempty"`
	Travelled float64 `json:"travelled,omitempty"`
	Returning bool    `json:"returning,omitempty"`
	Splash    float64 `json:"splash,omitempty"`
	Chain     int     `json:"chain,omitempty"`
	Bounces   int     `json:"bounces,omitempty"`
	Lobbed    bool    `json:"lobbed,omitempty"`
	TargetX   float64 `json:"targetX,omitempty"`
	TargetY   float64 `json:"targetY,omitempty"`
}

type PropJSON struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Radius   float64 `json:"radius"`
	Type     string  `json:"type"`
	LootType string  `json:"lootType,omitempty"`
	Lives    int     `json:"lives,omitempty"`
	MaxLives int     `json:"maxLives,omitempty"`
	Active   bool    `json:"active"`
}

type MapJSON struct {
	ID         string                 `json:"id"`
	Name       string                 `json:"name"`
	Seed       int64                  `json:"seed"`
	Revision   int                    `json:"revision"`
	Width      float64                `json:"width"`
	Height     float64                `json:"height"`
	TileSize   float64                `json:"tileSize"`
	Walls      []WallJSON             `json:"walls"`
	TeamSpawns map[string][]SpawnJSON `json:"teamSpawns,omitempty"`
	Objectives []ObjectiveJSON        `json:"objectives,omitempty"`
	Features   []FeatureJSON          `json:"features,omitempty"`
}

type SpawnJSON struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}
type ObjectiveJSON struct {
	ID     string  `json:"id"`
	Type   string  `json:"type"`
	Team   string  `json:"team"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Radius float64 `json:"radius"`
}

type FeatureJSON struct {
	ID       string  `json:"id"`
	Type     string  `json:"type"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Rotation float64 `json:"rotation,omitempty"`
	Scale    float64 `json:"scale,omitempty"`
}

type WallJSON struct {
	MinX           float64 `json:"minX"`
	MinY           float64 `json:"minY"`
	MaxX           float64 `json:"maxX"`
	MaxY           float64 `json:"maxY"`
	Type           string  `json:"type"`
	Blocking       bool    `json:"blocking"`
	BushGroup      int     `json:"bushGroup,omitempty"`
	ColliderInsetX float64 `json:"colliderInsetX,omitempty"`
	ColliderInsetY float64 `json:"colliderInsetY,omitempty"`
}

type RoomJoinedParams struct {
	PlayerId    string `json:"playerId"`
	RoomId      string `json:"roomId"`
	RoomName    string `json:"roomName"`
	MapName     string `json:"mapName"`
	MapID       string `json:"mapId,omitempty"`
	MapRevision int    `json:"mapRevision,omitempty"`
	Mode        string `json:"mode"`
	MaxPlayers  int    `json:"maxPlayers"`
}

type MatchFoundParams struct {
	RoomId string `json:"roomId"`
}

type PartyStateParams struct {
	PartyID   string   `json:"partyId"`
	OwnerID   string   `json:"ownerId"`
	MemberIDs []string `json:"memberIds"`
	Count     int      `json:"count"`
	MaxSize   int      `json:"maxSize"`
}

type ErrorParams struct {
	Message string `json:"message"`
}

func NewServerMessage(msgType string, params interface{}) *ServerMessage {
	return &ServerMessage{
		Type:   msgType,
		Ts:     time.Now().UnixMilli(),
		Params: params,
	}
}

func NewStateUpdate(g *GameStateJSON, m *MapJSON, players map[string]PlayerJSON, monsters map[string]MonsterJSON, bullets []BulletJSON, props []PropJSON, effects []EffectJSON, combatEvents ...[]CombatEventJSON) *StateUpdate {
	state := &StateUpdate{
		Type:     "state",
		Ts:       time.Now().UnixMilli(),
		Game:     *g,
		Map:      *m,
		Players:  players,
		Monsters: monsters,
		Bullets:  bullets,
		Props:    props,
		Effects:  effects,
	}
	if len(combatEvents) > 0 {
		state.CombatEvents = combatEvents[0]
	}
	return state
}
