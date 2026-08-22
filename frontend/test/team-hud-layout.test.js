import {test} from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

const css = await readFile(new URL("../src/components/BattleGame/BattleGame.css", import.meta.url), "utf8")

test("team scoreboard exposes compact numeric stats instead of repeating long labels", async () => {
  const source = await readFile(new URL("../src/components/BattleGame/BattleGameUI.jsx", import.meta.url), "utf8")
  assert.match(source, /team-battle-hud__stats/)
  assert.match(source, /team-battle-hud__value/)
  assert.match(css, /\.battle-game--team \.team-battle-hud\s*\{[\s\S]*?border-radius:\s*999px/)
})

test("mobile team minimap gets the larger navigation slot", () => {
  assert.match(css, /\.battle-game--team \.battle-minimap\s*\{[\s\S]*?width:\s*clamp\(86px,\s*25vw,\s*112px\)/)
})

test("team objective HUD reserves space before the player card on compact screens", () => {
  assert.match(css, /--battle-team-objective-height:\s*63px/)
  assert.match(css, /--team-info-top:\s*calc\(var\(--team-objective-top\) \+ var\(--battle-team-objective-height\) \+ var\(--battle-team-stack-gap\)\)/)
  assert.match(css, /\.battle-game--team \.battle-player-card,[\s\S]*?\.battle-game--team \.battle-minimap[\s\S]*?top:\s*var\(--team-info-top\)/)
})
