import test from "node:test"
import assert from "node:assert/strict"
import {MIN_PLAYER_SEARCH_LENGTH, normalizePlayerSearchInput, shouldSearchPlayers} from "../src/components/Party/partySearch.js"

test("player search accepts a nickname or an id", () => {
  assert.equal(MIN_PLAYER_SEARCH_LENGTH, 2)
  assert.equal(shouldSearchPlayers("A"), false)
  assert.equal(shouldSearchPlayers("Fox"), true)
  assert.equal(shouldSearchPlayers("123"), true)
})

test("player search preserves nickname characters and trims whitespace", () => {
  assert.equal(normalizePlayerSearchInput("  Arena Fox  "), "Arena Fox")
  assert.equal(normalizePlayerSearchInput(" 12a-34 "), "12a-34")
})
