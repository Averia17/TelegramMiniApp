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
      local: {x: 100, y: 100, radius: 14, speed: 6, lives: 100, ack: 0},
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
  assert.equal(slow.predicted.x, 100.6)
})

test("a long suspended frame is capped to avoid a huge prediction jump", () => {
  const simulation = movingSimulation()

  simulation.advance(2)

  assert.ok(Math.abs(simulation.predicted.x - 101.5) < 0.001)
})

test("local prediction keeps moving through a 180-degree direction change", () => {
  const simulation = movingSimulation()
  simulation.advance(0.1)
  const beforeTurn = simulation.predicted.x

  simulation.setInput(-1, 0)
  simulation.advance(0.1)

  assert.ok(simulation.predicted.x < beforeTurn)
})

test("diagonal direction changes never insert a stop frame", () => {
  const simulation = movingSimulation()
  simulation.advance(0.05)
  const beforeTurn = {...simulation.predicted}

  simulation.setInput(-1, -1)
  simulation.advance(1 / 60)

  assert.ok(simulation.predicted.x < beforeTurn.x)
  assert.ok(simulation.predicted.y < beforeTurn.y)
})

test("network correction cannot push the predicted player through a blocking wall", () => {
  const simulation = new NetworkSimulation()
  simulation.ingest({
    type: "state",
    ts: Date.now(),
    map: {
      width: 500,
      height: 500,
      walls: [{minX: 100, minY: 0, maxX: 140, maxY: 200, type: "wall"}],
    },
    players: {
      local: {x: 70, y: 80, radius: 10, speed: 6, lives: 100, ack: 0},
    },
  })
  simulation.setLocalPlayerId("local")
  simulation.correction = {x: 100, y: 0}

  simulation.advance(0.05)

  assert.equal(simulation.predicted.x, 90)
  assert.equal(simulation.predicted.y, 80)
})

test("local prediction allows movement through moon mist concealment", () => {
  const simulation = new NetworkSimulation()
  simulation.ingest({
    type: "state",
    ts: Date.now(),
    map: {
      width: 500,
      height: 500,
      walls: [{minX: 100, minY: 0, maxX: 140, maxY: 200, type: "moon_mist"}],
    },
    players: {
      local: {x: 70, y: 80, radius: 10, speed: 6, lives: 100, ack: 0},
    },
  })
  simulation.setLocalPlayerId("local")
  simulation.correction = {x: 100, y: 0}

  simulation.advance(0.05)

  assert.ok(simulation.predicted.x > 100)
  assert.equal(simulation.predicted.y, 80)
})

test("display interpolation reuses entity objects between render frames", () => {
  const simulation = new NetworkSimulation({interpolationDelay: 0})
  simulation.ingest({
    type: "state",
    ts: 1000,
    players: {local: {x: 0, y: 0, lives: 100, maxLives: 100}},
    monsters: {},
    bullets: [],
  })
  simulation.ingest({
    type: "state",
    ts: 1100,
    players: {local: {x: 100, y: 0, lives: 100, maxLives: 100}},
    monsters: {},
    bullets: [],
  })
  simulation.clockOffset = 0

  const first = simulation.getDisplayState(1050)
  const entity = first.players.local
  const second = simulation.getDisplayState(1060)

  assert.strictEqual(second.players.local, entity)
  assert.equal(second.players.local.x, 60)

  const uiSnapshot = simulation.getDisplayState(1070, {copyEntities: true})
  const renderSnapshot = simulation.getDisplayState(1080)
  assert.notStrictEqual(uiSnapshot.players.local, renderSnapshot.players.local)
})

test("compact player snapshots clear status effects omitted after expiration", () => {
  const simulation = new NetworkSimulation({interpolationDelay: 0})
  simulation.ingest({
    type: "state",
    ts: 1000,
    players: {local: {x: 0, y: 0, lives: 100, maxLives: 100, shield: 1}},
    monsters: {},
    bullets: [],
  })
  simulation.clockOffset = 0
  simulation.getDisplayState(1000)
  simulation.ingest({
    type: "state",
    ts: 1100,
    players: {local: {x: 100, y: 0, lives: 100, maxLives: 100}},
    monsters: {},
    bullets: [],
  })
  simulation.clockOffset = 0

  const state = simulation.getDisplayState(1100)

  assert.equal(state.players.local.shield, undefined)
})
