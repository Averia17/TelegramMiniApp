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
	Type          string                     `json:"type"`
	SchemaVersion string                     `json:"schemaVersion,omitempty"`
	Observation   *game.BotMLObservation     `json:"observation,omitempty"`
	Action        *game.BotMLAction          `json:"action,omitempty"`
	Reward        float64                    `json:"reward,omitempty"`
	Report        *game.CombatScenarioReport `json:"report,omitempty"`
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

func main() {
	durationMs := flag.Int64("duration-ms", 5_000, "episode duration")
	seed := flag.Int64("seed", 123, "deterministic episode seed")
	scenarioID := flag.String("scenario", "open_engage", "deterministic ML scenario id")
	flag.Parse()
	if *durationMs <= 0 {
		fmt.Fprintln(os.Stderr, "duration-ms must be positive")
		os.Exit(2)
	}
	output := bufio.NewWriter(os.Stdout)
	encoder := json.NewEncoder(output)
	input := bufio.NewScanner(os.Stdin)
	state, err := game.NewBotMLScenarioState(*scenarioID, int(*seed))
	if err != nil {
		fmt.Fprintf(os.Stderr, "build IPC scenario: %v\n", err)
		os.Exit(1)
	}
	policy := &stdinPolicy{input: input, output: encoder, writer: output, bot: state.Players["bot"], enemy: state.Players["enemy"]}
	state.SetBotMLPolicy(policy)
	runner := game.NewCombatScenarioRunner("bot-ml-ipc", *seed, game.ModeDeathmatch, state)
	state.GameEndsAt = runner.CurrentTimeMs() + *durationMs + 1_000
	if err := writeMessage(output, protocolMessage{Type: "ready", SchemaVersion: game.BotMLObservationSchemaVersion}); err != nil {
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
