package game

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sync"
)

// BotMLRecurrentCheckpoint is the portable inference artifact emitted by the
// Python trainer. LSTM matrices use PyTorch's gate order: input, forget,
// cell-update, output. Keeping the artifact as JSON makes the first runtime
// integration auditable and avoids adding an inference dependency to battle.
type BotMLRecurrentCheckpoint struct {
	Kind               string      `json:"kind"`
	SchemaVersion      string      `json:"schemaVersion"`
	SchemaFingerprint  string      `json:"schemaFingerprint"`
	CombatProfileID    string      `json:"combatProfileId"`
	CombatRulesVersion string      `json:"combatRulesVersion"`
	InputSize          int         `json:"inputSize"`
	HiddenSize         int         `json:"hiddenSize"`
	ActionSize         int         `json:"actionSize"`
	InputToHidden      [][]float64 `json:"inputToHidden"`
	HiddenToHidden     [][]float64 `json:"hiddenToHidden"`
	LSTMBias           []float64   `json:"lstmBias"`
	ActorWeight        [][]float64 `json:"actorWeight"`
	ActorBias          []float64   `json:"actorBias"`
}

type botMLRecurrentState struct {
	h []float64
	c []float64
}

// BotMLStatefulPolicy is an optional extension of BotMLPolicy for recurrent
// models. The bot ID is part of the call so hidden state cannot leak between
// players when one policy instance serves a whole match.
type BotMLStatefulPolicy interface {
	BotMLPolicy
	DecideFor(botID string, observation BotMLObservation) BotMLAction
	Reset(botID string)
}

type BotMLRecurrentPolicy struct {
	checkpoint BotMLRecurrentCheckpoint
	mu         sync.Mutex
	states     map[string]botMLRecurrentState
}

func NewBotMLRecurrentPolicy(checkpoint BotMLRecurrentCheckpoint) (*BotMLRecurrentPolicy, error) {
	if err := validateBotMLRecurrentCheckpoint(checkpoint); err != nil {
		return nil, err
	}
	return &BotMLRecurrentPolicy{
		checkpoint: cloneBotMLRecurrentCheckpoint(checkpoint),
		states:     make(map[string]botMLRecurrentState),
	}, nil
}

func LoadBotMLRecurrentPolicy(path string) (*BotMLRecurrentPolicy, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read ML checkpoint: %w", err)
	}
	var checkpoint BotMLRecurrentCheckpoint
	if err := json.Unmarshal(data, &checkpoint); err != nil {
		return nil, fmt.Errorf("decode ML checkpoint: %w", err)
	}
	return NewBotMLRecurrentPolicy(checkpoint)
}

func (p *BotMLRecurrentPolicy) Name() string {
	if p == nil || p.checkpoint.Kind == "" {
		return "recurrent-ppo-lstm-v1"
	}
	return p.checkpoint.Kind
}

func (p *BotMLRecurrentPolicy) Decide(observation BotMLObservation) BotMLAction {
	return p.DecideFor("__default__", observation)
}

func (p *BotMLRecurrentPolicy) DecideFor(botID string, observation BotMLObservation) BotMLAction {
	if p == nil || !validBotMLObservation(observation) {
		return BotMLActionRoam
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	state := p.states[botID]
	state.h, state.c = p.stepLSTM(state.h, state.c, observation.Values)
	p.states[botID] = botMLRecurrentState{h: state.h, c: state.c}
	logits := make([]float64, p.checkpoint.ActionSize)
	for action := range logits {
		logits[action] = p.checkpoint.ActorBias[action]
		for hidden, value := range state.h {
			logits[action] += p.checkpoint.ActorWeight[action][hidden] * value
		}
	}
	selected := BotMLActionRoam
	best := math.Inf(-1)
	for action, valid := range observation.ActionMask {
		if valid && logits[action] > best {
			best = logits[action]
			selected = BotMLAction(action)
		}
	}
	return selected
}

func (p *BotMLRecurrentPolicy) Reset(botID string) {
	if p == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.states, botID)
}

func (p *BotMLRecurrentPolicy) stepLSTM(previousH, previousC []float64, values []float32) ([]float64, []float64) {
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

func sigmoid(value float64) float64 {
	if value >= 0 {
		z := math.Exp(-value)
		return 1 / (1 + z)
	}
	z := math.Exp(value)
	return z / (1 + z)
}

func validBotMLObservation(observation BotMLObservation) bool {
	if observation.SchemaVersion != BotMLObservationSchemaVersion || len(observation.Values) != BotMLObservationSize || len(observation.ActionMask) != int(BotMLActionCount) {
		return false
	}
	for _, value := range observation.Values {
		if math.IsNaN(float64(value)) || math.IsInf(float64(value), 0) || value < -1 || value > 1 {
			return false
		}
	}
	for _, valid := range observation.ActionMask {
		if valid {
			return true
		}
	}
	return false
}

func validateBotMLRecurrentCheckpoint(checkpoint BotMLRecurrentCheckpoint) error {
	if checkpoint.Kind != "recurrent-ppo-lstm-v1" || checkpoint.SchemaVersion != BotMLObservationSchemaVersion || checkpoint.SchemaFingerprint != BotMLSchemaFingerprint() || checkpoint.CombatProfileID != CombatProfileID || checkpoint.CombatRulesVersion != CombatRulesVersion || checkpoint.InputSize != BotMLObservationSize || checkpoint.HiddenSize < 1 || checkpoint.HiddenSize > 256 || checkpoint.ActionSize != int(BotMLActionCount) {
		return fmt.Errorf("invalid ML checkpoint metadata")
	}
	if len(checkpoint.InputToHidden) != checkpoint.HiddenSize*4 || len(checkpoint.HiddenToHidden) != checkpoint.HiddenSize*4 || len(checkpoint.LSTMBias) != checkpoint.HiddenSize*4 || len(checkpoint.ActorWeight) != checkpoint.ActionSize || len(checkpoint.ActorBias) != checkpoint.ActionSize {
		return fmt.Errorf("invalid ML checkpoint matrix shape")
	}
	for row := range checkpoint.InputToHidden {
		if len(checkpoint.InputToHidden[row]) != checkpoint.InputSize {
			return fmt.Errorf("invalid ML input matrix row %d", row)
		}
		if !finiteFloat64s(checkpoint.InputToHidden[row]) {
			return fmt.Errorf("invalid ML input matrix values")
		}
	}
	for row := range checkpoint.HiddenToHidden {
		if len(checkpoint.HiddenToHidden[row]) != checkpoint.HiddenSize {
			return fmt.Errorf("invalid ML hidden matrix row %d", row)
		}
		if !finiteFloat64s(checkpoint.HiddenToHidden[row]) {
			return fmt.Errorf("invalid ML hidden matrix values")
		}
	}
	if !finiteFloat64s(checkpoint.LSTMBias) || !finiteFloat64s(checkpoint.ActorBias) {
		return fmt.Errorf("invalid ML bias values")
	}
	for action := range checkpoint.ActorWeight {
		if len(checkpoint.ActorWeight[action]) != checkpoint.HiddenSize {
			return fmt.Errorf("invalid ML actor matrix row %d", action)
		}
		if !finiteFloat64s(checkpoint.ActorWeight[action]) {
			return fmt.Errorf("invalid ML actor matrix values")
		}
	}
	return nil
}

func finiteFloat64s(values []float64) bool {
	for _, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return false
		}
	}
	return true
}

func cloneBotMLRecurrentCheckpoint(source BotMLRecurrentCheckpoint) BotMLRecurrentCheckpoint {
	clone := source
	clone.LSTMBias, clone.ActorBias = append([]float64(nil), source.LSTMBias...), append([]float64(nil), source.ActorBias...)
	clone.InputToHidden, clone.HiddenToHidden, clone.ActorWeight = cloneMatrix(source.InputToHidden), cloneMatrix(source.HiddenToHidden), cloneMatrix(source.ActorWeight)
	return clone
}

func cloneMatrix(source [][]float64) [][]float64 {
	clone := make([][]float64, len(source))
	for row := range source {
		clone[row] = append([]float64(nil), source[row]...)
	}
	return clone
}
