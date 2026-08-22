import test from "node:test"
import assert from "node:assert/strict"
import {
  BATTLE_FONT_SIZES,
  getBattleHealthFontSize,
  getBattleViewportFontSize,
} from "../src/components/BattleGame/battleTypography.js"

test("battle health labels share one world-space height across renderers", () => {
  assert.equal(getBattleHealthFontSize({canvasHeight: 80, spriteHeight: 1.45}), 14)
  assert.equal(getBattleHealthFontSize({canvasHeight: 80, spriteHeight: .25, parentScale: 2.2}), 38)
  assert.equal(getBattleHealthFontSize({canvasHeight: 36, spriteHeight: .25, parentScale: 1.15}), 33)
  assert.equal(getBattleHealthFontSize({canvasHeight: 80, spriteHeight: .62, parentScale: 1.75}), 19)
})

test("hero names stay slightly larger while compact view keeps them readable", () => {
  assert.equal(BATTLE_FONT_SIZES.heroName, 21)
  assert.equal(BATTLE_FONT_SIZES.heroNameCompact, 20)
  assert.equal(getBattleViewportFontSize(BATTLE_FONT_SIZES.heroName, BATTLE_FONT_SIZES.heroNameCompact), 21)
})
