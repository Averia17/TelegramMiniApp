import assert from "node:assert/strict"
import test from "node:test"

import {getBattleHeroKey, loadBattleHero, saveBattleHero} from "../src/utils/battlePreferences.js"

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
