const GAME_MESSAGES = new Set([
  "joined",
  "left",
  "killed",
  "won",
  "timeout",
  "start",
  "island_phase",
  "island_voice",
  "stop",
  "waiting",
  "error",
  "you_died",
  "match_found",
])

import {recordBattleMetric} from "./rendering/shared/performance.js"

export const preserveAuthoritativeMapWalls = (map, previousMap) => {
  const previousWalls = previousMap?.walls
  const incomingWalls = map?.walls
  if (!Array.isArray(previousWalls) || previousWalls.length === 0) return map
  if (Array.isArray(incomingWalls) && incomingWalls.length > 0) return map
  if (map?.width !== previousMap.width || map?.height !== previousMap.height) return map
  return {...map, walls: previousWalls}
}

export class GameClient {
  constructor(url, accessToken, onStateUpdate, onMessage, onConnect, onDisconnect) {
    this.url = url
    this.accessToken = accessToken
    this.onStateUpdate = onStateUpdate
    this.onMessage = onMessage
    this.onConnect = onConnect
    this.onDisconnect = onDisconnect
    this.ws = null
    this.playerId = null
    this.connected = false
    this.lastState = null
    this.stateTimes = []
    this.stateHz = 0
    this.lastStateBytes = 0
    this.lastStateReceivedAt = 0
    this.lastClientTs = 0
    this.abilitySequence = 0
    this.shootSequence = 0
    this.pendingAbilities = new Map()
    this.onShootPrediction = null
    this.clockOffset = null
    this.clockSyncRequests = new Map()
    this.clockSyncSamples = []
    this.clockSyncTimer = null
  }

  connect() {
    this.ws = new WebSocket(this.url)
    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({type: "auth", token: this.accessToken}))
      this.connected = true
      this.onConnect?.()
      this.clockSyncTimer = setInterval(() => this.syncClock(), 2000)
    }
    this.ws.onclose = () => {
      this.connected = false
      if (this.clockSyncTimer) clearInterval(this.clockSyncTimer)
      this.clockSyncTimer = null
      this.onDisconnect?.()
    }
    this.ws.onerror = error => console.error("WebSocket error:", error)
    this.ws.onmessage = event => {
      try {
        this.lastStateBytes = typeof event.data === "string" ? event.data.length : 0
        this.handleMessage(JSON.parse(event.data))
      } catch (error) {
        console.error("Battle message parse error:", error)
      }
    }
  }

  handleMessage(message) {
    if (message.type === "clock_sync") {
      const clientTs = Number(message.params?.clientTs)
      const serverTs = Number(message.params?.serverTs)
      if (Number.isFinite(clientTs) && Number.isFinite(serverTs)) {
        const receiveTs = Date.now()
        const measuredOffset = (clientTs + receiveTs) / 2 - serverTs
        const request = this.clockSyncRequests.get(clientTs)
        this.clockSyncRequests.delete(clientTs)
        if (request) {
          const roundTripMs = Math.max(0, performance.now() - request.sentAt)
          this.clockSyncSamples.push({offset: measuredOffset, roundTripMs})
          if (this.clockSyncSamples.length > 8) this.clockSyncSamples.shift()
          // A delayed browser task can make receiveTs much later than the
          // packet arrival. Prefer the lowest-RTT recent sample instead of
          // turning that scheduling pause into clock skew.
          const bestSample = this.clockSyncSamples.reduce((best, sample) =>
            !best || sample.roundTripMs < best.roundTripMs ? sample : best, null)
          this.clockOffset = bestSample?.offset ?? measuredOffset
          recordBattleMetric("network.clock_offset", this.clockOffset, {
            roundTripMs: Math.round(bestSample?.roundTripMs || 0),
          })
        } else {
          // Keep direct handleMessage callers and older servers compatible
          // when there is no locally tracked request timestamp.
          this.clockOffset = this.clockOffset == null
            ? measuredOffset
            : this.clockOffset + (measuredOffset - this.clockOffset) * 0.2
        }
      }
      return
    }
    if (message.type === "state") {
      const now = performance.now()
      if (this.lastStateReceivedAt > 0) {
        recordBattleMetric("network.snapshot_interval", now - this.lastStateReceivedAt)
      }
      this.lastStateReceivedAt = now
      if (Number.isFinite(Number(message.ts))) {
        recordBattleMetric(
          "network.snapshot_age",
          Date.now() - (Number(message.ts) + (this.clockOffset || 0)),
          {state: message.game?.state || "unknown"},
        )
      }
      recordBattleMetric("network.snapshot_bytes", this.lastStateBytes)
      this.stateTimes.push(now)
      while (this.stateTimes.length && this.stateTimes[0] < now - 1000) this.stateTimes.shift()
      this.stateHz = this.stateTimes.length
      // The server sends the expensive wall list only when its map revision changes.
      // Keep the last authoritative list for UI consumers such as the minimap.
      message.map = preserveAuthoritativeMapWalls(message.map, this.lastState?.map)
      this.lastState = message
      const local = this.playerId && message.players?.[this.playerId]
      if (local?.abilityAck) {
        const pending = this.pendingAbilities.get(local.abilityAck)
        if (pending) {
          recordBattleMetric("network.ability_ack", Date.now() - pending.sentAt, {slot: pending.slot})
          this.pendingAbilities.delete(local.abilityAck)
        }
      }
      this.onStateUpdate?.(message)
      return
    }
    if (message.type === "room_joined") {
      this.playerId = message.params?.playerId
      this.onMessage?.(message)
      return
    }
    if (GAME_MESSAGES.has(message.type)) this.onMessage?.(message)
  }

  send(type, value) {
    if (this.ws?.readyState !== WebSocket.OPEN) return null
    const ts = Math.max(Date.now(), this.lastClientTs + 1)
    this.lastClientTs = ts
    this.ws.send(JSON.stringify({type, ts, value}))
    return ts
  }

  joinById(roomId, playerName, heroName) {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({
      type: "join_by_id",
      roomId,
      playerName: playerName || "Player",
      heroName: heroName || "",
    }))
  }

  findMatch(playerName, heroName) {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({
      type: "find_match",
      playerName: playerName || "Player",
      heroName: heroName || "",
    }))
  }

  move(x, y) {
    return this.send("move", {x, y})
  }

  rotate(rotation, aimDistance = 0) {
    this.send("rotate", {rotation, aimDistance})
  }

  setAiming(aiming) {
    this.send("aiming", {aiming: Boolean(aiming)})
  }

  shoot(angle, aimDistance = Infinity, autoAim = false) {
    const commandId = `${this.playerId || "local"}:shoot:${++this.shootSequence}`
    const ts = this.send("shoot", {angle, aimDistance, autoAim, clientId: commandId})
    if (ts !== null) this.onShootPrediction?.({angle, aimDistance, autoAim, commandId, now: ts})
    return ts
  }

  syncClock() {
    if (this.ws?.readyState !== WebSocket.OPEN) return null
    const clientTs = Date.now()
    this.clockSyncRequests.set(clientTs, {sentAt: performance.now()})
    const sentTs = this.send("clock_sync", {clientTs})
    if (sentTs === null) this.clockSyncRequests.delete(clientTs)
    return sentTs
  }

  setShootPrediction(handler) {
    this.onShootPrediction = typeof handler === "function" ? handler : null
  }

  ability(slot, targetId = undefined) {
    const clientId = `${this.playerId || "local"}:${++this.abilitySequence}`
    this.pendingAbilities.set(clientId, {slot, sentAt: Date.now()})
    this.send("ability", {slot, clientId, ...(targetId ? {targetId} : {})})
    return clientId
  }

  disconnect() {
    if (this.clockSyncTimer) clearInterval(this.clockSyncTimer)
    this.clockSyncTimer = null
    this.ws?.close()
    this.ws = null
  }
}
