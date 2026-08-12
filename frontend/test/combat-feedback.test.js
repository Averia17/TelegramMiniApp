import test from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"

import {
  collectNewCombatHits,
  isConfirmedHitEvent,
  resolveCombatTargetPosition,
} from "../src/components/BattleGame/rendering/combat/combatFeedback.js"
import {CombatFeedbackRenderer} from "../src/components/BattleGame/rendering/combat/CombatFeedbackRenderer.js"

const hit = (id = 7) => ({
  id,
  kind: "hit",
  sourceId: "local",
  targetType: "players",
  targetId: "enemy",
  damage: 60,
})

test("combat hit collection is idempotent across repeated snapshots", () => {
  assert.equal(isConfirmedHitEvent(hit()), true)
  assert.equal(isConfirmedHitEvent({...hit(), damage: 0}), false)

  const first = collectNewCombatHits([hit()], new Set())
  assert.equal(first.hits.length, 1)

  const repeated = collectNewCombatHits([hit(), hit(8)], first.seenIds)
  assert.deepEqual(repeated.hits.map(event => event.id), [8])
})

test("combat feedback follows the authoritative target and expires", () => {
  const root = new THREE.Group()
  const renderer = new CombatFeedbackRenderer(root)
  renderer.setLocalPlayerId("local")
  const state = {
    combatEvents: [hit()],
    players: {
      enemy: {x: 240, y: 360, radius: 20},
    },
  }

  assert.deepEqual(resolveCombatTargetPosition(hit(), state), {x: 240, y: 360, radius: 20})
  assert.equal(renderer.sync(state).length, 1)
  assert.equal(root.children.length, 1)
  assert.equal(root.children[0].userData.damage, 60)
  assert.equal(root.children[0].userData.role, "combat-hit-feedback")
  assert.equal(root.children[0].children.some(child => child.userData.role === "damage-number"), true)

  assert.equal(renderer.sync(state).length, 0)
  state.players.enemy.x = 280
  renderer.sync({...state, combatEvents: []})
  renderer.update(.1)
  assert.equal(Math.abs(root.children[0].position.x - 280 * .065) < .001, true)

  renderer.update(.6)
  assert.equal(root.children.length, 0)
  renderer.dispose()
})

test("a hit is retried when its target is absent from a compact snapshot", () => {
  const root = new THREE.Group()
  const renderer = new CombatFeedbackRenderer(root)
  renderer.setLocalPlayerId("local")
  const event = hit(12)

  assert.equal(renderer.sync({combatEvents: [event], players: {}}).length, 0)
  assert.equal(renderer.sync({combatEvents: [event], players: {enemy: {x: 20, y: 30}}}).length, 1)
  assert.equal(root.children.length, 1)
  renderer.dispose()
})
