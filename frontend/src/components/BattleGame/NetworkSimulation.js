import {DamagePrediction} from "./DamagePrediction.js"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const lerp = (a, b, t) => a + (b - a) * t
const MAX_SIMULATION_STEP = .05
const MAX_CATCH_UP_TIME = .25
const SCREEN_DEPTH_SCALE = .66

const worldAngleFromScreen = angle => Math.atan2(Math.sin(angle) / SCREEN_DEPTH_SCALE, Math.cos(angle))

const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

const isDefended = entity =>
  Number(entity?.invulnerable) > 0 ||
  Number(entity?.shield) > 0 ||
  Number(entity?.shieldHp) > 0 ||
  Number(entity?.shieldStacks) > 0 ||
  (Number(entity?.stealth) > 0 && Number(entity?.dodges) > 0)

const canDamage = (source, target) =>
  target && Number(target.lives) > 0 &&
  String(source?.playerId || "") !== String(target.playerId || "") &&
  (!source?.team || source.team !== target.team) &&
  !isDefended(target)

const targetEntries = (players = {}, monsters = {}) => [
  ...Object.entries(players).map(([id, entity]) => ({type: "players", id, entity})),
  ...Object.entries(monsters).map(([id, entity]) => ({type: "monsters", id, entity})),
]

const distanceBetween = (a, b) => Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.y || 0) - Number(b?.y || 0))

const attackDamage = player => {
  let damage = Number(player?.attackDamage) || 0
  damage *= Math.max(1, Number(player?.damageMultiplier) || 1)
  if (player?.hero === "Mandy" && Number(player?.focusCharge) >= 100) damage *= 1.4
  return damage > 0 ? Math.max(1, Math.round(damage)) : 0
}

const blockingWall = wall => wall.type !== "half" && wall.type !== "bush"

const resolveWalls = (position, radius, walls) => {
  let {x, y} = position
  for (const wall of walls || []) {
    if (!blockingWall(wall)) continue
    const closestX = clamp(x, wall.minX, wall.maxX)
    const closestY = clamp(y, wall.minY, wall.maxY)
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
      {distance: Math.abs(x - wall.minX), x: wall.minX - radius, y},
      {distance: Math.abs(wall.maxX - x), x: wall.maxX + radius, y},
      {distance: Math.abs(y - wall.minY), x, y: wall.minY - radius},
      {distance: Math.abs(wall.maxY - y), x, y: wall.maxY + radius},
    ]
    const nearest = choices.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best)
    x = nearest.x
    y = nearest.y
  }
  return {x, y}
}

const movementSpeed = player => {
  let speed = Number(player?.speed) || 0
  if (Number(player?.haste) > 0) speed *= 1.22
  if (Number(player?.slow) > 0) speed *= .45
  if (Number(player?.stun) > 0) speed = 0
  return speed
}

const interpolateAngle = (a = 0, b = 0, t) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t

const updateInterpolatedEntity = (target, older, newer, t) => {
  Object.assign(target, newer)
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
  Object.keys(cache).forEach(id => {
    if (!Object.prototype.hasOwnProperty.call(nextMap, id)) delete cache[id]
  })
  Object.entries(nextMap).forEach(([id, newerEntity]) => {
    const olderEntity = previousMap[id]
    const target = cache[id] || (cache[id] = {})
    if (olderEntity) updateInterpolatedEntity(target, olderEntity, newerEntity, t)
    else Object.assign(target, newerEntity)
  })
  return cache
}

const syncInterpolatedList = (cache, older = [], newer = [], keyOf, t) => {
  const previousList = Array.isArray(older) ? older : []
  const nextList = Array.isArray(newer) ? newer : []
  const previous = new Map(previousList.map((entity, index) => [String(keyOf(entity, index)), entity]))
  const active = new Set()
  const result = nextList.map((newerEntity, index) => {
    const key = String(keyOf(newerEntity, index))
    active.add(key)
    const olderEntity = previous.get(key)
    const target = cache.get(key) || {}
    cache.set(key, target)
    if (olderEntity) updateInterpolatedEntity(target, olderEntity, newerEntity, t)
    else Object.assign(target, newerEntity)
    return target
  })
  cache.forEach((value, key) => {
    if (!active.has(key)) cache.delete(key)
  })
  return result
}

export class NetworkSimulation {
  constructor({interpolationDelay = 100} = {}) {
    this.interpolationDelay = interpolationDelay
    this.playerId = null
    this.snapshots = []
    this.latestState = null
    this.predicted = null
    this.correction = {x: 0, y: 0}
    this.input = {x: 0, y: 0}
    this.movementInput = {x: 0, y: 0}
    this.pendingInputs = []
    this.positionHistory = []
    this.clockOffset = null
    this.damagePrediction = new DamagePrediction()
    this.displayPlayers = {}
    this.displayMonsters = {}
    this.displayBullets = new Map()
    this.displayTotems = new Map()
  }

  setLocalPlayerId(id) {
    this.playerId = id == null ? null : String(id)
    this.seedLocalPlayer()
  }

  setInput(x, y, ack) {
    const nextInput = {x: Number(x) || 0, y: Number(y) || 0}
    this.input = nextInput
    this.movementInput = nextInput
    if (Number.isFinite(ack)) this.pendingInputs.push({ack, ...this.input})
  }

  ingest(state) {
    if (!state || state.type !== "state") return
    const measuredOffset = Date.now() - Number(state.ts || Date.now())
    this.clockOffset = this.clockOffset == null ? measuredOffset : lerp(this.clockOffset, measuredOffset, .08)
    this.latestState = state
    this.damagePrediction.ingest(state)
    this.damagePrediction.reconcileEvents(state.combatEvents, Date.now())
    this.snapshots.push(state)
    if (this.snapshots.length > 40) this.snapshots.shift()
    this.reconcile()
  }

  predictLocalShoot({angle, autoAim = false, commandId = "", now = Date.now()} = {}) {
    if (autoAim) return []
    const state = this.latestState
    const sourceId = this.playerId
    const sourceState = state?.players?.[sourceId]
    if (state?.game?.state !== "game" || !sourceState || Number(sourceState.lives) <= 0 || Number(sourceState.ammo) <= 0) return []
    if (Number(sourceState.stun) > 0 || Number(sourceState.channel) > 0) return []

    const source = {
      ...sourceState,
      ...(this.predicted ? {x: this.predicted.x, y: this.predicted.y} : {}),
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
      if (!canDamage(source, entity)) return
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
    if (player && !this.predicted) this.predicted = {x: player.x, y: player.y}
  }

  serverTimeToLocal(serverTime) {
    return Number(serverTime) + (this.clockOffset || 0)
  }

  localTimeToServer(localTime) {
    return Number(localTime) - (this.clockOffset || 0)
  }

  reconcile() {
    const authoritative = this.latestState?.players?.[this.playerId]
    if (!authoritative) return
    this.pendingInputs = this.pendingInputs.filter(input => input.ack > Number(authoritative.ack || 0))
    if (!this.predicted) {
      this.predicted = {x: authoritative.x, y: authoritative.y}
      return
    }
    // Both protocol timestamps are Unix milliseconds. Network transit time is
    // not clock skew: adding it here compares an old authoritative position to
    // the current predicted frame and creates a visible backward correction.
    const snapshotLocalTime = this.serverTimeToLocal(this.latestState.ts)
    const historical = this.positionHistory.reduce((nearest, sample) =>
      !nearest || Math.abs(sample.time - snapshotLocalTime) < Math.abs(nearest.time - snapshotLocalTime) ? sample : nearest, null)
    const comparison = historical || this.predicted
    const errorX = authoritative.x - comparison.x
    const errorY = authoritative.y - comparison.y
    const error = Math.hypot(errorX, errorY)
    if (error > Math.max(90, (authoritative.radius || 14) * 4) || authoritative.lives <= 0) {
      this.predicted = {x: authoritative.x, y: authoritative.y}
      this.correction = {x: 0, y: 0}
    } else {
      this.correction.x += errorX
      this.correction.y += errorY
      this.positionHistory.forEach(sample => {
        sample.x += errorX
        sample.y += errorY
      })
    }
  }

  advance(delta) {
    let remaining = clamp(Number(delta) || 0, 0, MAX_CATCH_UP_TIME)
    while (remaining > 0) {
      const step = Math.min(remaining, MAX_SIMULATION_STEP)
      this.update(step)
      remaining -= step
    }
  }

  update(delta) {
    const player = this.latestState?.players?.[this.playerId]
    if (!player) return
    this.seedLocalPlayer()
    if (!this.predicted) return

    const magnitude = Math.hypot(this.movementInput.x, this.movementInput.y)
    if (magnitude > .001) {
      const distance = movementSpeed(player) * delta
      this.predicted.x += this.movementInput.x / magnitude * distance
      this.predicted.y += this.movementInput.y / magnitude * distance
    }

    const correctionBlend = 1 - Math.exp(-12 * delta)
    this.predicted.x += this.correction.x * correctionBlend
    this.predicted.y += this.correction.y * correctionBlend
    this.correction.x *= 1 - correctionBlend
    this.correction.y *= 1 - correctionBlend

    const map = this.latestState.map || {}
    const radius = Number(player.radius) || 14
    this.predicted.x = clamp(this.predicted.x, radius, Math.max(radius, (map.width || radius) - radius))
    this.predicted.y = clamp(this.predicted.y, radius, Math.max(radius, (map.height || radius) - radius))
    this.predicted = resolveWalls(this.predicted, radius, map.walls)
    const now = Date.now()
    this.positionHistory.push({time: now, x: this.predicted.x, y: this.predicted.y})
    while (this.positionHistory.length && this.positionHistory[0].time < now - 2000) this.positionHistory.shift()
  }

  getDisplayState(now = Date.now(), {copyEntities = false} = {}) {
    if (!this.latestState) return null
    const targetTime = this.localTimeToServer(now - this.interpolationDelay)
    let older = this.snapshots[0] || this.latestState
    let newer = this.latestState
    for (let index = 1; index < this.snapshots.length; index += 1) {
      const candidate = this.snapshots[index]
      if (candidate.ts >= targetTime) {
        newer = candidate
        older = this.snapshots[index - 1]
        break
      }
      older = candidate
    }
    const span = Math.max(1, Number(newer.ts) - Number(older.ts))
    const t = clamp((targetTime - Number(older.ts)) / span, 0, 1)
    const players = syncInterpolatedMap(this.displayPlayers, older.players, newer.players, t)
    if (this.playerId && players[this.playerId] && this.predicted) {
      players[this.playerId].x = this.predicted.x
      players[this.playerId].y = this.predicted.y
    }
    const monsters = syncInterpolatedMap(this.displayMonsters, older.monsters, newer.monsters, t)
    const bullets = syncInterpolatedList(
      this.displayBullets,
      older.bullets,
      newer.bullets,
      (bullet, index) => bullet.id ?? `${bullet.playerId || ""}:${bullet.kind || ""}:${index}`,
      t,
    )
    const totems = syncInterpolatedList(this.displayTotems, older.totems, newer.totems, (totem, index) => totem.owner ?? index, t)
    return this.damagePrediction.applyToState(
      {...this.latestState, players, monsters, bullets, totems, networkSmoothed: true},
      now,
      {mutateEntities: !copyEntities},
    )
  }
}
