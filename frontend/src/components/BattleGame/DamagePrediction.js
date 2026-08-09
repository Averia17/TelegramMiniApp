const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback

const entityKey = (targetType, targetId) => `${targetType}:${String(targetId)}`
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

const ingestEntity = (prediction, targetType, id, entity, now, seen) => {
  const key = entityKey(targetType, id)
  const lives = Math.max(0, finite(entity?.lives))
  const previous = prediction.authoritativeLives.get(key)
  // An HP delta is not enough to identify which local command caused it:
  // another player may have damaged this target in the same interval. Only
  // combat events are allowed to consume a matching prediction.
  if (previous !== undefined && lives < previous && prediction.pending.has(key)) {
    prediction.rollbackStarts.set(key, now)
  }
  if (lives <= 0) prediction.pending.delete(key)
  prediction.authoritativeLives.set(key, lives)
  seen.add(key)
}

const distanceToSegmentSquared = (point, from, to) => {
  const dx = finite(to?.x) - finite(from?.x)
  const dy = finite(to?.y) - finite(from?.y)
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= 0.000001) {
    const px = finite(point?.x) - finite(from?.x)
    const py = finite(point?.y) - finite(from?.y)
    return px * px + py * py
  }
  const t = clamp(((finite(point?.x) - finite(from?.x)) * dx + (finite(point?.y) - finite(from?.y)) * dy) / lengthSquared, 0, 1)
  const closestX = finite(from?.x) + dx * t
  const closestY = finite(from?.y) + dy * t
  const offsetX = finite(point?.x) - closestX
  const offsetY = finite(point?.y) - closestY
  return offsetX * offsetX + offsetY * offsetY
}

export const segmentHitsCircle = (from, to, center, radius) =>
  distanceToSegmentSquared(center, from, to) <= Math.max(0, finite(radius)) ** 2

export const lineHitsTarget = (origin, angle, range, target, padding = 0) => {
  const safeRange = Math.max(0, finite(range))
  const end = {
    x: finite(origin?.x) + Math.cos(finite(angle)) * safeRange,
    y: finite(origin?.y) + Math.sin(finite(angle)) * safeRange,
  }
  const targetRadius = Math.max(0, finite(target?.radius, 0)) + Math.max(0, finite(padding))
  return segmentHitsCircle(origin, end, target, targetRadius)
}

export class DamagePrediction {
  constructor({ttlMs = 360, rollbackMs = 120} = {}) {
    this.ttlMs = ttlMs
    this.rollbackMs = rollbackMs
    this.pending = new Map()
    this.authoritativeLives = new Map()
    this.presentationLives = new Map()
    this.rollbackStarts = new Map()
    this.processedEvents = new Map()
    this.lastExpireAt = null
  }

  ingest(state, now = Date.now()) {
    const seen = new Set()
    const players = state?.players || {}
    const monsters = state?.monsters || {}
    for (const id in players) {
      if (hasOwn(players, id)) ingestEntity(this, "players", id, players[id], now, seen)
    }
    for (const id in monsters) {
      if (hasOwn(monsters, id)) ingestEntity(this, "monsters", id, monsters[id], now, seen)
    }
    this.authoritativeLives.forEach((_, key) => {
      if (!seen.has(key)) {
        this.authoritativeLives.delete(key)
        this.pending.delete(key)
        this.presentationLives.delete(key)
        this.rollbackStarts.delete(key)
      }
    })
    this.expire(now)
  }

  reconcileEvents(events = [], now = Date.now()) {
    for (const event of events || []) {
      const eventId = String(event?.id ?? "")
      if (!eventId || this.processedEvents.has(eventId)) continue
      this.processedEvents.set(eventId, now)

      const commandId = String(event?.commandId || "")
      if (event?.kind === "hit" && commandId) {
        this.removePending(entry => entry.commandId === commandId &&
          entry.targetType === event.targetType &&
          String(entry.targetId) === String(event.targetId), now)
        const key = entityKey(event.targetType, event.targetId)
        const damage = Math.max(0, finite(event.damage))
        if (damage > 0) {
          const entries = this.pending.get(key) || []
          entries.forEach(entry => {
            entry.baseLives = Math.max(0, Math.min(entry.baseLives, entry.baseLives - damage))
          })
        }
      }
      if (event?.kind === "attack" && commandId && (!event.accepted || event.resolved)) {
        this.removePending(entry => entry.commandId === commandId, now)
      }
    }
    this.processedEvents.forEach((seenAt, id) => {
      if (now - seenAt > this.ttlMs * 8) this.processedEvents.delete(id)
    })
  }

  removePending(predicate, now = Date.now()) {
    this.pending.forEach((entries, key) => {
      const remaining = entries.filter(entry => !predicate(entry))
      if (remaining.length > 0) this.pending.set(key, remaining)
      else {
        if (entries.length > 0) this.rollbackStarts.set(key, now)
        this.pending.delete(key)
      }
    })
  }

  predictDamage({targetType = "players", targetId, damage, id, commandId = "", now = Date.now()}) {
    const key = entityKey(targetType, targetId)
    const lives = this.authoritativeLives.get(key)
    const amount = Math.max(0, finite(damage))
    if (lives === undefined || lives <= 0 || amount <= 0) return null
    const predictionId = String(id || `${key}:${now}:${Math.random().toString(36).slice(2)}`)
    const entries = this.pending.get(key) || []
    if (entries.some(entry => entry.id === predictionId)) return predictionId
    entries.push({
      id: predictionId,
      commandId: String(commandId || ""),
      targetType,
      targetId: String(targetId),
      amount,
      // If the authoritative HP moves below this baseline before the matching
      // event arrives, do not subtract the speculative amount again.
      baseLives: lives,
      expiresAt: now + this.ttlMs,
    })
    this.pending.set(key, entries)
    return predictionId
  }

  consume(key, observedDamage) {
    let remaining = Math.max(0, finite(observedDamage))
    const entries = this.pending.get(key) || []
    while (remaining > 0 && entries.length > 0) {
      const entry = entries[0]
      const consumed = Math.min(entry.amount, remaining)
      entry.amount -= consumed
      remaining -= consumed
      if (entry.amount <= 0.0001) entries.shift()
    }
    if (entries.length === 0) this.pending.delete(key)
  }

  expire(now = Date.now()) {
    if (this.lastExpireAt === now) return
    this.lastExpireAt = now
    this.pending.forEach((entries, key) => {
      const active = entries.filter(entry => entry.expiresAt > now && entry.amount > 0.0001)
      if (active.length > 0) this.pending.set(key, active)
      else {
        if (entries.length > 0) this.rollbackStarts.set(key, Math.min(...entries.map(entry => entry.expiresAt)))
        this.pending.delete(key)
      }
    })
  }

  pendingDamage(key, authoritativeLives, now) {
    this.expire(now)
    return (this.pending.get(key) || []).reduce((total, entry) =>
      entry.baseLives <= authoritativeLives + 0.001 ? total + entry.amount : total, 0)
  }

  hasPending(targetType, targetId, now = Date.now()) {
    const lives = this.authoritativeLives.get(entityKey(targetType, targetId)) || 0
    return this.pendingDamage(entityKey(targetType, targetId), lives, now) > 0
  }

  displayLives(targetType, targetId, authoritativeLives, maxLives, now = Date.now()) {
    const key = entityKey(targetType, targetId)
    const authoritative = Math.max(0, finite(authoritativeLives))
    const maximum = Math.max(1, finite(maxLives, authoritative || 1))
    const speculative = this.pendingDamage(key, authoritative, now)
    const desired = authoritative <= 0
      ? 0
      // Never predict death. Death/visibility must be server-confirmed.
      : Math.max(1, Math.min(maximum, authoritative - speculative))
    const previous = this.presentationLives.get(key)
    if (!previous) {
      this.presentationLives.set(key, {value: desired, target: desired, changedAt: now})
      return Math.round(desired)
    }
    if (desired <= previous.value) {
      previous.value = desired
      previous.target = desired
      previous.changedAt = now
      this.rollbackStarts.delete(key)
      return Math.round(desired)
    }
    if (previous.target !== desired) {
      previous.target = desired
      previous.changedAt = this.rollbackStarts.get(key) ?? now
    }
    const progress = clamp((now - previous.changedAt) / Math.max(1, this.rollbackMs), 0, 1)
    previous.value += (previous.target - previous.value) * progress
    if (progress >= 1) {
      previous.value = previous.target
      this.rollbackStarts.delete(key)
    }
    return Math.round(previous.value)
  }

  applyToState(state, now = Date.now(), {mutateEntities = false} = {}) {
    this.expire(now)
    const players = mutateEntities ? (state?.players || {}) : Object.fromEntries(Object.entries(state?.players || {}).map(([id, entity]) => [id, {...entity}]))
    const monsters = mutateEntities ? (state?.monsters || {}) : Object.fromEntries(Object.entries(state?.monsters || {}).map(([id, entity]) => [id, {...entity}]))
    Object.entries(players).forEach(([id, entity]) => {
      entity.lives = this.displayLives("players", id, this.authoritativeLives.get(entityKey("players", id)) ?? entity?.lives, entity?.maxLives, now)
    })
    Object.entries(monsters).forEach(([id, entity]) => {
      entity.lives = this.displayLives("monsters", id, this.authoritativeLives.get(entityKey("monsters", id)) ?? entity?.lives, entity?.maxLives, now)
    })
    return {...state, players, monsters}
  }
}
