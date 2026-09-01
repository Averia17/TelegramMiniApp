import {TEAM_DEATHMATCH_MODE, normalizeBattleMode} from "./battleMode.js"

const asTeamId = value => String(value || "").trim()

export const heroAvatarPaths = Object.freeze({
  Needle: "/assets/heroes/icons/needle.png",
  Mandy: "/assets/heroes/icons/mandy.png",
  "Fairy Mina": "/assets/heroes/icons/fairy-mina.png",
  "Brock Zeus": "/assets/heroes/icons/brock-zeus.png",
  Kaze: "/assets/heroes/icons/kaze.png",
  "Wukong Mico": "/assets/heroes/icons/wukong-mico.png",
  "Persephone Lumi": "/assets/heroes/icons/persephone-lumi.png",
  Katty: "/assets/heroes/icons/katty.png",
})

export const getHeroAvatarPath = hero => heroAvatarPaths[String(hero || "").trim()] || null

const summarizeObjectiveHealth = (items, extra = {}) => {
  const current = items.reduce((total, objective) => total + Math.max(0, Number(objective?.lives) || 0), 0)
  const maximum = items.reduce((total, objective) => total + Math.max(0, Number(objective?.maxLives) || 0), 0)
  const percent = maximum > 0 ? Math.round(Math.max(0, Math.min(100, current / maximum * 100))) : 0
  return {current, maximum, percent, destroyed: items.length > 0 && current <= 0, count: items.length, ...extra}
}

export const getTeamObjectiveSummary = (objectives = [], teamId) => {
  const teamObjectives = objectives.filter(objective => asTeamId(objective?.team) === asTeamId(teamId))
  const towers = teamObjectives.filter(objective => objective?.type === "tower")
  const townHalls = teamObjectives.filter(objective => objective?.type === "town_hall")
  return {
    tower: summarizeObjectiveHealth(towers),
    townHall: summarizeObjectiveHealth(townHalls, {protected: towers.some(objective => Number(objective?.lives) > 0)}),
  }
}

export const getTeamRespawnSeconds = (member, now = Date.now()) => {
  if (member?.alive) return null
  const respawnAt = Number(member?.respawnAt)
  if (!Number.isFinite(respawnAt) || respawnAt <= now) return null
  return Math.ceil((respawnAt - now) / 1000)
}

export const getTeamPerspectiveLabel = (team, localTeam) => team === localTeam ? "СОЮЗНИКИ" : "ПРОТИВНИКИ"

export const getTeamHudModel = (state, localId, mode = state?.game?.mode) => {
  if (normalizeBattleMode(mode) !== TEAM_DEATHMATCH_MODE) return null
  const roster = Array.isArray(state?.teamRoster) && state.teamRoster.length
    ? state.teamRoster
    : Object.values(state?.players || {})
  const localTeam = asTeamId(state?.players?.[localId]?.team || roster.find(player => String(player?.playerId) === String(localId))?.team)
  const objectives = Array.isArray(state?.objectives) ? state.objectives.filter(Boolean) : []
  const grouped = new Map()
  roster.forEach(player => {
    const id = asTeamId(player?.team)
    if (!id) return
    if (!grouped.has(id)) grouped.set(id, {id, alive: 0, kills: 0, members: []})
    const team = grouped.get(id)
    const alive = player?.alive === undefined ? Number(player?.lives) > 0 : Boolean(player.alive)
    team.alive += alive ? 1 : 0
    team.kills += Number(player?.kills) || 0
    team.members.push({
      id: player?.playerId,
      name: player?.name || "Боец",
      hero: player?.hero || "",
      alive,
      respawnAt: Number(player?.respawnAt) || 0,
    })
  })
  return {
    localTeam,
    teams: [...grouped.values()].sort((a, b) => a.id.localeCompare(b.id)).map(team => ({
      ...team,
      isLocal: team.id === localTeam,
      label: getTeamPerspectiveLabel(team.id, localTeam),
      objectives: getTeamObjectiveSummary(objectives, team.id),
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
