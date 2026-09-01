import test from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"

import {getMonsterVisualProfile} from "../src/components/BattleGame/rendering/monsters/MonsterRenderer.js"
import {EffectRenderer, MONSTER_EFFECT_VISUAL_KINDS} from "../src/components/BattleGame/rendering/combat/EffectRenderer.js"
import {getCombatEffectPhase} from "../src/components/BattleGame/rendering/combat/combatEffectPhase.js"

test("authored neutral monster kinds have distinct readable visual profiles", () => {
  const bat = getMonsterVisualProfile("bat")
  const hound = getMonsterVisualProfile("ash_hound")
  const guardian = getMonsterVisualProfile("root_guardian")

  assert.equal(hound.wings, false)
  assert.equal(guardian.wings, false)
  assert.notEqual(hound.body, bat.body)
  assert.notEqual(guardian.body, bat.body)
  assert.notDeepEqual(hound.scale, guardian.scale)
})

test("unknown monster kinds fall back to the stable bat profile", () => {
  assert.deepEqual(getMonsterVisualProfile("future_monster"), getMonsterVisualProfile("bat"))
})

test("monster attack phases expose distinct dodge and zone silhouettes", () => {
  for (const kind of [
    "ash_hound_charge_telegraph", "ash_hound_charge_impact", "ash_hound_recovery",
    "root_guardian_telegraph", "root_guardian_impact", "root_guardian_zone",
  ]) assert.equal(MONSTER_EFFECT_VISUAL_KINDS.has(kind), true, `${kind} is missing a visual contract`)

  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([
    {id: "hound", kind: "ash_hound_charge_telegraph", x: 0, y: 0, toX: 240, toY: 0, range: 240, radius: 26, life: .2, maxLife: .52},
    {id: "guardian", kind: "root_guardian_zone", x: 0, y: 0, radius: 112, life: 1, maxLife: 1.8},
  ])
  assert.equal(root.children[0].userData.directed, true)
  const roles = []
  root.children[1].traverse(node => { if (node.userData?.role) roles.push(node.userData.role) })
  assert.ok(roles.includes("root-guardian-zone-ring"))
  assert.ok(roles.includes("root-guardian-zone-spike"))
  assert.equal(getCombatEffectPhase({kind: "ash_hound_charge_telegraph"}), "telegraph")
  assert.equal(getCombatEffectPhase({kind: "root_guardian_zone"}), "active")
  assert.equal(getCombatEffectPhase({kind: "root_guardian_impact"}), "impact")
})
