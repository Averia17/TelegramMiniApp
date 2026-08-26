import assert from "node:assert/strict"
import test from "node:test"

import {collectNewCombatAbilityRejections, formatCombatAbilityReason} from "../src/components/BattleGame/combatEventFeedback.js"

test("formats authoritative ability rejection reasons for the local player", () => {
  assert.equal(formatCombatAbilityReason("super_not_ready", "primary"), "Super is not ready")
  assert.equal(formatCombatAbilityReason("ability_cooldown", "secondary"), "Ability is recharging")
  assert.equal(formatCombatAbilityReason("gadget_unavailable", "secondary"), "No gadget charges")
  assert.equal(formatCombatAbilityReason("unknown_reason", "primary"), "Ability was not accepted")
})

test("deduplicates rejected ability events by authoritative event id", () => {
  const events = [
    {id: 4, kind: "ability", sourceId: "local", abilitySlot: "primary", accepted: false, reason: "super_not_ready"},
    {id: 5, kind: "ability", sourceId: "enemy", abilitySlot: "primary", accepted: false, reason: "super_not_ready"},
    {id: 6, kind: "ability", sourceId: "local", abilitySlot: "secondary", accepted: true, reason: "accepted"},
  ]
  const first = collectNewCombatAbilityRejections(events, "local")
  assert.deepEqual(first.events.map(event => event.id), [4])
  const second = collectNewCombatAbilityRejections(events, "local", first.seenIds)
  assert.deepEqual(second.events, [])
})
