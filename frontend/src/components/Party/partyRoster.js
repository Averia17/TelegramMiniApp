const canonicalHero = hero => String(hero || "").trim().toLowerCase()

export const getBattleModeAfterPartyState = (currentMode, partyState) =>
  partyState?.partyId ? "team" : currentMode === "team" ? "team" : "solo"

export const normalizePartyMembers = members => (Array.isArray(members) ? members : [])
  .filter(member => member && member.playerId)
  .map(member => ({...member, hero: member.hero || ""}))

export const getDuplicatePartyHeroes = members => {
  const counts = new Map()
  normalizePartyMembers(members).forEach(member => {
    const hero = canonicalHero(member.hero)
    if (hero) counts.set(hero, (counts.get(hero) || 0) + 1)
  })
  return [...counts.entries()].filter(([, count]) => count > 1).map(([hero]) => hero)
}

export const canStartTeamParty = (members, maxSize = 3) => {
  const normalized = normalizePartyMembers(members)
  if (normalized.length === 0) return {ok: false, reason: "В пати пока нет игроков", duplicates: []}
  if (normalized.length > maxSize) return {ok: false, reason: "Пати переполнено", duplicates: []}
  if (normalized.some(member => !canonicalHero(member.hero))) {
    return {ok: false, reason: "Все игроки пати должны выбрать героя", duplicates: []}
  }
  const duplicates = getDuplicatePartyHeroes(normalized)
  if (duplicates.length) {
    return {ok: false, reason: "Все герои пати должны быть уникальны", duplicates}
  }
  return {ok: true, reason: "", duplicates: []}
}

export const arrangePartyMembers = (members, ownerId) => {
  const normalized = normalizePartyMembers(members)
  if (normalized.length < 3) return normalized
  const owner = normalized.find(member => String(member.playerId) === String(ownerId))
  const others = normalized.filter(member => member !== owner)
  return owner ? [others[0], owner, others[1]] : normalized
}

export const getPartyRosterModel = (party, ownerId) => ({
  active: Boolean(party?.partyId),
  partyId: party?.partyId || "",
  members: arrangePartyMembers(party?.members || [], ownerId),
})

export const canKickPartyMember = (party, playerId, targetId) => {
  if (!party || !playerId || !targetId || String(playerId) === String(targetId)) return false
  return normalizePartyMembers(party.members).some(member => String(member.playerId) === String(playerId) && member.owner)
}

export const getPartyBattleIntent = party => party?.partyId && party?.battleNonce
  ? `${party.partyId}:${party.battleNonce}`
  : ""

export const shouldApplyPartyState = (current, incoming, force = false) => {
  if (force) return true
  if (!incoming?.partyId) return !current?.partyId
  if (!current?.partyId || current.partyId !== incoming.partyId) return true
  return Number(incoming.revision || 0) >= Number(current.revision || 0)
}
