import test from "node:test"
import assert from "node:assert/strict"
import {COMBAT_EFFECT_PHASES, getCombatEffectPhase, getCombatEffectPhaseLabel} from "../src/components/BattleGame/rendering/combat/combatEffectPhase.js"

test("combat effect phases prefer the authoritative snapshot phase", () => {
  assert.equal(getCombatEffectPhase({kind: "lumi_roots", phase: "active"}), "active")
  assert.equal(getCombatEffectPhase({kind: "lumi_roots", phase: "impact"}), "impact")
})

test("Lumi garden separates the active zone from its impact payoff", () => {
  assert.equal(getCombatEffectPhase({kind: "lumi_roots"}), "active")
  assert.equal(getCombatEffectPhase({kind: "lumi_seedburst"}), "impact")
  assert.equal(getCombatEffectPhaseLabel({kind: "lumi_seedburst"}), "УДАР")
})

test("high-impact phase labels stay short enough for a combat marker", () => {
  assert.equal(getCombatEffectPhaseLabel({kind: "zeus_strike_warning"}), "ТЕЛЕГРАФ")
  assert.equal(getCombatEffectPhaseLabel({kind: "katty_paint_spray"}), "ЗАМАХ")
})

test("combat phase harness normalizes the full readable lifecycle", () => {
  assert.deepEqual([...COMBAT_EFFECT_PHASES], ["intent", "cast", "telegraph", "active", "impact", "status", "recovery"])
  assert.equal(getCombatEffectPhase({phase: "accepted"}), "intent")
  assert.equal(getCombatEffectPhase({phase: "release"}), "cast")
  assert.equal(getCombatEffectPhase({phase: "payoff"}), "impact")
	assert.equal(getCombatEffectPhase({phase: "recovery"}), "recovery")
	assert.equal(getCombatEffectPhase({kind: "ash_hound_recovery"}), "recovery")
	assert.equal(getCombatEffectPhase({kind: "root_guardian_recovery"}), "recovery")
	assert.equal(getCombatEffectPhaseLabel({phase: "status"}), "СТАТУС")
})
