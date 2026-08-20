import assert from "node:assert/strict"
import test from "node:test"

import {getKeyboardMoveDirection} from "../src/components/BattleGame/Input.js"

test("team keyboard movement keeps the same world axes as the touch stick", () => {
  assert.deepEqual(getKeyboardMoveDirection({KeyD: true}), {x: 1, y: 0})
  assert.deepEqual(getKeyboardMoveDirection({KeyA: true}), {x: -1, y: 0})
  assert.deepEqual(getKeyboardMoveDirection({KeyW: true}), {x: 0, y: -1})
  assert.deepEqual(getKeyboardMoveDirection({KeyS: true}), {x: 0, y: 1})
})
