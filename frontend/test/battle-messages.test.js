import assert from "node:assert/strict"
import test from "node:test"

import {formatBattleMessage} from "../src/components/BattleGame/battleMessages.js"

test("formats the room and matchmaking events that used to render as empty bubbles", () => {
  assert.equal(formatBattleMessage({type: "room_joined", params: {roomName: "Arena"}}), "Joined Arena")
  assert.equal(formatBattleMessage({type: "match_found"}), "Match found!")
})

test("formats actionable server errors and death notifications", () => {
  assert.equal(formatBattleMessage({type: "error", params: {message: "Room not found"}}), "Room not found")
  assert.equal(formatBattleMessage({type: "you_died", params: {killerName: "Mandy"}}), "You died — Mandy got you")
})

test("formats authoritative ability rejection feedback", () => {
  assert.equal(
    formatBattleMessage({type: "combat_ability_rejected", params: {reason: "super_not_ready", slot: "primary"}}),
    "Super is not ready",
  )
  assert.equal(
    formatBattleMessage({type: "combat_ability_rejected", params: {reason: "gadget_unavailable", slot: "secondary"}}),
    "No gadget charges",
  )
  assert.equal(
    formatBattleMessage({type: "combat_ability_rejected", params: {reason: "ability_cancelled", slot: "primary"}}),
    "Ability cancelled",
  )
})

test("formats a targeted clown taunt", () => {
  assert.equal(
    formatBattleMessage({type: "taunt", params: {playerName: "Alice", targetName: "Bob"}}),
    "Alice 🤡 Bob",
  )
})

test("does not return a renderable message for unknown or intentionally hidden events", () => {
  assert.equal(formatBattleMessage({type: "island_voice", params: {text: "Look around"}}), "")
  assert.equal(formatBattleMessage({type: "future_event", params: {}}), "")
  assert.equal(formatBattleMessage(null), "")
})
