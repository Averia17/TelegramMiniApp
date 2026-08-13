import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const read = relativePath => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8")

test("document opts into phone safe areas and interactive viewport resizing", () => {
  const html = read("index.html")

  assert.match(html, /width=device-width/)
  assert.match(html, /viewport-fit=cover/)
  assert.match(html, /interactive-widget=resizes-content/)
})

test("application shell owns the full dynamic viewport without horizontal overflow", () => {
  const scss = read("src/scss/main.scss")

  assert.match(scss, /box-sizing:\s*border-box/)
  assert.match(scss, /#root/)
  assert.match(scss, /min-height:\s*100dvh/)
  assert.match(scss, /overflow-x:\s*hidden/)
})

test("lobby has compact phone and short-screen layouts", () => {
  const css = read("src/pages/landing-page.css")

  assert.match(css, /@media\s*\(max-width:\s*360px\)/)
  assert.match(css, /@media\s*\(max-height:\s*700px\)/)
  assert.match(css, /env\(safe-area-inset-left\)/)
  assert.match(css, /env\(safe-area-inset-right\)/)
})

test("hero roster rises above the lobby chrome while it is open", () => {
  const css = read("src/components/HeroSelect/HeroSelect.css")

  assert.match(css, /\.hero-select:has\(\.hero-roster\)\s*\{\s*z-index:\s*100/)
})

test("battle HUD keeps touch controls in safe areas on narrow and short phones", () => {
  const css = read("src/components/BattleGame/BattleGame.css")

  assert.match(css, /--battle-safe-left:\s*max\(/)
  assert.match(css, /--battle-safe-bottom:\s*max\(/)
  assert.match(css, /@media\s*\(max-width:\s*360px\)/)
  assert.match(css, /@media\s*\(max-height:\s*700px\)/)
  assert.match(css, /min-width:\s*48px/)
  assert.match(css, /touch-action:\s*none/)
})

test("secondary mobile surfaces constrain dense content", () => {
  const katty = read("src/pages/katty-lab.css")
  const loading = read("src/components/BattleLoading/BattleLoading.css")
  const battle = read("src/components/BattleGame/BattleGame.css")

  assert.match(katty, /max-width:\s*430px/)
  assert.match(katty, /orientation:\s*landscape/)
  assert.match(loading, /max-height:\s*calc\(100dvh\s*-\s*24px\)/)
  assert.match(battle, /\.battle-result-card\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*24px\)/s)
})
