import test from "node:test"
import assert from "node:assert/strict"

import {getSpawnProtectionVisualState} from "../src/components/BattleGame/rendering/heroes/spawnProtectionVisuals.js"

test("shows the respawn shield only for a living team hero with time remaining", () => {
  assert.deepEqual(getSpawnProtectionVisualState({lives: 3, invulnerable: 2.4}, true), {
    active: true,
    remaining: 2.4,
  })
  assert.equal(getSpawnProtectionVisualState({lives: 3, invulnerable: 2.4}, false).active, false)
  assert.equal(getSpawnProtectionVisualState({lives: 0, invulnerable: 2.4}, true).active, false)
})

test("clamps malformed or expired protection timers safely", () => {
  assert.deepEqual(getSpawnProtectionVisualState({lives: 3, invulnerable: -1}, true), {
    active: false,
    remaining: 0,
  })
  assert.deepEqual(getSpawnProtectionVisualState({lives: 3, invulnerable: "bad"}, true), {
    active: false,
    remaining: 0,
  })
})
