import assert from "node:assert/strict"
import test from "node:test"

import {
  getAttackReloadSegments,
  shouldCreateAttackReloadIndicator,
} from "../src/components/BattleGame/rendering/heroes/AttackReloadIndicator.js"
import {HEROES_CONFIG} from "../src/components/BattleGame/heroesConfig.js"

test("attack reload ring lights every segment when all attacks are ready", () => {
  assert.deepEqual(getAttackReloadSegments({ammo: 3, maxAmmo: 3, reloadProgress: 0}), [1, 1, 1])
})

test("attack reload ring fills only the next spent segment", () => {
  assert.deepEqual(getAttackReloadSegments({ammo: 1, maxAmmo: 3, reloadProgress: 0.4}), [1, 0.4, 0])
})

test("attack reload ring clamps malformed snapshot values", () => {
  assert.deepEqual(getAttackReloadSegments({ammo: -2, maxAmmo: 3, reloadProgress: 1.8}), [1, 0, 0])
})

test("attack reload ring is created only for the local player", () => {
  assert.equal(shouldCreateAttackReloadIndicator("player-1", "player-1"), true)
  assert.equal(shouldCreateAttackReloadIndicator("player-2", "player-1"), false)
  assert.equal(shouldCreateAttackReloadIndicator("player-1", null), false)
})

test("every hero config declares the number of basic attack charges", () => {
  assert.ok(HEROES_CONFIG.every(hero => Number.isInteger(hero.maxAmmo) && hero.maxAmmo > 0))
  assert.deepEqual(getAttackReloadSegments({hero: "Needle", ammo: 1, reloadProgress: .25}), [1, .25, 0])
})

test("attack reload ring supports heroes with a different charge count", () => {
  assert.deepEqual(getAttackReloadSegments({maxAmmo: 4, ammo: 2, reloadProgress: .5}), [1, 1, .5, 0])
})
