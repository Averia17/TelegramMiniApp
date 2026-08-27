const legacyHeroKey = "battle_hero"
const defaultBattleMode = "solo"
const supportedBattleModes = new Set(["solo", "team"])

export const TEAM_BATTLE_MAPS = [
  {id: "team-battle", label: "Каменный Перекрёсток", subtitle: "Классическая командная арена"},
  {id: "team-battle-northern", label: "Северный Пепел", subtitle: "Таверны, руины и топи"},
]
export const DEFAULT_TEAM_BATTLE_MAP = "team-battle-northern"
const supportedTeamBattleMaps = new Set(TEAM_BATTLE_MAPS.map(map => map.id))

export const getBattleHeroKey = playerId => playerId ? `battle_hero:${playerId}` : legacyHeroKey
export const getBattleModeKey = playerId => `battle_mode:${playerId || "anonymous"}`

const normalizeBattleMode = mode => supportedBattleModes.has(mode) ? mode : defaultBattleMode

export const normalizeBattleMap = mapName => supportedTeamBattleMaps.has(mapName) ? mapName : DEFAULT_TEAM_BATTLE_MAP
export const isTeamBattleMap = mapName => supportedTeamBattleMaps.has(mapName)
export const getTeamBattleMap = mapName => TEAM_BATTLE_MAPS.find(map => map.id === normalizeBattleMap(mapName)) || TEAM_BATTLE_MAPS[1]
export const getBattleMapKey = playerId => `battle_map:${playerId || "anonymous"}`

export const getBattleRoute = (mode, partyId = "", mapName = DEFAULT_TEAM_BATTLE_MAP) => {
  const normalizedMode = normalizeBattleMode(mode)
  if (normalizedMode !== "team") return "/battle"
  const params = new URLSearchParams({mode: "team"})
  if (partyId) params.set("party", partyId)
  params.set("map", normalizeBattleMap(mapName))
  return `/battle?${params.toString()}`
}

export const getBattleResumeRoute = ({roomId, mode = "solo", partyId = "", mapName = ""} = {}) => {
  if (!roomId) return "/"
  const params = new URLSearchParams()
  if (mode === "team" || mode === "team deathmatch") params.set("mode", "team")
  if (partyId) params.set("party", partyId)
  if ((mode === "team" || mode === "team deathmatch") && mapName) params.set("map", normalizeBattleMap(mapName))
  const query = params.toString()
  return `/battle/${encodeURIComponent(String(roomId))}${query ? `?${query}` : ""}`
}

export const loadBattleHero = playerId => {
  try {
    return window.localStorage.getItem(getBattleHeroKey(playerId))
      || window.localStorage.getItem(legacyHeroKey)
      || ""
  } catch {
    return ""
  }
}

export const saveBattleHero = (playerId, heroName) => {
  try {
    if (heroName) window.localStorage.setItem(getBattleHeroKey(playerId), heroName)
  } catch {
    // A storage failure must not prevent entering a battle.
  }
}

export const loadBattleMode = playerId => {
  try {
    return normalizeBattleMode(window.localStorage.getItem(getBattleModeKey(playerId)))
  } catch {
    return defaultBattleMode
  }
}

export const saveBattleMode = (playerId, mode) => {
  try {
    const normalizedMode = normalizeBattleMode(mode)
    if (normalizedMode === mode) window.localStorage.setItem(getBattleModeKey(playerId), normalizedMode)
  } catch {
    // A storage failure must not prevent changing the battle mode.
  }
}

export const loadBattleMap = playerId => {
  try {
    return normalizeBattleMap(window.localStorage.getItem(getBattleMapKey(playerId)))
  } catch {
    return DEFAULT_TEAM_BATTLE_MAP
  }
}

export const saveBattleMap = (playerId, mapName) => {
  try {
    window.localStorage.setItem(getBattleMapKey(playerId), normalizeBattleMap(mapName))
  } catch {
    // A storage failure must not prevent entering a battle.
  }
}
