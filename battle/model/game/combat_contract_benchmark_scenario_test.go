package game

import (
	"battle/model/player"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"testing"
)

type benchmarkContractFile struct {
	Heroes map[string]struct {
		BenchmarkMatchups []struct {
			Opponent string `json:"opponent"`
			Scenario string `json:"scenario"`
		} `json:"benchmarkMatchups"`
	} `json:"heroes"`
}

func readCombatBenchmarkContracts(t *testing.T) benchmarkContractFile {
	t.Helper()
	_, sourceFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("could not locate the benchmark contract test source")
	}
	path := filepath.Join(filepath.Dir(sourceFile), "..", "..", "..", "docs", "hero-combat-contracts.json")
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read combat benchmark contracts: %v", err)
	}
	var contracts benchmarkContractFile
	if err := json.Unmarshal(contents, &contracts); err != nil {
		t.Fatalf("decode combat benchmark contracts: %v", err)
	}
	return contracts
}

func benchmarkHeroNames(contracts benchmarkContractFile) []string {
	names := make([]string, 0, len(contracts.Heroes))
	for heroID := range contracts.Heroes {
		if hero := GetHeroByName(displayNameForHeroID(heroID)); hero != nil {
			names = append(names, hero.Name)
		}
	}
	sort.Strings(names)
	return names
}

func displayNameForHeroID(heroID string) string {
	return map[string]string{
		"needle":          "Needle",
		"mandy":           "Mandy",
		"fairy-mina":      "Fairy Mina",
		"brock-zeus":      "Brock Zeus",
		"wukong-mico":     "Wukong Mico",
		"persephone-lumi": "Persephone Lumi",
		"kaze":            "Kaze",
		"katty":           "Katty",
	}[heroID]
}

func benchmarkContractForHero(t *testing.T, contracts benchmarkContractFile, heroName string) []struct {
	Opponent string `json:"opponent"`
	Scenario string `json:"scenario"`
} {
	t.Helper()
	for heroID, contract := range contracts.Heroes {
		if displayNameForHeroID(heroID) == heroName {
			return contract.BenchmarkMatchups
		}
	}
	t.Fatalf("benchmark contract missing for %s", heroName)
	return nil
}

func benchmarkMatchupState(attacker, defender string, mode GameMode) (*GameState, *player.Player, *player.Player) {
	var state *GameState
	if mode == ModeTeamDeathmatch {
		state = newScenarioTeamState()
		state.Walls = nil
		state.Objectives = nil
		state.Props = nil
		state.Players = make(map[string]*player.Player)
		state.State = GameStateWaiting
		state.PlayerAdd("attacker", "Attacker", attacker)
		state.PlayerAdd("defender", "Defender", defender)
		state.State = GameStateGame
		state.Players["attacker"].SetTeam("Blue")
		state.Players["defender"].SetTeam("Red")
	} else {
		state = newScenarioSoloState(attacker, defender)
		state.Walls = nil
		state.Props = nil
		return state, state.Players["hero"], state.Players["target"]
	}
	return state, state.Players["attacker"], state.Players["defender"]
}

func runContractBenchmarkMatchup(t *testing.T, attackerName, defenderName string, mode GameMode, scenario string) CombatScenarioReport {
	t.Helper()
	state, attacker, defender := benchmarkMatchupState(attackerName, defenderName, mode)
	attacker.X, attacker.Y = 160, 160
	defender.X, defender.Y = attacker.X+math.Max(48, math.Min(180, math.Min(CombatKitFor(attackerName).AttackRange(), CombatKitFor(defenderName).AttackRange())*.4)), attacker.Y
	attacker.MaxLives, attacker.Lives = 2_000, 2_000
	defender.MaxLives, defender.Lives = 2_000, 2_000
	attacker.Ammo, attacker.MaxAmmo = 3, 3
	defender.Ammo, defender.MaxAmmo = 3, 3

	runner := NewCombatScenarioRunner("contract-matchup-"+string(mode)+"-"+attackerName+"-"+scenario, 660, mode, state)
	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "benchmark_" + scenario + "_attacker"}, func(gs *GameState, _ CombatScenarioInput) {
		gs.playerShoot(attacker.PlayerId, gs.nowMs(), screenAngleFromWorld(0), defender.X-attacker.X)
	}); err != nil {
		t.Fatalf("apply %s %s attacker benchmark: %v", attackerName, scenario, err)
	}
	// Give the first basic's authored control/telegraph window time to resolve;
	// this is a runtime coverage smoke, not a simultaneous stun-trade test.
	if err := runner.ApplyInput(CombatScenarioInput{AtMs: 1_000, PlayerID: defender.PlayerId, Type: "benchmark_" + scenario + "_defender"}, func(gs *GameState, _ CombatScenarioInput) {
		gs.playerShoot(defender.PlayerId, gs.nowMs(), screenAngleFromWorld(math.Pi), attacker.X-defender.X)
	}); err != nil {
		t.Fatalf("apply %s %s defender benchmark: %v", defenderName, scenario, err)
	}
	if err := runner.AdvanceTo(2_000); err != nil {
		t.Fatalf("advance %s %s benchmark: %v", mode, scenario, err)
	}
	if err := runner.RecordMetric("attackerDamage", float64(2_000-defender.Lives)); err != nil {
		t.Fatalf("record attacker benchmark: %v", err)
	}
	if err := runner.RecordMetric("defenderDamage", float64(2_000-attacker.Lives)); err != nil {
		t.Fatalf("record defender benchmark: %v", err)
	}
	return runner.Report()
}

func TestScenarioPackContractBenchmarkMatchupsProduceDamageInSoloAndTeam(t *testing.T) {
	contracts := readCombatBenchmarkContracts(t)
	heroes := benchmarkHeroNames(contracts)
	if len(heroes) != len(contracts.Heroes) {
		t.Fatalf("contract roster=%d, runtime roster=%d", len(contracts.Heroes), len(heroes))
	}

	run := func() []CombatScenarioReport {
		reports := make([]CombatScenarioReport, 0, len(heroes)*2*2)
		for _, attacker := range heroes {
			for _, matchup := range benchmarkContractForHero(t, contracts, attacker) {
				if GetHeroByName(matchup.Opponent) == nil {
					t.Fatalf("%s benchmark opponent %q is not in runtime roster", attacker, matchup.Opponent)
				}
				for _, mode := range []GameMode{ModeDeathmatch, ModeTeamDeathmatch} {
					report := runContractBenchmarkMatchup(t, attacker, matchup.Opponent, mode, matchup.Scenario)
					if err := ValidateCombatScenarioReport(report); err != nil {
						t.Fatalf("%s vs %s %s benchmark report invalid: %v", attacker, matchup.Opponent, mode, err)
					}
					attackerDamage, attackerOK := scenarioMetric(report, "attackerDamage")
					defenderDamage, defenderOK := scenarioMetric(report, "defenderDamage")
					if !attackerOK || attackerDamage <= 0 || !defenderOK || defenderDamage <= 0 {
						t.Fatalf("%s vs %s %s benchmark did not exercise both basics: attacker=%.1f defender=%.1f report=%#v", attacker, matchup.Opponent, mode, attackerDamage, defenderDamage, report)
					}
					reports = append(reports, report)
				}
			}
		}
		return reports
	}

	first := run()
	for replay := 2; replay <= 5; replay++ {
		next := run()
		if !reflect.DeepEqual(first, next) {
			t.Fatalf("contract benchmark reports differ on replay %d", replay)
		}
	}
}
