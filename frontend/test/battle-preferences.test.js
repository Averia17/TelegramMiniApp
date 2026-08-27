import assert from "node:assert/strict"
import test from "node:test"

import {
  getBattleHeroKey,
  getBattleRoute,
  getBattleModeKey,
  getBattleMapKey,
  loadBattleHero,
  loadBattleMap,
  loadBattleMode,
  saveBattleHero,
  saveBattleMap,
  saveBattleMode,
} from "../src/utils/battlePreferences.js"

const createStorage = () => {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

test("battle hero preference is scoped to the authenticated player", () => {
  assert.equal(getBattleHeroKey("42"), "battle_hero:42")
  assert.equal(getBattleHeroKey("43"), "battle_hero:43")
})

test("battle hero preference survives a page reload without putting hero in the URL", () => {
  globalThis.window = {localStorage: createStorage()}

  saveBattleHero("42", "Mandy")

  assert.equal(loadBattleHero("42"), "Mandy")
  assert.equal(loadBattleHero("43"), "")
})

test("battle mode preference survives a page reload per authenticated player", () => {
  globalThis.window = {localStorage: createStorage()}

  assert.equal(getBattleModeKey("42"), "battle_mode:42")
  assert.equal(loadBattleMode("42"), "solo")

  saveBattleMode("42", "team")

  assert.equal(loadBattleMode("42"), "team")
  assert.equal(loadBattleMode("43"), "solo")
})

test("battle mode preference ignores unsupported values", () => {
  const storage = createStorage()
  globalThis.window = {localStorage: storage}

  storage.setItem("battle_mode:42", "invalid")

  assert.equal(loadBattleMode("42"), "solo")
  saveBattleMode("42", "invalid")
  assert.equal(loadBattleMode("42"), "solo")
})

test("team mode keeps a team battle route after leaving a party", () => {
  assert.equal(getBattleRoute("team"), "/battle?mode=team&map=team-battle-northern")
  assert.equal(getBattleRoute("team", "party-42", "team-battle"), "/battle?mode=team&party=party-42&map=team-battle")
})

test("team map preference keeps both canonical maps selectable per player", () => {
  globalThis.window = {localStorage: createStorage()}

  assert.equal(getBattleMapKey("42"), "battle_map:42")
  assert.equal(loadBattleMap("42"), "team-battle-northern")
  saveBattleMap("42", "team-battle")
  assert.equal(loadBattleMap("42"), "team-battle")
  saveBattleMap("42", "unsupported-map")
  assert.equal(loadBattleMap("42"), "team-battle-northern")
})
