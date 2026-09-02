package main

import (
	"battle/model/game"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

func main() {
	durationMs := flag.Int64("duration-ms", 640, "deterministic episode duration")
	seed := flag.Int64("seed", 123, "paired episode seed")
	episodes := flag.Int("episodes", 1, "number of paired episodes")
	matrix := flag.Bool("matrix", false, "run the full deterministic tactical scenario matrix")
	candidateName := flag.String("candidate", "retreat", "candidate action: roam, engage, retreat, collect_pickup")
	checkpointPath := flag.String("checkpoint", "", "optional recurrent checkpoint JSON")
	outputPath := flag.String("output", "", "optional JSON report output path")
	flag.Parse()

	action := game.BotMLActionRoam
	if *checkpointPath == "" {
		var ok bool
		action, ok = map[string]game.BotMLAction{
			"roam":           game.BotMLActionRoam,
			"engage":         game.BotMLActionEngage,
			"retreat":        game.BotMLActionRetreat,
			"collect_pickup": game.BotMLActionCollectPickup,
		}[*candidateName]
		if !ok {
			fmt.Fprintf(os.Stderr, "unknown candidate action %q\n", *candidateName)
			os.Exit(2)
		}
	}
	if *episodes <= 0 {
		fmt.Fprintln(os.Stderr, "episodes must be positive")
		os.Exit(2)
	}
	scenarios := []string{"open_engage"}
	if *matrix {
		scenarios = game.BotMLScenarioIDs()
	}

	candidateFor := func() game.BotMLPolicy {
		if *checkpointPath != "" {
			loaded, err := game.LoadBotMLRecurrentPolicy(*checkpointPath)
			if err != nil {
				fmt.Fprintf(os.Stderr, "load bot ML checkpoint: %v\n", err)
				os.Exit(1)
			}
			return loaded
		}
		return game.BotMLPolicyFunc{PolicyName: "scripted-" + *candidateName, Fn: func(game.BotMLObservation) game.BotMLAction { return action }}
	}
	checkpointHash := ""
	if *checkpointPath != "" {
		data, err := os.ReadFile(*checkpointPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "read bot ML checkpoint for hash: %v\n", err)
			os.Exit(1)
		}
		digest := sha256.Sum256(data)
		checkpointHash = hex.EncodeToString(digest[:])
	}

	var result interface{}
	var err error
	if *episodes == 1 && len(scenarios) == 1 {
		state, err := game.NewBotMLScenarioState(scenarios[0], 0)
		if err != nil {
			fmt.Fprintf(os.Stderr, "build benchmark scenario: %v\n", err)
			os.Exit(1)
		}
		result, err = game.RunBotMLBenchmark(game.BotMLBenchmarkConfig{
			ScenarioID: "bot-ml-cli-" + scenarios[0], Seed: *seed, Mode: game.ModeDeathmatch, DurationMs: *durationMs,
			BaselineState: state, CandidateState: mustScenarioState(scenarios[0], 0), Candidate: candidateFor(), CandidateCheckpointHash: checkpointHash,
		})
	} else {
		configs := make([]game.BotMLBenchmarkConfig, 0, *episodes*len(scenarios))
		for episode := 0; episode < *episodes; episode++ {
			for scenarioIndex, scenarioID := range scenarios {
				base, buildErr := game.NewBotMLScenarioState(scenarioID, episode*len(scenarios)+scenarioIndex)
				if buildErr != nil {
					fmt.Fprintf(os.Stderr, "build benchmark scenario: %v\n", buildErr)
					os.Exit(1)
				}
				candidateState, buildErr := game.NewBotMLScenarioState(scenarioID, episode*len(scenarios)+scenarioIndex)
				if buildErr != nil {
					fmt.Fprintf(os.Stderr, "build benchmark candidate scenario: %v\n", buildErr)
					os.Exit(1)
				}
				configs = append(configs, game.BotMLBenchmarkConfig{
					ScenarioID: fmt.Sprintf("bot-ml-cli-%s-%d", scenarioID, episode), Seed: *seed + int64(episode*len(scenarios)+scenarioIndex), Mode: game.ModeDeathmatch, DurationMs: *durationMs,
					BaselineState: base, CandidateState: candidateState, Candidate: candidateFor(), CandidateCheckpointHash: checkpointHash,
				})
			}
		}
		result, err = game.RunBotMLBenchmarkSuite(configs)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "bot ML benchmark: %v\n", err)
		os.Exit(1)
	}
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "encode bot ML benchmark: %v\n", err)
		os.Exit(1)
	}
	if *outputPath != "" {
		if err := os.WriteFile(*outputPath, append(data, '\n'), 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "write bot ML benchmark: %v\n", err)
			os.Exit(1)
		}
	} else {
		fmt.Println(string(data))
	}
}

func mustScenarioState(scenarioID string, episode int) *game.GameState {
	state, err := game.NewBotMLScenarioState(scenarioID, episode)
	if err != nil {
		fmt.Fprintf(os.Stderr, "build benchmark candidate scenario: %v\n", err)
		os.Exit(1)
	}
	return state
}
