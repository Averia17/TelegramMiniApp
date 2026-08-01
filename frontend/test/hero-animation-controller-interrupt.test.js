import test from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"

import {GLBHeroController} from "../src/components/BattleGame/rendering/heroes/GLBHeroController.js"

const poseClip = (name, duration = .4) => new THREE.AnimationClip(name, duration, [
  new THREE.QuaternionKeyframeTrack("Upper.quaternion", [0, duration], [0, 0, 0, 1, 0, 0.7071068, 0, 0.7071068]),
])

test("full-body skill overlays suppress locomotion instead of averaging two poses", () => {
  const root = new THREE.Group()
  const upper = new THREE.Bone()
  upper.name = "Upper"
  root.add(upper)
  const controller = new GLBHeroController(root, [
    poseClip("Idle"),
    poseClip("Attack"),
  ], {
    idle: "Idle",
    attack: "Attack",
  }, {
    attackPulse: 0,
    spawnOnLoad: false,
  })

  controller.update(.016, {alive: true, moving: false, attackPulse: 0})
  controller.update(.016, {alive: true, moving: false, attackPulse: 1})
  controller.update(.2, {alive: true, moving: false, attackPulse: 1})

  assert.equal(controller.overlay, "attack")
  assert.equal(controller.actions.get("idle").getEffectiveWeight(), 0)
  assert.equal(controller.actions.get("attack").getEffectiveWeight(), 1)
  controller.dispose()
})

test("spawn and outcome interrupt an active upper-body overlay", () => {
  const root = new THREE.Group()
  const hips = new THREE.Bone()
  hips.name = "Hips"
  root.add(hips)
  const idle = new THREE.AnimationClip("Idle", 1, [
    new THREE.QuaternionKeyframeTrack("Hips.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ])
  const aimSuper = new THREE.AnimationClip("AimSuper", 1, [
    new THREE.QuaternionKeyframeTrack("Hips.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ])
  const spawn = new THREE.AnimationClip("Spawn", .5, [
    new THREE.QuaternionKeyframeTrack("Hips.quaternion", [0, .5], [0, 0, 0, 1, 0, 0, 0, 1]),
  ])
  const defeat = new THREE.AnimationClip("Defeat", 1, [
    new THREE.QuaternionKeyframeTrack("Hips.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ])
  const controller = new GLBHeroController(root, [idle, aimSuper, spawn, defeat], {
    idle: "Idle",
    aimSuper: "AimSuper",
    spawn: "Spawn",
    defeat: "Defeat",
  }, {spawnOnLoad: false})

  controller.playOverlay("aimSuper")
  controller.playSpawn()
  assert.equal(controller.overlay, null)
  assert.equal(controller.actions.get("aimSuper").getEffectiveWeight(), 0)

  controller.playOverlay("aimSuper")
  controller.playOutcome("defeat")
  assert.equal(controller.overlay, null)
  assert.equal(controller.actions.get("aimSuper").getEffectiveWeight(), 0)
  controller.dispose()
})
