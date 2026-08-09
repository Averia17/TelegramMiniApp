const DEFAULT_GAME_DURATION_MS = 5 * 60 * 1000

export const getPlayerBattleStats = (state, playerId, now = Date.now(), {eliminated = false} = {}) => {
  const player = state?.players?.[playerId]
  if (!player) return {}
  const isAlive = Number(player.lives) > 0
  const visibleAliveOpponents = Object.entries(state.players || {}).filter(
    ([id, candidate]) => id !== String(playerId) && Number(candidate?.lives) > 0,
  ).length
  const authoritativeAlive = Number(state?.game?.alivePlayers)
  const aliveOpponents = Number.isFinite(authoritativeAlive)
    ? Math.max(0, authoritativeAlive - (isAlive ? 1 : 0))
    : visibleAliveOpponents
  const gameEndsAt = Number(state?.game?.gameEndsAt) || 0
  const startedAt = gameEndsAt ? gameEndsAt - DEFAULT_GAME_DURATION_MS : 0
  return {
    place: isAlive && !eliminated ? 1 : aliveOpponents + 1,
    kills: player.kills || 0,
    monsters: player.monsters || player.monsterKills || 0,
    duration: startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0,
  }
}

export const getBattlePlayerCount = state => {
  const authoritative = Number(state?.game?.alivePlayers)
  if (Number.isFinite(authoritative)) return Math.max(0, authoritative)
  return Object.values(state?.players || {}).filter(player => Number(player?.lives) > 0).length
}

export const getSynchronizedBattleView = (authoritativeState, currentView) => {
  if (["dead", "result", "timeout"].includes(currentView)) return null
  if (authoritativeState === "game") return "game"
  if (authoritativeState === "lobby" && currentView !== "connecting") return "lobby"
  return null
}

export const getStateBattleResult = (state, playerId, currentView) => {
  if (!playerId || ["dead", "result", "timeout"].includes(currentView)) return null
  const authoritativeState = state?.game?.state
  if (currentView !== "game" && authoritativeState !== "game" && authoritativeState !== "finished") return null
  const player = state?.players?.[playerId]
  if (!player || Number(player.lives) > 0) return null
  return {
    won: false,
    ...getPlayerBattleStats(state, playerId),
  }
}

export const getBattleRewardMessage = result => {
  if (!result?.won) return ""
  const place = Number(result.place) || 1
  return `Вы получили награду за №${place} место в бою`
}
