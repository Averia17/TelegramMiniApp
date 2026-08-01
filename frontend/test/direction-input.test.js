import assert from "node:assert/strict"
import test from "node:test"

import {
  ATTACK_DIRECTION_COUNT,
  normalizeEightWayMove,
  quantizeAngleToSectors,
} from "../src/components/BattleGame/direction.js"

test("keyboard movement exposes all eight compass directions", () => {
  const directions = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
  ]

  for (const [x, y] of directions) {
    const result = normalizeEightWayMove(x, y)
    assert.ok(Math.abs(Math.hypot(result.x, result.y) - 1) < 1e-9)
    assert.ok(Math.abs(result.x - x / Math.hypot(x, y)) < 1e-9)
    assert.ok(Math.abs(result.y - y / Math.hypot(x, y)) < 1e-9)
  }
})

test("attack angles resolve to at least 32 stable directions", () => {
  const step = Math.PI * 2 / ATTACK_DIRECTION_COUNT
  const angles = new Set()

  for (let index = 0; index < ATTACK_DIRECTION_COUNT; index += 1) {
    angles.add(quantizeAngleToSectors(index * step + step * .18, ATTACK_DIRECTION_COUNT).toFixed(8))
  }

  assert.equal(angles.size, ATTACK_DIRECTION_COUNT)
  assert.ok(Math.abs(quantizeAngleToSectors(-step * .18, ATTACK_DIRECTION_COUNT)) < 1e-9)
})
