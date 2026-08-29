import assert from "node:assert/strict"
import test from "node:test"
import {readFile} from "node:fs/promises"

import {getBattleRecoveryDecision, getBattleRecoveryTimeoutDecision, getBattleReconnectDelay} from "../src/components/BattleGame/battleRecovery.js"

test("recovery resumes the authoritative active room even with a stale room hint", () => {
  assert.deepEqual(
    getBattleRecoveryDecision({status: "active", roomId: "authoritative-room", startNewBattle: false}),
    {kind: "resume", roomId: "authoritative-room"},
  )
})

test("reload fallback presents a completed battle result instead of matchmaking", () => {
  assert.deepEqual(
    getBattleRecoveryDecision({
      status: "finished",
      startNewBattle: false,
      result: {won: true, duration: 12500, kills: 2},
    }),
    {kind: "result", result: {won: true, recovered: true, duration: 13, kills: 2}},
  )
})

test("explicit new battle starts matchmaking only when recovery found nothing", () => {
  assert.deepEqual(
    getBattleRecoveryDecision({status: "none", startNewBattle: true}),
    {kind: "new"},
  )
  assert.deepEqual(
    getBattleRecoveryDecision({status: "none", startNewBattle: false}),
    {kind: "menu"},
  )
})

test("explicit new battle ignores a stale active room and starts matchmaking", () => {
  assert.deepEqual(
    getBattleRecoveryDecision({status: "active", roomId: "old-room", startNewBattle: true}),
    {kind: "new"},
  )
})

test("recovery watchdog returns to the menu when the server never answers", () => {
  assert.deepEqual(getBattleRecoveryTimeoutDecision({startNewBattle: false}), {kind: "menu"})
})

test("recovery watchdog preserves an explicit new-battle intent", () => {
  assert.deepEqual(getBattleRecoveryTimeoutDecision({startNewBattle: true}), {kind: "new"})
})

test("reconnect delay backs off but stays within the user-visible retry budget", () => {
  assert.equal(getBattleReconnectDelay(0), 1000)
  assert.equal(getBattleReconnectDelay(1), 2000)
  assert.equal(getBattleReconnectDelay(2), 4000)
  assert.equal(getBattleReconnectDelay(8), 5000)
})

test("new-battle intent is consumed after the initial recovery decision", async () => {
  const source = await readFile(new URL("../src/components/BattleGame/BattleGame.jsx", import.meta.url), "utf8")
  assert.match(source, /const startNewBattleRef = useRef\(startNewBattle\)/)
  assert.match(source, /startNewBattle: startNewBattleRef\.current/)
  assert.match(source, /startNewBattleRef\.current = false/)
})
