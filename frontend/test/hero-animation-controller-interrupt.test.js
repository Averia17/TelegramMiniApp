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

  assert.equal(controller.state, "idle")
  assert.equal(controller.actions.get("idle").getEffectiveWeight(), 1)
  controller.update(.016, {alive: true, moving: false, attackPulse: 0})
  controller.update(.016, {alive: true, moving: false, attackPulse: 1})
  controller.update(.2, {alive: true, moving: false, attackPulse: 1})

  assert.equal(controller.overlay, "attack")
  assert.equal(controller.actions.get("idle").getEffectiveWeight(), 0)
  assert.equal(controller.actions.get("attack").getEffectiveWeight(), 1)
  controller.dispose()
})

test("preview controllers apply the idle pose before the first render", () => {
  const root = new THREE.Group()
  const upper = new THREE.Bone()
  upper.name = "Upper"
  root.add(upper)
  const idle = new THREE.AnimationClip("Idle", 1, [
    new THREE.VectorKeyframeTrack("Upper.position", [0, 1], [0.25, 0, 0, 0.25, 0, 0]),
  ])
  const controller = new GLBHeroController(root, [idle], {idle: "Idle"}, {spawnOnLoad: false})

  assert.equal(controller.state, "idle")
  assert.equal(upper.position.x, 0.25)
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

test("full-body overlay restores locomotion without resetting its phase", () => {
  const root = new THREE.Group()
  const upper = new THREE.Bone()
  upper.name = "Upper"
  root.add(upper)
  const idle = new THREE.AnimationClip("Idle", 1, [
    new THREE.QuaternionKeyframeTrack("Upper.quaternion", [0, 1], [0, 0, 0, 1, 0, 0.7071068, 0, 0.7071068]),
  ])
  const attack = new THREE.AnimationClip("Attack", .1, [
    new THREE.QuaternionKeyframeTrack("Upper.quaternion", [0, .1], [0, 0, 0, 1, 0, 0, 0.7071068, 0.7071068]),
  ])
  const controller = new GLBHeroController(root, [idle, attack], {
    idle: "Idle",
    attack: "Attack",
  }, {attackPulse: 0, spawnOnLoad: false})

  controller.update(.016, {alive: true, moving: false, attackPulse: 0})
  controller.update(.24, {alive: true, moving: false, attackPulse: 0})
  const phaseBeforeAttack = controller.actions.get("idle").time
  controller.playOverlay("attack", 0)
  controller.update(.11, {alive: true, moving: false, attackPulse: 0})

  const idleAction = controller.actions.get("idle")
  assert.ok(idleAction.time > phaseBeforeAttack)
  assert.ok(idleAction.time > 0)
  assert.ok(idleAction.getEffectiveWeight() < 1)
  controller.dispose()
})

test("full-body overlay blends out before its finished event leaves an empty frame", () => {
  const root = new THREE.Group()
  const upper = new THREE.Bone()
  upper.name = "Upper"
  root.add(upper)
  const idle = poseClip("Idle", 1)
  const attack = poseClip("Attack", .2)
  const controller = new GLBHeroController(root, [idle, attack], {
    idle: "Idle",
    attack: "Attack",
  }, {spawnOnLoad: false, attackPulse: 0})

  controller.update(.05, {alive: true, moving: false, attackPulse: 0})
  controller.playOverlay("attack", 0)
  const weights = []
  for (let index = 0; index < 8; index += 1) {
    controller.update(.05, {alive: true, moving: false, attackPulse: 0})
    weights.push([
      controller.actions.get("idle").getEffectiveWeight(),
      controller.actions.get("attack").getEffectiveWeight(),
    ])
  }

  assert.ok(weights.every(([idleWeight, attackWeight]) => idleWeight + attackWeight > .001))
  assert.equal(controller.overlay, null)
  controller.dispose()
})

test("spawn restores locomotion when its time scale stretches the clip", () => {
  const root = new THREE.Group()
  const upper = new THREE.Bone()
  upper.name = "Upper"
  root.add(upper)
  const idle = poseClip("Idle", 1)
  const run = poseClip("Run", 1)
  const spawn = poseClip("Spawn", .8)
  const controller = new GLBHeroController(root, [idle, run, spawn], {
    idle: "Idle",
    run: "Run",
    spawn: "Spawn",
  }, {spawnOnLoad: false, spawnDuration: 1.6})

  controller.playSpawn()
  for (let index = 0; index < 140; index += 1) {
    controller.update(1 / 60, {alive: true, moving: true, speed: 144, referenceSpeed: 144})
  }

  assert.equal(controller.state, "run")
  assert.equal(controller.actions.get("run").getEffectiveWeight(), 1)
  assert.equal(controller.actions.get("spawn").getEffectiveWeight(), 0)
  controller.dispose()
})
