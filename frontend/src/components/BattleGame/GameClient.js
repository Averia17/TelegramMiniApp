const GAME_MESSAGES = new Set([
  "joined",
  "left",
  "killed",
  "won",
  "timeout",
  "start",
  "stop",
  "waiting",
  "error",
  "you_died",
  "match_found",
])

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
    this.lastClientTs = 0
    this.abilitySequence = 0
    this.pendingAbilities = new Map()
  }

  connect() {
    this.ws = new WebSocket(this.url)
    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({type: "auth", token: this.accessToken}))
      this.connected = true
      this.onConnect?.()
    }
    this.ws.onclose = () => {
      this.connected = false
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
    if (message.type === "state") {
      const now = performance.now()
      this.stateTimes.push(now)
      while (this.stateTimes.length && this.stateTimes[0] < now - 1000) this.stateTimes.shift()
      this.stateHz = this.stateTimes.length
      // The server sends the expensive wall list only when its map revision changes.
      // Keep the last authoritative list for UI consumers such as the minimap.
      message.map = preserveAuthoritativeMapWalls(message.map, this.lastState?.map)
      this.lastState = message
      const local = this.playerId && message.players?.[this.playerId]
      if (local?.abilityAck) this.pendingAbilities.delete(local.abilityAck)
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
    this.send("shoot", {angle, aimDistance, autoAim})
  }

  ability(slot) {
    const clientId = `${this.playerId || "local"}:${++this.abilitySequence}`
    this.pendingAbilities.set(clientId, {slot, sentAt: Date.now()})
    this.send("ability", {slot, clientId})
    return clientId
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
  }
}
