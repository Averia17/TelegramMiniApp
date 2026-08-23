package game

import (
	"battle/model/player"
	"math"
	"sort"
	"time"
)

type IslandPhase string

const (
	IslandPhaseLanding   IslandPhase = "landing"
	IslandPhaseHunt      IslandPhase = "hunt"
	IslandPhaseChallenge IslandPhase = "challenge"
	IslandPhaseCollapse  IslandPhase = "collapse"
	IslandPhaseBeacon    IslandPhase = "beacon"

	LandingDuration       = 30 * time.Second / BattlePhaseSpeed
	HuntDuration          = 90 * time.Second / BattlePhaseSpeed
	OpeningCombatDuration = LandingDuration + HuntDuration
	ChallengeDuration     = 90 * time.Second / BattlePhaseSpeed
	CollapseDuration      = 90 * time.Second / BattlePhaseSpeed
	FinalPhaseDuration    = 60 * time.Second
	BeaconHoldDuration    = 10 * time.Second
	IslandTick            = time.Second
	BeaconRadius          = 135.0
	FinalStormRadius      = 200.0
)

type IslandEvent string

const (
	IslandEventFog      IslandEvent = "fog"
	IslandEventWalls    IslandEvent = "moving_walls"
	IslandEventSpores   IslandEvent = "poison_spores"
	IslandEventUltimate IslandEvent = "ultimate_zone"
)

var islandEvents = []IslandEvent{
	IslandEventFog,
	IslandEventWalls,
	IslandEventSpores,
	IslandEventUltimate,
}

func (gs *GameState) IslandName() string {
	if gs.MapName == "battle-royale" || gs.MapName == "" {
		return "Остров Первого Испытания"
	}
	return gs.MapName
}

func (gs *GameState) islandEventForMatch() IslandEvent {
	return islandEvents[time.Now().UnixNano()%int64(len(islandEvents))]
}

func (gs *GameState) CombatEnabled() bool {
	return gs.State == GameStateGame
}

func (gs *GameState) updateIsland(now int64) {
	if gs.State != GameStateGame || gs.Mode == ModeTeamDeathmatch {
		return
	}
	if gs.MatchStartedAt == 0 {
		gs.MatchStartedAt = now
	}
	elapsed := time.Duration(maxInt64(0, now-gs.MatchStartedAt)) * time.Millisecond
	// Landing and Hunt are one opening combat phase. Keep the legacy landing
	// value defined for snapshot compatibility, but never schedule it.
	nextPhase := IslandPhaseHunt
	switch {
	case elapsed < OpeningCombatDuration:
		nextPhase = IslandPhaseHunt
	case elapsed < OpeningCombatDuration+ChallengeDuration:
		nextPhase = IslandPhaseChallenge
	case elapsed < OpeningCombatDuration+ChallengeDuration+CollapseDuration:
		nextPhase = IslandPhaseCollapse
	default:
		nextPhase = IslandPhaseBeacon
	}

	if gs.IslandPhase != nextPhase {
		gs.IslandPhase = nextPhase
		gs.PhaseStartedAt = now
		gs.PhaseEndsAt = islandPhaseEndsAt(gs.MatchStartedAt, nextPhase)
		if nextPhase == IslandPhaseChallenge && gs.IslandEvent == "" {
			gs.IslandEvent = string(gs.islandEventForMatch())
		}
		if nextPhase == IslandPhaseCollapse {
			gs.StormNextTickAt = now
		}
		if nextPhase == IslandPhaseBeacon {
			gs.BeaconOpen = true
			gs.StormNextTickAt = now
		}
		if gs.Broadcast != nil {
			gs.Broadcast("island_phase", map[string]interface{}{
				"phase": string(nextPhase), "event": gs.IslandEvent,
			})
		}
		gs.emitIslandVoiceToAll(IslandVoiceTriggerPhase, now)
	}

	gs.updateStorm(now, elapsed)
	gs.updateBeacon(now)
	gs.applySuddenDeath(now)
	gs.updateIslandVoices(now)
}

func islandPhaseEndsAt(start int64, phase IslandPhase) int64 {
	var duration time.Duration
	switch phase {
	case IslandPhaseHunt:
		duration = OpeningCombatDuration
	case IslandPhaseChallenge:
		duration = OpeningCombatDuration + ChallengeDuration
	case IslandPhaseCollapse:
		duration = OpeningCombatDuration + ChallengeDuration + CollapseDuration
	default:
		return 0
	}
	return start + duration.Milliseconds()
}

func (gs *GameState) updateStorm(now int64, elapsed time.Duration) {
	if gs.IslandPhase != IslandPhaseCollapse && gs.IslandPhase != IslandPhaseBeacon {
		gs.StormRadius, gs.StormDamage = 0, 0
		return
	}
	width, height := 2400.0, 2400.0
	if gs.Map != nil {
		width, height = gs.Map.WidthInPixels, gs.Map.HeightInPixels
	}
	maxRadius := math.Hypot(width/2, height/2) + 20
	collapseStart := OpeningCombatDuration + ChallengeDuration
	if elapsed < collapseStart {
		return
	}
	progress := math.Min(1, math.Max(0, float64(elapsed-collapseStart)/float64(CollapseDuration)))
	if gs.IslandPhase == IslandPhaseBeacon {
		beaconProgress := math.Min(1, math.Max(0, float64(elapsed-collapseStart-CollapseDuration)/float64(GameDuration-collapseStart-CollapseDuration)))
		gs.StormRadius = FinalStormRadius - (FinalStormRadius-BeaconRadius)*beaconProgress
	} else {
		gs.StormRadius = maxRadius - (maxRadius-FinalStormRadius)*progress
	}
	gs.StormDamage = 8 + int(progress*8)
	if gs.IslandPhase == IslandPhaseBeacon {
		gs.StormDamage = 16 + int(math.Min(18, float64(beaconProgressForDamage(elapsed, collapseStart+CollapseDuration))))
	}
	if now < gs.StormNextTickAt {
		return
	}
	gs.StormNextTickAt = now + IslandTick.Milliseconds()
	for _, candidate := range gs.Players {
		if candidate == nil || !candidate.IsAlive() || !gs.outsideStorm(candidate) {
			continue
		}
		gs.damageFromIsland(candidate, gs.StormDamage, "Шторм")
	}
}

func beaconProgressForDamage(elapsed, beaconStart time.Duration) int {
	if elapsed <= beaconStart {
		return 0
	}
	return int(math.Max(0, math.Min(18, float64(elapsed-beaconStart)/float64(IslandTick))))
}

func (gs *GameState) outsideStorm(candidate *player.Player) bool {
	if gs.Map == nil || gs.StormRadius <= 0 {
		return false
	}
	centerX, centerY := gs.Map.WidthInPixels/2, gs.Map.HeightInPixels/2
	return math.Hypot(candidate.X-centerX, candidate.Y-centerY) > gs.StormRadius-candidate.Radius
}

func (gs *GameState) damageFromIsland(target *player.Player, amount int, killerName string) {
	wasAlive := target != nil && target.IsAlive()
	gs.applyDamageAmount(target, amount)
	if !wasAlive || target.IsAlive() {
		return
	}
	if gs.Broadcast != nil {
		gs.Broadcast("killed", map[string]interface{}{"killerName": killerName, "killedName": target.Name, "killedId": target.PlayerId})
	}
	if gs.OnPlayerKilled != nil {
		gs.OnPlayerKilled(target.PlayerId, killerName)
	}
}

func (gs *GameState) updateBeacon(now int64) {
	if !gs.BeaconOpen || gs.IslandPhase != IslandPhaseBeacon || gs.Map == nil {
		gs.BeaconHolder = ""
		if gs.BeaconHoldStartedAt != nil {
			clear(gs.BeaconHoldStartedAt)
		}
		return
	}
	if gs.BeaconHoldStartedAt == nil {
		gs.BeaconHoldStartedAt = make(map[string]int64)
	}
	centerX, centerY := gs.Map.WidthInPixels/2, gs.Map.HeightInPixels/2
	ids := make([]string, 0, len(gs.Players))
	for id := range gs.Players {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		candidate := gs.Players[id]
		inside := candidate != nil && candidate.IsAlive() && math.Hypot(candidate.X-centerX, candidate.Y-centerY) <= BeaconRadius
		if !inside {
			delete(gs.BeaconHoldStartedAt, id)
			if gs.BeaconHolder == id {
				gs.BeaconHolder = ""
			}
			continue
		}
		if _, ok := gs.BeaconHoldStartedAt[id]; !ok {
			gs.BeaconHoldStartedAt[id] = now
		}
		if gs.BeaconHolder == "" {
			gs.BeaconHolder = id
		}
	}
}

func (gs *GameState) beaconWinner(now int64) *player.Player {
	if gs.IslandPhase != IslandPhaseBeacon || gs.BeaconHolder == "" || gs.BeaconHoldStartedAt == nil {
		return nil
	}
	startedAt := gs.BeaconHoldStartedAt[gs.BeaconHolder]
	if startedAt == 0 || now-startedAt < BeaconHoldDuration.Milliseconds() {
		return nil
	}
	winner := gs.Players[gs.BeaconHolder]
	if winner == nil || !winner.IsAlive() {
		return nil
	}
	return winner
}

func (gs *GameState) BeaconProgress(now int64) float64 {
	if gs.BeaconHolder == "" || gs.BeaconHoldStartedAt == nil {
		return 0
	}
	return math.Max(0, math.Min(1, float64(now-gs.BeaconHoldStartedAt[gs.BeaconHolder])/float64(BeaconHoldDuration.Milliseconds())))
}

func (gs *GameState) applySuddenDeath(now int64) {
	if gs.IslandPhase != IslandPhaseBeacon || gs.countActivePlayers() < 2 {
		gs.SuddenDeathStartedAt, gs.SuddenDeathNextTickAt, gs.SuddenDeathDamage = 0, 0, 0
		return
	}
	if gs.SuddenDeathStartedAt == 0 {
		gs.SuddenDeathStartedAt = now
		gs.SuddenDeathNextTickAt = now
		for playerID := range gs.Players {
			gs.emitIslandVoice(playerID, IslandVoiceTriggerDuel, now)
		}
	}
	if now < gs.SuddenDeathNextTickAt {
		gs.SuddenDeathDamage = 8 + int(math.Max(0, float64(now-gs.SuddenDeathStartedAt)/1000))*4
		return
	}
	seconds := int(math.Max(0, float64(now-gs.SuddenDeathStartedAt)/1000))
	gs.SuddenDeathDamage = 8 + seconds*4
	gs.SuddenDeathNextTickAt = now + IslandTick.Milliseconds()
	var protected *player.Player
	for _, candidate := range gs.Players {
		if candidate == nil || !candidate.IsAlive() {
			continue
		}
		if protected == nil || candidate.Lives+candidate.ShieldHP > protected.Lives+protected.ShieldHP {
			protected = candidate
		}
	}
	for _, candidate := range gs.Players {
		if candidate == nil || !candidate.IsAlive() {
			continue
		}
		damage := gs.SuddenDeathDamage
		if candidate == protected {
			damage = int(math.Max(0, math.Min(float64(damage), float64(candidate.Lives+candidate.ShieldHP-1))))
		}
		gs.damageFromIsland(candidate, damage, "Глас острова")
	}
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
