import test from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"

import {GLBHeroController} from "../src/components/BattleGame/rendering/heroes/GLBHeroController.js"

test("full-body authored super strips exported bone-position root motion but keeps pose tracks", () => {
  const root = new THREE.Group()
  const hips = new THREE.Bone()
  hips.name = "Hips"
  hips.position.set(0, 440, -14)
  const spine = new THREE.Bone()
  spine.name = "Spine"
  hips.add(spine)
  root.add(hips)
  const superClip = new THREE.AnimationClip("Super", 1, [
    new THREE.VectorKeyframeTrack("Hips.position", [0, 1], [0, 0, 0, 440, -14, 0]),
    new THREE.QuaternionKeyframeTrack("Hips.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    new THREE.QuaternionKeyframeTrack("Spine.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ])
  const controller = new GLBHeroController(root, [superClip], {super: "Super"}, {
    spawnOnLoad: false,
    fullBodySuper: true,
  })
  const tracks = controller.actions.get("super").getClip().tracks
  assert.equal(tracks.some(track => track.name.endsWith(".position")), false)
  assert.equal(tracks.some(track => track.name === "Hips.quaternion"), false)
  assert.equal(tracks.some(track => track.name === "Spine.quaternion"), true)
  controller.dispose()

  const locomotionController = new GLBHeroController(root, [superClip], {idle: "Super"}, {
    spawnOnLoad: false,
  })
  assert.equal(locomotionController.actions.get("idle").getClip().tracks.some(track => track.name === "Hips.position"), false)
  assert.equal(locomotionController.actions.get("idle").getClip().tracks.some(track => track.name === "Hips.quaternion"), false)
  locomotionController.dispose()
})
