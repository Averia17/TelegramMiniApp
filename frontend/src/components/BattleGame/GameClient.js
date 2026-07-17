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

export class GameClient {
  constructor(url, onStateUpdate, onMessage, onConnect, onDisconnect) {
    this.url = url
    this.onStateUpdate = onStateUpdate
    this.onMessage = onMessage
    this.onConnect = onConnect
    this.onDisconnect = onDisconnect
    this.ws = null
    this.playerId = null
    this.connected = false
    this.lastState = null
  }

  connect() {
    this.ws = new WebSocket(this.url)
    this.ws.onopen = () => {
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
        this.handleMessage(JSON.parse(event.data))
      } catch (error) {
        console.error("Battle message parse error:", error)
      }
    }
  }

  handleMessage(message) {
    if (message.type === "state") {
      this.lastState = message
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
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({type, ts: Date.now(), value}))
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
    this.send("move", {x, y})
  }

  rotate(rotation) {
    this.send("rotate", {rotation})
  }

  shoot(angle) {
    this.send("shoot", {angle})
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
  }
}
