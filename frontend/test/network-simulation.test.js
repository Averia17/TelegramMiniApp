import assert from "node:assert/strict"
import test from "node:test"

import {createCollisionIndex, NetworkSimulation, queryCollisionWalls} from "../src/components/BattleGame/NetworkSimulation.js"
import {getBattlePerformanceSnapshot, resetBattlePerformance} from "../src/components/BattleGame/rendering/shared/performance.js"

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

test("local prediction uses the authoritative effective movement speed", () => {
  const simulation = movingSimulation()
  simulation.latestState.players.local.movementSpeed = 23

  simulation.advance(0.1)

  assert.ok(Math.abs(simulation.predicted.x - 102.3) < 0.0001)
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
      local: {x: 90, y: 80, radius: 10, speed: 60, lives: 100, ack: 0},
    },
  })
  simulation.setLocalPlayerId("local")
  simulation.setInput(1, 0)

  simulation.advance(0.5)

  assert.equal(simulation.predicted.x, 90)
  assert.equal(simulation.predicted.y, 80)
})

test("prediction reuses the filtered collision wall list until the map revision changes", () => {
  const walls = [
    {minX: 100, minY: 0, maxX: 140, maxY: 200, type: "wall"},
    {minX: 200, minY: 0, maxX: 240, maxY: 200, type: "bush"},
  ]
  const simulation = new NetworkSimulation()
  const state = {
    type: "state",
    ts: 1000,
    map: {width: 500, height: 500, walls},
    players: {local: {x: 90, y: 80, radius: 10, speed: 60, lives: 100, ack: 0}},
  }

  simulation.ingest(state, 0)
  simulation.setLocalPlayerId("local")
  simulation.advance(1 / 60)

  assert.equal(simulation.collisionWallsSource, walls)
  assert.deepEqual(simulation.collisionWalls, [walls[0]])

  const nextWalls = [...walls, {minX: 300, minY: 0, maxX: 340, maxY: 200, type: "wall"}]
  simulation.ingest({...state, ts: 1016, map: {...state.map, walls: nextWalls}}, 0)
  assert.equal(simulation.collisionWallsSource, nextWalls)
  assert.deepEqual(simulation.collisionWalls, [nextWalls[0], nextWalls[2]])
})

test("collision broad-phase returns nearby blocking walls in map order", () => {
  const near = {minX: 100, minY: 0, maxX: 140, maxY: 200, type: "wall"}
  const concealment = {minX: 200, minY: 0, maxX: 240, maxY: 200, type: "bush"}
  const far = {minX: 800, minY: 0, maxX: 840, maxY: 200, type: "wall"}
  const index = createCollisionIndex([near, concealment, far])

  assert.deepEqual(queryCollisionWalls(index, {x: 90, y: 80}, 10), [near])
})

test("collision broad-phase can reuse a caller-owned result buffer", () => {
  const near = {minX: 100, minY: 0, maxX: 140, maxY: 200, type: "wall"}
  const index = createCollisionIndex([near])
  const result = [near]

  const queried = queryCollisionWalls(index, {x: 90, y: 80}, 10, result)

  assert.strictEqual(queried, result)
  assert.deepEqual(result, [near])
})

test("prediction does not grow the unused reconciliation history on every frame", () => {
  const simulation = new NetworkSimulation({interpolationDelay: 0})
  simulation.setLocalPlayerId("local")
  simulation.ingest({
    type: "state",
    ts: 1000,
    game: {state: "game"},
    map: {width: 1024, height: 768, walls: []},
    players: {
      local: {x: 100, y: 100, radius: 14, lives: 100, movementSpeed: 120, moveX: 1, moveY: 0},
    },
    monsters: {},
    bullets: [],
  }, 0, 1000)
  const history = simulation.positionHistory

  simulation.setInput(1, 0, 1000)
  simulation.advance(1 / 60)

  assert.strictEqual(simulation.positionHistory, history)
  assert.equal(simulation.positionHistory.length, 0)
})

test("large alive-player corrections are eased instead of snapped", () => {
  const simulation = new NetworkSimulation({interpolationDelay: 0})
  const first = {
    type: "state",
    ts: 1000,
    map: {width: 1000, height: 1000, walls: []},
    players: {local: {x: 300, y: 100, radius: 14, speed: 0, lives: 100, ack: 0}},
  }
  simulation.ingest({...first, players: {local: {...first.players.local, x: 100}}}, 0)
  simulation.setLocalPlayerId("local")
  simulation.ingest({...first, ts: 1100}, 0)

  assert.equal(simulation.predicted.x, 300)
  assert.equal(simulation.getDisplayState(1100).players.local.x, 100)

  simulation.advance(1 / 60)
  const displayed = simulation.getDisplayState(1116)
  assert.ok(displayed.players.local.x > 100)
  assert.ok(displayed.players.local.x < 300)
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
      local: {x: 90, y: 80, radius: 10, speed: 60, lives: 100, ack: 0},
    },
  })
  simulation.setLocalPlayerId("local")
  simulation.setInput(1, 0)

  simulation.advance(0.5)

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

test("display sampling publishes presentation buffer telemetry", () => {
  resetBattlePerformance()
  const simulation = new NetworkSimulation({interpolationDelay: 33})
  simulation.ingest({
    type: "state",
    ts: 1000,
    players: {enemy: {x: 0, y: 0, lives: 100}},
    monsters: {},
    bullets: [],
  }, 0)
  simulation.ingest({
    type: "state",
    ts: 1033,
    players: {enemy: {x: 33, y: 0, lives: 100}},
    monsters: {},
    bullets: [],
  }, 0)

  simulation.getDisplayState(1040)
  const metrics = getBattlePerformanceSnapshot()

  assert.equal(metrics["network.presentation_buffer_ms"].count, 1)
  assert.equal(metrics["network.presentation_buffer_ms"].last.snapshotsBuffered, 2)
  assert.equal(metrics["network.snapshot_buffer_size"].last, null)
  resetBattlePerformance()
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

test("reconciliation replays unacknowledged movement and keeps the rendered frame continuous", () => {
  const simulation = new NetworkSimulation({interpolationDelay: 0})
  const base = {
    type: "state",
    map: {width: 2000, height: 2000, walls: []},
    monsters: {},
    bullets: [],
  }
  simulation.ingest({...base, ts: 1000, players: {
    local: {x: 100, y: 100, radius: 14, speed: 10, movementSpeed: 10, lives: 100, ack: 0, moveX: 0, moveY: 0},
  }}, 0)
  simulation.setLocalPlayerId("local")
  simulation.setInput(1, 0, 1005)
  simulation.advance(0.1)
  const predictedBeforeSnapshot = simulation.predicted.x

  simulation.ingest({...base, ts: 1050, players: {
    local: {x: 100, y: 100, radius: 14, speed: 10, movementSpeed: 10, lives: 100, ack: 0, moveX: 0, moveY: 0},
  }}, 0)

  assert.equal(simulation.pendingInputs.length, 1)
  assert.ok(Math.abs(simulation.predicted.x - 100.5) < 0.001)
  const displayed = simulation.getDisplayState(1100)
  assert.ok(Math.abs(displayed.players.local.x - predictedBeforeSnapshot) < 0.001)

  simulation.advance(0.2)
  const settled = simulation.getDisplayState(1300)
  assert.ok(Math.abs(simulation.correction.x) < 0.5)
  assert.ok(Math.abs(settled.players.local.x - simulation.predicted.x) < 0.5)
})

test("out-of-order snapshots cannot rewind the interpolation buffer", () => {
  const simulation = new NetworkSimulation({interpolationDelay: 0})
  const state = ts => ({
    type: "state",
    ts,
    players: {local: {x: ts / 10, y: 0, lives: 100, maxLives: 100, ack: 0}},
    monsters: {},
    bullets: [],
  })

  simulation.ingest(state(1000), 0)
  simulation.ingest(state(1100), 0)
  simulation.ingest(state(1050), 0)

  assert.deepEqual(simulation.snapshots.map(snapshot => snapshot.ts), [1000, 1100])
})

test("adaptive interpolation reduces stable snapshot latency without removing the buffer", () => {
  const simulation = new NetworkSimulation()
  for (let index = 0; index < 30; index += 1) {
    const ts = 1000 + index * 17
    simulation.ingest({
      type: "state",
      ts,
      players: {local: {x: 0, y: 0, lives: 100, ack: 0}},
      monsters: {},
      bullets: [],
    }, 0)
  }

  assert.ok(simulation.interpolationDelay >= 33)
  assert.ok(simulation.interpolationDelay < 40)
})

test("adaptive interpolation reuses quantile sort buffers between snapshots", () => {
  const simulation = new NetworkSimulation()
  const state = index => ({
    type: "state",
    ts: 1000 + index * 17,
    players: {},
    monsters: {},
    bullets: [],
  })

  assert.ok(Array.isArray(simulation.snapshotIntervalSortBuffer))
  assert.ok(Array.isArray(simulation.snapshotArrivalIntervalSortBuffer))
  const serverBuffer = simulation.snapshotIntervalSortBuffer
  const arrivalBuffer = simulation.snapshotArrivalIntervalSortBuffer
  for (let index = 0; index < 30; index += 1) simulation.ingest(state(index), 0, 1000 + index * 17)

  assert.strictEqual(simulation.snapshotIntervalSortBuffer, serverBuffer)
  assert.strictEqual(simulation.snapshotArrivalIntervalSortBuffer, arrivalBuffer)
})

test("explicit interpolation delay remains fixed for deterministic consumers", () => {
  const simulation = new NetworkSimulation({interpolationDelay: 100})
  for (const ts of [1000, 1033, 1066, 1099]) {
    simulation.ingest({
      type: "state",
      ts,
      players: {local: {x: 0, y: 0, lives: 100, ack: 0}},
      monsters: {},
      bullets: [],
    }, 0)
  }

  assert.equal(simulation.interpolationDelay, 100)
})

test("display interpolation extrapolates briefly during a snapshot underrun", () => {
  const simulation = new NetworkSimulation({interpolationDelay: 0})
  simulation.ingest({
    type: "state",
    ts: 1000,
    players: {enemy: {x: 0, y: 0, rotation: 0, lives: 100}},
    monsters: {},
    bullets: [],
  }, 0)
  simulation.ingest({
    type: "state",
    ts: 1016,
    players: {enemy: {x: 16, y: 0, rotation: 0, lives: 100}},
    monsters: {},
    bullets: [],
  }, 0)

  const display = simulation.getDisplayState(1060)

  assert.ok(display.players.enemy.x > 16)
  assert.ok(display.players.enemy.x < 100)
})

test("adaptive interpolation follows delivery jitter instead of only server tick spacing", () => {
  const simulation = new NetworkSimulation()
  const arrivals = [1000, 1016, 1056, 1116]
  arrivals.forEach((receivedAt, index) => {
    simulation.ingest({
      type: "state",
      ts: 1000 + index * 16,
      players: {},
      monsters: {},
      bullets: [],
    }, 0, receivedAt)
  })

  assert.ok(simulation.interpolationDelay > 66)
})
