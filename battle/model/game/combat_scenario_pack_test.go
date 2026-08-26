package game

import (
	"battle/model/monster"
	"battle/model/prop"
	"reflect"
	"testing"
)

func newScenarioSoloState(hero, targetHero string) *GameState {
	state := newTestGameState()
	state.PlayerAdd("hero", "Hero", hero)
	state.PlayerAdd("target", "Target", targetHero)
	state.Players["hero"].X, state.Players["hero"].Y = 160, 160
	state.Players["target"].X, state.Players["target"].Y = 250, 160
	state.State = GameStateGame
	state.GameEndsAt = combatScenarioEpochMs + 120_000
	return state
}

func newScenarioTeamState() *GameState {
	state := newTeamObjectiveState()
	state.State = GameStateGame
	state.rules = TeamDeathmatchRules{}
	state.MatchStartedAt = combatScenarioEpochMs
	state.GameEndsAt = combatScenarioEpochMs + 120_000
	state.CombatEvents = nil
	state.Props = nil
	return state
}

func TestScenarioPackSuperChargeAndRespawnReportsAreReplayable(t *testing.T) {
	runSuper := func() CombatScenarioReport {
		state := newScenarioSoloState("Kaze", "Katty")
		runner := NewCombatScenarioRunner("super-charge-kaze", 401, ModeDeathmatch, state)
		for index, atMs := range []int64{0, 250, 500} {
			input := CombatScenarioInput{AtMs: atMs, PlayerID: "hero", Type: "effective_damage"}
			if err := runner.ApplyInput(input, func(gs *GameState, _ CombatScenarioInput) {
				gs.dealPlayerDamage(gs.Players["hero"], gs.Players["target"], 100)
			}); err != nil {
				t.Fatalf("apply super input %d: %v", index, err)
			}
			runner.Checkpoint(atMs)
		}
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 750, PlayerID: "hero", Type: "control_credit"}, func(gs *GameState, _ CombatScenarioInput) {
			addSuperChargeForControl(gs.Players["hero"], gs.Players["target"], 1_000)
		}); err != nil {
			t.Fatalf("apply control contribution: %v", err)
		}
		runner.Checkpoint(750)
		if err := runner.RecordMetric("superChargePercent", float64(state.Players["hero"].SuperCharge)); err != nil {
			t.Fatalf("record Super metric: %v", err)
		}
		if state.Players["hero"].SuperCharge != 53 {
			t.Fatalf("Super charge = %d, want 53 from effective damage plus control", state.Players["hero"].SuperCharge)
		}
		return runner.Report()
	}

	runRespawn := func() CombatScenarioReport {
		state := newScenarioTeamState()
		blue := state.Players["blue"]
		blue.Lives = 0
		blue.RespawnAt = combatScenarioEpochMs + 500
		blue.SuperCharge, blue.KazeCombo, blue.GadgetCharges = 64, 2, 2
		blue.HealthBoosts = 2
		runner := NewCombatScenarioRunner("respawn-resource-reset", 402, ModeTeamDeathmatch, state)
		if err := runner.AdvanceTo(600); err != nil {
			t.Fatalf("advance respawn scenario: %v", err)
		}
		runner.Checkpoint(600)
		if !blue.IsAlive() || blue.SuperCharge != 0 || blue.KazeCombo != 0 || blue.HealthBoosts != 2 || blue.GadgetCharges != 2 {
			t.Fatalf("respawn resources = alive=%v super=%d combo=%d boosts=%d gadgets=%d state=%s mode=%s respawnAt=%d now=%d spawners=%d", blue.IsAlive(), blue.SuperCharge, blue.KazeCombo, blue.HealthBoosts, blue.GadgetCharges, state.State, state.Mode, blue.RespawnAt, runner.CurrentTimeMs(), len(state.Map.TeamSpawners[blue.Team]))
		}
		for name, value := range map[string]float64{
			"respawned":             1,
			"superAfterRespawn":     float64(blue.SuperCharge),
			"healthStacksPreserved": float64(blue.HealthBoosts),
		} {
			if err := runner.RecordMetric(name, value); err != nil {
				t.Fatalf("record respawn metric %q: %v", name, err)
			}
		}
		return runner.Report()
	}

	firstSuper, secondSuper := runSuper(), runSuper()
	if !reflect.DeepEqual(firstSuper, secondSuper) {
		t.Fatalf("Super reports differ:\nfirst=%#v\nsecond=%#v", firstSuper, secondSuper)
	}
	firstRespawn, secondRespawn := runRespawn(), runRespawn()
	if !reflect.DeepEqual(firstRespawn, secondRespawn) {
		t.Fatalf("respawn reports differ:\nfirst=%#v\nsecond=%#v", firstRespawn, secondRespawn)
	}
}

func TestScenarioPackCubeOwnershipAndBatContestReportsAreReplayable(t *testing.T) {
	runCube := func() CombatScenarioReport {
		state := newScenarioTeamState()
		blue, red := state.Players["blue"], state.Players["red"]
		blue.X, blue.Y = 500, 500
		red.X, red.Y = 500, 500
		reward := prop.NewProp("health_boost", blue.X, blue.Y, 14)
		reward.HealthBoostKillerID = blue.PlayerId
		reward.VisibilityTeam = blue.Team
		state.Props = append(state.Props, reward)
		runner := NewCombatScenarioRunner("cube-ownership", 403, ModeTeamDeathmatch, state)
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: "red", Type: "pickup_attempt"}, func(gs *GameState, _ CombatScenarioInput) {
			gs.collectPickups(red)
		}); err != nil {
			t.Fatalf("apply enemy pickup attempt: %v", err)
		}
		denied := reward.Active
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 100, PlayerID: "blue", Type: "pickup_claim"}, func(gs *GameState, _ CombatScenarioInput) {
			gs.collectPickups(blue)
		}); err != nil {
			t.Fatalf("apply team pickup claim: %v", err)
		}
		runner.Checkpoint(100)
		if !denied || reward.Active || blue.HealthBoosts != 1 {
			t.Fatalf("cube ownership = denied=%v active=%v blueStacks=%d", denied, reward.Active, blue.HealthBoosts)
		}
		if err := runner.RecordMetric("enemyDenied", 1); err != nil {
			t.Fatalf("record cube denial: %v", err)
		}
		if err := runner.RecordMetric("claimed", 1); err != nil {
			t.Fatalf("record cube claim: %v", err)
		}
		return runner.Report()
	}

	runBat := func() CombatScenarioReport {
		state := newScenarioSoloState("Needle", "Kaze")
		bat := monster.NewMonsterAt(combatScenarioEpochMs-2_000, 180, 160, 16, 512, 512, 1)
		bat.Lives = 1
		bat.State = monster.MonsterChase
		bat.TargetPlayerId = "hero"
		state.Monsters["bat"] = bat
		runner := NewCombatScenarioRunner("bat-contest", 404, ModeDeathmatch, state)
		if err := runner.AdvanceTo(16); err != nil {
			t.Fatalf("advance bat telegraph: %v", err)
		}
		telegraph := bat.State == monster.MonsterWindup
		runner.Checkpoint(16)
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 32, PlayerID: "hero", Type: "bat_defeat"}, func(gs *GameState, _ CombatScenarioInput) {
			if !gs.damageMonster("bat", bat, 1) {
				t.Fatalf("bat was not defeated in contest scenario")
			}
		}); err != nil {
			t.Fatalf("apply bat defeat: %v", err)
		}
		runner.Checkpoint(32)
		rewardCount := 0
		for _, candidate := range state.Props {
			if candidate != nil && candidate.Type == "health_boost" && candidate.Active {
				rewardCount++
			}
		}
		if !telegraph || rewardCount != 1 {
			t.Fatalf("bat contest = telegraph=%v rewardCount=%d", telegraph, rewardCount)
		}
		if err := runner.AdvanceTo(20_100); err != nil {
			t.Fatalf("advance bat respawn: %v", err)
		}
		runner.Checkpoint(20_100)
		if state.Monsters["bat"] == nil || !state.Monsters["bat"].IsAlive() {
			t.Fatal("bat camp did not respawn deterministically")
		}
		if err := runner.RecordMetric("telegraphShown", 1); err != nil {
			t.Fatalf("record bat telegraph: %v", err)
		}
		if err := runner.RecordMetric("rewardCount", float64(rewardCount)); err != nil {
			t.Fatalf("record bat reward: %v", err)
		}
		return runner.Report()
	}

	firstCube, secondCube := runCube(), runCube()
	if !reflect.DeepEqual(firstCube, secondCube) {
		t.Fatalf("cube reports differ:\nfirst=%#v\nsecond=%#v", firstCube, secondCube)
	}
	firstBat, secondBat := runBat(), runBat()
	if !reflect.DeepEqual(firstBat, secondBat) {
		t.Fatalf("bat reports differ:\nfirst=%#v\nsecond=%#v", firstBat, secondBat)
	}
}
