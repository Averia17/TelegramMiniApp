import test from "node:test"
import assert from "node:assert/strict"

import {getActiveStatusEffects} from "../src/components/BattleGame/statusEffects.js"
import {getHeroPaintStacks} from "../src/components/BattleGame/rendering/heroes/healthBadge.js"

test("shows Katty paint setup before the third-stack payoff", () => {
  const effects = getActiveStatusEffects({paintStacks: 2})

  assert.deepEqual(effects.map(effect => effect.id), ["paintStacks"])
  assert.equal(effects[0].label, "КРАСКА 2/3")
  assert.equal(effects[0].icon, "🎨")
})

test("clamps world paint marker to the readable pre-payoff setup", () => {
  assert.equal(getHeroPaintStacks({paintStacks: 0}), 0)
  assert.equal(getHeroPaintStacks({paintStacks: 2}), 2)
  assert.equal(getHeroPaintStacks({paintStacks: 3}), 2)
})
