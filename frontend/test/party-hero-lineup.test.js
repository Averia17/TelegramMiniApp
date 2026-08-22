import test from "node:test"
import assert from "node:assert/strict"
import {getPartyHeroLineup} from "../src/components/HeroSelect/partyHeroLineup.js"

const heroes = [
  {name: "Kaze", displayName: "KAZE", color: "#7fe5ff"},
  {name: "Needle", displayName: "NEEDLE", color: "#f1a5ff"},
]

test("party lineup keeps nicknames and centers the local player in a full party", () => {
  const lineup = getPartyHeroLineup({partyId: "party-1", members: [
    {playerId: "me", name: "Sulteе", hero: "Kaze"},
    {playerId: "friend-a", name: "Piggеst", hero: "Needle"},
    {playerId: "friend-b", name: "Kren", hero: "Kaze"},
  ]}, "me", heroes, "Kaze")

  assert.deepEqual(lineup.map(item => [item.playerId, item.name, item.hero.name, item.isLocal]), [
    ["friend-a", "Piggеst", "Needle", false],
    ["me", "Sulteе", "Kaze", true],
    ["friend-b", "Kren", "Kaze", false],
  ])
})

test("party lineup uses the current selection while the party update is in flight", () => {
  const lineup = getPartyHeroLineup({partyId: "party-1", members: [
    {playerId: "me", name: "Sulteе", hero: "Needle"},
  ]}, "me", heroes, "Kaze")

  assert.equal(lineup[0].hero.name, "Kaze")
  assert.equal(lineup[0].isLocal, true)
})

test("party lineup ignores empty or unavailable friend heroes", () => {
  const lineup = getPartyHeroLineup({partyId: "party-1", members: [
    {playerId: "me", name: "Sulteе", hero: "Kaze"},
    {playerId: "friend-a", name: "Waiting", hero: ""},
    {playerId: "friend-b", name: "Unknown", hero: "MissingHero"},
  ]}, "me", heroes, "Kaze")

  assert.deepEqual(lineup.map(item => item.playerId), ["me"])
})

test("solo lobby has no party lineup", () => {
  assert.deepEqual(getPartyHeroLineup(null, "me", heroes, "Kaze"), [])
})
