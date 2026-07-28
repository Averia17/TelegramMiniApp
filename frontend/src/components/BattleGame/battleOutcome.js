const DEFAULT_GAME_DURATION_MS = 5 * 60 * 1000

export const getPlayerBattleStats = (state, playerId, now = Date.now()) => {
  const player = state?.players?.[playerId]
  if (!player) return {}
  const aliveOpponents = Object.entries(state.players || {}).filter(
    ([id, candidate]) => id !== String(playerId) && Number(candidate?.lives) > 0,
  ).length
  const gameEndsAt = Number(state?.game?.gameEndsAt) || 0
  const startedAt = gameEndsAt ? gameEndsAt - DEFAULT_GAME_DURATION_MS : 0
  return {
    place: Number(player.lives) > 0 ? 1 : aliveOpponents + 1,
    kills: player.kills || 0,
    monsters: player.monsters || player.monsterKills || 0,
    duration: startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0,
  }
}

export const getStateBattleResult = (state, playerId, currentView) => {
  if (currentView !== "game" || !playerId) return null
  const player = state?.players?.[playerId]
  if (!player || Number(player.lives) > 0) return null
  return {
    won: false,
    ...getPlayerBattleStats(state, playerId),
  }
}
