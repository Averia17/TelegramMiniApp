import assert from "node:assert/strict"
import test from "node:test"

import {NetworkSimulation} from "../src/components/BattleGame/NetworkSimulation.js"

const movingSimulation = () => {
  const simulation = new NetworkSimulation()
  simulation.ingest({
    type: "state",
    ts: Date.now(),
    map: {width: 2000, height: 2000, walls: []},
    players: {
      local: {x: 100, y: 100, radius: 14, speed: 120, lives: 100, ack: 0},
    },
  })
  simulation.setLocalPlayerId("local")
  simulation.setInput(1, 0)
  return simulation
}

test("advancing a slow mobile frame preserves elapsed movement time", () => {
  const smooth = movingSimulation()
  const slow = movingSimulation()

  for (let frame = 0; frame < 6; frame += 1) smooth.advance(1 / 60)
  slow.advance(0.1)

  assert.ok(Math.abs(smooth.predicted.x - slow.predicted.x) < 0.001)
  assert.equal(slow.predicted.x, 112)
})

test("a long suspended frame is capped to avoid a huge prediction jump", () => {
  const simulation = movingSimulation()

  simulation.advance(2)

  assert.equal(simulation.predicted.x, 130)
})
