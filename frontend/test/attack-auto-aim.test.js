import assert from "node:assert/strict"
import test from "node:test"

import {isAutoAimAttackGesture} from "../src/components/BattleGame/Input.js"

test("a stationary attack release auto-aims even after a long press", () => {
  assert.equal(isAutoAimAttackGesture(0, 650), true)
})

test("a deliberate attack drag keeps the manually aimed direction", () => {
  assert.equal(isAutoAimAttackGesture(24, 120), false)
})
