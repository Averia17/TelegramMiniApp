import test from "node:test"
import assert from "node:assert/strict"
import {
  DamagePrediction,
  lineHitsTarget,
  segmentHitsCircle,
} from "../src/components/BattleGame/DamagePrediction.js"
import {NetworkSimulation} from "../src/components/BattleGame/NetworkSimulation.js"

const state = (lives = 100) => ({
  type: "state",
  players: {
    me: {playerId: "me", x: 0, y: 0, lives: 100, maxLives: 100},
    enemy: {playerId: "enemy", x: 100, y: 0, lives, maxLives: 100},
  },
  monsters: {},
})

test("segment hit uses the target radius and handles a stationary segment", () => {
  assert.equal(segmentHitsCircle({x: 0, y: 0}, {x: 100, y: 0}, {x: 50, y: 9}, 10), true)
  assert.equal(segmentHitsCircle({x: 0, y: 0}, {x: 100, y: 0}, {x: 50, y: 11}, 10), false)
  assert.equal(segmentHitsCircle({x: 40, y: 40}, {x: 40, y: 40}, {x: 45, y: 44}, 7), true)
})

test("line prediction only selects targets inside the attack range", () => {
  const origin = {x: 0, y: 0}
  assert.equal(lineHitsTarget(origin, 0, 100, {x: 95, y: 0, radius: 10}), true)
  assert.equal(lineHitsTarget(origin, 0, 100, {x: 103, y: 0, radius: 2}), false)
  assert.equal(lineHitsTarget(origin, Math.PI / 2, 100, {x: 50, y: 0, radius: 5}), false)
})

test("speculative damage never hides an alive target and is confirmed by server HP", () => {
  const prediction = new DamagePrediction({ttlMs: 300, rollbackMs: 100})
  prediction.ingest(state(), 1000)
  prediction.predictDamage({targetType: "players", targetId: "enemy", damage: 120, now: 1000})

  assert.equal(prediction.applyToState(state(), 1000).players.enemy.lives, 1)

  prediction.ingest(state(40), 1050)
  assert.equal(prediction.applyToState(state(40), 1200).players.enemy.lives, 40)
})

test("a missed prediction eases back to authoritative HP instead of snapping", () => {
  const prediction = new DamagePrediction({ttlMs: 100, rollbackMs: 100})
  prediction.ingest(state(), 1000)
  prediction.predictDamage({targetType: "players", targetId: "enemy", damage: 30, now: 1000})
  assert.equal(prediction.applyToState(state(), 1000).players.enemy.lives, 70)

  const halfway = prediction.applyToState(state(), 1150).players.enemy.lives
  assert.ok(halfway > 70 && halfway < 100)
  assert.equal(prediction.applyToState(state(), 1300).players.enemy.lives, 100)
})

test("presentation eases confirmed nonlethal damage while keeping lethal HP authoritative", () => {
  const prediction = new DamagePrediction({rollbackMs: 120})
  prediction.ingest(state(), 1000)
  prediction.applyToState(state(), 1000, {smoothAuthoritativeDamage: true})
  prediction.ingest(state(40), 1050)

  const halfway = prediction.applyToState(state(40), 1110, {smoothAuthoritativeDamage: true})
    .players.enemy.lives
  assert.ok(40 < halfway && halfway < 100)
  assert.equal(
    prediction.applyToState(state(40), 1170, {smoothAuthoritativeDamage: true}).players.enemy.lives,
    40,
  )

  prediction.ingest(state(0), 1200)
  assert.equal(
    prediction.applyToState(state(0), 1200, {smoothAuthoritativeDamage: true}).players.enemy.lives,
    0,
  )
})

test("multiple predictions consume only the authoritative damage observed", () => {
  const prediction = new DamagePrediction({ttlMs: 300, rollbackMs: 100})
  prediction.ingest(state(), 1000)
  prediction.predictDamage({targetType: "players", targetId: "enemy", damage: 20, id: "a", commandId: "shot-a", now: 1000})
  prediction.predictDamage({targetType: "players", targetId: "enemy", damage: 25, id: "b", commandId: "shot-b", now: 1010})

  prediction.reconcileEvents([{id: 1, kind: "hit", commandId: "shot-a", targetType: "players", targetId: "enemy", damage: 20}], 1020)
  prediction.ingest(state(80), 1020)
  assert.equal(prediction.applyToState(state(80), 1020).players.enemy.lives, 55)
})

test("a rejected command removes only its own prediction and duplicate events are harmless", () => {
  const prediction = new DamagePrediction({ttlMs: 300, rollbackMs: 100})
  prediction.ingest(state(), 1000)
  prediction.predictDamage({targetType: "players", targetId: "enemy", damage: 20, id: "a", commandId: "shot-a", now: 1000})
  prediction.predictDamage({targetType: "players", targetId: "enemy", damage: 25, id: "b", commandId: "shot-b", now: 1000})

  const rejection = {id: 1, kind: "attack", commandId: "shot-a", accepted: false, resolved: true}
  prediction.reconcileEvents([rejection], 1010)
  prediction.reconcileEvents([rejection], 1011)
  assert.equal(prediction.applyToState(state(), 1010).players.enemy.lives, 75)
})

test("an authoritative HP snapshot does not consume a different pending command", () => {
  const prediction = new DamagePrediction({ttlMs: 300, rollbackMs: 100})
  prediction.ingest(state(), 1000)
  prediction.predictDamage({targetType: "players", targetId: "enemy", damage: 20, id: "a", commandId: "shot-a", now: 1000})
  prediction.ingest(state(90), 1020)

  // The 10 HP may have come from somebody else. Keep the local speculative entry
  // out of the already-authoritative 90 HP rather than subtracting it again.
  assert.equal(prediction.applyToState(state(90), 1020).players.enemy.lives, 90)
})

test("local basic melee prediction uses server-provided combat stats", () => {
  const simulation = new NetworkSimulation()
  simulation.ingest({
    type: "state",
    ts: 1000,
    game: {state: "game"},
    map: {width: 500, height: 500, walls: []},
    players: {
      me: {playerId: "me", x: 0, y: 0, radius: 14, lives: 100, maxLives: 100, team: "a", ammo: 3, attackDamage: 25, attackArchetype: "melee_cone", attackRange: 100, attackHalfArcDegrees: 45},
      enemy: {playerId: "enemy", x: 70, y: 0, radius: 14, lives: 100, maxLives: 100, team: "b"},
    },
    monsters: {},
    bullets: [],
  })
  simulation.setLocalPlayerId("me")
  simulation.predictLocalShoot({angle: 0, aimDistance: 100, now: 1000})

  assert.equal(simulation.damagePrediction.applyToState(simulation.latestState, 1000).players.enemy.lives, 75)
})

test("missing combat stats disable local prediction instead of guessing one damage", () => {
  const simulation = new NetworkSimulation()
  simulation.ingest({
    type: "state",
    ts: 1000,
    game: {state: "game"},
    players: {
      me: {playerId: "me", x: 0, y: 0, lives: 100, maxLives: 100, ammo: 3, attackArchetype: "melee_cone", attackRange: 100, attackHalfArcDegrees: 45},
      enemy: {playerId: "enemy", x: 70, y: 0, radius: 14, lives: 100, maxLives: 100},
    },
    monsters: {},
  })
  simulation.setLocalPlayerId("me")
  simulation.predictLocalShoot({angle: 0, now: 1000})

  assert.equal(simulation.damagePrediction.applyToState(simulation.latestState, 1000).players.enemy.lives, 100)
})

test("authoritative projectile hit reconciles by command id and server damage", () => {
  const simulation = new NetworkSimulation()
  const players = {local: {playerId: "local", x: 60, y: 0, radius: 14, lives: 100, maxLives: 100, team: "b"}}
  simulation.ingest({type: "state", ts: 1000, players, monsters: {}, combatEvents: []})
  simulation.damagePrediction.predictDamage({targetType: "players", targetId: "local", damage: 18, commandId: "remote-shot", id: "remote-shot:local", now: 1000})
  simulation.ingest({type: "state", ts: 1050, players: {...players, local: {...players.local, lives: 82}}, monsters: {}, combatEvents: [
    {id: 1, kind: "hit", commandId: "remote-shot", targetType: "players", targetId: "local", damage: 18},
  ]})
  assert.equal(simulation.getDisplayState(1050).players.local.lives, 82)
})
