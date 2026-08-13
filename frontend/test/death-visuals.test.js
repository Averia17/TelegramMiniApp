import assert from "node:assert/strict"
import test from "node:test"

import {
  getDeathFade,
  getDeathShakeAmount,
  getDeathPulseState,
  getHeroDeathPalette,
} from "../src/components/BattleGame/rendering/heroes/deathVisuals.js"

test("death effects use a recognizable palette for every playable hero", () => {
  const heroes = [
    "Needle", "Mandy", "Fairy Mina", "Brock Zeus",
    "Kaze", "Wukong Mico", "Persephone Lumi", "Katty",
  ]

  for (const hero of heroes) {
    const palette = getHeroDeathPalette(hero)
    assert.equal(palette.length, 3)
    assert.ok(palette.every(color => Number.isInteger(color) && color > 0))
  }
  assert.notDeepEqual(getHeroDeathPalette("Needle"), getHeroDeathPalette("Kaze"))
})

test("death pulse expands quickly and fades without hiding the authored pose", () => {
  const start = getDeathPulseState(0)
  const impact = getDeathPulseState(.18)
  const end = getDeathPulseState(.72)

  assert.equal(start.ringScale, .15)
  assert.ok(impact.ringScale > start.ringScale)
  assert.ok(impact.flashOpacity > 0)
  assert.equal(end.ringOpacity, 0)
  assert.equal(end.flashOpacity, 0)
})

test("hero model stays opaque through the performance and dissolves at the end", () => {
  assert.equal(getDeathFade(0), 1)
  assert.equal(getDeathFade(.75), 1)
  assert.ok(getDeathFade(.9) < 1)
  assert.equal(getDeathFade(1), 0)
})

test("death shake is emitted only on the lethal transition and scales by perspective", () => {
  assert.equal(getDeathShakeAmount({lives: 120}, {lives: 0}, true), .2)
  assert.equal(getDeathShakeAmount({lives: 120}, {lives: 0}, false), .11)
  assert.equal(getDeathShakeAmount({lives: 0}, {lives: 0}, false), 0)
  assert.equal(getDeathShakeAmount({lives: 120}, {lives: 20}, false), 0)
})
