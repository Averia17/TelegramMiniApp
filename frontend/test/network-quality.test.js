import assert from "node:assert/strict"
import test from "node:test"

import {getNetworkQuality} from "../src/components/BattleGame/networkQuality.js"

test("network quality stays quiet on a healthy snapshot stream", () => {
  const quality = getNetworkQuality({
    connected: true,
    lastStateReceivedAt: 10_000,
    stateHz: 20,
    clockSyncSamples: [{roundTripMs: 42}],
    now: 10_120,
  })

  assert.equal(quality.state, "good")
  assert.equal(quality.detail, "")
  assert.equal(quality.rttMs, 42)
})

test("network quality warns before a stale snapshot becomes a disconnect", () => {
  const quality = getNetworkQuality({
    connected: true,
    lastStateReceivedAt: 10_000,
    stateHz: 12,
    clockSyncSamples: [{roundTripMs: 190}],
    now: 10_500,
  })

  assert.equal(quality.state, "warning")
  assert.equal(quality.ageMs, 500)
})

test("network quality reports a severe degradation from stale updates", () => {
  const quality = getNetworkQuality({
    connected: true,
    lastStateReceivedAt: 10_000,
    stateHz: 4,
    clockSyncSamples: [{roundTripMs: 360}],
    now: 10_950,
  })

  assert.equal(quality.state, "poor")
  assert.match(quality.detail, /попадания/)
})

test("network quality distinguishes a closed socket from degraded gameplay", () => {
  const quality = getNetworkQuality({connected: false})

  assert.equal(quality.state, "offline")
  assert.equal(quality.label, "СВЯЗЬ ПОТЕРЯНА")
})
