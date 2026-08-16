import assert from "node:assert/strict"
import test from "node:test"

import {createHealEffect} from "../src/components/BattleGame/rendering/combat/EffectRenderer.js"

test("heal feedback is a readable green plus with glow and rising motes", () => {
  const heal = createHealEffect(2, 0x65ff9c)
  const roles = []
  heal.traverse(child => {
    if (child.userData.role) roles.push(child.userData.role)
  })

  assert.equal(heal.userData.kind, "heal")
  assert.equal(roles.includes("heal-glow"), true)
  assert.equal(roles.filter(role => role === "healing-cross").length, 4)
  assert.equal(roles.filter(role => role === "healing-mote").length, 6)
  assert.equal(roles.includes("cloud-puff"), false)
})
