import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const css = fs.readFileSync(path.resolve("src/components/BattleGame/BattleGame.css"), "utf8")
const ui = fs.readFileSync(path.resolve("src/components/BattleGame/BattleGameUI.jsx"), "utf8")

test("ready ability animation keeps the mobile hit target stationary", () => {
  const keyframes = css.match(/@keyframes\s+super-ready[^\n]*/)?.[0] || ""
  assert.doesNotMatch(keyframes, /transform\s*:/, "ready animation must not move or resize a touch target")
})

test("mobile attack stick is anchored by its real radius", () => {
  assert.match(css, /--battle-touch-stick-radius:\s*calc\(var\(--battle-touch-stick-size\)\s*\/\s*2\)/)
  assert.match(css, /\.mobile-stick-fire\s*\{[^}]*left:\s*calc\(100%\s*-\s*var\(--battle-safe-right\)\s*-\s*var\(--battle-touch-stick-radius\)\)/s)
  assert.match(css, /\.mobile-stick-fire\s*\{[^}]*top:\s*calc\(100%\s*-\s*var\(--battle-safe-bottom\)\s*-\s*var\(--battle-touch-stick-radius\)\)/s)
})

test("active touch sticks keep their visual base anchored", () => {
  assert.doesNotMatch(ui, /left:\s*control\.start\.x/, "touch start must not move the whole attack stick")
  assert.doesNotMatch(ui, /top:\s*control\.start\.y/, "touch start must not move the whole attack stick")
})

test("ability decoration does not become a competing mobile hit target", () => {
  assert.match(css, /\.battle-ability__charge[^\n]*pointer-events\s*:\s*none/, "charge overlay must pass touch events to the button")
  assert.match(css, /\.battle-ability\s*>\s*b[^\n]*pointer-events\s*:\s*none/, "button label must pass touch events to the button")
})

test("ability buttons have a direct touch activation fallback for WebViews", () => {
  assert.match(ui, /onPointerUp:\s*activateTouch/, "ability buttons must handle touch pointer release directly")
  assert.match(ui, /onTouchEnd:\s*activateTouch/, "ability buttons must handle legacy WebView touch release")
})
