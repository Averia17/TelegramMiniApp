import assert from "node:assert/strict"
import test from "node:test"
import * as THREE from "three"

import {GLBHeroController} from "../src/components/BattleGame/rendering/heroes/GLBHeroController.js"

test("moving heroes drive left and right legs as separate rig parts", () => {
  const root = new THREE.Group()
  const hips = new THREE.Bone()
  hips.name = "Hips"
  root.add(hips)
  for (const side of ["Left", "Right"]) {
    const upperLeg = new THREE.Bone()
    upperLeg.name = `${side}UpperLeg`
    const lowerLeg = new THREE.Bone()
    lowerLeg.name = `${side}LowerLeg`
    const foot = new THREE.Bone()
    foot.name = `${side}Foot`
    upperLeg.add(lowerLeg)
    lowerLeg.add(foot)
    hips.add(upperLeg)
  }
  const controller = new GLBHeroController(root, [
    new THREE.AnimationClip("Idle", 1, []),
    new THREE.AnimationClip("Run", 1, []),
  ], {
    idle: "Idle",
    run: "Run",
  }, {
    heroName: "Test Hero",
    spawnOnLoad: false,
  })

  controller.update(.2, {
    alive: true,
    moving: true,
    speed: 250,
    referenceSpeed: 250,
  })

  assert.equal(controller.rig.legs.left.upper.name, "LeftUpperLeg")
  assert.equal(controller.rig.legs.right.upper.name, "RightUpperLeg")
  assert.ok(controller.rig.legs.left.upper.rotation.x * controller.rig.legs.right.upper.rotation.x < 0)
  assert.ok(Math.abs(controller.rig.legs.left.lower.rotation.x) > .01)
  assert.ok(Math.abs(controller.rig.legs.right.foot.rotation.x) > .01)
  controller.dispose()
})

test("ranged heroes visibly carry their held projectile before attacking", () => {
  const root = new THREE.Group()
  const hand = new THREE.Bone()
  hand.name = "RightHand"
  root.add(hand)
  const controller = new GLBHeroController(root, [
    new THREE.AnimationClip("Idle", 1, []),
    new THREE.AnimationClip("Attack", .5, []),
  ], {
    idle: "Idle",
    attack: "Attack",
  }, {
    heroName: "Needle",
    attackPulse: 0,
    spawnOnLoad: false,
  })

  controller.update(.016, {alive: true, moving: false, attackPulse: 0})

  assert.equal(controller.heldProjectile.parent, hand)
  assert.equal(controller.heldProjectile.visible, true)
  controller.dispose()
})

test("the held projectile returns to the hand after its attack release", () => {
  const root = new THREE.Group()
  const hand = new THREE.Bone()
  hand.name = "RightHand"
  root.add(hand)
  const controller = new GLBHeroController(root, [
    new THREE.AnimationClip("Idle", 1, []),
    new THREE.AnimationClip("Attack", .4, []),
  ], {
    idle: "Idle",
    attack: "Attack",
  }, {
    heroName: "Needle",
    attackPulse: 0,
    spawnOnLoad: false,
  })

  controller.update(.01, {alive: true, attackPulse: 1})
  controller.update(.25, {alive: true, attackPulse: 1})
  assert.equal(controller.heldProjectile.visible, false)
  controller.update(.3, {alive: true, attackPulse: 1})
  assert.equal(controller.heldProjectile.visible, true)
  controller.dispose()
})
