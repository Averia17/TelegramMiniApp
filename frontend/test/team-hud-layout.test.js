import {test} from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

const css = await readFile(new URL("../src/components/BattleGame/BattleGame.css", import.meta.url), "utf8")

test("team scoreboard exposes kills and objective health without alive/death counters", async () => {
  const source = await readFile(new URL("../src/components/BattleGame/BattleGameUI.jsx", import.meta.url), "utf8")
  assert.match(source, /team-battle-hud__kills/)
  assert.doesNotMatch(source, /<small>УБИЙСТВА<\/small>/)
  assert.match(source, /team-battle-hud__objectives/)
  assert.doesNotMatch(source, /team-battle-hud__stats[^\n]*живы/)
  assert.doesNotMatch(source, /team-battle-hud__stats[^\n]*смерти/)
  assert.match(css, /\.battle-game--team \.team-battle-hud__objective i em\s*\{/)
})

test("team HUD is one compact information surface", () => {
  assert.match(css, /Team HUD: one compact information surface/)
  assert.match(css, /\.battle-game--team \.team-battle-hud\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 74px minmax\(0, 1fr\)/)
  assert.match(css, /\.battle-game--team \.team-battle-hud__member\s*\{[\s\S]*?flex:\s*1 1 0/)
  assert.match(css, /\.battle-game--team \.team-objective-hud\s*\{[^}]*display:\s*none/)
})

test("team HUD carries the match timer in its center instead of a second top pill", async () => {
  const source = await readFile(new URL("../src/components/BattleGame/BattleGameUI.jsx", import.meta.url), "utf8")
  const battle = await readFile(new URL("../src/components/BattleGame/BattleGame.jsx", import.meta.url), "utf8")
  assert.match(source, /team-battle-hud__timer/)
  assert.match(source, /<BattleMatchTimer game=\{game\}\/\>/)
  assert.match(battle, /\{!isTeamBattle && <BattleMatchTimer game=\{gameState\?\.game\}\/\>/)
  assert.match(css, /--battle-team-topbar-stack:\s*50px/)
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\)\s+74px\s+minmax\(0, 1fr\)/)
})

test("mobile team minimap gets the larger navigation slot", () => {
  assert.match(css, /\.battle-game--team \.battle-minimap\s*\{[\s\S]*?width:\s*clamp\(86px,\s*25vw,\s*112px\)/)
})

test("combined team HUD reserves one compact slot before the player card", () => {
  assert.match(css, /--battle-team-objective-height:\s*0px/)
  assert.match(css, /--team-objective-top:\s*var\(--team-score-top\)/)
  assert.match(css, /--team-info-top:\s*calc\(var\(--team-score-top\) \+ var\(--battle-team-score-height\) \+ var\(--battle-team-stack-gap\)\)/)
  assert.match(css, /\.battle-game--team \.battle-player-card,[\s\S]*?\.battle-game--team \.battle-minimap[\s\S]*?top:\s*var\(--team-info-top\)/)
})
