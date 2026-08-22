import test from "node:test"
import assert from "node:assert/strict"
import {getCombatEffectPhase, getCombatEffectPhaseLabel} from "../src/components/BattleGame/rendering/combat/combatEffectPhase.js"

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
