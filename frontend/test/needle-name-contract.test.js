import assert from "node:assert/strict"
import test from "node:test"

import {HEROES_CONFIG} from "../src/components/BattleGame/heroesConfig.js"
import {HERO_KITS} from "../src/components/BattleGame/heroesConfig.js"
import {HERO_SKILLS} from "../src/components/BattleGame/heroSkills.js"
import {
  HERO_ASSETS,
  resolveHeroName,
} from "../src/components/BattleGame/rendering/assets/assetManifest.js"

test("Needle is the canonical hero name across frontend contracts", () => {
  assert.ok(HEROES_CONFIG.some(hero => hero.name === "Needle"))
  assert.ok(HERO_KITS.Needle)
  assert.ok(HERO_SKILLS.Needle)
  assert.ok(HERO_ASSETS.Needle)
  assert.equal(resolveHeroName("needle"), "Needle")
  assert.equal(resolveHeroName("shadow"), "Needle")
})

test("Needle fallback kit keeps the anti-heal spore contract", () => {
  assert.equal(
    HERO_KITS.Needle.basic.description,
    "Спора летит по прямой, снижает лечение цели на 50% на 2 секунды и раскрывается шестью фиксированными шипами.",
  )
})
