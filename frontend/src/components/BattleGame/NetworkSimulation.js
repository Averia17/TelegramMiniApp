import {DamagePrediction} from "./DamagePrediction.js"
import {createBattleContext, createBattleMode} from "./battleMode.js"
import {isBlockingWall, preserveAuthoritativeMapWalls} from "./mapContract.js"
import {endBattlePerformance, recordBattleMetric, startBattlePerformance} from "./rendering/shared/performance.js"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const lerp = (a, b, t) => a + (b - a) * t
const MAX_SIMULATION_STEP = .05
const MAX_CATCH_UP_TIME = .25
const MAX_INPUT_HISTORY = 240
const INPUT_TIMELINE_RESYNC_THRESHOLD = MAX_SIMULATION_STEP * 1000
const SCREEN_DEPTH_SCALE = .66
const MIN_INTERPOLATION_DELAY = 33
// Busy mobile/WebSocket runtimes can deliver several snapshots in a burst
// after a 140-170 ms scheduling gap. Keep enough history to interpolate
// through that jitter instead of extrapolating a visible combat frame.
const MAX_INTERPOLATION_DELAY = 220
const MAX_SNAPSHOT_INTERVAL_SAMPLES = 24
const MAX_PRESENTATION_EXTRAPOLATION = 80
const STOP_CORRECTION_HOLD_TIME = .12
const LOCAL_ATTACK_PREDICTION_MS = 700
const MELEE_MOVING_TARGET_ASSIST_RADIUS = 20
const MIN_CORRECTION_SPEED = 1
const COLLISION_CELL_SIZE = 160
const EMPTY_WALLS = []
const EMPTY_COLLISION_INDEX = {
  walls: EMPTY_WALLS,
  blockingWalls: EMPTY_WALLS,
  flightBoundaryWalls: EMPTY_WALLS,
  cells: new Map(),
  queryMarks: new Uint32Array(0),
  queryScratchIndices: [],
}

const worldAngleFromScreen = angle => Math.atan2(Math.sin(angle) / SCREEN_DEPTH_SCALE, Math.cos(angle))

const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

const canDamage = (source, target, battleMode = createBattleMode()) =>
  battleMode.canDamage(source, target)

const targetEntries = (players = {}, monsters = {}) => [
  ...Object.entries(players).map(([id, entity]) => ({type: "players", id, entity})),
  ...Object.entries(monsters).map(([id, entity]) => ({type: "monsters", id, entity})),
]

const distanceBetween = (a, b) => Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.y || 0) - Number(b?.y || 0))

const meleeAutoAimReach = source => {
  const base = Math.max(1, Number(source?.attackRange) || 430)
  return source?.hero === "Mandy" && Number(source?.focusCharge) >= 100 ? base * 1.2 : base
}

const nearestMeleeAutoAimTarget = (source, players = {}, monsters = {}, battleMode = createBattleMode()) => {
  const reach = meleeAutoAimReach(source)
  const nearest = entries => entries
    .filter(({entity}) => canDamage(source, entity, battleMode))
    .map(entry => ({...entry, distance: distanceBetween(source, entry.entity)}))
    .filter(({entity, distance}) => {
      const movingAssist = Math.hypot(Number(entity.moveX) || 0, Number(entity.moveY) || 0) > .01
        ? MELEE_MOVING_TARGET_ASSIST_RADIUS
        : 0
      return distance <= reach + Number(entity.radius || 0) + movingAssist
    })
    .sort((a, b) => a.distance - b.distance)[0]?.entity || null
  return nearest(Object.entries(players).map(([id, entity]) => ({type: "players", id, entity})))
    || nearest(Object.entries(monsters).map(([id, entity]) => ({type: "monsters", id, entity})))
}

const attackDamage = player => {
  let damage = Number(player?.attackDamage) || 0
  damage *= Math.max(1, Number(player?.damageMultiplier) || 1)
  if (player?.hero === "Mandy" && Number(player?.focusCharge) >= 100) damage *= 1.5
  if (player?.hero === "Kaze" && Number(player?.stealth) > 0) damage *= 2
  return damage > 0 ? Math.max(1, Math.round(damage)) : 0
}

const cellCoordinate = value => Math.floor((Number(value) || 0) / COLLISION_CELL_SIZE)
const collisionCellKey = (x, y) => `${x}:${y}`

const colliderBounds = wall => {
  const width = Math.max(0, Number(wall?.maxX) - Number(wall?.minX))
  const height = Math.max(0, Number(wall?.maxY) - Number(wall?.minY))
  const insetX = clamp(Number(wall?.colliderInsetX) || 0, 0, Math.max(0, width / 2 - .001))
  const insetY = clamp(Number(wall?.colliderInsetY) || 0, 0, Math.max(0, height / 2 - .001))
  return {
    minX: Number(wall?.minX) + insetX,
    minY: Number(wall?.minY) + insetY,
    maxX: Number(wall?.maxX) - insetX,
    maxY: Number(wall?.maxY) - insetY,
  }
}

const colliderCircle = wall => {
  const radius = Number(wall?.colliderRadius)
  if (!Number.isFinite(radius) || radius <= 0) return null
  return {
    x: (Number(wall?.minX) + Number(wall?.maxX)) / 2,
    y: (Number(wall?.minY) + Number(wall?.maxY)) / 2,
    radius,
  }
}

export const createCollisionIndex = walls => {
  const source = Array.isArray(walls) ? walls : EMPTY_WALLS
  const cells = new Map()
  const blockingWalls = []
  const flightBoundaryWalls = []
  source.forEach((wall, index) => {
    if (!isBlockingWall(wall)) return
    blockingWalls.push(wall)
    if (wall?.type === "water" || wall?.type === "ocean") flightBoundaryWalls.push(wall)
    const minX = cellCoordinate(wall.minX)
    const maxX = cellCoordinate(wall.maxX)
    const minY = cellCoordinate(wall.minY)
    const maxY = cellCoordinate(wall.maxY)
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellY = minY; cellY <= maxY; cellY += 1) {
        const key = collisionCellKey(cellX, cellY)
        const bucket = cells.get(key)
        if (bucket) bucket.push(index)
        else cells.set(key, [index])
      }
    }
  })
  return {
    walls: source,
    blockingWalls,
    flightBoundaryWalls,
    cells,
    queryMarks: new Uint32Array(source.length),
    queryScratchIndices: [],
    queryId: 0,
  }
}

export const queryCollisionWalls = (index, position, radius, result = null) => {
  const output = Array.isArray(result) ? result : []
  output.length = 0
  if (!index?.cells?.size) return output
  const safeRadius = Math.max(0, Number(radius) || 0)
  const minX = cellCoordinate(Number(position?.x) - safeRadius)
  const maxX = cellCoordinate(Number(position?.x) + safeRadius)
  const minY = cellCoordinate(Number(position?.y) - safeRadius)
  const maxY = cellCoordinate(Number(position?.y) + safeRadius)
  const indices = index.queryScratchIndices || (index.queryScratchIndices = [])
  indices.length = 0
  index.queryId = ((Number(index.queryId) || 0) + 1) >>> 0
  if (index.queryId === 0) {
    index.queryMarks?.fill(0)
    index.queryId = 1
  }
  const queryId = index.queryId
  for (let cellX = minX; cellX <= maxX; cellX += 1) {
    for (let cellY = minY; cellY <= maxY; cellY += 1) {
      const bucket = index.cells.get(collisionCellKey(cellX, cellY))
      bucket?.forEach(wallIndex => {
        if (index.queryMarks[wallIndex] === queryId) return
        index.queryMarks[wallIndex] = queryId
        indices.push(wallIndex)
      })
    }
  }
  indices.sort((a, b) => a - b)
  indices.forEach(wallIndex => output.push(index.walls[wallIndex]))
  return output
}

const resolveWalls = (position, radius, walls) => {
  let {x, y} = position
  for (const wall of walls || []) {
    const circle = colliderCircle(wall)
    if (circle) {
      const dx = x - circle.x
      const dy = y - circle.y
      const distance = Math.hypot(dx, dy)
      const minimumDistance = radius + circle.radius
      if (distance >= minimumDistance) continue
      if (distance > 0.0001) {
        const push = minimumDistance - distance
        x += dx / distance * push
        y += dy / distance * push
      } else {
        x += minimumDistance
      }
      continue
    }
    const bounds = colliderBounds(wall)
    const closestX = clamp(x, bounds.minX, bounds.maxX)
    const closestY = clamp(y, bounds.minY, bounds.maxY)
    const dx = x - closestX
    const dy = y - closestY
    const distance = Math.hypot(dx, dy)
    if (distance >= radius) continue
    if (distance > 0.0001) {
      const push = radius - distance
      x += dx / distance * push
      y += dy / distance * push
      continue
    }
    const choices = [
      {distance: Math.abs(x - bounds.minX), x: bounds.minX - radius, y},
      {distance: Math.abs(bounds.maxX - x), x: bounds.maxX + radius, y},
      {distance: Math.abs(y - bounds.minY), x, y: bounds.minY - radius},
      {distance: Math.abs(bounds.maxY - y), x, y: bounds.maxY + radius},
    ]
    const nearest = choices.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best)
    x = nearest.x
    y = nearest.y
  }
  return {x, y}
}

const isBlockingDynamicProp = prop => prop?.active !== false &&
  (prop?.type === "health_crate" || prop?.type === "lunar_crate")

const resolveDynamicProps = (position, radius, props) => {
  let {x, y} = position
  for (const prop of props || []) {
    if (!isBlockingDynamicProp(prop)) continue
    const obstacleRadius = Math.max(0, Number(prop.radius) || 0)
    const minimumDistance = radius + obstacleRadius
    const dx = x - Number(prop.x || 0)
    const dy = y - Number(prop.y || 0)
    const distance = Math.hypot(dx, dy)
    if (distance >= minimumDistance) continue
    if (distance > 0.0001) {
      const push = minimumDistance - distance
      x += dx / distance * push
      y += dy / distance * push
    } else {
      x += minimumDistance
    }
  }
  return {x, y}
}

const movementSpeed = player => {
  const authoritativeSpeed = Number(player?.movementSpeed)
  if (Number.isFinite(authoritativeSpeed)) return Math.max(0, authoritativeSpeed)
  let speed = Number(player?.speed) || 0
  if (Number(player?.haste) > 0) speed *= 1.22
  if (Number(player?.lunarSpeed) > 0) speed *= 1.15
  if (Number(player?.slow) > 0) speed *= .45
  if (Number(player?.stun) > 0 || Number(player?.channel) > 0) speed = 0
  return speed
}

const constrainPosition = (position, player, map, collisionIndex = null, collisionResult = null, blockingProps = null) => {
  const radius = Number(player.radius) || 14
  const next = {
    x: clamp(Number(position.x) || 0, radius, Math.max(radius, (map.width || radius) - radius)),
    y: clamp(Number(position.y) || 0, radius, Math.max(radius, (map.height || radius) - radius)),
  }
  const collisionWalls = collisionIndex?.cells
    ? queryCollisionWalls(collisionIndex, next, radius, collisionResult)
    : map.walls
  return resolveDynamicProps(resolveWalls(next, radius, collisionWalls), radius, blockingProps)
}

const constrainFlightPosition = (position, player, map, collisionIndex = null) => {
  const radius = Number(player.radius) || 14
  const bounded = {
    x: clamp(Number(position.x) || 0, radius, Math.max(radius, (map.width || radius) - radius)),
    y: clamp(Number(position.y) || 0, radius, Math.max(radius, (map.height || radius) - radius)),
  }
  return resolveWalls(bounded, radius, collisionIndex?.flightBoundaryWalls)
}

export const movePosition = (position, input, player, delta, map, collisionIndex = null, collisionResult = null, blockingProps = null) => {
  const magnitude = Math.hypot(input.x, input.y)
  if (magnitude <= .001 || delta <= 0) return position
  const distance = movementSpeed(player) * delta
  const radius = Number(player.radius) || 14
  const maxStep = Math.max(1, radius * .5)
  const steps = Math.max(1, Math.ceil(distance / maxStep))
  const stepDistance = distance / steps
  const flying = Number(player?.flying) > 0
  let next = {...position}
  for (let step = 0; step < steps; step += 1) {
    next = {
      x: next.x + input.x / magnitude * stepDistance,
      y: next.y + input.y / magnitude * stepDistance,
    }
    next = flying
      ? constrainFlightPosition(next, player, map, collisionIndex)
      : constrainPosition(next, player, map, collisionIndex, collisionResult, blockingProps)
  }
  return next
}

const interpolateAngle = (a = 0, b = 0, t) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t

const assignEntitySnapshot = (target, snapshot) => {
  for (const key of Object.keys(target)) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, key)) delete target[key]
  }
  Object.assign(target, snapshot)
  return target
}

const updateInterpolatedEntity = (target, older, newer, t) => {
  // Discrete gameplay fields (HP, attack pulses, status flags) must travel
  // with the presentation timeline too. Copying them from `newer` before the
  // interpolation reaches that snapshot makes a future hit/death appear
  // immediately even while the body is still between positions.
  assignEntitySnapshot(target, t < 1 ? older : newer)
  target.x = lerp(older.x, newer.x, t)
  target.y = lerp(older.y, newer.y, t)
  if (Number.isFinite(older.z) && Number.isFinite(newer.z)) target.z = lerp(older.z, newer.z, t)
  else delete target.z
  target.rotation = interpolateAngle(older.rotation, newer.rotation, t)
  return target
}

const syncInterpolatedMap = (cache, older = {}, newer = {}, t) => {
  const previousMap = older || {}
  const nextMap = newer || {}
  // Entity membership is also time-based. Holding the older map until the
  // presentation boundary prevents a hidden/dead opponent from vanishing at
  // packet arrival and prevents a newly visible opponent from popping in early.
  const presentationMap = t < 1 ? previousMap : nextMap
  const active = new Set(Object.keys(presentationMap))
  Object.keys(cache).forEach(id => {
    if (!active.has(id)) delete cache[id]
  })
  Object.entries(presentationMap).forEach(([id, presentationEntity]) => {
    const olderEntity = previousMap[id]
    const newerEntity = nextMap[id]
    const target = cache[id] || (cache[id] = {})
    if (olderEntity && newerEntity) updateInterpolatedEntity(target, olderEntity, newerEntity, t)
    else assignEntitySnapshot(target, presentationEntity)
  })
  return cache
}

const syncInterpolatedList = (cache, older = [], newer = [], keyOf, t, scratch = null) => {
  const previousList = Array.isArray(older) ? older : []
  const nextList = Array.isArray(newer) ? newer : []
  const previous = scratch?.previous || new Map()
  const next = scratch?.next || new Map()
  previous.clear()
  next.clear()
  previousList.forEach((entity, index) => previous.set(String(keyOf(entity, index)), entity))
  nextList.forEach((entity, index) => next.set(String(keyOf(entity, index)), entity))
  // Membership is part of the same presentation timeline as position. Do not
  // spawn a projectile from a future packet or remove it before its last
  // interpolated frame has been shown.
  const presentationList = t < 1 ? previousList : nextList
  const active = scratch?.active || new Set()
  active.clear()
  const result = presentationList.map((presentationEntity, index) => {
    const key = String(keyOf(presentationEntity, index))
    active.add(key)
    const olderEntity = previous.get(key)
    const newerEntity = next.get(key)
    const target = cache.get(key) || {}
    cache.set(key, target)
    if (olderEntity && newerEntity) updateInterpolatedEntity(target, olderEntity, newerEntity, t)
    else assignEntitySnapshot(target, presentationEntity)
    return target
  })
  cache.forEach((value, key) => {
    if (!active.has(key)) cache.delete(key)
  })
  return result
}

export class NetworkSimulation {
  constructor({interpolationDelay = null} = {}) {
    this.adaptiveInterpolation = interpolationDelay == null
    this.interpolationDelay = this.adaptiveInterpolation
      ? 66
      : Math.max(0, Number(interpolationDelay) || 0)
    this.snapshotIntervals = []
    this.snapshotArrivalIntervals = []
    this.snapshotIntervalSortBuffer = []
    this.snapshotArrivalIntervalSortBuffer = []
    this.lastSnapshotArrivalAt = null
    this.playerId = null
    this.snapshots = []
    this.latestState = null
    this.predicted = null
    this.correction = {x: 0, y: 0}
    this.correctionHoldRemaining = 0
    this.recentlyStopped = false
    this.lastNonZeroInput = {x: 0, y: 0}
    this.input = {x: 0, y: 0}
    this.movementInput = {x: 0, y: 0}
    this.pendingInputs = []
    this.positionHistory = []
    this.clockOffset = null
    this.predictionTime = null
    this.damagePrediction = new DamagePrediction()
    this.displayPlayers = {}
    this.displayMonsters = {}
    this.displayBullets = new Map()
    // Projectile lists are rebuilt on every render frame; keep their lookup
    // indexes stable to avoid GC churn during team firefights.
    this.displayBulletScratch = {previous: new Map(), next: new Map(), active: new Set()}
    this.renderTime = null
    this.pendingLocalAttack = null
    this.collisionWallsSource = null
    this.collisionWalls = EMPTY_WALLS
    this.collisionIndexSource = null
    this.collisionIndex = EMPTY_COLLISION_INDEX
    this.collisionQueryResult = []
    this.battleContext = createBattleContext()
  }

  setLocalPlayerId(id) {
    this.playerId = id == null ? null : String(id)
    this.seedLocalPlayer()
  }

  setInput(x, y, ack) {
    const nextInput = {x: Number(x) || 0, y: Number(y) || 0}
    const wasMoving = Math.hypot(this.movementInput.x, this.movementInput.y) > .001
    const isMoving = Math.hypot(nextInput.x, nextInput.y) > .001
    this.recentlyStopped = wasMoving && !isMoving
    if (isMoving) {
      this.lastNonZeroInput = nextInput
      this.correctionHoldRemaining = 0
    }
    this.input = nextInput
    this.movementInput = nextInput
    if (Number.isFinite(ack)) {
      // Input timestamps are in the same local clock domain as predictionTime.
      // If a render frame was capped, move the timeline to the command time so
      // reconciliation cannot replay the previous direction through the gap.
      if (this.predictionTime != null && ack - this.predictionTime > INPUT_TIMELINE_RESYNC_THRESHOLD) {
        this.predictionTime = ack
      }
      this.pendingInputs = this.pendingInputs.filter(input => input.ack !== ack)
      this.pendingInputs.push({ack, sentAt: ack, ...this.input})
      if (this.pendingInputs.length > MAX_INPUT_HISTORY) this.pendingInputs.shift()
    }
  }

  ingest(state, clockOffset = null, receivedAt = Date.now()) {
    if (!state || state.type !== "state") return
    const map = preserveAuthoritativeMapWalls(state.map, this.latestState?.map)
    const normalizedState = map === state.map ? state : {...state, map}
    const previousLocalPlayer = this.latestState?.players?.[this.playerId]
    const nextLocalPlayer = normalizedState.players?.[this.playerId]
    const localPlayerRespawned = Number(previousLocalPlayer?.lives) <= 0 && Number(nextLocalPlayer?.lives) > 0
    const matchStarted = this.latestState?.game?.state === "lobby" && normalizedState.game?.state === "game"
    this.battleContext = createBattleContext(normalizedState)
    const timestamp = Number(state.ts)
    const lastTimestamp = Number(this.snapshots.at(-1)?.ts)
    if (Number.isFinite(timestamp) && Number.isFinite(lastTimestamp) && timestamp < lastTimestamp) return
    // A duplicate timestamp is not a newer authoritative frame. Replacing
    // latestState without appending to snapshots would split the state used by
    // reconciliation from the presentation timeline and re-open lifecycle
    // races around lobby start and respawn.
    if (Number.isFinite(timestamp) && Number.isFinite(lastTimestamp) && timestamp === lastTimestamp) return
    const perfToken = startBattlePerformance("simulation.ingest")
    if (Number.isFinite(timestamp) && Number.isFinite(lastTimestamp)) {
      const interval = timestamp - lastTimestamp
      if (interval > 0 && interval <= 1000) {
        this.snapshotIntervals.push(interval)
        if (this.snapshotIntervals.length > MAX_SNAPSHOT_INTERVAL_SAMPLES) this.snapshotIntervals.shift()
      }
    }
    if (Number.isFinite(receivedAt) && this.lastSnapshotArrivalAt != null) {
      const arrivalInterval = receivedAt - this.lastSnapshotArrivalAt
      if (arrivalInterval > 0 && arrivalInterval <= 1000) {
        this.snapshotArrivalIntervals.push(arrivalInterval)
        if (this.snapshotArrivalIntervals.length > MAX_SNAPSHOT_INTERVAL_SAMPLES) this.snapshotArrivalIntervals.shift()
      }
    }
    if (Number.isFinite(receivedAt)) this.lastSnapshotArrivalAt = receivedAt
    this.updateInterpolationDelay()
    if (Number.isFinite(clockOffset)) {
      this.clockOffset = clockOffset
    } else if (this.clockOffset == null) {
      // Fallback for consumers that do not have an active clock-sync channel.
      // This is only an initial estimate; every later synced state replaces it.
      this.clockOffset = Date.now() - Number(state.ts || Date.now())
    }
    this.latestState = normalizedState
    const predictionNow = Number.isFinite(receivedAt) ? receivedAt : Date.now()
    this.damagePrediction.ingest(normalizedState, predictionNow)
    this.damagePrediction.reconcileEvents(normalizedState.combatEvents, predictionNow)
    this.snapshots.push(normalizedState)
    // Older timestamps are rejected above, so the accepted stream is already
    // ordered. Avoid sorting the whole 40-frame presentation buffer per state.
    if (this.snapshots.length > 40) this.snapshots.shift()
    const snapshotLocalTime = this.serverTimeToLocal(timestamp || Date.now())
    this.predictionTime = Math.max(this.predictionTime ?? snapshotLocalTime, snapshotLocalTime)
    if ((localPlayerRespawned || matchStarted) && nextLocalPlayer) {
      this.resetLocalPresentationAtAuthoritativePosition(nextLocalPlayer, snapshotLocalTime)
    }
    this.reconcile()
    endBattlePerformance(perfToken)
  }

  updateInterpolationDelay() {
    if (!this.adaptiveInterpolation || this.snapshotIntervals.length < 3) return
    const serverSorted = this.snapshotIntervalSortBuffer
    serverSorted.length = this.snapshotIntervals.length
    for (let index = 0; index < this.snapshotIntervals.length; index += 1) {
      serverSorted[index] = this.snapshotIntervals[index]
    }
    serverSorted.sort((a, b) => a - b)
    const serverP90 = serverSorted[Math.min(serverSorted.length - 1, Math.ceil(serverSorted.length * .9) - 1)]
    const arrivalSorted = this.snapshotArrivalIntervalSortBuffer
    arrivalSorted.length = this.snapshotArrivalIntervals.length
    for (let index = 0; index < this.snapshotArrivalIntervals.length; index += 1) {
      arrivalSorted[index] = this.snapshotArrivalIntervals[index]
    }
    arrivalSorted.sort((a, b) => a - b)
    const arrivalP90 = arrivalSorted.length >= 3
      ? arrivalSorted[Math.min(arrivalSorted.length - 1, Math.ceil(arrivalSorted.length * .9) - 1)]
      : 0
    const p90 = Math.max(serverP90, arrivalP90)
    const target = clamp(p90 * 1.25 + 8, MIN_INTERPOLATION_DELAY, MAX_INTERPOLATION_DELAY)
    // Move slowly so one delayed packet cannot make the presentation jump
    // forward and then immediately fall back to a shorter buffer.
    this.interpolationDelay += (target - this.interpolationDelay) * .2
    recordBattleMetric("network.interpolation_delay", this.interpolationDelay, {
      snapshotIntervalP90: p90,
      serverIntervalP90: serverP90,
      arrivalIntervalP90: arrivalP90,
    })
  }

  predictLocalShoot({angle, autoAim = false, commandId = "", now = Date.now()} = {}) {
    const state = this.latestState
    const sourceId = this.playerId
    const sourceState = state?.players?.[sourceId]
    if (state?.game?.state !== "game" || !sourceState || Number(sourceState.lives) <= 0 || Number(sourceState.ammo) <= 0) return []
    if (Number(sourceState.stun) > 0 || Number(sourceState.channel) > 0) return []

    const source = {
      ...sourceState,
      ...(this.predicted ? {x: this.predicted.x, y: this.predicted.y} : {}),
    }
    if (autoAim) {
      if (source.attackArchetype !== "melee_cone") return []
      const target = nearestMeleeAutoAimTarget(source, state.players, state.monsters, this.battleContext.mode)
      if (!target) return []
      this.pendingLocalAttack = {
        rotation: Math.atan2(Number(target.y) - Number(source.y), Number(target.x) - Number(source.x)),
        attackPulse: Number(source.attackPulse) + 1,
        expiresAt: Number(now) + LOCAL_ATTACK_PREDICTION_MS,
      }
      return []
    }
    const damage = attackDamage(source)
    if (!damage) return []
    const archetype = source.attackArchetype || "projectile"
    // Projectile impact is server-authoritative. Its travel and collision are
    // deliberately not guessed from interpolated snapshots; only attacks whose
    // damage is resolved on the command tick are eligible for local HP feedback.
    if (archetype !== "melee_cone") return []
    const worldAngle = worldAngleFromScreen(Number(angle) || 0)
    const range = Math.max(1, Number(source.attackRange) || 430)
    const predicted = []

    targetEntries(state.players, state.monsters).forEach(({type, id, entity}) => {
      if (!canDamage(source, entity, this.battleContext.mode)) return
      const target = {...entity, x: Number(entity.x), y: Number(entity.y)}
      let hit = false
      if (archetype === "melee_cone") {
        const reach = range + Number(target.radius || 0)
        const halfArc = (Number(source.attackHalfArcDegrees) || 45) * Math.PI / 180
        const direction = Math.atan2(target.y - source.y, target.x - source.x)
        hit = distanceBetween(source, target) <= reach && Math.abs(angleDelta(direction, worldAngle)) <= halfArc
      }
      if (!hit) return
      predicted.push({type, id, distance: distanceBetween(source, target)})
    })

    // A normal projectile stops at the first player/monster. Melee may hit all
    // targets in its sector, matching the server's basic melee contract.
    const selected = archetype === "melee_cone"
      ? predicted
      : predicted.sort((a, b) => a.distance - b.distance).slice(0, 1)
    return selected.map(({type, id}) => this.damagePrediction.predictDamage({
      targetType: type,
      targetId: id,
      damage,
      id: `local-shot:${commandId || sourceId}:${type}:${id}`,
      commandId,
      now,
    }))
  }

  seedLocalPlayer() {
    const player = this.latestState?.players?.[this.playerId]
    if (player && !this.predicted) {
      this.predicted = {x: player.x, y: player.y}
      this.predictionTime = this.serverTimeToLocal(this.latestState.ts || Date.now())
    }
  }

  resetLocalPresentationAtAuthoritativePosition(player, snapshotLocalTime) {
    this.predicted = {x: Number(player.x) || 0, y: Number(player.y) || 0}
    this.correction = {x: 0, y: 0}
    this.correctionHoldRemaining = 0
    this.pendingInputs = []
    this.positionHistory.length = 0
    this.pendingLocalAttack = null
    this.recentlyStopped = false
    this.lastNonZeroInput = {x: 0, y: 0}
    this.input = {x: 0, y: 0}
    this.movementInput = {x: 0, y: 0}
    this.predictionTime = snapshotLocalTime
  }

  serverTimeToLocal(serverTime) {
    return Number(serverTime) + (this.clockOffset || 0)
  }

  localTimeToServer(localTime) {
    return Number(localTime) - (this.clockOffset || 0)
  }

  setRenderTime(now) {
    this.renderTime = Number.isFinite(now) ? now : null
  }

  getCollisionIndex(map = {}) {
    const walls = Array.isArray(map.walls) ? map.walls : EMPTY_WALLS
    if (walls !== this.collisionIndexSource) {
      this.collisionIndexSource = walls
      this.collisionIndex = walls.length > 0 ? createCollisionIndex(walls) : EMPTY_COLLISION_INDEX
      this.collisionWallsSource = walls
      this.collisionWalls = this.collisionIndex.blockingWalls
    }
    return this.collisionIndex
  }

  reconcile() {
    const authoritative = this.latestState?.players?.[this.playerId]
    if (!authoritative) return
    const authoritativeAck = Number(authoritative.ack || 0)
    this.pendingInputs = this.pendingInputs.filter(input => input.ack > authoritativeAck)
    if (!this.predicted) {
      this.predicted = {x: authoritative.x, y: authoritative.y}
      this.predictionTime = this.serverTimeToLocal(this.latestState.ts || Date.now())
      return
    }
    // Reconcile in one clock domain. The snapshot is an old authoritative
    // frame, so compare it with the current client simulation time, not with
    // a wall-clock sample collected during an arbitrary render frame.
    const snapshotLocalTime = this.serverTimeToLocal(this.latestState.ts)
    const targetTime = Math.max(this.predictionTime ?? snapshotLocalTime, snapshotLocalTime)
    const before = {...this.predicted}
    const map = this.latestState.map || {}
    const collisionIndex = this.getCollisionIndex(map)
    const blockingProps = this.latestState?.props
    let replayed = {x: Number(authoritative.x) || 0, y: Number(authoritative.y) || 0}
    let cursor = snapshotLocalTime
    let replayInput = {
      x: Number(authoritative.moveX) || 0,
      y: Number(authoritative.moveY) || 0,
    }
    const replayInputs = [...this.pendingInputs].sort((a, b) => a.ack - b.ack)
    for (const pending of replayInputs) {
      const commandTime = Number(pending.sentAt ?? pending.ack)
      const start = Number.isFinite(commandTime)
        ? Math.max(cursor, Math.min(commandTime, targetTime))
        : cursor
      replayed = movePosition(replayed, replayInput, authoritative, (start - cursor) / 1000, map, collisionIndex, this.collisionQueryResult, blockingProps)
      replayInput = {x: pending.x, y: pending.y}
      cursor = start
    }
    replayed = movePosition(replayed, replayInput, authoritative, (targetTime - cursor) / 1000, map, collisionIndex, this.collisionQueryResult, blockingProps)
    this.predicted = replayed
    this.predictionTime = targetTime

    const errorX = replayed.x - before.x
    const errorY = replayed.y - before.y
    const error = Math.hypot(errorX, errorY)
    recordBattleMetric("prediction.reconciliation_error", error, {
      state: this.latestState?.game?.state || "unknown",
      pendingInputs: this.pendingInputs.length,
    })
    if (authoritative.lives <= 0) {
      this.predicted = {x: authoritative.x, y: authoritative.y}
      this.correction = {x: 0, y: 0}
    } else {
      // Simulation truth is corrected immediately. Only the rendered local
      // pose carries the old-vs-new delta, so the same frame remains visually
      // continuous while authoritative state wins underneath.
      this.correction = {
        x: before.x + this.correction.x - replayed.x,
        y: before.y + this.correction.y - replayed.y,
      }
      const correctionAlongLastMovement = this.correction.x * this.lastNonZeroInput.x +
        this.correction.y * this.lastNonZeroInput.y
      if (this.recentlyStopped && correctionAlongLastMovement > 0.001) {
        // An older authoritative stop can leave the local prediction slightly
        // ahead. Hold that visual lead briefly instead of decaying it into a
        // visible backward kick during the first stopped frames.
        this.correctionHoldRemaining = Math.max(this.correctionHoldRemaining, STOP_CORRECTION_HOLD_TIME)
      }
    }
    recordBattleMetric("prediction.reconciliation_offset", Math.hypot(this.correction.x, this.correction.y), {
      state: this.latestState?.game?.state || "unknown",
      pendingInputs: this.pendingInputs.length,
    })
  }

  advance(delta) {
    const numericDelta = Number(delta)
    const requested = Number.isFinite(numericDelta) ? Math.max(0, numericDelta) : 0
    let remaining = Math.min(requested, MAX_CATCH_UP_TIME)
    let simulated = 0
    while (remaining > 0) {
      const step = Math.min(remaining, MAX_SIMULATION_STEP)
      this.update(step)
      remaining -= step
      simulated += step
    }
    if (this.predictionTime != null && requested > simulated) {
      // Keep the simulation clock current while retaining the safety cap on
      // actual movement. The next authoritative snapshot will reconcile the
      // skipped distance without making the old input active retroactively.
      this.predictionTime += (requested - simulated) * 1000
    }
  }

  update(delta) {
    const player = this.latestState?.players?.[this.playerId]
    if (!player) return
    this.seedLocalPlayer()
    if (!this.predicted) return

    this.predictionTime = (this.predictionTime ?? this.serverTimeToLocal(this.latestState.ts || Date.now())) + delta * 1000
    const map = this.latestState.map || {}
    const before = this.predicted
    this.predicted = movePosition(this.predicted, this.movementInput, player, delta, map, this.getCollisionIndex(map), this.collisionQueryResult, this.latestState?.props)

    if (this.correctionHoldRemaining > 0) {
      this.correctionHoldRemaining = Math.max(0, this.correctionHoldRemaining - delta)
    } else {
      const correctionBlend = 1 - Math.exp(-12 * delta)
      let correctionDelta = {
        x: -this.correction.x * correctionBlend,
        y: -this.correction.y * correctionBlend,
      }
      const movementDelta = {
        x: this.predicted.x - before.x,
        y: this.predicted.y - before.y,
      }
      const movementDistance = Math.hypot(movementDelta.x, movementDelta.y)
      const movementSpeedValue = Number(player.movementSpeed)
      const correctionSpeed = Math.max(
        MIN_CORRECTION_SPEED,
        Number.isFinite(movementSpeedValue) ? movementSpeedValue : Number(player.speed) || 0,
      )
      // A reconciliation offset is presentation-only. Its decay must not
      // become a second movement vector: after a delayed reversal, removing
      // an offset in the old direction can otherwise move the rendered hero
      // backward or faster than the authoritative movement speed.
      const maxPresentationDistance = correctionSpeed * delta
      const desiredPresentationDelta = {
        x: movementDelta.x + correctionDelta.x,
        y: movementDelta.y + correctionDelta.y,
      }
      if (Math.hypot(desiredPresentationDelta.x, desiredPresentationDelta.y) > maxPresentationDistance + 1e-9) {
        let low = 0
        let high = 1
        for (let iteration = 0; iteration < 12; iteration += 1) {
          const scale = (low + high) / 2
          const candidateX = movementDelta.x + correctionDelta.x * scale
          const candidateY = movementDelta.y + correctionDelta.y * scale
          if (Math.hypot(candidateX, candidateY) <= maxPresentationDistance) low = scale
          else high = scale
        }
        correctionDelta = {
          x: correctionDelta.x * low,
          y: correctionDelta.y * low,
        }
      }
      if (movementDistance > 1e-9) {
        const directionX = movementDelta.x / movementDistance
        const directionY = movementDelta.y / movementDistance
        const projected = (movementDelta.x + correctionDelta.x) * directionX +
          (movementDelta.y + correctionDelta.y) * directionY
        const minimumProgress = movementDistance * .1
        if (projected < minimumProgress) {
          const correctionProjection = correctionDelta.x * directionX + correctionDelta.y * directionY
          if (correctionProjection < -1e-9) {
            const scale = Math.max(0, Math.min(1, (movementDistance - minimumProgress) / -correctionProjection))
            correctionDelta = {
              x: correctionDelta.x * scale,
              y: correctionDelta.y * scale,
            }
          }
        }
      }
      this.correction.x += correctionDelta.x
      this.correction.y += correctionDelta.y
    }

    // Prediction truth is collision-safe, but the presentation offset is a
    // second vector applied afterwards. During a fast reversal it can briefly
    // point from an older safe pose through a wall while it decays. Constrain
    // the composed render pose and retain only the collision-safe offset.
    const presentationPosition = {
      x: this.predicted.x + this.correction.x,
      y: this.predicted.y + this.correction.y,
    }
    const presentation = Number(player?.flying) > 0
      ? constrainFlightPosition(presentationPosition, player, map, this.getCollisionIndex(map))
      : constrainPosition(presentationPosition, player, map, this.getCollisionIndex(map), this.collisionQueryResult, this.latestState?.props)
    this.correction.x = presentation.x - this.predicted.x
    this.correction.y = presentation.y - this.predicted.y

  }

  getDisplayState(now = this.renderTime ?? Date.now(), {copyEntities = false} = {}) {
    if (!this.latestState) return null
    const perfToken = startBattlePerformance("simulation.display")
    const targetTime = this.localTimeToServer(now - this.interpolationDelay)
    const latestIndex = Math.max(0, this.snapshots.length - 1)
    let older = this.snapshots[Math.max(0, latestIndex - 1)] || this.latestState
    let newer = this.latestState
    for (let index = 1; index < this.snapshots.length; index += 1) {
      const candidate = this.snapshots[index]
      if (candidate.ts >= targetTime) {
        newer = candidate
        older = this.snapshots[index - 1]
        break
      }
      if (index < this.snapshots.length - 1) older = candidate
    }
    const span = Math.max(1, Number(newer.ts) - Number(older.ts))
    const latestTimestamp = Number(newer.ts)
    const isPresentationUnderrun = Number.isFinite(latestTimestamp) && targetTime > latestTimestamp
    recordBattleMetric("network.presentation_buffer_ms", latestTimestamp - targetTime, {
      snapshotsBuffered: this.snapshots.length,
      underrun: isPresentationUnderrun,
    })
    recordBattleMetric("network.snapshot_buffer_size", this.snapshots.length)
    const presentationTime = isPresentationUnderrun
      ? Math.min(targetTime, latestTimestamp + MAX_PRESENTATION_EXTRAPOLATION)
      : targetTime
    const t = clamp((presentationTime - Number(older.ts)) / span, 0, 1 + MAX_PRESENTATION_EXTRAPOLATION / span)
    if (isPresentationUnderrun) {
      recordBattleMetric("network.presentation_underrun", 1, {
        requestedMs: targetTime - latestTimestamp,
        extrapolatedMs: presentationTime - latestTimestamp,
      })
      recordBattleMetric("network.presentation_extrapolation_ms", presentationTime - latestTimestamp)
    }
    const players = syncInterpolatedMap(this.displayPlayers, older.players, newer.players, t)
    if (this.playerId && players[this.playerId] && this.predicted) {
      const localAuthoritative = this.latestState?.players?.[this.playerId] || players[this.playerId]
      const previousLocalAuthoritative = this.snapshots.length > 1
        ? this.snapshots[this.snapshots.length - 2]?.players?.[this.playerId]
        : null
      const flightJustEnded = Number(previousLocalAuthoritative?.flying) > 0 && Number(localAuthoritative?.flying) <= 0
      const localPresentation = {
        x: this.predicted.x + this.correction.x,
        y: this.predicted.y + this.correction.y,
      }
      const collisionIndex = this.getCollisionIndex(this.latestState?.map || {})
      let constrainedPresentation = Number(localAuthoritative?.flying) > 0
        ? constrainFlightPosition(localPresentation, localAuthoritative, this.latestState?.map || {}, collisionIndex)
        : constrainPosition(localPresentation, localAuthoritative, this.latestState?.map || {}, collisionIndex, this.collisionQueryResult, this.latestState?.props)
      if (flightJustEnded) {
        // The server has already resolved the landing. Do not let a stale
        // airborne prediction choose the opposite side of a wall while the
        // interpolation buffer catches up; use the authoritative landing
        // point immediately and keep it collision-safe for malformed frames.
        constrainedPresentation = constrainPosition(
          {x: Number(localAuthoritative.x) || 0, y: Number(localAuthoritative.y) || 0},
          localAuthoritative,
          this.latestState?.map || {},
          collisionIndex,
          this.collisionQueryResult,
          this.latestState?.props,
        )
        if (Object.prototype.hasOwnProperty.call(localAuthoritative, "flying")) {
          players[this.playerId].flying = localAuthoritative.flying
        } else {
          delete players[this.playerId].flying
        }
      }
      this.correction.x = constrainedPresentation.x - this.predicted.x
      this.correction.y = constrainedPresentation.y - this.predicted.y
      players[this.playerId].x = constrainedPresentation.x
      players[this.playerId].y = constrainedPresentation.y
      // Position prediction already reacts to the current local command on
      // this frame. Keep the facing vector in the same time domain so
      // HeroView does not keep turning toward an older server snapshot after
      // the player changes direction.
      players[this.playerId].moveX = this.movementInput.x
      players[this.playerId].moveY = this.movementInput.y
      if (this.pendingLocalAttack && now <= this.pendingLocalAttack.expiresAt) {
        players[this.playerId].rotation = this.pendingLocalAttack.rotation
        players[this.playerId].attackPulse = this.pendingLocalAttack.attackPulse
      } else if (this.pendingLocalAttack) {
        this.pendingLocalAttack = null
      }
    }
    const monsters = syncInterpolatedMap(this.displayMonsters, older.monsters, newer.monsters, t)
    const bullets = syncInterpolatedList(
      this.displayBullets,
      older.bullets,
      newer.bullets,
      (bullet, index) => bullet.id ?? `${bullet.playerId || ""}:${bullet.kind || ""}:${index}`,
      t,
      this.displayBulletScratch,
    )
    const displayState = this.damagePrediction.applyToState(
      {...this.latestState, players, monsters, bullets, networkSmoothed: true},
      now,
      {mutateEntities: !copyEntities, smoothAuthoritativeDamage: true},
    )
    endBattlePerformance(perfToken)
    return displayState
  }
}
