import test from "node:test"
import assert from "node:assert/strict"
import {formatEnergyCountdown, getEnergyRemainingSeconds} from "../src/utils/energyTimer.js"

test("energy countdown follows the server snapshot without trusting device clock", () => {
  const snapshot = {
    energy: 42,
    max_energy: 100,
    next_energy_in: 300,
    server_time: "2026-07-29T12:00:00.000Z",
    _syncedAt: 10_000,
  }

  assert.equal(getEnergyRemainingSeconds(snapshot, 10_000), 300)
  assert.equal(getEnergyRemainingSeconds(snapshot, 70_001), 240)
})

test("full energy does not show a misleading regeneration countdown", () => {
  assert.equal(getEnergyRemainingSeconds({energy: 100, max_energy: 100, next_energy_in: 300}, 10_000), 0)
  assert.equal(formatEnergyCountdown(0), "полная")
})

test("countdown format keeps minutes and seconds readable", () => {
  assert.equal(formatEnergyCountdown(299), "04:59")
  assert.equal(formatEnergyCountdown(3661), "61:01")
})
