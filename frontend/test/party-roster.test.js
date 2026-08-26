import nodeTest from "node:test"
import assert from "node:assert/strict"
import {arrangePartyMembers, canKickPartyMember, canStartTeamParty, getBattleModeAfterPartyState, getDuplicatePartyHeroes, getPartyBattleIntent, getPartyRosterModel, shouldApplyPartyState} from "../src/components/Party/partyRoster.js"

const test = (name, fn) => nodeTest(name, {concurrency: true}, fn)

const member = (playerId, hero) => ({playerId, hero})

test("party start is blocked when two members selected the same hero", () => {
	const result = canStartTeamParty([member("1", "Kaze"), member("2", "Kaze")])
  assert.equal(result.ok, false)
  assert.equal(result.reason, "Все герои пати должны быть уникальны")
	assert.deepEqual(result.duplicates, ["kaze"])
})

test("party start is allowed when heroes are unique", () => {
	assert.equal(canStartTeamParty([member("1", "Kaze"), member("2", "Needle")]).ok, true)
})

test("missing hero is rejected before matchmaking", () => {
  assert.equal(canStartTeamParty([member("1", "")]).ok, false)
})

test("owner is centered in a full party roster", () => {
	const roster = arrangePartyMembers([member("owner", "Kaze"), member("a", "Needle"), member("b", "Mico")], "owner")
  assert.deepEqual(roster.map(item => item.playerId), ["a", "owner", "b"])
})

test("duplicate hero helper ignores empty slots", () => {
  assert.deepEqual(getDuplicatePartyHeroes([member("1", ""), member("2", "Needle")]), [])
})

test("main screen roster keeps every member and their selected hero", () => {
  const model = getPartyRosterModel({partyId: "party-1", members: [
    {playerId: "friend", name: "Друг", hero: "Needle"},
    {playerId: "me", name: "Я", hero: "Kaze", owner: true},
  ]}, "me")

  assert.equal(model.active, true)
  assert.deepEqual(model.members.map(item => [item.playerId, item.hero]), [["friend", "Needle"], ["me", "Kaze"]])
})

test("only the party owner can kick another member", () => {
  const party = {members: [
    {playerId: "owner", owner: true},
    {playerId: "friend", owner: false},
  ]}

  assert.equal(canKickPartyMember(party, "owner", "friend"), true)
  assert.equal(canKickPartyMember(party, "friend", "owner"), false)
  assert.equal(canKickPartyMember(party, "owner", "owner"), false)
})

test("party battle intent is shared by every member", () => {
  assert.equal(getPartyBattleIntent({partyId: "party-1", battleNonce: "battle-2"}), "party-1:battle-2")
  assert.equal(getPartyBattleIntent({partyId: "party-1"}), "")
})

test("stale party polling cannot hide a newer accepted member", () => {
  const current = {partyId: "party-1", revision: 3, members: [{playerId: "owner"}, {playerId: "friend"}]}
  const stale = {partyId: "party-1", revision: 2, members: [{playerId: "owner"}]}

  assert.equal(shouldApplyPartyState(current, stale), false)
  assert.equal(shouldApplyPartyState(current, {...current, revision: 4}), true)
})

test("leaving a party keeps the selected team battle mode", () => {
  assert.equal(getBattleModeAfterPartyState("team", null), "team")
  assert.equal(getBattleModeAfterPartyState("solo", null), "solo")
})

test("manual solo selection is not overwritten by a stale party refresh", () => {
  const party = {partyId: "party-1", members: [{playerId: "owner"}]}
  assert.equal(getBattleModeAfterPartyState("team", party, "solo"), "solo")
})
