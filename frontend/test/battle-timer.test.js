import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import {formatBattleTime} from "../src/components/BattleGame/battleTimer.js"

test("battle timer formats remaining match time as minutes and seconds", () => {
  assert.equal(formatBattleTime(Date.UTC(2026, 0, 1, 0, 2, 3), Date.UTC(2026, 0, 1, 0, 0, 0)), "2:03")
})

test("the match timer layer stays above the solo phase HUD", async () => {
  const css = await readFile(new URL("../src/components/BattleGame/BattleGame.css", import.meta.url), "utf8")
  const topbarZIndex = Number(css.match(/\.battle-topbar \{[\s\S]*?z-index:\s*(\d+)/)?.[1])
  const phaseHudZIndex = Number(css.match(/\.island-phase-hud \{[\s\S]*?z-index:\s*(\d+)/)?.[1])
  assert.ok(topbarZIndex > phaseHudZIndex)
})

test("the match timer stays viewport-centered and the phase card starts below the topbar", async () => {
  const css = await readFile(new URL("../src/components/BattleGame/BattleGame.css", import.meta.url), "utf8")

  assert.match(css, /--battle-topbar-height:\s*48px/)
  assert.match(css, /--battle-phase-gap:\s*16px/)
  assert.match(css, /\.battle-topbar__center\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?left:\s*50%;/)
  assert.match(css, /\.island-phase-hud\s*\{[\s\S]*?top:\s*calc\(var\(--battle-safe-top\) \+ var\(--battle-topbar-height\) \+ var\(--battle-phase-gap\)\)/)
})
