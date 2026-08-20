import {TEAM_DEATHMATCH_MODE, normalizeBattleMode} from "./battleMode.js"

const asTeamId = value => String(value || "").trim()

export const getTeamPerspectiveLabel = (team, localTeam) => team === localTeam ? "СОЮЗНИКИ" : "ПРОТИВНИКИ"

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
      label: getTeamPerspectiveLabel(team.id, localTeam),
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
  const draw = Boolean(result?.draw)
  const won = draw ? false : winnerTeam ? winnerTeam === localTeam : result?.won
  return {...result, winnerTeam: winnerTeam || null, team: localTeam || null, teamBattle: true, draw, won}
}

export const getObjectiveHudModel = (state, mode = state?.game?.mode) => {
  if (normalizeBattleMode(mode) !== TEAM_DEATHMATCH_MODE) return null
  const towersAlive = new Set((state?.objectives || [])
    .filter(objective => objective?.type === "tower" && Number(objective.lives) > 0)
    .map(objective => asTeamId(objective.team)))
  return (state?.objectives || []).filter(Boolean).map(objective => ({
    ...objective,
    percent: Math.max(0, Math.min(100, Number(objective.maxLives) > 0 ? Number(objective.lives) / Number(objective.maxLives) * 100 : 0)),
    destroyed: Number(objective.lives) <= 0,
    protected: objective.type === "town_hall" && towersAlive.has(asTeamId(objective.team)),
  }))
}

export const getTeamObjectiveGroups = (objectives = [], localTeam = "") => {
  const grouped = objectives.reduce((result, objective) => {
    const team = asTeamId(objective?.team)
    if (!team) return result
    const items = result[team] || []
    items.push(objective)
    result[team] = items
    return result
  }, {})
  const objectiveOrder = {tower: 0, town_hall: 1}
  Object.values(grouped).forEach(items => items.sort((left, right) => {
    const typeOrder = (objectiveOrder[left?.type] ?? 2) - (objectiveOrder[right?.type] ?? 2)
    return typeOrder || asTeamId(left?.id).localeCompare(asTeamId(right?.id))
  }))
  return Object.entries(grouped).sort(([left], [right]) => {
    const leftIsLocal = left === asTeamId(localTeam)
    const rightIsLocal = right === asTeamId(localTeam)
    if (leftIsLocal !== rightIsLocal) return leftIsLocal ? -1 : 1
    return left.localeCompare(right)
  })
}

export const getIncomingTowerThreat = (state, localId, mode = state?.game?.mode) => {
  if (normalizeBattleMode(mode) !== TEAM_DEATHMATCH_MODE) return null
  const local = state?.players?.[localId]
  const localTeam = asTeamId(local?.team)
  if (!local || !localTeam || Number(local?.lives) <= 0) return null
  return (state?.objectives || [])
    .filter(objective => objective?.type === "tower" && Number(objective.lives) > 0 && asTeamId(objective.team) !== localTeam)
    .map(objective => ({
      objective,
      distance: Math.hypot(Number(objective.x) - Number(local.x), Number(objective.y) - Number(local.y)),
    }))
    .filter(({objective, distance}) => Number(objective.attackRange) > 0 && distance <= Number(objective.attackRange))
    .sort((left, right) => left.distance - right.distance)[0] || null
}
