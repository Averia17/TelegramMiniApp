import assert from "node:assert/strict"
import test from "node:test"

import {getConcealmentIndex, isInsideConcealment} from "../src/components/BattleGame/rendering/shared/concealment.js"

test("concealment queries use a cached spatial index for the same wall source", () => {
  const walls = [
    {minX: 80, minY: 80, maxX: 160, maxY: 160, type: "bush"},
    {minX: 1200, minY: 1200, maxX: 1280, maxY: 1280, type: "wall"},
  ]

  const first = getConcealmentIndex(walls)
  const second = getConcealmentIndex(walls)

  assert.strictEqual(first, second)
  assert.equal(isInsideConcealment({x: 100, y: 120}, first), true)
  assert.equal(isInsideConcealment({x: 400, y: 400}, first), false)
})
