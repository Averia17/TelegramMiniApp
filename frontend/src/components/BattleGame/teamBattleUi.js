import {TEAM_DEATHMATCH_MODE, normalizeBattleMode} from "./battleMode.js"

const asTeamId = value => String(value || "").trim()

export const getTeamHudModel = (state, localId, mode = state?.game?.mode) => {
  if (normalizeBattleMode(mode) !== TEAM_DEATHMATCH_MODE) return null
  const players = Object.values(state?.players || {})
  const localTeam = asTeamId(state?.players?.[localId]?.team)
  const grouped = new Map()
  players.forEach(player => {
    const id = asTeamId(player?.team)
    if (!id) return
    if (!grouped.has(id)) grouped.set(id, {id, alive: 0, kills: 0, members: []})
    const team = grouped.get(id)
    team.alive += Number(player?.lives) > 0 ? 1 : 0
    team.kills += Number(player?.kills) || 0
    team.members.push({id: player?.playerId, name: player?.name || "Боец", alive: Number(player?.lives) > 0})
  })
  return {
    localTeam,
    teams: [...grouped.values()].sort((a, b) => a.id.localeCompare(b.id)).map(team => ({
      ...team,
      isLocal: team.id === localTeam,
      label: `${team.id} команда`,
    })),
  }
}

export const normalizeTeamBattleResult = (result, state, localId, mode = state?.game?.mode) => {
  if (normalizeBattleMode(mode) !== TEAM_DEATHMATCH_MODE) return result
  const localTeam = asTeamId(state?.players?.[localId]?.team)
  const winnerText = String(result?.winnerTeam || result?.winner || "")
  const winnerTeam = result?.winnerTeam || Object.keys(state?.players || {})
    .map(id => state.players[id]?.team)
    .find(team => team && winnerText.toLowerCase() === `${String(team).toLowerCase()} team`)
  const won = winnerTeam ? winnerTeam === localTeam : result?.won
  return {...result, winnerTeam: winnerTeam || null, team: localTeam || null, won}
}

export const getObjectiveHudModel = (state, mode = state?.game?.mode) => {
  if (normalizeBattleMode(mode) !== TEAM_DEATHMATCH_MODE) return null
  return (state?.objectives || []).filter(Boolean).map(objective => ({
    ...objective,
    percent: Math.max(0, Math.min(100, Number(objective.maxLives) > 0 ? Number(objective.lives) / Number(objective.maxLives) * 100 : 0)),
    destroyed: Number(objective.lives) <= 0,
  }))
}
