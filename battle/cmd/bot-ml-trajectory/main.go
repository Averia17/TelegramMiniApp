package main

import (
	"battle/model/game"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
)

type trajectoryHeader struct {
	RecordType        string   `json:"recordType"`
	SchemaVersion     string   `json:"schemaVersion"`
	SchemaFingerprint string   `json:"schemaFingerprint"`
	ObservationSize   int      `json:"observationSize"`
	FeatureNames      []string `json:"featureNames"`
	ActionNames       []string `json:"actionNames"`
}

type trajectoryRecord struct {
	RecordType  string                `json:"recordType"`
	AtMs        int64                 `json:"atMs"`
	EpisodeID   string                `json:"episodeId"`
	Seed        int64                 `json:"seed"`
	BotID       string                `json:"botId"`
	Hero        string                `json:"hero"`
	Policy      string                `json:"policy"`
	Observation game.BotMLObservation `json:"observation"`
	Action      game.BotMLAction      `json:"action"`
}

func main() {
	episodes := flag.Int("episodes", 1, "number of deterministic expert episodes")
	durationMs := flag.Int64("duration-ms", 5_000, "episode duration")
	seed := flag.Int64("seed", 123, "first episode seed; later episodes increment it")
	matrix := flag.Bool("matrix", false, "export trajectories from the full deterministic tactical scenario matrix")
	checkpointPath := flag.String("checkpoint", "", "optional ML checkpoint for DAgger state-distribution collection")
	output := flag.String("output", "-", "JSONL output path, or - for stdout")
	flag.Parse()
	if *episodes <= 0 || *durationMs <= 0 {
		fmt.Fprintln(os.Stderr, "episodes and duration-ms must be positive")
		os.Exit(2)
	}

	writer := io.Writer(os.Stdout)
	var outputFile *os.File
	if *output != "-" {
		var err error
		outputFile, err = os.Create(*output)
		if err != nil {
			fmt.Fprintf(os.Stderr, "create trajectory output: %v\n", err)
			os.Exit(1)
		}
		defer outputFile.Close()
		writer = outputFile
	}
	encoder := json.NewEncoder(writer)
	if err := encoder.Encode(trajectoryHeader{
		RecordType:        "header",
		SchemaVersion:     game.BotMLObservationSchemaVersion,
		SchemaFingerprint: game.BotMLSchemaFingerprint(),
		ObservationSize:   game.BotMLObservationSize,
		FeatureNames:      game.BotMLFeatureNames(),
		ActionNames:       botMLActionNames(),
	}); err != nil {
		fmt.Fprintf(os.Stderr, "encode trajectory header: %v\n", err)
		os.Exit(1)
	}

	scenarios := []string{"open_engage"}
	if *matrix {
		scenarios = game.BotMLScenarioIDs()
	}
	var policy game.BotMLPolicy
	if *checkpointPath != "" {
		loaded, err := game.LoadBotMLRecurrentPolicy(*checkpointPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "load trajectory checkpoint: %v\n", err)
			os.Exit(1)
		}
		policy = loaded
	}
	for episode := 0; episode < *episodes; episode++ {
		for scenarioIndex, scenarioID := range scenarios {
			runIndex := episode*len(scenarios) + scenarioIndex
			episodeSeed := *seed + int64(runIndex)
			state, buildErr := game.NewBotMLScenarioState(scenarioID, runIndex)
			if buildErr != nil {
				fmt.Fprintf(os.Stderr, "build trajectory scenario %d: %v\n", runIndex, buildErr)
				os.Exit(1)
			}
			state.EnableBotMLTrajectoryRecording(true)
			state.SetBotMLPolicy(policy)
			runner := game.NewCombatScenarioRunner(fmt.Sprintf("bot-ml-expert-%s-%d", scenarioID, episode), episodeSeed, game.ModeDeathmatch, state)
			state.GameEndsAt = runner.CurrentTimeMs() + *durationMs + 1_000
			if err := runner.AdvanceTo(*durationMs); err != nil {
				fmt.Fprintf(os.Stderr, "run trajectory episode %d: %v\n", episode, err)
				os.Exit(1)
			}
			for _, sample := range state.BotMLTrajectorySnapshot() {
				if err := encoder.Encode(trajectoryRecord{
					RecordType: "sample", AtMs: sample.AtMs, EpisodeID: fmt.Sprintf("%s-%d", scenarioID, episode), Seed: episodeSeed,
					BotID: sample.BotID, Hero: sample.Hero, Policy: sample.Policy,
					Observation: sample.Observation, Action: sample.Action,
				}); err != nil {
					fmt.Fprintf(os.Stderr, "encode trajectory episode %d: %v\n", episode, err)
					os.Exit(1)
				}
			}
		}
	}
}

func botMLActionNames() []string {
	names := make([]string, 0, int(game.BotMLActionCount))
	for action := game.BotMLAction(0); action < game.BotMLActionCount; action++ {
		names = append(names, game.BotMLActionName(action))
	}
	return names
}
