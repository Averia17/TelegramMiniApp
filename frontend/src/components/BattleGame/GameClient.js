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
  "battle_recovered",
  "party_state",
  "taunt",
])

import {recordBattleMetric} from "./rendering/shared/performance.js"
import {preserveAuthoritativeMapWalls} from "./mapContract.js"
import {getNetworkQuality} from "./networkQuality.js"
import {COMBAT_PROFILE_ID, COMBAT_RULES_VERSION} from "./combatProfile.generated.js"

const COMBAT_EVENT_SCHEMA_VERSION = 1

export {preserveAuthoritativeMapWalls}

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
    this.lastStateReceivedWallClock = 0
    this.lastStateTimestamp = null
    this.lastClientTs = 0
    this.abilitySequence = 0
    this.shootSequence = 0
    this.pendingAbilities = new Map()
    this.activeAbilityClientId = null
    this.onShootPrediction = null
    this.clockOffset = null
    this.clockSyncRequests = new Map()
    this.clockSyncSamples = []
    this.clockSyncTimer = null
    this.leaveBattleResolver = null
    this.leaveBattleTimer = null
    this.combatCompatible = true
  }

  connect() {
    const previousSocket = this.ws
    if (this.clockSyncTimer) clearInterval(this.clockSyncTimer)
    this.clockSyncTimer = null
    this.clockSyncRequests.clear()
    if (this.leaveBattleTimer) clearTimeout(this.leaveBattleTimer)
    this.leaveBattleTimer = null
    this.leaveBattleResolver?.(false)
    this.leaveBattleResolver = null
    this.connected = false
    this.ws = null
    previousSocket?.close()

    const socket = new WebSocket(this.url)
    this.ws = socket
    socket.onopen = () => {
      if (this.ws !== socket) return
      socket.send(JSON.stringify({
        type: "auth",
        token: this.accessToken,
        combatProfileId: COMBAT_PROFILE_ID,
        combatRulesVersion: COMBAT_RULES_VERSION,
        eventSchemaVersion: COMBAT_EVENT_SCHEMA_VERSION,
      }))
      this.connected = true
      this.onConnect?.()
      this.clockSyncTimer = setInterval(() => this.syncClock(), 2000)
    }
    socket.onclose = event => {
      if (this.ws !== socket) return
      this.ws = null
      this.connected = false
      if (this.clockSyncTimer) clearInterval(this.clockSyncTimer)
      this.clockSyncTimer = null
      this.clockSyncRequests.clear()
      this.onDisconnect?.(event)
    }
    socket.onerror = error => {
      if (this.ws === socket) console.error("WebSocket error:", error)
    }
    socket.onmessage = event => {
      if (this.ws !== socket) return
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
      if (!this.validateCombatVersion(message)) return
      const stateTimestamp = Number(message.ts)
      // A reconnect or transport retry can deliver an older frame after the
      // current one. Do not wake the renderer for a state it cannot present.
      if (Number.isFinite(stateTimestamp) && this.lastStateTimestamp != null && stateTimestamp <= this.lastStateTimestamp) return
      const now = performance.now()
      if (this.lastStateReceivedAt > 0) {
        recordBattleMetric("network.snapshot_interval", now - this.lastStateReceivedAt)
      }
      this.lastStateReceivedAt = now
      this.lastStateReceivedWallClock = Date.now()
      if (Number.isFinite(stateTimestamp)) this.lastStateTimestamp = stateTimestamp
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
      if (!this.validateCombatVersion(message.params)) return
      this.playerId = message.params?.playerId
      this.onMessage?.(message)
      return
    }
    if (message.type === "battle_left") {
      if (this.leaveBattleTimer) clearTimeout(this.leaveBattleTimer)
      this.leaveBattleTimer = null
      const resolve = this.leaveBattleResolver
      this.leaveBattleResolver = null
      resolve?.(true)
      return
    }
    if (GAME_MESSAGES.has(message.type)) this.onMessage?.(message)
  }

  validateCombatVersion(value) {
    const profileId = value?.combatProfileId
    const rulesVersion = value?.combatRulesVersion
    const eventSchemaVersion = value?.eventSchemaVersion
    if (
      (profileId && profileId !== COMBAT_PROFILE_ID) ||
      (rulesVersion && rulesVersion !== COMBAT_RULES_VERSION) ||
      (eventSchemaVersion && Number(eventSchemaVersion) !== COMBAT_EVENT_SCHEMA_VERSION)
    ) {
      if (this.combatCompatible) {
        this.combatCompatible = false
        this.onMessage?.({type: "error", params: {message: "Unsupported combat version"}})
      }
      return false
    }
    return true
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

  findMatch(playerName, heroName, profile = {}) {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({
      type: "find_match",
      playerName: playerName || "Player",
      heroName: heroName || "",
      ...(profile.mode ? {mode: profile.mode} : {}),
      ...(profile.mapName ? {roomMap: profile.mapName} : {}),
      ...(profile.maxPlayers ? {maxPlayers: profile.maxPlayers} : {}),
      ...(profile.partyId ? {partyId: profile.partyId} : {}),
      ...(profile.partySize ? {partySize: profile.partySize} : {}),
      ...(profile.partyTicket ? {partyTicket: profile.partyTicket} : {}),
    }))
  }

  recoverBattle(roomId = "") {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({type: "recover_battle", ...(roomId ? {roomId} : {})}))
  }

  createParty(maxSize = 3, partyId = "") {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({type: "party_create", maxSize, ...(partyId ? {partyId} : {})}))
  }

  joinParty(partyId, maxSize = 3, partyTicket = "") {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({type: "party_join", partyId, maxSize, ...(partyTicket ? {partyTicket} : {})}))
  }

  leaveParty() {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({type: "party_leave"}))
  }

  leaveBattle() {
    if (this.ws?.readyState !== WebSocket.OPEN) return Promise.resolve(false)
    if (this.leaveBattleResolver) return new Promise(resolve => {
      const previousResolve = this.leaveBattleResolver
      this.leaveBattleResolver = result => {
        previousResolve(result)
        resolve(result)
      }
    })
    const socket = this.ws
    return new Promise(resolve => {
      this.leaveBattleResolver = resolve
      this.leaveBattleTimer = setTimeout(() => {
        if (this.leaveBattleResolver !== resolve) return
        this.leaveBattleResolver = null
        this.leaveBattleTimer = null
        resolve(false)
      }, 1000)
      try {
        socket.send(JSON.stringify({type: "leave_battle"}))
      } catch {
        if (this.leaveBattleTimer) clearTimeout(this.leaveBattleTimer)
        this.leaveBattleTimer = null
        this.leaveBattleResolver = null
        resolve(false)
      }
    })
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

  getNetworkQuality(now = Date.now()) {
    return getNetworkQuality({
      connected: this.connected,
      lastStateReceivedAt: this.lastStateReceivedWallClock,
      stateHz: this.stateHz,
      clockSyncSamples: this.clockSyncSamples,
      now,
    })
  }

  ability(slot, targetId = undefined, input = undefined) {
    const clientId = `${this.playerId || "local"}:${++this.abilitySequence}`
    this.pendingAbilities.set(clientId, {slot, sentAt: Date.now()})
    if (slot === "primary") this.activeAbilityClientId = clientId
    this.send("ability", {
      slot,
      clientId,
      ...(targetId ? {targetId} : {}),
      ...(input?.aimProvided ? {
        aimAngle: input.aimAngle,
        aimDistance: input.aimDistance,
        aimProvided: true,
      } : {}),
    })
    return clientId
  }

  cancelAbility() {
    const clientId = `${this.playerId || "local"}:cancel:${++this.abilitySequence}`
    const targetClientId = this.activeAbilityClientId
    this.activeAbilityClientId = null
    this.pendingAbilities.set(clientId, {slot: "primary", sentAt: Date.now()})
    this.send("ability_cancel", {clientId, ...(targetClientId ? {targetClientId} : {})})
    return clientId
  }

  taunt(tauntId = "clown_laugh", targetId = undefined) {
    return this.send("taunt", {tauntId, ...(targetId ? {targetId} : {})})
  }

  disconnect() {
    if (this.clockSyncTimer) clearInterval(this.clockSyncTimer)
    this.clockSyncTimer = null
    this.clockSyncRequests.clear()
    if (this.leaveBattleTimer) clearTimeout(this.leaveBattleTimer)
    this.leaveBattleTimer = null
    this.leaveBattleResolver?.(false)
    this.leaveBattleResolver = null
    const socket = this.ws
    this.ws = null
    this.connected = false
    socket?.close()
  }
}
