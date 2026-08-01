import test from "node:test"
import assert from "node:assert/strict"

import {getActiveStatusEffects} from "../src/components/BattleGame/statusEffects.js"

test("shows bush concealment as an active effect", () => {
  const effects = getActiveStatusEffects({lives: 3}, {inBush: true})

  assert.deepEqual(effects.map(effect => effect.id), ["bush"])
  assert.equal(effects[0].label, "СПРЯТАН В КУСТАХ")
  assert.equal(effects[0].remaining, null)
})

test("shows crowd-control effects with their remaining duration", () => {
  const effects = getActiveStatusEffects({stun: 1.25, slow: 2.5}, {inBush: false})

  assert.deepEqual(effects.map(effect => effect.id), ["stun", "slow"])
  assert.equal(effects[0].remaining, 1.25)
  assert.equal(effects[1].remaining, 2.5)
})

test("does not show expired or inactive effects", () => {
  const effects = getActiveStatusEffects({stun: 0, poisoned: false, lunarShield: false}, {inBush: false})

  assert.deepEqual(effects, [])
})

test("does not show a timed effect that would render as zero seconds", () => {
  const effects = getActiveStatusEffects({shield: 0.04, slow: 0.049}, {inBush: false})

  assert.deepEqual(effects, [])
})

test("keeps persistent effects visible without inventing a timer", () => {
  const effects = getActiveStatusEffects({poisoned: true, lunarShield: true}, {inBush: false})

  assert.deepEqual(effects.map(effect => [effect.id, effect.remaining]), [
    ["lunarShield", null],
    ["poisoned", null],
  ])
})
