import assert from "node:assert/strict"
import test from "node:test"
import {readFile} from "node:fs/promises"

import {shouldSpendBattleEnergy} from "../src/components/BattleGame/battleEnergy.js"

const landingPageSource = await readFile(new URL("../src/pages/landing-page.jsx", import.meta.url), "utf8")
const battleGameSource = await readFile(new URL("../src/components/BattleGame/BattleGame.jsx", import.meta.url), "utf8")

test("battle energy is charged only when the server starts the battle", () => {
  assert.equal(shouldSpendBattleEnergy("room_joined", {startNewBattle: true}), false)
  assert.equal(shouldSpendBattleEnergy("start", {startNewBattle: true}), true)
  assert.equal(shouldSpendBattleEnergy("start", {alreadySpent: true, startNewBattle: true}), false)
  assert.equal(shouldSpendBattleEnergy("start", {startNewBattle: false}), false)
})

test("landing page does not charge energy before matchmaking succeeds", () => {
  assert.doesNotMatch(landingPageSource, /axios\.post\(\s*`\$\{API_URL\}\/economy\/me\/battle`/)
  assert.match(battleGameSource, /shouldSpendBattleEnergy\(/)
})
