import test from "node:test"
import assert from "node:assert/strict"
import {normalizeHeroConfig} from "../src/components/BattleGame/heroesConfig.js"

test("server-only normalization does not invent a local hero kit", () => {
  const hero = normalizeHeroConfig({name: "Needle"}, {useFallbackKit: false})

  assert.equal(hero.kit.basic.id, undefined)
  assert.equal(hero.kit.super.id, undefined)
  assert.equal(hero.kit.gadget.id, undefined)
})
