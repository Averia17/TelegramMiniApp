import test from "node:test"
import assert from "node:assert/strict"

import {
  formatHeroShieldLabel,
  getHeroHealthFraction,
  getHeroShieldFraction,
  getHeroShieldValue,
} from "../src/components/BattleGame/rendering/heroes/healthBadge.js"

test("hero health stays separate from an active shield", () => {
  const mina = {lives: 650, maxLives: 650, shieldHp: 500}

  assert.equal(getHeroHealthFraction(mina), 1)
  assert.equal(getHeroShieldValue(mina), 500)
  assert.equal(getHeroShieldFraction(mina), 1)
  assert.equal(formatHeroShieldLabel(mina), "ЩИТ 500")
})

test("shield badge values are safe when no shield is present", () => {
  const hero = {lives: 320, maxLives: 650}

  assert.equal(getHeroShieldValue(hero), 0)
  assert.equal(getHeroShieldFraction(hero), 0)
  assert.equal(formatHeroShieldLabel(hero), "")
})
