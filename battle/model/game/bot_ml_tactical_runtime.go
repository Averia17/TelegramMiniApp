package game

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sync"
)

const (
	botMLTacticalKind       = "recurrent-ppo-lstm-tactical-v2"
	botMLTacticalHiddenLimit = 256
)

// BotMLTacticalCheckpoint is the portable multi-head actor artifact. The
// shared LSTM is followed by four masked categorical heads: intent, target,
// movement and ability. Keeping the format JSON makes it inspectable and
// keeps battle free of a Python/ONNX runtime dependency.
type BotMLTacticalCheckpoint struct {
	Kind               string      `json:"kind"`
	SchemaVersion      string      `json:"schemaVersion"`
	SchemaFingerprint  string      `json:"schemaFingerprint"`
	CombatProfileID    string      `json:"combatProfileId"`
	CombatRulesVersion string      `json:"combatRulesVersion"`
	InputSize          int         `json:"inputSize"`
	HiddenSize         int         `json:"hiddenSize"`
	InputToHidden      [][]float64 `json:"inputToHidden"`
	HiddenToHidden     [][]float64 `json:"hiddenToHidden"`
	LSTMBias           []float64   `json:"lstmBias"`
	IntentWeight       [][]float64 `json:"intentWeight"`
	IntentBias         []float64   `json:"intentBias"`
	TargetWeight       [][]float64 `json:"targetWeight"`
	TargetBias         []float64   `json:"targetBias"`
	MovementWeight     [][]float64 `json:"movementWeight"`
	MovementBias       []float64   `json:"movementBias"`
	AbilityWeight      [][]float64 `json:"abilityWeight"`
	AbilityBias        []float64   `json:"abilityBias"`
}

type BotMLTacticalRecurrentPolicy struct {
	checkpoint BotMLTacticalCheckpoint
	mu         sync.Mutex
	states     map[string]botMLRecurrentState
}

func NewBotMLTacticalRecurrentPolicy(checkpoint BotMLTacticalCheckpoint) (*BotMLTacticalRecurrentPolicy, error) {
	if err := validateBotMLTacticalCheckpoint(checkpoint); err != nil {
		return nil, err
	}
	return &BotMLTacticalRecurrentPolicy{
		checkpoint: cloneBotMLTacticalCheckpoint(checkpoint),
		states:     make(map[string]botMLRecurrentState),
	}, nil
}

func LoadBotMLTacticalPolicy(path string) (*BotMLTacticalRecurrentPolicy, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read tactical ML checkpoint: %w", err)
	}
	var checkpoint BotMLTacticalCheckpoint
	if err := json.Unmarshal(data, &checkpoint); err != nil {
		return nil, fmt.Errorf("decode tactical ML checkpoint: %w", err)
	}
	return NewBotMLTacticalRecurrentPolicy(checkpoint)
}

func (p *BotMLTacticalRecurrentPolicy) Name() string {
	if p == nil || p.checkpoint.Kind == "" {
		return botMLTacticalKind
	}
	return p.checkpoint.Kind
}

func (p *BotMLTacticalRecurrentPolicy) DecideTactical(botID string, observation BotMLTacticalObservation) BotMLTacticalDecision {
	if p == nil || !validBotMLTacticalObservation(observation) {
		return BotMLTacticalDecision{Intent: BotMLTacticalIntentRoam, Target: BotMLTacticalTargetNone, Movement: BotMLTacticalMovementDirect, Ability: BotMLTacticalAbilityNone}
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	state := p.states[botID]
	state.h, state.c = p.stepLSTM(state.h, state.c, observation.Values)
	p.states[botID] = botMLRecurrentState{h: state.h, c: state.c}
	return BotMLTacticalDecision{
		Intent:   BotMLTacticalIntent(p.selectHead(state.h, p.checkpoint.IntentWeight, p.checkpoint.IntentBias, observation.IntentMask)),
		Target:   BotMLTacticalTargetSlot(p.selectHead(state.h, p.checkpoint.TargetWeight, p.checkpoint.TargetBias, observation.TargetMask)),
		Movement: BotMLTacticalMovement(p.selectHead(state.h, p.checkpoint.MovementWeight, p.checkpoint.MovementBias, observation.MovementMask)),
		Ability:  BotMLTacticalAbility(p.selectHead(state.h, p.checkpoint.AbilityWeight, p.checkpoint.AbilityBias, observation.AbilityMask)),
	}
}

func (p *BotMLTacticalRecurrentPolicy) Reset(botID string) {
	if p == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.states, botID)
}

func (p *BotMLTacticalRecurrentPolicy) selectHead(hidden []float64, weights [][]float64, bias []float64, mask []bool) int {
	selected := 0
	best := math.Inf(-1)
	for action, allowed := range mask {
		if !allowed || action >= len(weights) || action >= len(bias) {
			continue
		}
		value := bias[action]
		for unit, hiddenValue := range hidden {
			if unit < len(weights[action]) {
				value += weights[action][unit] * hiddenValue
			}
		}
		if value > best {
			best, selected = value, action
		}
	}
	return selected
}

func (p *BotMLTacticalRecurrentPolicy) stepLSTM(previousH, previousC []float64, values []float32) ([]float64, []float64) {
	hidden := p.checkpoint.HiddenSize
	h := make([]float64, hidden)
	c := make([]float64, hidden)
	if len(previousH) == hidden && len(previousC) == hidden {
		copy(h, previousH)
		copy(c, previousC)
	}
	oldH := append([]float64(nil), h...)
	for unit := 0; unit < hidden; unit++ {
		gates := [4]float64{}
		for gate := 0; gate < 4; gate++ {
			row := gate*hidden + unit
			value := p.checkpoint.LSTMBias[row]
			for index, input := range values {
				value += p.checkpoint.InputToHidden[row][index] * float64(input)
			}
			for index, old := range oldH {
				value += p.checkpoint.HiddenToHidden[row][index] * old
			}
			gates[gate] = value
		}
		inputGate := sigmoid(gates[0])
		forgetGate := sigmoid(gates[1])
		cellUpdate := math.Tanh(gates[2])
		outputGate := sigmoid(gates[3])
		c[unit] = forgetGate*c[unit] + inputGate*cellUpdate
		h[unit] = outputGate * math.Tanh(c[unit])
	}
	return h, c
}

func validBotMLTacticalObservation(observation BotMLTacticalObservation) bool {
	if observation.SchemaVersion != BotMLTacticalSchemaVersion || len(observation.Values) != BotMLTacticalObservationSize || len(observation.IntentMask) != int(BotMLTacticalIntentCount) || len(observation.TargetMask) != int(BotMLTacticalTargetCount) || len(observation.MovementMask) != int(BotMLTacticalMovementCount) || len(observation.AbilityMask) != int(BotMLTacticalAbilityCount) {
		return false
	}
	for _, value := range observation.Values {
		if math.IsNaN(float64(value)) || math.IsInf(float64(value), 0) || value < -1 || value > 1 {
			return false
		}
	}
	return hasValidMask(observation.IntentMask) && hasValidMask(observation.TargetMask) && hasValidMask(observation.MovementMask) && hasValidMask(observation.AbilityMask)
}

func hasValidMask(mask []bool) bool {
	for _, allowed := range mask {
		if allowed {
			return true
		}
	}
	return false
}

func validateBotMLTacticalCheckpoint(checkpoint BotMLTacticalCheckpoint) error {
	if checkpoint.Kind != botMLTacticalKind || checkpoint.SchemaVersion != BotMLTacticalSchemaVersion || checkpoint.SchemaFingerprint != BotMLTacticalSchemaFingerprint() || checkpoint.CombatProfileID != CombatProfileID || checkpoint.CombatRulesVersion != CombatRulesVersion || checkpoint.InputSize != BotMLTacticalObservationSize || checkpoint.HiddenSize < 1 || checkpoint.HiddenSize > botMLTacticalHiddenLimit {
		return fmt.Errorf("invalid tactical ML checkpoint metadata")
	}
	if len(checkpoint.InputToHidden) != checkpoint.HiddenSize*4 || len(checkpoint.HiddenToHidden) != checkpoint.HiddenSize*4 || len(checkpoint.LSTMBias) != checkpoint.HiddenSize*4 {
		return fmt.Errorf("invalid tactical ML LSTM shape")
	}
	if err := validateMatrix(checkpoint.InputToHidden, checkpoint.HiddenSize*4, checkpoint.InputSize, "input"); err != nil { return err }
	if err := validateMatrix(checkpoint.HiddenToHidden, checkpoint.HiddenSize*4, checkpoint.HiddenSize, "hidden"); err != nil { return err }
	if !finiteFloat64s(checkpoint.LSTMBias) { return fmt.Errorf("invalid tactical ML LSTM bias") }
	for name, weights, bias, size := range map[string]struct{ weights [][]float64; bias []float64; size int }{
		"intent": {checkpoint.IntentWeight, checkpoint.IntentBias, int(BotMLTacticalIntentCount)},
		"target": {checkpoint.TargetWeight, checkpoint.TargetBias, int(BotMLTacticalTargetCount)},
		"movement": {checkpoint.MovementWeight, checkpoint.MovementBias, int(BotMLTacticalMovementCount)},
		"ability": {checkpoint.AbilityWeight, checkpoint.AbilityBias, int(BotMLTacticalAbilityCount)},
	} {
		if len(weights) != size || len(bias) != size || !finiteFloat64s(bias) { return fmt.Errorf("invalid tactical ML %s head shape", name) }
		if err := validateMatrix(weights, size, checkpoint.HiddenSize, name); err != nil { return err }
	}
	return nil
}

func validateMatrix(matrix [][]float64, rows, columns int, name string) error {
	if len(matrix) != rows { return fmt.Errorf("invalid tactical ML %s matrix rows", name) }
	for row := range matrix {
		if len(matrix[row]) != columns || !finiteFloat64s(matrix[row]) { return fmt.Errorf("invalid tactical ML %s matrix row %d", name, row) }
	}
	return nil
}

func cloneBotMLTacticalCheckpoint(source BotMLTacticalCheckpoint) BotMLTacticalCheckpoint {
	clone := source
	clone.LSTMBias = append([]float64(nil), source.LSTMBias...)
	clone.IntentBias, clone.TargetBias = append([]float64(nil), source.IntentBias...), append([]float64(nil), source.TargetBias...)
	clone.MovementBias, clone.AbilityBias = append([]float64(nil), source.MovementBias...), append([]float64(nil), source.AbilityBias...)
	clone.InputToHidden, clone.HiddenToHidden = cloneMatrix(source.InputToHidden), cloneMatrix(source.HiddenToHidden)
	clone.IntentWeight, clone.TargetWeight = cloneMatrix(source.IntentWeight), cloneMatrix(source.TargetWeight)
	clone.MovementWeight, clone.AbilityWeight = cloneMatrix(source.MovementWeight), cloneMatrix(source.AbilityWeight)
	return clone
}
