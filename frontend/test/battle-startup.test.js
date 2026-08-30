import test from "node:test"
import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

const battleGameSource = await readFile(new URL("../src/components/BattleGame/BattleGame.jsx", import.meta.url), "utf8")
const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8")

test("BattleGame initializes effectivePlayerId before callbacks that capture it", () => {
  const effectivePlayerIdDeclaration = battleGameSource.indexOf("const effectivePlayerId =")
  const finishBattleDeclaration = battleGameSource.indexOf("const finishBattle = useCallback")

  assert.notEqual(effectivePlayerIdDeclaration, -1, "effectivePlayerId declaration must exist")
  assert.notEqual(finishBattleDeclaration, -1, "finishBattle callback must exist")
  assert.ok(
    effectivePlayerIdDeclaration < finishBattleDeclaration,
    "effectivePlayerId must be initialized before finishBattle captures it",
  )
})

test("BattleGame keeps the arena visible before opening the battle result", () => {
  assert.match(battleGameSource, /const DEATH_RESULT_DELAY_MS = 2000/)
  const deathReveal = battleGameSource.slice(
    battleGameSource.indexOf("const revealPresentedDeath"),
    battleGameSource.indexOf("const addMessage"),
  )
  assert.doesNotMatch(deathReveal, /setView\("dead"\)/)
  assert.match(deathReveal, /finishBattle\(\{\.\.\.result, \.\.\.pendingDeathInfoRef\.current\}\)/)
  assert.match(deathReveal, /\}, DEATH_RESULT_DELAY_MS\)/)
})

test("BattleGame shows compact death feedback during the result delay", () => {
  const deathReveal = battleGameSource.slice(
    battleGameSource.indexOf("const revealPresentedDeath"),
    battleGameSource.indexOf("const addMessage"),
  )

  assert.match(battleGameSource, /const \[deathPresentation, setDeathPresentation\] = useState\(false\)/)
  assert.match(deathReveal, /setDeathPresentation\(true\)/)
  assert.match(battleGameSource, /battle-player-card--dead/)
  assert.doesNotMatch(battleGameSource, /className="battle-death-impact"/)
})

test("BattleGame retries a dropped socket and exposes the recovered connection notice", () => {
  assert.match(battleGameSource, /getBattleReconnectDelay/)
  assert.match(battleGameSource, /setConnectionNotice/)
  assert.match(battleGameSource, /client\.connect\(\)/)
  assert.match(battleGameSource, /client\.recoverBattle\(roomId \|\| ""\)/)
})

test("Telegram BackButton routes outside battle and leaves an active battle cleanly", () => {
  assert.match(appSource, /setupTelegramBackButton/)
  assert.match(appSource, /location\.pathname\.startsWith\("\/battle"\)/)
  assert.match(battleGameSource, /setupTelegramBackButton\(window, handleBackToMenu\)/)
})

test("BattleGame reports battle outcomes through Telegram haptics", () => {
  assert.match(battleGameSource, /triggerTelegramHaptic\(\s*window,\s*"notification"/)
})

test("BattleGame exposes the referral share action on battle results", () => {
  assert.match(battleGameSource, /shareTelegramBattleResult/)
  assert.match(battleGameSource, /onShare=\{handleShareBattleResult\}/)
})

test("BattleResultCard renders a dedicated share action", async () => {
  const resultCardSource = await readFile(new URL("../src/components/BattleGame/BattleGameUI.jsx", import.meta.url), "utf8")
  assert.match(resultCardSource, /onShare/)
  assert.match(resultCardSource, /battle-result-share-button/)
})

test("BattleGame pauses prediction/rendering while Telegram Mini App is inactive", () => {
  assert.match(battleGameSource, /setupTelegramActivity/)
  assert.match(battleGameSource, /inputRef\.current\?\.setActive\(active\)/)
  assert.match(battleGameSource, /if \(!telegramActiveRef\.current\)/)
  assert.match(battleGameSource, /previousFrameAt = performance\.now\(\)/)
})
