import test from "node:test"
import assert from "node:assert/strict"

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
