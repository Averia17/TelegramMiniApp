import test from "node:test"
import assert from "node:assert/strict"
import {arrangePartyMembers, canStartTeamParty, getDuplicatePartyHeroes} from "../src/components/Party/partyRoster.js"

const member = (playerId, hero) => ({playerId, hero})

test("party start is blocked when two members selected the same hero", () => {
  const result = canStartTeamParty([member("1", "Viper"), member("2", "Viper")])
  assert.equal(result.ok, false)
  assert.equal(result.reason, "Все герои пати должны быть уникальны")
  assert.deepEqual(result.duplicates, ["viper"])
})

test("party start is allowed when heroes are unique", () => {
  assert.equal(canStartTeamParty([member("1", "Viper"), member("2", "Needle")]).ok, true)
})

test("missing hero is rejected before matchmaking", () => {
  assert.equal(canStartTeamParty([member("1", "")]).ok, false)
})

test("owner is centered in a full party roster", () => {
  const roster = arrangePartyMembers([member("owner", "Viper"), member("a", "Needle"), member("b", "Mico")], "owner")
  assert.deepEqual(roster.map(item => item.playerId), ["a", "owner", "b"])
})

test("duplicate hero helper ignores empty slots", () => {
  assert.deepEqual(getDuplicatePartyHeroes([member("1", ""), member("2", "Needle")]), [])
})
