export const BATTLE_HISTORY_LIMIT = 20
export const LEGACY_BATTLE_HISTORY_KEY = "battle_history"
export const getActiveBattleKey = playerId => `battle_active:${playerId || "anonymous"}`

export const getBattleHistoryKey = playerId => `battle_history:${playerId || "anonymous"}`

const asNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0

export const normalizeActiveBattle = battle => {
  if (!battle || typeof battle !== "object" || !String(battle.roomId || "").trim()) return null
  return {
    roomId: String(battle.roomId).trim(),
    mode: String(battle.mode || "deathmatch"),
    ...(battle.partyId ? {partyId: String(battle.partyId)} : {}),
  }
}

export const readActiveBattle = playerId => {
  try {
    const raw = window.localStorage.getItem(getActiveBattleKey(playerId))
    return normalizeActiveBattle(raw ? JSON.parse(raw) : null)
  } catch {
    return null
  }
}

export const saveActiveBattle = (battle, playerId) => {
  const normalized = normalizeActiveBattle(battle)
  if (!normalized) return null
  try {
    window.localStorage.setItem(getActiveBattleKey(playerId), JSON.stringify(normalized))
  } catch {
    // A storage failure must not prevent reconnecting to the current battle.
  }
  return normalized
}

export const clearActiveBattle = playerId => {
  try {
    window.localStorage.removeItem(getActiveBattleKey(playerId))
  } catch {
    // A storage failure must not prevent showing the battle result.
  }
}

const normalizePartyMember = member => {
  if (typeof member === "string") return {name: member}
  if (!member || typeof member !== "object") return null
  const name = String(member.name || member.nickname || "").trim()
  if (!name) return null
  const hero = String(member.hero || "").trim()
  return hero ? {name, hero} : {name}
}

export const normalizeBattleHistory = history => {
  if (!Array.isArray(history)) return []
  return history
    .filter(record => record && typeof record === "object" && record.finishedAt)
    .map((record, index) => ({
      ...record,
      id: String(record.id || record.battleId || record.roomId || `${record.finishedAt}-${index}`),
      won: Boolean(record.won),
      draw: Boolean(record.draw),
      finishedAt: String(record.finishedAt),
      mode: String(record.mode || (record.teamBattle ? "team deathmatch" : "deathmatch")),
      mapName: String(record.mapName || record.mapId || "battle-royale"),
      duration: asNumber(record.duration),
      kills: asNumber(record.kills),
      deaths: asNumber(record.deaths),
      place: asNumber(record.place),
      playerDamage: asNumber(record.playerDamage),
      partyMembers: Array.isArray(record.partyMembers) ? record.partyMembers.map(normalizePartyMember).filter(Boolean) : [],
    }))
}

export const sortBattleHistory = history => [...normalizeBattleHistory(history)].sort((a, b) => {
  const timeDiff = Date.parse(b.finishedAt) - Date.parse(a.finishedAt)
  return Number.isNaN(timeDiff) ? 0 : timeDiff
})

export const mergeBattleHistory = (...histories) => {
  const unique = new Map()
  histories.flatMap(history => normalizeBattleHistory(history)).forEach(record => {
    if (!unique.has(record.id)) unique.set(record.id, record)
  })
  return sortBattleHistory([...unique.values()])
}

export const readBattleHistory = playerId => {
  try {
    const scoped = window.localStorage.getItem(getBattleHistoryKey(playerId))
    const legacy = window.localStorage.getItem(LEGACY_BATTLE_HISTORY_KEY)
    return sortBattleHistory(JSON.parse(scoped || legacy || "[]")).slice(0, BATTLE_HISTORY_LIMIT)
  } catch {
    return []
  }
}

export const saveBattleHistoryRecord = (result, playerId, metadata = {}) => {
  try {
    const current = readBattleHistory(playerId)
    const record = {
      ...result,
      ...metadata,
      finishedAt: result.finishedAt || new Date().toISOString(),
    }
    const next = sortBattleHistory([record, ...current]).slice(0, BATTLE_HISTORY_LIMIT)
    window.localStorage.setItem(getBattleHistoryKey(playerId), JSON.stringify(next))
    return next
  } catch {
    return []
  }
}

export const getBattleModeLabel = mode =>
  ["team", "team battle", "team-battle", "team deathmatch"].includes(String(mode || "").toLowerCase()) ? "Командная битва" : "Каждый сам за себя"

const isTeamBattleHistoryMode = mode =>
  ["team", "team battle", "team-battle", "team deathmatch"].includes(String(mode || "").toLowerCase())

export const getBattleHistoryPresentation = battle => {
  const place = asNumber(battle?.place)
  if (!isTeamBattleHistoryMode(battle?.mode) && place > 0) {
    return {
      kind: "placement",
      label: `${place} место`,
      icon: place === 1 ? "✦" : place === 2 ? "◇" : place === 3 ? "◆" : "•",
      tone: place === 1 ? "gold" : place === 2 ? "silver" : place === 3 ? "bronze" : "neutral",
    }
  }
  return {
    kind: battle?.draw ? "draw" : battle?.won ? "win" : "loss",
    label: battle?.draw ? "Ничья" : battle?.won ? "Победа" : "Поражение",
    icon: battle?.draw ? "=" : battle?.won ? "✦" : "×",
    tone: "",
  }
}

export const getBattleMapLabel = mapName => ({
  "battle-royale": "Остров Первого Испытания",
  "team-battle": "Каменный Перекрёсток",
  "team-battle-northern": "Северный Пепел",
  arena: "Тренировочная арена",
}[String(mapName || "").toLowerCase()] || "Арена боя")

export const formatBattleDuration = seconds => {
  const total = Math.max(0, Math.round(asNumber(seconds)))
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${String(remainder).padStart(2, "0")}`
}

export const formatBattleDate = (value, now = new Date()) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Дата неизвестна"
  const localeDate = new Intl.DateTimeFormat("ru-RU", {day: "numeric", month: "short"}).format(date).replace(".", "")
  const time = new Intl.DateTimeFormat("ru-RU", {hour: "2-digit", minute: "2-digit"}).format(date)
  const sameDay = date.toDateString() === now.toDateString()
  return sameDay ? `Сегодня, ${time}` : `${localeDate}, ${time}`
}
