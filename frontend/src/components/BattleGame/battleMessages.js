const paramsOf = message => (message?.params && typeof message.params === "object" ? message.params : {})

export const formatBattleMessage = message => {
  const params = paramsOf(message)
  switch (message?.type) {
  case "killed":
    return `${params.killerName || "Someone"} killed ${params.killedName || "a fighter"}`
  case "won":
    return `${params.name || "Someone"} won!`
  case "joined":
    return `${params.name || "A fighter"} joined as ${params.hero || "Unknown"}`
  case "left":
    return `${params.name || "A fighter"} left`
  case "start":
    return "Game started!"
  case "stop":
    return "Game over"
  case "timeout":
    return "Time out!"
  case "waiting":
    return "Waiting for players..."
  case "room_joined":
    return params.roomName ? `Joined ${params.roomName}` : "Joined the battle room"
  case "match_found":
    return "Match found!"
  case "error":
    return params.message || "Battle connection error"
  case "you_died":
    return params.killerName ? `You died — ${params.killerName} got you` : "You died"
  case "island_phase":
    return params.phase ? `Island phase: ${params.phase}` : "Island phase changed"
  case "taunt":
    return `${params.playerName || "Боец"} 🤡${params.targetName ? ` ${params.targetName}` : ""}`
  default:
    return ""
  }
}
