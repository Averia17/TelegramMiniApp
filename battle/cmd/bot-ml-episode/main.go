package main

import (
	"battle/model/game"
	"battle/model/player"
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

type protocolMessage struct {
	Type                string                         `json:"type"`
	BotID               string                         `json:"botId,omitempty"`
	SchemaVersion       string                         `json:"schemaVersion,omitempty"`
	Observation         *game.BotMLObservation         `json:"observation,omitempty"`
	TacticalObservation *game.BotMLTacticalObservation `json:"tacticalObservation,omitempty"`
	Action              *game.BotMLAction              `json:"action,omitempty"`
	TacticalAction      *tacticalActionMessage         `json:"tacticalAction,omitempty"`
	Reward              float64                        `json:"reward,omitempty"`
	RewardBreakdown     *game.BotMLTacticalReward      `json:"rewardBreakdown,omitempty"`
	Report              *game.CombatScenarioReport     `json:"report,omitempty"`
}

type tacticalActionMessage struct {
	Intent   int `json:"intent"`
	Target   int `json:"target"`
	Movement int `json:"movement"`
	Ability  int `json:"ability"`
}

type stdinPolicy struct {
	input                                       *bufio.Scanner
	output                                      *json.Encoder
	writer                                      *bufio.Writer
	bot                                         *player.Player
	enemy                                       *player.Player
	prevBotLives, prevEnemyLives, prevBotDamage int
	initialized                                 bool
}

func (p *stdinPolicy) Name() string { return "ipc-external-v1" }

func (p *stdinPolicy) Decide(observation game.BotMLObservation) game.BotMLAction {
	if err := p.output.Encode(protocolMessage{Type: "observation", Observation: &observation, Reward: p.rewardSinceLastDecision()}); err != nil {
		return game.BotMLActionRoam
	}
	if err := p.writer.Flush(); err != nil {
		return game.BotMLActionRoam
	}
	if !p.input.Scan() {
		return game.BotMLActionRoam
	}
	var message struct {
		Action int `json:"action"`
	}
	if err := json.Unmarshal(p.input.Bytes(), &message); err != nil || message.Action < 0 || message.Action >= int(game.BotMLActionCount) {
		return game.BotMLActionRoam
	}
	p.captureState()
	return game.BotMLAction(message.Action)
}

func (p *stdinPolicy) rewardSinceLastDecision() float64 {
	if p == nil || p.bot == nil || p.enemy == nil || !p.initialized {
		return 0
	}
	return float64(p.prevEnemyLives-p.enemy.Lives)*0.01 - float64(p.prevBotLives-p.bot.Lives)*0.01 + float64(p.bot.BasicDamage-p.prevBotDamage)*0.001
}

func (p *stdinPolicy) captureState() {
	if p == nil || p.bot == nil || p.enemy == nil {
		return
	}
	p.prevBotLives, p.prevEnemyLives = p.bot.Lives, p.enemy.Lives
	p.prevBotDamage = p.bot.BasicDamage
	p.initialized = true
}

type stdinTacticalPolicy struct {
	input     *bufio.Scanner
	output    *json.Encoder
	writer    *bufio.Writer
	bots      map[string]*player.Player
	state     *game.GameState
	last      map[string]tacticalSnapshot
	decisions map[string]game.BotMLTacticalDecision
}

type tacticalSnapshot struct {
	lives, damage int
}

func (p *stdinTacticalPolicy) DecideTactical(botID string, observation game.BotMLTacticalObservation) game.BotMLTacticalDecision {
	if p == nil || p.input == nil || p.output == nil || p.writer == nil {
		return game.BotMLTacticalDecision{}
	}
	reward := p.rewardSinceLastDecision(botID)
	if err := p.output.Encode(protocolMessage{Type: "tactical_observation", BotID: botID, TacticalObservation: &observation, Reward: reward.Total, RewardBreakdown: &reward}); err != nil {
		return game.BotMLTacticalDecision{}
	}
	if err := p.writer.Flush(); err != nil || !p.input.Scan() {
		return game.BotMLTacticalDecision{}
	}
	var message struct {
		TacticalAction tacticalActionMessage `json:"tacticalAction"`
	}
	if err := json.Unmarshal(p.input.Bytes(), &message); err != nil {
		return game.BotMLTacticalDecision{}
	}
	decision := game.BotMLTacticalDecision{
		Intent: game.BotMLTacticalIntent(message.TacticalAction.Intent), Target: game.BotMLTacticalTargetSlot(message.TacticalAction.Target),
		Movement: game.BotMLTacticalMovement(message.TacticalAction.Movement), Ability: game.BotMLTacticalAbility(message.TacticalAction.Ability),
	}
	if p.decisions == nil {
		p.decisions = make(map[string]game.BotMLTacticalDecision)
	}
	p.decisions[botID] = decision
	p.captureState(botID)
	return decision
}

func (p *stdinTacticalPolicy) rewardSinceLastDecision(botID string) game.BotMLTacticalReward {
	if p == nil || p.bots == nil {
		return game.BotMLTacticalReward{}
	}
	bot := p.bots[botID]
	if bot == nil {
		return game.BotMLTacticalReward{}
	}
	previous := p.last[botID]
	if previous.lives == 0 && previous.damage == 0 {
		p.captureState(botID)
		return game.BotMLTacticalReward{}
	}
	reward := game.BotMLTacticalReward{}
	if p.state != nil {
		decision := p.decisions[botID]
		target := p.state.BotMLTacticalTargetFor(botID, decision.Target)
		reward = p.state.BotMLTacticalRewardFor(botID, decision, target)
	}
	reward.Total += float64(bot.BasicDamage-previous.damage)*0.002 - float64(maxInt(0, previous.lives-bot.Lives))*0.01
	return reward
}

func (p *stdinTacticalPolicy) captureState(botID string) {
	if p == nil || p.bots == nil {
		return
	}
	if p.last == nil {
		p.last = make(map[string]tacticalSnapshot)
	}
	if bot := p.bots[botID]; bot != nil {
		p.last[botID] = tacticalSnapshot{lives: bot.Lives, damage: bot.BasicDamage}
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func main() {
	durationMs := flag.Int64("duration-ms", 5_000, "episode duration")
	seed := flag.Int64("seed", 123, "deterministic episode seed")
	scenarioID := flag.String("scenario", "open_engage", "deterministic ML scenario id")
	team3v3 := flag.Bool("team-3v3", false, "run six-agent tactical 3v3 self-play protocol")
	flag.Parse()
	if *durationMs <= 0 {
		fmt.Fprintln(os.Stderr, "duration-ms must be positive")
		os.Exit(2)
	}
	output := bufio.NewWriter(os.Stdout)
	encoder := json.NewEncoder(output)
	input := bufio.NewScanner(os.Stdin)
	var state *game.GameState
	var err error
	if *team3v3 {
		state, err = game.NewBotMLTeamScenarioState(int(*seed))
	} else {
		state, err = game.NewBotMLScenarioState(*scenarioID, int(*seed))
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "build IPC scenario: %v\n", err)
		os.Exit(1)
	}
	readySchema := game.BotMLObservationSchemaVersion
	runnerMode := game.ModeDeathmatch
	if *team3v3 {
		policy := &stdinTacticalPolicy{input: input, output: encoder, writer: output, bots: state.Players, state: state, last: make(map[string]tacticalSnapshot), decisions: make(map[string]game.BotMLTacticalDecision)}
		state.SetBotMLTacticalPolicy(policy)
		state.SetBotMLTacticalDirect(true)
		readySchema = game.BotMLTacticalSchemaVersion
		runnerMode = game.ModeTeamDeathmatch
	} else {
		policy := &stdinPolicy{input: input, output: encoder, writer: output, bot: state.Players["bot"], enemy: state.Players["enemy"]}
		state.SetBotMLPolicy(policy)
	}
	runner := game.NewCombatScenarioRunner("bot-ml-ipc", *seed, runnerMode, state)
	state.GameEndsAt = runner.CurrentTimeMs() + *durationMs + 1_000
	if err := writeMessage(output, protocolMessage{Type: "ready", SchemaVersion: readySchema}); err != nil {
		fmt.Fprintf(os.Stderr, "write IPC ready: %v\n", err)
		os.Exit(1)
	}
	if err := runner.AdvanceTo(*durationMs); err != nil {
		fmt.Fprintf(os.Stderr, "run IPC episode: %v\n", err)
		os.Exit(1)
	}
	runner.Checkpoint(*durationMs)
	if err := runner.RecordBotAIMetrics("bot"); err != nil {
		fmt.Fprintf(os.Stderr, "record IPC metrics: %v\n", err)
		os.Exit(1)
	}
	report := runner.Report()
	if err := writeMessage(output, protocolMessage{Type: "report", Report: &report}); err != nil {
		// The Python bridge may intentionally close after receiving the complete
		// report while the process is draining. Treat that broken pipe as a
		// graceful peer disconnect; incomplete reports are rejected by the
		// bridge's timeout/JSON validation.
		return
	}
}

func writeMessage(output *bufio.Writer, message protocolMessage) error {
	if err := json.NewEncoder(output).Encode(message); err != nil {
		return err
	}
	return output.Flush()
}
