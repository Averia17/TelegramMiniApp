import assert from "node:assert/strict"
import test from "node:test"
import * as THREE from "three"

import {canStartAttack, isAutoAimAttackGesture} from "../src/components/BattleGame/Input.js"
import {AimRenderer} from "../src/components/BattleGame/rendering/combat/AimRenderer.js"
import {blendAngle} from "../src/components/BattleGame/rendering/heroes/turning.js"

test("a stationary attack release auto-aims even after a long press", () => {
  assert.equal(isAutoAimAttackGesture(0, 650), true)
})

test("a deliberate attack drag keeps the manually aimed direction", () => {
  assert.equal(isAutoAimAttackGesture(24, 120), false)
})

test("attack input waits for the authoritative recovery window", () => {
  assert.equal(canStartAttack({ammo: 2, lives: 100, attackCooldown: 0.18}, 1_000, 0), false)
  assert.equal(canStartAttack({ammo: 2, lives: 100, attackCooldown: 0}, 1_000, 0), true)
})

test("attack input immediately applies the hero cadence after sending a shot", () => {
  const player = {ammo: 2, lives: 100, attackCooldown: 0, attackRateMs: 650}

  assert.equal(canStartAttack(player, 1_500, 1_000), false)
  assert.equal(canStartAttack(player, 1_650, 1_000), true)
})

test("attack input never advertises an unavailable attack", () => {
  assert.equal(canStartAttack({ammo: 2, lives: 100, attackReady: false}, 1_000, 0, "game"), false)
  assert.equal(canStartAttack({ammo: 2, lives: 100}, 1_000, 0, "lobby"), false)
  assert.equal(canStartAttack({ammo: 2, lives: 0}, 1_000, 0, "game"), false)
  assert.equal(canStartAttack({ammo: 2, lives: 100, stun: 0.2}, 1_000, 0, "game"), false)
  assert.equal(canStartAttack({ammo: 2, lives: 100, channel: 0.2}, 1_000, 0, "game"), false)
})

test("attack guide stays visible when the server says the attack is unavailable", () => {
  const root = new THREE.Group()
  const aim = new AimRenderer(root)

  aim.update({aiming: true, attackReady: false, x: 100, y: 100})

  assert.equal(root.visible, true)
})

test("Mandy super aiming remains visible while the basic attack is locked", () => {
  const root = new THREE.Group()
  const aim = new AimRenderer(root)

  aim.update({
    aiming: true,
    attackReady: false,
    hero: "Mandy",
    channel: 0.4,
    x: 100,
    y: 100,
    rotation: 0,
  })

  assert.equal(root.visible, true)
  assert.equal(aim.superLane.visible, true)
  assert.equal(aim.line.visible, false)
})

test("attack-facing interpolation follows the shortest arc", () => {
  assert.ok(Math.abs(blendAngle(0, Math.PI / 2, .5) - Math.PI / 4) < 1e-9)
  assert.ok(Math.abs(Math.abs(blendAngle(Math.PI - .1, -Math.PI + .1, .5)) - Math.PI) < 1e-9)
})
