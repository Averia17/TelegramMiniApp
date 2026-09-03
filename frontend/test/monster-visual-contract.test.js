import test from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"

import {MonsterRenderer, getMonsterVisualProfile} from "../src/components/BattleGame/rendering/monsters/MonsterRenderer.js"
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

test("neutral monster profiles use distinct grounded silhouettes", () => {
  const bat = getMonsterVisualProfile("bat")
  const hound = getMonsterVisualProfile("ash_hound")
  const guardian = getMonsterVisualProfile("root_guardian")

  assert.notEqual(bat.size, hound.size)
  assert.notEqual(hound.size, guardian.size)
  assert.notEqual(bat.groundOffset, hound.groundOffset)
  assert.equal(bat.hoverAmplitude, 0)
  assert.equal(hound.hoverAmplitude, 0)
  assert.equal(guardian.hoverAmplitude, 0)
})

test("each neutral monster mounts authored silhouette parts with its own animation channel", () => {
  const root = new THREE.Group()
  const renderer = new MonsterRenderer(root)
  renderer.sync({
    bat: {x: 100, y: 100, radius: 18, lives: 4, maxLives: 4, kind: "bat"},
    hound: {x: 200, y: 100, radius: 18, lives: 4, maxLives: 4, kind: "ash_hound"},
    guardian: {x: 300, y: 100, radius: 18, lives: 4, maxLives: 4, kind: "root_guardian"},
  })

  const rolesFor = id => {
    const roles = []
    renderer.views.get(id).group.traverse(node => { if (node.userData?.role) roles.push(node.userData.role) })
    return roles
  }
  assert.ok(rolesFor("bat").includes("bat-wing"))
  assert.ok(rolesFor("bat").includes("bat-belly"))
  assert.ok(rolesFor("hound").includes("ash-hound-leg"))
  assert.ok(rolesFor("hound").includes("ash-hound-snout"))
  assert.ok(rolesFor("hound").includes("ash-hound-collar"))
  assert.ok(rolesFor("guardian").includes("root-guardian-core"))
  assert.ok(rolesFor("guardian").includes("root-guardian-shoulder"))
  assert.ok(rolesFor("guardian").includes("root-guardian-bark-band"))

  const batWingBefore = renderer.views.get("bat").leftWing.rotation.z
  const houndLegBefore = renderer.views.get("hound").legs[0].rotation.z
  const guardianVineBefore = renderer.views.get("guardian").vines[0].rotation.z
  renderer.update(.1, .7)
  assert.notEqual(renderer.views.get("bat").leftWing.rotation.z, batWingBefore)
  assert.notEqual(renderer.views.get("hound").legs[0].rotation.z, houndLegBefore)
  assert.notEqual(renderer.views.get("guardian").vines[0].rotation.z, guardianVineBefore)
  renderer.dispose()
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
