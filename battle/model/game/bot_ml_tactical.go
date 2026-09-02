package game

import (
	"battle/model/player"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"sort"
	"strings"
)

// BotMLTacticalSchemaVersion is deliberately separate from the v1 intent-only
// contract. A v1 checkpoint must never be allowed to interpret v2 head logits.
const BotMLTacticalSchemaVersion = "bot-ml-tactical-v2"

// 48 legacy combat features + 18 enemy features + 15 ally features +
// 15 monster features + 3 cover features.
const BotMLTacticalObservationSize = 99

type BotMLTacticalIntent uint8

const (
	BotMLTacticalIntentRoam BotMLTacticalIntent = iota
	BotMLTacticalIntentEngage
	BotMLTacticalIntentRetreat
	BotMLTacticalIntentKite
	BotMLTacticalIntentChase
	BotMLTacticalIntentTakeCover
	BotMLTacticalIntentUseAbility
	BotMLTacticalIntentCount
)

type BotMLTacticalTargetSlot uint8

const (
	BotMLTacticalTargetNone BotMLTacticalTargetSlot = iota
	BotMLTacticalTargetEnemy0
	BotMLTacticalTargetEnemy1
	BotMLTacticalTargetEnemy2
	BotMLTacticalTargetAlly0
	BotMLTacticalTargetObjective
	BotMLTacticalTargetMonster0
	BotMLTacticalTargetPickup
	BotMLTacticalTargetCount
)

type BotMLTacticalMovement uint8

const (
	BotMLTacticalMovementDirect BotMLTacticalMovement = iota
	BotMLTacticalMovementStrafe
	BotMLTacticalMovementKite
	BotMLTacticalMovementChase
	BotMLTacticalMovementCover
	BotMLTacticalMovementRegroup
	BotMLTacticalMovementCount
)

type BotMLTacticalAbility uint8

const (
	BotMLTacticalAbilityNone BotMLTacticalAbility = iota
	BotMLTacticalAbilityGadget
	BotMLTacticalAbilitySuper
	BotMLTacticalAbilityCount
)

var botMLTacticalIntentNames = [...]string{"roam", "engage", "retreat", "kite", "chase", "take_cover", "use_ability"}
var botMLTacticalTargetNames = [...]string{"none", "enemy_0", "enemy_1", "enemy_2", "ally_0", "objective", "monster_0", "pickup"}
var botMLTacticalMovementNames = [...]string{"direct", "strafe", "kite", "chase", "cover", "regroup"}
var botMLTacticalAbilityNames = [...]string{"none", "gadget", "super"}

// BotMLTacticalObservation is the v2 multi-head inference contract. Masks are
// per head so a policy cannot request a missing target or an unavailable
// ability. Candidate slots are reconstructed from the same deterministic
// ordering in the authoritative executor; IDs never enter the model vector.
type BotMLTacticalObservation struct {
	SchemaVersion string    `json:"schemaVersion"`
	Values        []float32 `json:"values"`
	IntentMask    []bool    `json:"intentMask"`
	TargetMask    []bool    `json:"targetMask"`
	MovementMask  []bool    `json:"movementMask"`
	AbilityMask   []bool    `json:"abilityMask"`
}

type BotMLTacticalDecision struct {
	Intent   BotMLTacticalIntent
	Target   BotMLTacticalTargetSlot
	Movement BotMLTacticalMovement
	Ability  BotMLTacticalAbility
}

type BotMLTacticalPolicy interface {
	DecideTactical(botID string, observation BotMLTacticalObservation) BotMLTacticalDecision
}

type BotMLTacticalPolicyFunc struct {
	PolicyName string
	Fn         func(string, BotMLTacticalObservation) BotMLTacticalDecision
}

func (p BotMLTacticalPolicyFunc) DecideTactical(botID string, observation BotMLTacticalObservation) BotMLTacticalDecision {
	if p.Fn == nil {
		return BotMLTacticalDecision{Intent: BotMLTacticalIntentRoam, Target: BotMLTacticalTargetNone, Movement: BotMLTacticalMovementDirect, Ability: BotMLTacticalAbilityNone}
	}
	return p.Fn(botID, observation)
}

func BotMLTacticalSchemaFingerprint() string {
	parts := []string{BotMLTacticalSchemaVersion, strings.Join(botMLTacticalFeatureNames(), "\x00")}
	for _, names := range [][]string{botMLTacticalIntentNames[:], botMLTacticalTargetNames[:], botMLTacticalMovementNames[:], botMLTacticalAbilityNames[:]} {
		parts = append(parts, strings.Join(names, "\x00"))
	}
	digest := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(digest[:])
}

func botMLTacticalFeatureNames() []string {
	features := append([]string(nil), botMLFeatureNames...)
	groups := []struct {
		name   string
		count  int
		fields []string
	}{
		{name: "enemy", count: 3, fields: []string{"distance", "bearing", "health", "pressure", "score", "attack_range"}},
		{name: "ally", count: 3, fields: []string{"distance", "bearing", "health", "pressure", "score"}},
		{name: "monster", count: 3, fields: []string{"distance", "bearing", "health", "score", "attack_range"}},
	}
	for _, group := range groups {
		for slot := 0; slot < group.count; slot++ {
			for _, name := range group.fields {
				features = append(features, fmt.Sprintf("%s_%d_%s", group.name, slot, name))
			}
		}
	}
	features = append(features, "cover_available", "cover_distance", "cover_quality")
	return features
}

func botMLTacticalIntentName(value BotMLTacticalIntent) string {
	if int(value) < 0 || int(value) >= len(botMLTacticalIntentNames) {
		return "invalid"
	}
	return botMLTacticalIntentNames[value]
}

func botMLTacticalTargetName(value BotMLTacticalTargetSlot) string {
	if int(value) < 0 || int(value) >= len(botMLTacticalTargetNames) {
		return "invalid"
	}
	return botMLTacticalTargetNames[value]
}

func botMLTacticalMovementName(value BotMLTacticalMovement) string {
	if int(value) < 0 || int(value) >= len(botMLTacticalMovementNames) {
		return "invalid"
	}
	return botMLTacticalMovementNames[value]
}

func botMLTacticalAbilityName(value BotMLTacticalAbility) string {
	if int(value) < 0 || int(value) >= len(botMLTacticalAbilityNames) {
		return "invalid"
	}
	return botMLTacticalAbilityNames[value]
}

func (gs *GameState) BotMLTacticalObservationFor(botID string, now int64) (BotMLTacticalObservation, error) {
	if gs == nil {
		return BotMLTacticalObservation{}, fmt.Errorf("tactical ML observation requires a game state")
	}
	bot := gs.Players[botID]
	if bot == nil {
		return BotMLTacticalObservation{}, fmt.Errorf("tactical ML bot %q was not found", botID)
	}
	base, err := gs.BotMLObservationFor(botID, now)
	if err != nil {
		return BotMLTacticalObservation{}, err
	}
	values := make([]float32, BotMLTacticalObservationSize)
	copy(values, base.Values)
	enemies, allies, monsters := gs.botMLTacticalCandidates(bot, now)
	index := len(base.Values)
	for _, target := range enemies {
		botMLPutTacticalTarget(values, &index, bot, target, 6)
	}
	for _, target := range allies {
		botMLPutTacticalTarget(values, &index, bot, target, 5)
	}
	for _, target := range monsters {
		botMLPutTacticalTarget(values, &index, bot, target, 5)
	}
	for index < len(values)-3 {
		values[index] = 0
		index++
	}
	coverAvailable, coverDistance, coverQuality := gs.botMLCoverFeatures(bot, now)
	values[len(values)-3] = botMLClip(coverAvailable)
	values[len(values)-2] = botMLClip(coverDistance / 1000)
	values[len(values)-1] = botMLClip(coverQuality)

	intentMask := make([]bool, int(BotMLTacticalIntentCount))
	for intent := range intentMask {
		intentMask[intent] = true
	}
	if len(enemies) == 0 {
		intentMask[BotMLTacticalIntentEngage] = false
		intentMask[BotMLTacticalIntentKite] = false
		intentMask[BotMLTacticalIntentChase] = false
	}
	if !bot.IsAlive() {
		for intent := range intentMask {
			intentMask[intent] = false
		}
	}
	targetMask := make([]bool, int(BotMLTacticalTargetCount))
	targetMask[BotMLTacticalTargetNone] = true
	for slot := 0; slot < len(enemies) && slot < 3; slot++ {
		targetMask[int(BotMLTacticalTargetEnemy0)+slot] = true
	}
	if len(allies) > 0 {
		targetMask[BotMLTacticalTargetAlly0] = true
	}
	if gs.Mode == ModeTeamDeathmatch && gs.teamObjective(bot.Team, false) != nil {
		targetMask[BotMLTacticalTargetObjective] = true
	}
	if len(monsters) > 0 {
		targetMask[BotMLTacticalTargetMonster0] = true
	}
	if pickup := gs.botPickupTarget(bot); pickup != nil && pickup.Active {
		targetMask[BotMLTacticalTargetPickup] = true
	}
	movementMask := make([]bool, int(BotMLTacticalMovementCount))
	for movement := range movementMask {
		movementMask[movement] = true
	}
	movementMask[BotMLTacticalMovementCover] = coverAvailable > 0
	abilityMask := []bool{true, bot.GadgetCharges > 0, bot.SuperCharge >= SuperMaxChargePercent}
	return BotMLTacticalObservation{
		SchemaVersion: BotMLTacticalSchemaVersion,
		Values:        values,
		IntentMask:    intentMask,
		TargetMask:    targetMask,
		MovementMask:  movementMask,
		AbilityMask:   abilityMask,
	}, nil
}

func botMLPutTacticalTarget(values []float32, index *int, bot *player.Player, target *botTarget, fields int) {
	if index == nil || target == nil || *index >= len(values) {
		return
	}
	start := *index
	put := func(value float64) {
		if *index < len(values) && *index-start < fields {
			values[*index] = botMLClip(value)
			*index = *index + 1
		}
	}
	put(target.distance / 1000)
	put(botMLBearing(bot.X, bot.Y, target.x, target.y))
	health := 1.0
	if target.player != nil {
		health = float64(target.player.Lives) / math.Max(1, float64(target.player.MaxLives))
	} else if target.monster != nil {
		health = float64(target.monster.Lives) / math.Max(1, float64(target.monster.MaxLives))
	}
	attackRange := 0.0
	if target.player != nil {
		attackRange = botAttackRange(target.player) / 800
	}
	if target.kind == "monster" {
		put(health)
		put(target.score / 100)
		put(attackRange)
		return
	}
	pressure := 0.0
	if target.player != nil && target.player.LastShootAt > 0 {
		pressure = 1
	}
	put(health)
	put(pressure)
	put(target.score / 100)
	if fields >= 6 {
		put(attackRange)
	}
}

func (gs *GameState) botMLTacticalCandidates(bot *player.Player, now int64) (enemies, allies, monsters []*botTarget) {
	if gs == nil || bot == nil {
		return nil, nil, nil
	}
	for id, candidate := range gs.Players {
		if candidate == nil || id == bot.PlayerId || !candidate.IsAlive() || !gs.botCanSee(bot, candidate, now) {
			continue
		}
		distance := math.Hypot(candidate.X-bot.X, candidate.Y-bot.Y)
		target := &botTarget{kind: "player", id: id, player: candidate, x: candidate.X, y: candidate.Y, distance: distance}
		if candidate.Team != "" && candidate.Team == bot.Team {
			if candidate.Lives < candidate.MaxLives || candidate.LastDamageAt > 0 {
				target.score = (1-float64(candidate.Lives)/math.Max(1, float64(candidate.MaxLives)))*100 - distance/100
				allies = append(allies, target)
			}
			continue
		}
		target.score = gs.botTargetScore(bot, target, now)
		enemies = append(enemies, target)
	}
	for id, candidate := range gs.Monsters {
		if candidate == nil || !gs.botCanSeeMonster(bot, candidate) {
			continue
		}
		distance := math.Hypot(candidate.X-bot.X, candidate.Y-bot.Y)
		monsters = append(monsters, &botTarget{kind: "monster", id: id, monster: candidate, x: candidate.X, y: candidate.Y, distance: distance, score: 100 - distance/10})
	}
	sort.Slice(enemies, func(i, j int) bool {
		return enemies[i].score > enemies[j].score || enemies[i].score == enemies[j].score && enemies[i].id < enemies[j].id
	})
	sort.Slice(allies, func(i, j int) bool {
		return allies[i].score > allies[j].score || allies[i].score == allies[j].score && allies[i].id < allies[j].id
	})
	sort.Slice(monsters, func(i, j int) bool {
		return monsters[i].score > monsters[j].score || monsters[i].score == monsters[j].score && monsters[i].id < monsters[j].id
	})
	if len(enemies) > 3 {
		enemies = enemies[:3]
	}
	if len(allies) > 3 {
		allies = allies[:3]
	}
	if len(monsters) > 3 {
		monsters = monsters[:3]
	}
	return enemies, allies, monsters
}

func (gs *GameState) botMLCoverFeatures(bot *player.Player, now int64) (available, distance, quality float64) {
	if gs == nil || bot == nil || gs.Map == nil {
		return 0, 0, 0
	}
	wall := gs.closestWallOfType(bot.X, bot.Y, "crates")
	if wall == nil {
		return 0, 0, 0
	}
	wallX, wallY := (wall.MinX+wall.MaxX)/2, (wall.MinY+wall.MaxY)/2
	distance = math.Hypot(wallX-bot.X, wallY-bot.Y)
	if distance > BotVisionRange*1.2 {
		return 0, distance, 0
	}
	quality = 1
	if target := gs.botSelectTarget(bot, now); target != nil && target.player != nil {
		if segmentHitsBlockingWallExcept(target.x, target.y, bot.X, bot.Y, 2, gs.Walls, "cover") {
			quality = 1
		} else {
			quality = .25
		}
	}
	return 1, distance, quality
}
