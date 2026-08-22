const legacyHeroKey = "battle_hero"
const defaultBattleMode = "solo"
const supportedBattleModes = new Set(["solo", "team"])

export const getBattleHeroKey = playerId => playerId ? `battle_hero:${playerId}` : legacyHeroKey
export const getBattleModeKey = playerId => `battle_mode:${playerId || "anonymous"}`

const normalizeBattleMode = mode => supportedBattleModes.has(mode) ? mode : defaultBattleMode

export const getBattleRoute = (mode, partyId = "") => {
  const normalizedMode = normalizeBattleMode(mode)
  if (normalizedMode !== "team") return "/battle"
  const params = new URLSearchParams({mode: "team"})
  if (partyId) params.set("party", partyId)
  return `/battle?${params.toString()}`
}

export const getBattleResumeRoute = ({roomId, mode = "solo", partyId = ""} = {}) => {
  if (!roomId) return "/"
  const params = new URLSearchParams()
  if (mode === "team" || mode === "team deathmatch") params.set("mode", "team")
  if (partyId) params.set("party", partyId)
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
