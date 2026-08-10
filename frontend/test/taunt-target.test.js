import assert from "node:assert/strict"
import test from "node:test"

import {chooseTauntTarget} from "../src/components/BattleGame/tauntTarget.js"

test("chooses the nearest visible living opponent", () => {
  const target = chooseTauntTarget({
    localId: "me",
    players: {
      me: {x: 100, y: 100, lives: 3},
      far: {x: 300, y: 100, lives: 3},
      near: {x: 120, y: 100, lives: 3},
      dead: {x: 101, y: 100, lives: 0},
      hidden: {x: 110, y: 100, lives: 3},
    },
    isVisible: id => id !== "hidden",
  })

  assert.equal(target, "near")
})

test("does not select a hidden or dead opponent", () => {
  const target = chooseTauntTarget({
    localId: "me",
    players: {
      me: {x: 0, y: 0, lives: 3},
      hidden: {x: 1, y: 0, lives: 3},
      dead: {x: 1, y: 0, lives: 0},
    },
    isVisible: () => false,
  })

  assert.equal(target, null)
})
