import assert from "node:assert/strict"
import test from "node:test"

import {isAutoAimAttackGesture} from "../src/components/BattleGame/Input.js"
import {blendAngle} from "../src/components/BattleGame/rendering/heroes/turning.js"

test("a stationary attack release auto-aims even after a long press", () => {
  assert.equal(isAutoAimAttackGesture(0, 650), true)
})

test("a deliberate attack drag keeps the manually aimed direction", () => {
  assert.equal(isAutoAimAttackGesture(24, 120), false)
})

test("attack-facing interpolation follows the shortest arc", () => {
  assert.ok(Math.abs(blendAngle(0, Math.PI / 2, .5) - Math.PI / 4) < 1e-9)
  assert.ok(Math.abs(Math.abs(blendAngle(Math.PI - .1, -Math.PI + .1, .5)) - Math.PI) < 1e-9)
})
