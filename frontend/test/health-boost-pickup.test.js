import assert from "node:assert/strict"
import nodeTest from "node:test"
import * as THREE from "three"

import {
  createHealthBoost,
} from "../src/components/BattleGame/rendering/map/PickupRenderer.js"
import {EffectRenderer} from "../src/components/BattleGame/rendering/combat/EffectRenderer.js"

const test = (name, fn) => nodeTest(name, {concurrency: true}, fn)

test("health boost uses a single readable green max-health cube visual", () => {
  const boost = createHealthBoost({type: "health_boost"})
  const roles = []
  boost.traverse(child => {
    if (child.userData.role) roles.push(child.userData.role)
  })

  assert.equal(boost.userData.type, "health_boost")
  assert.equal(boost.userData.healthBoost, true)
  assert.equal(boost.userData.palette, "green")
  assert.equal(roles.includes("health-boost-cube"), true)
  assert.equal(roles.includes("health-boost-bolt"), true)
  assert.equal(roles.includes("health-boost-edge"), true)
  assert.equal(roles.filter(role => role === "health-boost-shard").length >= 4, true)
  assert.equal(roles.includes("health-boost-halo"), true)
})

test("collecting a health boost shows a readable max-health marker", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([{
    id: "health-boost-effect",
    kind: "health_boost",
    x: 120,
    y: 220,
    color: "#4dff70",
    damage: 31,
    life: .5,
    maxLife: .7,
  }])

  const roles = []
  root.traverse(child => {
    if (child.userData.role) roles.push(child.userData.role)
  })
  assert.equal(roles.includes("healing-cross"), true)
})
