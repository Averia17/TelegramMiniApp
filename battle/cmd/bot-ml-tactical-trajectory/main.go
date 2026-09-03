package main

import (
	"battle/model/game"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"sort"
)

type tacticalHeader struct {
	RecordType        string   `json:"recordType"`
	SchemaVersion     string   `json:"schemaVersion"`
	SchemaFingerprint string   `json:"schemaFingerprint"`
	ObservationSize   int      `json:"observationSize"`
	FeatureNames      []string `json:"featureNames"`
	IntentNames       []string `json:"intentNames"`
	TargetNames       []string `json:"targetNames"`
	MovementNames     []string `json:"movementNames"`
	AbilityNames      []string `json:"abilityNames"`
}

type tacticalRecord struct {
	RecordType  string                        `json:"recordType"`
	AtMs        int64                         `json:"atMs"`
	EpisodeID   string                        `json:"episodeId"`
	Seed        int64                         `json:"seed"`
	BotID       string                        `json:"botId"`
	Hero        string                        `json:"hero"`
	Policy      string                        `json:"policy"`
	Observation game.BotMLTacticalObservation `json:"observation"`
	Intent      game.BotMLTacticalIntent      `json:"intent"`
	Target      game.BotMLTacticalTargetSlot  `json:"target"`
	Movement    game.BotMLTacticalMovement    `json:"movement"`
	Ability     game.BotMLTacticalAbility     `json:"ability"`
}

func main() {
	episodes := flag.Int("episodes", 8, "number of 3v3 expert episodes")
	durationMs := flag.Int64("duration-ms", 10_000, "episode duration")
	seed := flag.Int64("seed", 123, "first episode seed")
	output := flag.String("output", "-", "JSONL output path, or - for stdout")
	flag.Parse()
	if *episodes <= 0 || *durationMs <= 0 {
		fmt.Fprintln(os.Stderr, "episodes and duration-ms must be positive")
		os.Exit(2)
	}
	var writer io.Writer = os.Stdout
	var outputFile *os.File
	if *output != "-" {
		var err error
		outputFile, err = os.Create(*output)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		defer outputFile.Close()
		writer = outputFile
	}
	encoder := json.NewEncoder(writer)
	if err := encoder.Encode(tacticalHeader{RecordType: "header", SchemaVersion: game.BotMLTacticalSchemaVersion, SchemaFingerprint: game.BotMLTacticalSchemaFingerprint(), ObservationSize: game.BotMLTacticalObservationSize, FeatureNames: game.BotMLTacticalFeatureNames(), IntentNames: game.BotMLTacticalIntentNames(), TargetNames: game.BotMLTacticalTargetNames(), MovementNames: game.BotMLTacticalMovementNames(), AbilityNames: game.BotMLTacticalAbilityNames()}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	for episode := 0; episode < *episodes; episode++ {
		state, err := game.NewBotMLTeamScenarioState(episode)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		runner := game.NewCombatScenarioRunner(fmt.Sprintf("bot-ml-tactical-expert-%d", episode), *seed+int64(episode), game.ModeTeamDeathmatch, state)
		state.GameEndsAt = runner.CurrentTimeMs() + *durationMs + 1_000
		ids := make([]string, 0, len(state.Players))
		for id := range state.Players {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		for at := int64(0); at <= *durationMs; at += 240 {
			if err := runner.AdvanceTo(at); err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			for _, id := range ids {
				bot := state.Players[id]
				if bot == nil || !bot.IsAlive() {
					continue
				}
				observation, err := state.BotMLTacticalObservationFor(id, runner.CurrentTimeMs())
				if err != nil {
					continue
				}
				decision, err := state.BotMLTacticalExpertDecisionFor(id, runner.CurrentTimeMs())
				if err != nil {
					continue
				}
				if err := encoder.Encode(tacticalRecord{RecordType: "sample", AtMs: at, EpisodeID: fmt.Sprintf("team-3v3-%d", episode), Seed: *seed + int64(episode), BotID: id, Hero: bot.HeroName, Policy: "deterministic-team-teacher", Observation: observation, Intent: decision.Intent, Target: decision.Target, Movement: decision.Movement, Ability: decision.Ability}); err != nil {
					fmt.Fprintln(os.Stderr, err)
					os.Exit(1)
				}
			}
		}
	}
}
