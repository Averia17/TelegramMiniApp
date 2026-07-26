const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const lerp = (a, b, t) => a + (b - a) * t

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

const interpolateEntity = (older, newer, t) => ({
  ...newer,
  x: lerp(older.x, newer.x, t),
  y: lerp(older.y, newer.y, t),
  rotation: interpolateAngle(older.rotation, newer.rotation, t),
})

export class NetworkSimulation {
  constructor({interpolationDelay = 100} = {}) {
    this.interpolationDelay = interpolationDelay
    this.playerId = null
    this.snapshots = []
    this.latestState = null
    this.predicted = null
    this.correction = {x: 0, y: 0}
    this.input = {x: 0, y: 0}
    this.pendingInputs = []
    this.positionHistory = []
    this.clockOffset = null
  }

  setLocalPlayerId(id) {
    this.playerId = id == null ? null : String(id)
    this.seedLocalPlayer()
  }

  setInput(x, y, ack) {
    this.input = {x: Number(x) || 0, y: Number(y) || 0}
    if (Number.isFinite(ack)) this.pendingInputs.push({ack, ...this.input})
  }

  ingest(state) {
    if (!state || state.type !== "state") return
    const measuredOffset = Date.now() - Number(state.ts || Date.now())
    this.clockOffset = this.clockOffset == null ? measuredOffset : lerp(this.clockOffset, measuredOffset, .08)
    this.latestState = state
    this.snapshots.push(state)
    if (this.snapshots.length > 40) this.snapshots.shift()
    this.reconcile()
  }

  seedLocalPlayer() {
    const player = this.latestState?.players?.[this.playerId]
    if (player && !this.predicted) this.predicted = {x: player.x, y: player.y}
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
    const snapshotLocalTime = Number(this.latestState.ts)
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

  update(delta) {
    const player = this.latestState?.players?.[this.playerId]
    if (!player) return
    this.seedLocalPlayer()
    if (!this.predicted) return

    const magnitude = Math.hypot(this.input.x, this.input.y)
    if (magnitude > .001) {
      const distance = movementSpeed(player) * delta
      this.predicted.x += this.input.x / magnitude * distance
      this.predicted.y += this.input.y / magnitude * distance
    }

    const map = this.latestState.map || {}
    const radius = Number(player.radius) || 14
    this.predicted.x = clamp(this.predicted.x, radius, Math.max(radius, (map.width || radius) - radius))
    this.predicted.y = clamp(this.predicted.y, radius, Math.max(radius, (map.height || radius) - radius))
    this.predicted = resolveWalls(this.predicted, radius, map.walls)

    const correctionBlend = 1 - Math.exp(-12 * delta)
    this.predicted.x += this.correction.x * correctionBlend
    this.predicted.y += this.correction.y * correctionBlend
    this.correction.x *= 1 - correctionBlend
    this.correction.y *= 1 - correctionBlend
    const now = Date.now()
    this.positionHistory.push({time: now, x: this.predicted.x, y: this.predicted.y})
    while (this.positionHistory.length && this.positionHistory[0].time < now - 2000) this.positionHistory.shift()
  }

  getDisplayState(now = Date.now()) {
    if (!this.latestState) return null
    const targetTime = now - this.interpolationDelay
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
    const players = {...this.latestState.players}
    const ids = new Set([...Object.keys(older.players || {}), ...Object.keys(newer.players || {})])
    ids.forEach(id => {
      if (id === this.playerId) return
      const from = older.players?.[id]
      const to = newer.players?.[id]
      if (from && to) players[id] = interpolateEntity(from, to, t)
      else if (to) players[id] = to
    })
    if (this.playerId && players[this.playerId] && this.predicted) {
      players[this.playerId] = {...players[this.playerId], x: this.predicted.x, y: this.predicted.y}
    }
    return {...this.latestState, players, networkSmoothed: true}
  }
}
