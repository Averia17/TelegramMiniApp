import test from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import {CameraRig} from "../src/components/BattleGame/rendering/CameraRig.js"
import {getCombatAccessibilityPreferences} from "../src/components/BattleGame/rendering/combat/combatAccessibility.js"
import {CombatFeedbackRenderer} from "../src/components/BattleGame/rendering/combat/CombatFeedbackRenderer.js"

test("combat accessibility follows reduced-motion and explicit local preference", () => {
  const environment = {
    matchMedia: query => ({matches: query === "(prefers-reduced-motion: reduce)"}),
    localStorage: {getItem: key => key === "combat.reducedFlash" ? "1" : null},
  }
  assert.deepEqual(getCombatAccessibilityPreferences(environment), {
    reducedMotion: true,
    reducedShake: true,
    reducedFlash: true,
    reducedAudio: false,
  })
})

test("camera shake is disabled when reduced motion is active", () => {
  const camera = new CameraRig({reducedShake: true})
  camera.addShake(.2)
  assert.equal(camera.shake, 0)
})

test("reduced audio is an explicit local preference", () => {
  const preferences = getCombatAccessibilityPreferences({
    matchMedia: () => ({matches: false}),
    localStorage: {getItem: key => key === "combat.reducedAudio" ? "1" : null},
  })
  assert.equal(preferences.reducedAudio, true)
  assert.equal(preferences.reducedMotion, false)
})

test("reduced flash lowers confirmed hit feedback intensity", () => {
  const root = new THREE.Group()
  const renderer = new CombatFeedbackRenderer(root, {reducedFlash: true})
  renderer.setLocalPlayerId("local")
  renderer.sync({
    combatEvents: [{id: 1, kind: "hit", phase: "impact", sourceId: "local", targetId: "enemy", damage: 20}],
    players: {enemy: {x: 100, y: 100, radius: 20}},
  })
  assert.equal(root.children[0].userData.flashMultiplier, .45)
  renderer.dispose()
})
