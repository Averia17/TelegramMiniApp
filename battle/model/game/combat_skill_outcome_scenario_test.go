package game

import (
	"battle/model/player"
	"math"
	"reflect"
	"testing"
)

type skillOutcomeTrial struct {
	hero           string
	targetDistance float64
}

type skillOutcomeResult struct {
	targetDamage    int
	targetKilled    bool
	selfDamageTaken int
	basicDamage     int
	skillDamage     int
}

func skillOutcomeState(hero, defender string, mode GameMode) (*GameState, *player.Player, *player.Player) {
	var state *GameState
	if mode == ModeTeamDeathmatch {
		// This matrix replaces the generated team map immediately. Use the small
		// fixture directly so every trial stays deterministic and cheap.
		state = newTestGameState()
		state.Mode = ModeTeamDeathmatch
		state.rules = TeamDeathmatchRules{}
		state.Walls = nil
		state.Objectives = nil
		state.Props = nil
		state.Players = make(map[string]*player.Player)
		state.State = GameStateWaiting
		state.PlayerAdd("attacker", "Attacker", hero)
		state.PlayerAdd("defender", "Defender", defender)
		state.State = GameStateGame
		state.Players["attacker"].SetTeam("Blue")
		state.Players["defender"].SetTeam("Red")
	} else {
		state = newScenarioSoloState(hero, defender)
		state.Walls = nil
		state.Props = nil
	}
	state.MatchStartedAt = combatScenarioEpochMs
	state.GameEndsAt = combatScenarioEpochMs + 120_000
	attackerID, targetID := "attacker", "defender"
	if mode != ModeTeamDeathmatch {
		attackerID, targetID = "hero", "target"
	}
	attacker, target := state.Players[attackerID], state.Players[targetID]
	if attacker == nil || target == nil {
		return state, attacker, target
	}
	attacker.X, attacker.Y = 160, 160
	target.X, target.Y = 160, 160
	attacker.MaxLives, attacker.Lives = 1_000, 1_000
	target.MaxLives, target.Lives = 1_000, 1_000
	attacker.Ammo, attacker.MaxAmmo = 3, 3
	target.Ammo, target.MaxAmmo = 3, 3
	return state, attacker, target
}

func runSkillOutcomeTrial(t *testing.T, trial skillOutcomeTrial, mode GameMode, targetLives int, skillEnabled bool, counterAttack bool) skillOutcomeResult {
	t.Helper()
	state, attacker, defender := skillOutcomeState(trial.hero, "Kaze", mode)
	targetLives = max(1, targetLives)
	targetDistance := trial.targetDistance
	defender.X = attacker.X + targetDistance
	defender.Y = attacker.Y
	target := defender
	attacker.Rotation = 0
	attacker.AimDistance = targetDistance
	target.MaxLives, target.Lives = targetLives, targetLives
	runner := NewCombatScenarioRunner("skill-outcome-"+string(mode)+"-"+trial.hero, 690, mode, state)
	if skillEnabled {
		attacker.SuperCharge = 100
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "skill_enabled_super"}, func(gs *GameState, _ CombatScenarioInput) {
			gs.playerAbility(attacker.PlayerId, gs.nowMs(), "primary", "skill-outcome-super")
		}); err != nil {
			t.Fatalf("apply %s %s Super: %v", mode, trial.hero, err)
		}
		if err := runner.AdvanceTo(1_000); err != nil {
			t.Fatalf("advance %s %s Super: %v", mode, trial.hero, err)
		}
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 1_000, PlayerID: attacker.PlayerId, Type: "skill_enabled_basic"}, func(gs *GameState, _ CombatScenarioInput) {
			gs.playerShoot(attacker.PlayerId, gs.nowMs(), screenAngleFromWorld(0), targetDistance)
		}); err != nil {
			t.Fatalf("apply %s %s follow-up basic: %v", mode, trial.hero, err)
		}
		if counterAttack {
			if err := runner.ApplyInput(CombatScenarioInput{AtMs: 1_100, PlayerID: defender.PlayerId, Type: "counter_attack"}, func(gs *GameState, _ CombatScenarioInput) {
				gs.playerShoot(defender.PlayerId, gs.nowMs(), screenAngleFromWorld(math.Pi), targetDistance)
			}); err != nil {
				t.Fatalf("apply %s %s counter attack: %v", mode, trial.hero, err)
			}
		}
	} else {
		if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "basic_only"}, func(gs *GameState, _ CombatScenarioInput) {
			gs.playerShoot(attacker.PlayerId, gs.nowMs(), screenAngleFromWorld(0), targetDistance)
		}); err != nil {
			t.Fatalf("apply %s %s basic-only attack: %v", mode, trial.hero, err)
		}
		if counterAttack {
			if err := runner.ApplyInput(CombatScenarioInput{AtMs: 1_100, PlayerID: defender.PlayerId, Type: "counter_attack"}, func(gs *GameState, _ CombatScenarioInput) {
				gs.playerShoot(defender.PlayerId, gs.nowMs(), screenAngleFromWorld(math.Pi), targetDistance)
			}); err != nil {
				t.Fatalf("apply %s %s basic-only counter attack: %v", mode, trial.hero, err)
			}
		}
	}
	if err := runner.AdvanceTo(3_000); err != nil {
		t.Fatalf("resolve %s %s skill outcome: %v", mode, trial.hero, err)
	}
	return skillOutcomeResult{
		targetDamage:    targetLives - target.Lives,
		targetKilled:    !target.IsAlive(),
		selfDamageTaken: 1_000 - attacker.Lives,
		basicDamage:     attacker.BasicDamage,
		skillDamage:     attacker.SkillDamage,
	}
}

func runSkillOutcomeMatrix(t *testing.T, trial skillOutcomeTrial, mode GameMode) CombatScenarioReport {
	t.Helper()
	// The report runner stores the deterministic input vocabulary and aggregate
	// metrics. Each threshold is executed in a fresh authoritative state so one
	// lethal sample cannot change the next sample's rules or timers.
	dummyState, _, _ := skillOutcomeState(trial.hero, "Kaze", mode)
	reportRunner := NewCombatScenarioRunner("skill-outcome-matrix-"+string(mode)+"-"+trial.hero, 691, mode, dummyState)
	thresholds := []int{50, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400}
	basicKills, skillKills := 0, 0
	basicDamage, skillDamage := 0, 0
	for index, threshold := range thresholds {
		baseAt := int64(index * 4_000)
		if err := reportRunner.RecordInput(CombatScenarioInput{AtMs: baseAt, PlayerID: "attacker", Type: "basic_only"}); err != nil {
			t.Fatalf("record %s %s basic-only input: %v", mode, trial.hero, err)
		}
		basic := runSkillOutcomeTrial(t, trial, mode, threshold, false, false)
		if err := reportRunner.RecordInput(CombatScenarioInput{AtMs: baseAt + 2_000, PlayerID: "attacker", Type: "skill_enabled_super"}); err != nil {
			t.Fatalf("record %s %s Super input: %v", mode, trial.hero, err)
		}
		if err := reportRunner.RecordInput(CombatScenarioInput{AtMs: baseAt + 3_000, PlayerID: "attacker", Type: "skill_enabled_basic"}); err != nil {
			t.Fatalf("record %s %s skill follow-up input: %v", mode, trial.hero, err)
		}
		skill := runSkillOutcomeTrial(t, trial, mode, threshold, true, false)
		if basic.targetKilled {
			basicKills++
		}
		if skill.targetKilled {
			skillKills++
		}
		basicDamage += basic.targetDamage
		skillDamage += skill.targetDamage
	}
	if err := reportRunner.RecordMetric("thresholdSamples", float64(len(thresholds))); err != nil {
		t.Fatalf("record %s %s threshold samples: %v", mode, trial.hero, err)
	}
	if err := reportRunner.RecordMetric("basicOnlyKills", float64(basicKills)); err != nil {
		t.Fatalf("record %s %s basic-only kills: %v", mode, trial.hero, err)
	}
	if err := reportRunner.RecordMetric("skillAssistedKills", float64(skillKills)); err != nil {
		t.Fatalf("record %s %s skill-assisted kills: %v", mode, trial.hero, err)
	}
	if err := reportRunner.RecordMetric("basicOnlyKillRate", float64(basicKills)/float64(len(thresholds))); err != nil {
		t.Fatalf("record %s %s basic-only kill rate: %v", mode, trial.hero, err)
	}
	if err := reportRunner.RecordMetric("skillAssistedKillRate", float64(skillKills)/float64(len(thresholds))); err != nil {
		t.Fatalf("record %s %s skill-assisted kill rate: %v", mode, trial.hero, err)
	}
	if err := reportRunner.RecordMetric("averageBasicOnlyDamage", float64(basicDamage)/float64(len(thresholds))); err != nil {
		t.Fatalf("record %s %s basic-only damage: %v", mode, trial.hero, err)
	}
	if err := reportRunner.RecordMetric("averageSkillAssistedDamage", float64(skillDamage)/float64(len(thresholds))); err != nil {
		t.Fatalf("record %s %s skill-assisted damage: %v", mode, trial.hero, err)
	}
	if trial.hero == "Fairy Mina" {
		basic := runSkillOutcomeTrial(t, trial, mode, 100_000, false, true)
		skill := runSkillOutcomeTrial(t, trial, mode, 100_000, true, true)
		if err := reportRunner.RecordMetric("basicOnlyCounterDamage", float64(basic.selfDamageTaken)); err != nil {
			t.Fatalf("record %s Mina basic-only counter damage: %v", mode, err)
		}
		if err := reportRunner.RecordMetric("skillCounterDamage", float64(skill.selfDamageTaken)); err != nil {
			t.Fatalf("record %s Mina skill counter damage: %v", mode, err)
		}
	}
	return reportRunner.Report()
}

func TestScenarioPackSkillDisabledOutcomeChangesAcrossSoloAndTeam(t *testing.T) {
	trials := []skillOutcomeTrial{
		{hero: "Needle", targetDistance: 120},
		{hero: "Mandy", targetDistance: 60},
		{hero: "Fairy Mina", targetDistance: 120},
		{hero: "Brock Zeus", targetDistance: 260},
		{hero: "Kaze", targetDistance: 60},
		{hero: "Wukong Mico", targetDistance: 70},
		{hero: "Persephone Lumi", targetDistance: 120},
		{hero: "Katty", targetDistance: 80},
	}
	run := func() []CombatScenarioReport {
		reports := make([]CombatScenarioReport, 0, len(trials)*2)
		for _, trial := range trials {
			for _, mode := range []GameMode{ModeDeathmatch, ModeTeamDeathmatch} {
				report := runSkillOutcomeMatrix(t, trial, mode)
				if err := ValidateCombatScenarioReport(report); err != nil {
					t.Fatalf("%s %s skill outcome report invalid: %v", trial.hero, mode, err)
				}
				samples, samplesOK := scenarioMetric(report, "thresholdSamples")
				basicRate, basicOK := scenarioMetric(report, "basicOnlyKillRate")
				skillRate, skillOK := scenarioMetric(report, "skillAssistedKillRate")
				if !samplesOK || samples != 11 || !basicOK || !skillOK {
					t.Fatalf("%s %s skill outcome metrics incomplete: %#v", trial.hero, mode, report)
				}
				if trial.hero == "Fairy Mina" {
					basicCounter, basicCounterOK := scenarioMetric(report, "basicOnlyCounterDamage")
					skillCounter, skillCounterOK := scenarioMetric(report, "skillCounterDamage")
					if !basicCounterOK || !skillCounterOK || skillCounter >= basicCounter {
						t.Fatalf("Mina Super did not change survival outcome in %s: basicCounter=%.1f skillCounter=%.1f report=%#v", mode, basicCounter, skillCounter, report)
					}
				} else if skillRate <= basicRate {
					t.Fatalf("%s Super did not improve kill outcome in %s: basicRate=%.3f skillRate=%.3f report=%#v", trial.hero, mode, basicRate, skillRate, report)
				}
				reports = append(reports, report)
			}
		}
		return reports
	}
	first := run()
	for replay := 2; replay <= 20; replay++ {
		next := run()
		if !reflect.DeepEqual(first, next) {
			t.Fatalf("skill outcome reports differ on replay %d", replay)
		}
	}
}

func TestScenarioPackSkillEnabledRoundRecordsMeaningfulSkillContribution(t *testing.T) {
	trials := []skillOutcomeTrial{
		{hero: "Needle", targetDistance: 120},
		{hero: "Mandy", targetDistance: 60},
		{hero: "Fairy Mina", targetDistance: 120},
		{hero: "Brock Zeus", targetDistance: 260},
		{hero: "Kaze", targetDistance: 60},
		{hero: "Wukong Mico", targetDistance: 70},
		{hero: "Persephone Lumi", targetDistance: 120},
		{hero: "Katty", targetDistance: 80},
	}
	for _, trial := range trials {
		result := runSkillOutcomeTrial(t, trial, ModeDeathmatch, 400, true, false)
		if result.skillDamage <= 0 {
			t.Fatalf("%s skill-enabled round recorded no skill contribution: %#v", trial.hero, result)
		}
		if result.targetDamage <= result.basicDamage {
			t.Fatalf("%s skill-enabled round did not make skills meaningful: total=%d basic=%d skill=%d", trial.hero, result.targetDamage, result.basicDamage, result.skillDamage)
		}
	}
}

func TestScenarioPackGadgetAuthorityCoversEveryHero(t *testing.T) {
	for _, hero := range []string{
		"Needle", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico",
		"Persephone Lumi", "Katty",
	} {
		t.Run(hero, func(t *testing.T) {
			state, attacker, _ := skillOutcomeState(hero, "Kaze", ModeDeathmatch)
			attacker.GadgetCharges = 3
			if hero == "Persephone Lumi" {
				state.HeroZones = append(state.HeroZones, &HeroZone{
					Owner: attacker.PlayerId, Kind: "lumi_flower", X: attacker.X, Y: attacker.Y,
					CreatedAt: combatScenarioEpochMs, ExpiresAt: combatScenarioEpochMs + 5_000,
				})
			}
			attacker.SuperCharge = 100
			commandID := "gadget-matrix-" + hero
			runner := NewCombatScenarioRunner("gadget-authority-"+hero, 692, ModeDeathmatch, state)
			if err := runner.ApplyInput(CombatScenarioInput{AtMs: 0, PlayerID: attacker.PlayerId, Type: "gadget"}, func(gs *GameState, _ CombatScenarioInput) {
				gs.playerAbility(attacker.PlayerId, gs.nowMs(), "secondary", commandID)
			}); err != nil {
				t.Fatalf("apply %s gadget: %v", hero, err)
			}
			var acknowledgement *CombatEvent
			for index := range state.CombatEvents {
				event := &state.CombatEvents[index]
				if event.Kind == "ability" && event.CommandID == commandID {
					acknowledgement = event
				}
			}
			if acknowledgement == nil || !acknowledgement.Accepted || !acknowledgement.Resolved {
				t.Fatalf("%s gadget acknowledgement = %#v, want accepted/resolved", hero, acknowledgement)
			}
			if acknowledgement.AbilitySlot != "secondary" || acknowledgement.ResourceKind != "gadget_charges" || acknowledgement.ResourceBefore != 3 || acknowledgement.ResourceAfter != 2 {
				t.Fatalf("%s gadget resource contract = %#v, want secondary 3 -> 2", hero, acknowledgement)
			}
			if !attacker.LastAbilityOK || attacker.GadgetPulse == 0 {
				t.Fatalf("%s gadget did not create a local authoritative outcome: ok=%v pulse=%d", hero, attacker.LastAbilityOK, attacker.GadgetPulse)
			}
		})
	}
}
