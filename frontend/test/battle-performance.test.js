import test from "node:test"
import assert from "node:assert/strict"
import {
  getBattlePerformanceSnapshot,
  recordBattleMetric,
  resetBattlePerformance,
} from "../src/components/BattleGame/rendering/shared/performance.js"
import {GameClient} from "../src/components/BattleGame/GameClient.js"

test("battle performance metrics keep bounded samples and expose tail percentiles", () => {
  resetBattlePerformance()
  for (let value = 1; value <= 260; value += 1) recordBattleMetric("frame", value)

  const snapshot = getBattlePerformanceSnapshot()
  assert.equal(snapshot.frame.count, 260)
  assert.equal(snapshot.frame.samples, 240)
  assert.ok(snapshot.frame.p95 >= 240)
  assert.ok(snapshot.frame.p99 >= snapshot.frame.p95)
})

test("battle performance metrics retain the latest bounded metadata", () => {
  resetBattlePerformance()
  recordBattleMetric("snapshot", 8.5, {phase: "hunt", players: 4})

  assert.deepEqual(getBattlePerformanceSnapshot().snapshot.last, {
    phase: "hunt",
    players: 4,
  })
})

test("game snapshots publish bounded transport metrics", () => {
  resetBattlePerformance()
  const client = new GameClient("ws://example", "token", () => {})
  const state = {type: "state", ts: Date.now(), game: {state: "game"}, players: {}, map: {}}

  client.handleMessage(state)
  client.handleMessage({...state, ts: state.ts + 16})

  const snapshot = getBattlePerformanceSnapshot()
  assert.equal(snapshot["network.snapshot_bytes"].count, 2)
  assert.equal(snapshot["network.snapshot_interval"].count, 1)
  assert.equal(snapshot["network.snapshot_age"].last.state, "game")
})

test("stale game snapshots do not reach the state consumer", () => {
  let updates = 0
  const client = new GameClient("ws://example", "token", () => { updates += 1 })
  const state = {type: "state", ts: 2_000, game: {state: "game"}, players: {}, map: {}}

  client.handleMessage(state)
  client.handleMessage({...state, ts: 1_999})
  client.handleMessage({...state, ts: 2_000})

  assert.equal(updates, 1)
})

test("clock sync prefers the lowest-RTT recent sample", () => {
  const client = new GameClient("ws://example", "token", () => {})
  const now = Date.now()
  client.clockSyncRequests.set(now, {sentAt: performance.now() - 8})
  client.handleMessage({
    type: "clock_sync",
    params: {clientTs: now, serverTs: now - 50},
  })
  assert.ok(Math.abs(client.clockOffset - 50) < 10)

  const delayed = now + 2000
  client.clockSyncRequests.set(delayed, {sentAt: performance.now() - 400})
  client.handleMessage({
    type: "clock_sync",
    params: {clientTs: delayed, serverTs: delayed - 200},
  })
  assert.ok(Math.abs(client.clockOffset - 50) < 10)
})
