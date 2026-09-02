package main

import (
	"battle/model/game"
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
)

type trajectoryHeader struct {
	RecordType        string `json:"recordType"`
	SchemaVersion     string `json:"schemaVersion"`
	SchemaFingerprint string `json:"schemaFingerprint"`
}

type trajectorySample struct {
	RecordType  string                `json:"recordType"`
	EpisodeID   string                `json:"episodeId"`
	BotID       string                `json:"botId"`
	Action      game.BotMLAction      `json:"action"`
	Observation game.BotMLObservation `json:"observation"`
}

type replayReport struct {
	Checkpoint string  `json:"checkpoint"`
	Samples    int     `json:"samples"`
	Correct    int     `json:"correct"`
	Invalid    int     `json:"invalid"`
	Accuracy   float64 `json:"accuracy"`
}

func main() {
	checkpointPath := flag.String("checkpoint", "", "recurrent checkpoint JSON")
	trajectoryPath := flag.String("trajectory", "", "expert trajectory JSONL")
	flag.Parse()
	if *checkpointPath == "" || *trajectoryPath == "" {
		fmt.Fprintln(os.Stderr, "checkpoint and trajectory are required")
		os.Exit(2)
	}
	policy, err := game.LoadBotMLRecurrentPolicy(*checkpointPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load checkpoint: %v\n", err)
		os.Exit(1)
	}
	file, err := os.Open(*trajectoryPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "open trajectory: %v\n", err)
		os.Exit(1)
	}
	defer file.Close()

	report := replayReport{Checkpoint: policy.Name()}
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 2*1024*1024)
	lastEpisode := ""
	lastBot := ""
	for scanner.Scan() {
		line := scanner.Bytes()
		var kind struct {
			RecordType string `json:"recordType"`
		}
		if err := json.Unmarshal(line, &kind); err != nil {
			fmt.Fprintf(os.Stderr, "decode trajectory record: %v\n", err)
			os.Exit(1)
		}
		if kind.RecordType == "header" {
			var header trajectoryHeader
			if err := json.Unmarshal(line, &header); err != nil || header.SchemaVersion != game.BotMLObservationSchemaVersion || header.SchemaFingerprint != game.BotMLSchemaFingerprint() {
				fmt.Fprintln(os.Stderr, "trajectory header is incompatible with the Go schema")
				os.Exit(1)
			}
			continue
		}
		var sample trajectorySample
		if err := json.Unmarshal(line, &sample); err != nil || sample.RecordType != "sample" {
			fmt.Fprintln(os.Stderr, "trajectory contains an invalid sample")
			os.Exit(1)
		}
		if sample.EpisodeID != lastEpisode || sample.BotID != lastBot {
			policy.Reset(sample.BotID)
			lastEpisode, lastBot = sample.EpisodeID, sample.BotID
		}
		report.Samples++
		if !validAction(sample.Action, sample.Observation.ActionMask) {
			report.Invalid++
			continue
		}
		if policy.DecideFor(sample.BotID, sample.Observation) == sample.Action {
			report.Correct++
		}
	}
	if err := scanner.Err(); err != nil && err != io.EOF {
		fmt.Fprintf(os.Stderr, "read trajectory: %v\n", err)
		os.Exit(1)
	}
	if report.Samples > 0 {
		report.Accuracy = float64(report.Correct) / float64(report.Samples-report.Invalid)
	}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "encode replay report: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(data))
}

func validAction(action game.BotMLAction, mask []bool) bool {
	return int(action) >= 0 && int(action) < len(mask) && mask[action]
}
