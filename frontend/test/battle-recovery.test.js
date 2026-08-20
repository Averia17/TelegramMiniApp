import assert from "node:assert/strict"
import test from "node:test"

import {getBattleRecoveryDecision} from "../src/components/BattleGame/battleRecovery.js"

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
