import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

const cssUrl = new URL("../src/components/BattleGame/BattleGame.css", import.meta.url)

test("battle lobby keeps the arena readable and touch controls unobstructed", async () => {
  const css = await readFile(cssUrl, "utf8")

  assert.match(css, /\.battle-lobby-hud\s*\{[\s\S]*?backdrop-filter:\s*none;/)
  assert.match(css, /\.battle-lobby-hud\s*\{[\s\S]*?pointer-events:\s*none;/)
  assert.match(css, /\.lobby-info\s*\{[\s\S]*?max-height:\s*calc\(100dvh\s*-\s*var\(--battle-safe-top\)\s*-\s*var\(--battle-safe-bottom\)\s*-\s*24px\);/)
  assert.match(css, /\.lobby-roster\s*,\s*\.lobby-hero-card\s*\{\s*display:\s*none;/)
})
