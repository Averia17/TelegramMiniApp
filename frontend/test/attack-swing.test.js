import assert from "node:assert/strict"
import test from "node:test"

import {getAttackSwingYaw} from "../src/components/BattleGame/rendering/heroes/attackSwing.js"

const degrees = radians => radians * 180 / Math.PI

test("melee swing smoothly traverses the configured attack sector", () => {
  assert.equal(degrees(getAttackSwingYaw(0.18, 42)), -42)
  assert.ok(Math.abs(degrees(getAttackSwingYaw(0.43, 42))) < 0.001)
  assert.equal(degrees(getAttackSwingYaw(0.68, 42)), 42)

  const samples = Array.from({length: 11}, (_, index) =>
    getAttackSwingYaw(0.18 + index * 0.05, 42))
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(samples[index] >= samples[index - 1])
  }
})

test("swing eases into its edges and recovers to neutral", () => {
  const startStep = getAttackSwingYaw(0.19, 55) - getAttackSwingYaw(0.18, 55)
  const middleStep = getAttackSwingYaw(0.44, 55) - getAttackSwingYaw(0.43, 55)
  assert.ok(startStep > 0)
  assert.ok(startStep < middleStep)
  assert.equal(getAttackSwingYaw(0, 55), 0)
  assert.equal(getAttackSwingYaw(1, 55), 0)
})

test("invalid or missing attack arcs do not add procedural rotation", () => {
  assert.equal(getAttackSwingYaw(0.4, 0), 0)
  assert.equal(getAttackSwingYaw(0.4, Number.NaN), 0)
})
