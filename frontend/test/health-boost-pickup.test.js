import assert from "node:assert/strict"
import test from "node:test"
import * as THREE from "three"

import {
  createHealthBoost,
  createHealthCrate,
  createHealthPotion,
  getPropHealthFraction,
} from "../src/components/BattleGame/rendering/map/PickupRenderer.js"
import {EffectRenderer} from "../src/components/BattleGame/rendering/combat/EffectRenderer.js"

test("health crate has a readable breakable-box silhouette and health bar", () => {
  const crate = createHealthCrate({type: "health_crate", lives: 500, maxLives: 500})
  const roles = []
  crate.traverse(child => {
    if (child.userData.role) roles.push(child.userData.role)
  })

  assert.equal(crate.userData.type, "health_crate")
  assert.equal(roles.includes("health-crate-body"), true)
  assert.equal(roles.includes("health-crate-front-panel"), true)
  assert.equal(roles.filter(role => role === "health-crate-plank").length >= 5, true)
  assert.equal(roles.filter(role => role === "health-crate-corner").length >= 4, true)
  assert.equal(roles.filter(role => role === "health-crate-crack").length >= 3, true)
  assert.equal(roles.includes("health-crate-energy-gem"), true)
  assert.equal(roles.includes("health-crate-lid"), false)
  assert.equal(roles.includes("health-crate-cap"), false)
  assert.equal(roles.includes("prop-health-fill"), true)
  assert.equal(getPropHealthFraction(250, 500), .5)
})

test("health boost uses a purple hero power cube visual", () => {
  const boost = createHealthBoost({type: "health_boost"})
  const roles = []
  boost.traverse(child => {
    if (child.userData.role) roles.push(child.userData.role)
  })

  assert.equal(boost.userData.type, "health_boost")
  assert.equal(boost.userData.healthBoost, true)
  assert.equal(boost.userData.palette, "purple")
  assert.equal(roles.includes("health-boost-cube"), true)
  assert.equal(roles.includes("health-boost-bolt"), true)
  assert.equal(roles.includes("health-boost-edge"), true)
  assert.equal(roles.filter(role => role === "health-boost-shard").length >= 4, true)
  assert.equal(roles.includes("health-boost-halo"), true)
})

test("regular health pickup uses a green cube related to the hero power cube", () => {
  const potion = createHealthPotion({type: "potion-red"})
  const roles = []
  potion.traverse(child => {
    if (child.userData.role) roles.push(child.userData.role)
  })

  assert.equal(potion.userData.type, "potion-red")
  assert.equal(potion.userData.palette, "green")
  assert.equal(roles.includes("health-potion-cube"), true)
  assert.equal(roles.includes("health-potion-emblem"), true)
  assert.equal(roles.includes("health-potion-edge"), true)
  assert.equal(roles.includes("health-potion-body"), false)
  assert.equal(roles.includes("health-potion-cork"), false)
  assert.equal(roles.includes("health-boost-cube"), false)
})

test("collecting a health boost reuses the readable healing plus", () => {
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
