import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"

import {getBattleLoadingProgress} from "../src/components/BattleGame/battleLoadingProgress.js"

test("battle loading progress never moves backwards during startup", () => {
  const startupStates = [
    {assetsReady: false, connected: false},
    {assetsReady: true, connected: false},
    {assetsReady: true, connected: true},
  ]

  const progress = startupStates.map(getBattleLoadingProgress)

  assert.deepEqual(progress, [42, 62, 82])
  assert.equal(progress.every((value, index) => index === 0 || value >= progress[index - 1]), true)
})

test("an asset loading error completes the progress indicator", () => {
  assert.equal(getBattleLoadingProgress({assetsReady: false, connected: false, assetLoadError: true}), 100)
})

test("battle loading uses a neutral matchmaking signal instead of the old brand logo", () => {
  const component = readFileSync(new URL("../src/components/BattleLoading/BattleLoading.jsx", import.meta.url), "utf8")
  const styles = readFileSync(new URL("../src/components/BattleLoading/BattleLoading.css", import.meta.url), "utf8")

  assert.doesNotMatch(component, /battle-loading__logo|STAR|BRAWL/)
  assert.match(component, /battle-loading__radar/)
  assert.match(component, /ПОИСК СОПЕРНИКА/)
  assert.match(styles, /\.battle-loading__radar\s*\{/)
})

test("battle loading lets the player cancel matchmaking", () => {
  const component = readFileSync(new URL("../src/components/BattleLoading/BattleLoading.jsx", import.meta.url), "utf8")
  const styles = readFileSync(new URL("../src/components/BattleLoading/BattleLoading.css", import.meta.url), "utf8")
  const battleGame = readFileSync(new URL("../src/components/BattleGame/BattleGame.jsx", import.meta.url), "utf8")
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")

  assert.match(component, /onCancel/)
  assert.match(component, /battle-loading__close/)
  assert.match(component, /aria-label="Отменить поиск соперника"/)
  assert.doesNotMatch(component, /ОТМЕНИТЬ ПОИСК/)
  assert.match(styles, /\.battle-loading__close\s*\{/)
  assert.doesNotMatch(styles, /\.battle-loading__cancel/)
  assert.match(battleGame, /<BattleLoading[\s\S]*onCancel=\{handleBackToMenu\}/)
  assert.match(app, /const AppLoading = \(\) => \{/)
  assert.match(app, /<BattleLoading[\s\S]*onCancel=\{\(\) => navigate\("\/", \{replace: true\}\)\}/)
  assert.match(app, /<Suspense fallback=\{<BattleLoading[\s\S]*onCancel=\{\(\) => navigate\("\/", \{replace: true\}\)\}/)
  assert.match(app, /<Suspense fallback=\{<AppLoading \/>\}/)
})
