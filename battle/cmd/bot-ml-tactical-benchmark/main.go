package main

import (
	"battle/model/game"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"
)

type benchmarkReport struct {
	SchemaVersion     string                        `json:"schemaVersion"`
	SchemaFingerprint string                        `json:"schemaFingerprint"`
	CheckpointHash    string                        `json:"checkpointHash"`
	Episodes          int                           `json:"episodes"`
	DurationMs        int64                         `json:"durationMs"`
	Metrics           map[string]map[string]float64 `json:"metrics"`
	Deltas            map[string]float64            `json:"deltas"`
}

func main() {
	checkpointPath := flag.String("checkpoint", "../artifacts/bot_ml/recurrent-ppo-lstm-tactical-v2.json", "tactical checkpoint JSON")
	episodes := flag.Int("episodes", 4, "paired episodes")
	durationMs := flag.Int64("duration-ms", 5000, "episode duration")
	seed := flag.Int64("seed", 123, "first seed")
	flag.Parse()
	if *episodes <= 0 || *durationMs <= 0 {
		fmt.Fprintln(os.Stderr, "episodes and duration-ms must be positive")
		os.Exit(2)
	}
	policy, err := game.LoadBotMLTacticalPolicy(*checkpointPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	data, err := os.ReadFile(*checkpointPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	digest := sha256.Sum256(data)
	metrics := map[string]map[string]float64{"baseline": {}, "tacticalV2": {}}
	for episode := 0; episode < *episodes; episode++ {
		base, err := game.NewBotMLTeamScenarioState(episode)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		candidate, err := game.NewBotMLTeamScenarioState(episode)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		baseRunner := game.NewCombatScenarioRunner(fmt.Sprintf("team-baseline-%d", episode), *seed+int64(episode), game.ModeTeamDeathmatch, base)
		candidateRunner := game.NewCombatScenarioRunner(fmt.Sprintf("team-tactical-v2-%d", episode), *seed+int64(episode), game.ModeTeamDeathmatch, candidate)
		base.GameEndsAt = baseRunner.CurrentTimeMs() + *durationMs + 1_000
		candidate.GameEndsAt = candidateRunner.CurrentTimeMs() + *durationMs + 1_000
		candidate.SetBotMLTacticalPolicy(policy)
		candidate.SetBotMLTacticalDirect(true)
		policy.Reset("blue-0")
		policy.Reset("blue-1")
		policy.Reset("blue-2")
		policy.Reset("red-0")
		policy.Reset("red-1")
		policy.Reset("red-2")
		if err := baseRunner.AdvanceTo(*durationMs); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		if err := candidateRunner.AdvanceTo(*durationMs); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		addMetrics(metrics["baseline"], base, "")
		addMetrics(metrics["tacticalV2"], candidate, "")
	}
	for _, side := range []string{"baseline", "tacticalV2"} {
		for name, value := range metrics[side] {
			metrics[side][name] = value / float64(*episodes)
		}
	}
	deltas := map[string]float64{}
	for name, value := range metrics["baseline"] {
		deltas[name] = metrics["tacticalV2"][name] - value
	}
	output := benchmarkReport{SchemaVersion: game.BotMLTacticalSchemaVersion, SchemaFingerprint: game.BotMLTacticalSchemaFingerprint(), CheckpointHash: hex.EncodeToString(digest[:]), Episodes: *episodes, DurationMs: *durationMs, Metrics: metrics, Deltas: deltas}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	_ = encoder.Encode(output)
}

func addMetrics(target map[string]float64, state *game.GameState, _ string) {
	metrics := state.BotAIMetricsSnapshot()
	values := map[string]float64{
		"aliveRate": aliveRate(state), "damage": teamDamage(state), "mlTacticalDecisions": float64(metrics.MLTacticalDecisions),
		"mlTacticalBehaviorChanges": float64(metrics.MLTacticalBehaviorChanges), "focusFire": float64(metrics.MLTacticalFocusFire),
		"allyHelp": float64(metrics.MLTacticalAllyHelp), "cover": float64(metrics.MLTacticalCover),
		"smartRetreat": float64(metrics.MLTacticalSmartRetreat), "teamVictory": float64(metrics.MLTacticalTeamVictory),
		"safetyFallbacks": float64(metrics.MLTacticalSafetyFallbacks),
	}
	for name, value := range values {
		target[name] += value
	}
}

func aliveRate(state *game.GameState) float64 {
	if state == nil || len(state.Players) == 0 {
		return 0
	}
	alive := 0
	for _, player := range state.Players {
		if player != nil && player.IsAlive() {
			alive++
		}
	}
	return float64(alive) / float64(len(state.Players))
}

func teamDamage(state *game.GameState) float64 {
	if state == nil {
		return 0
	}
	total := 0
	ids := make([]string, 0, len(state.Players))
	for id := range state.Players {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		if player := state.Players[id]; player != nil {
			total += player.BasicDamage + player.SkillDamage
		}
	}
	return float64(total)
}
