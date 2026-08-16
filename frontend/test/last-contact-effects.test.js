import test from "node:test"
import assert from "node:assert/strict"
import {createLastContactEffects} from "../src/components/BattleGame/rendering/combat/lastContactEffects.js"

test("last contact creates a short directional marker instead of a visible enemy", () => {
  const effects = createLastContactEffects({enemy: {
    hidden: true,
    color: "#ff00aa",
    lastContact: {x: 480, y: 490, at: 1000, directionX: 0.8, directionY: 0.6},
  }}, 1500)

  assert.equal(effects.length, 1)
  assert.equal(effects[0].x, 480)
  assert.equal(effects[0].y, 490)
  assert.equal(effects[0].kind, "last_contact")
  assert.ok(effects[0].angle > 0)
})

test("expired or non-hidden contacts are not rendered", () => {
  const effects = createLastContactEffects({
    visible: {hidden: false, lastContact: {x: 1, y: 1, at: 1000}},
    expired: {hidden: true, lastContact: {x: 1, y: 1, at: 1000}},
  }, 3001)

  assert.deepEqual(effects, [])
})
