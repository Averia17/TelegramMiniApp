import assert from "node:assert/strict"
import test from "node:test"

import {buildAbilityInput, getHeroAbilityInputContract, resolveAbilityInputContract} from "../src/components/BattleGame/abilityInputContract.js"

test("ability input contract maps directional, point, self and targeted skills", () => {
  assert.equal(resolveAbilityInputContract({target: "directional_projectile"}).mode, "directional")
  assert.equal(resolveAbilityInputContract({target: "point_zone"}).mode, "point")
  assert.equal(resolveAbilityInputContract({target: "self"}).mode, "self")
  assert.equal(resolveAbilityInputContract({target: "targeted_ally"}).mode, "targeted")
})

test("point and directional commands carry the current aim without inventing a hit", () => {
  const input = buildAbilityInput({
    contract: {target: "point_zone", mode: "point"},
    aimAngle: 0.75,
    aimDistance: 240,
  })
  assert.deepEqual(input, {targeting: "point", aimProvided: true, aimAngle: 0.75, aimDistance: 240})
})

test("self abilities do not reuse a stale cursor distance", () => {
  assert.deepEqual(buildAbilityInput({contract: getHeroAbilityInputContract("Mandy", "secondary"), aimAngle: 1, aimDistance: 500}), {targeting: "self"})
  assert.equal(getHeroAbilityInputContract("Wukong Mico", "primary").mode, "directional")
})
