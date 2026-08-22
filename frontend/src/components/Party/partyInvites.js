export const OUTGOING_DECLINED_DISPLAY_MS = 5000
export const INVITE_TTL_MS = 5 * 60 * 1000
export const INVITE_NOTIFICATION_DISPLAY_MS = 15_000
export const INVITE_INVALID_NOTIFICATION_DISPLAY_MS = 5_000
export const INVITE_INVALID_DISPLAY_MS = 10_000

const asList = invites => Array.isArray(invites) ? invites : invites ? [invites] : []

const getExpiry = invite => Number(invite?.expiresAt || 0)
const getResponseTime = invite => Number(invite?.respondedAt || 0)

export const shouldAcceptInviteUpdate = (current, incoming) => {
  if (!incoming?.inviteId || !current?.inviteId) return true
  if (current.status !== "pending" && incoming.status === "pending") return false
  if (current.status === incoming.status) {
    if (current.status === "pending") return Number(incoming.createdAt || 0) > Number(current.createdAt || 0)
    return getResponseTime(incoming) > getResponseTime(current)
  }
  if (current.status !== "pending" && incoming.status !== "pending") return getResponseTime(incoming) > getResponseTime(current)
  return true
}

export const getInviteRemainingSeconds = (invite, now = Date.now()) => {
  const expiresAt = getExpiry(invite)
  if (!expiresAt) return 0
  return Math.max(0, Math.ceil((expiresAt - now) / 1000))
}

export const getInviteProgress = (invite, now = Date.now()) => {
  const createdAt = Number(invite?.createdAt || 0)
  const expiresAt = getExpiry(invite)
  if (!createdAt || !expiresAt || expiresAt <= createdAt) return 0
  return Math.max(0, Math.min(100, ((expiresAt - now) / (expiresAt - createdAt)) * 100))
}

export const getInviteNotificationDisplayMs = invite => invite?.status === "invalid"
  ? INVITE_INVALID_NOTIFICATION_DISPLAY_MS
  : INVITE_NOTIFICATION_DISPLAY_MS

export const dismissInviteNotification = async ({invite, hide, decline}) => {
  hide?.()
  if (invite?.status === "pending") {
    try { await decline?.() } catch { /* the invite may already be expired or invalid */ }
  }
}

export const getNotificationProgress = (deadline, now = Date.now(), duration = INVITE_NOTIFICATION_DISPLAY_MS) => {
  const remaining = Number(deadline || 0) - now
  return Math.max(0, Math.min(100, (remaining / duration) * 100))
}

export const getVisibleIncomingInvites = (invites, now = Date.now()) => asList(invites)
  .filter(invite => {
    if (!invite?.inviteId) return false
    return invite.status === "pending" && (!getExpiry(invite) || getExpiry(invite) > now)
  })

export const getVisiblePartyInvites = (invites, now = Date.now()) => asList(invites)
  .filter(invite => {
    if (!invite?.inviteId) return false
    if (invite.status === "pending") return !getExpiry(invite) || getExpiry(invite) > now
    if (invite.status === "invalid") return getResponseTime(invite) > 0 && getResponseTime(invite) + INVITE_INVALID_DISPLAY_MS > now
    return false
  })

export const getVisibleOutgoingInvites = (invites, now = Date.now()) => asList(invites)
  .filter(invite => {
    if (!invite?.inviteId) return false
    if (invite.status === "pending") return !getExpiry(invite) || getExpiry(invite) > now
    if (invite.status === "declined") return false
    return invite.status === "invalid" && getResponseTime(invite) > 0 && getResponseTime(invite) + INVITE_INVALID_DISPLAY_MS > now
  })

export const getVisiblePartyOutgoingInvites = (invites, now = Date.now()) => asList(invites)
  .filter(invite => {
    if (!invite?.inviteId) return false
    if (invite.status === "declined") return getResponseTime(invite) > 0 && getResponseTime(invite) + OUTGOING_DECLINED_DISPLAY_MS > now
    if (invite.status === "pending") return !getExpiry(invite) || getExpiry(invite) > now
    return invite.status === "invalid" && getResponseTime(invite) > 0 && getResponseTime(invite) + INVITE_INVALID_DISPLAY_MS > now
  })

export const mergeOutgoingInvitesAfterRefresh = (current, incoming, now = Date.now(), resolved = []) => {
  const terminalById = new Map(asList(current)
    .concat(asList(resolved))
    .filter(invite => invite?.inviteId && (invite.status === "declined" || invite.status === "invalid"))
    .map(invite => [invite.inviteId, invite]))
  const refreshed = getVisibleOutgoingInvites(incoming, now)
    .filter(invite => !terminalById.has(invite.inviteId) || invite.status !== "pending")
  const refreshedIds = new Set(refreshed.map(invite => invite.inviteId))
  const terminalStillVisible = [...terminalById.values()].filter(invite => {
    if (invite.status === "declined") return getResponseTime(invite) > 0 && getResponseTime(invite) + OUTGOING_DECLINED_DISPLAY_MS > now
    return getResponseTime(invite) > 0 && getResponseTime(invite) + INVITE_INVALID_DISPLAY_MS > now
  }).filter(invite => !refreshedIds.has(invite.inviteId))
  return mergeOutgoingInvites(refreshed, terminalStillVisible)
}

export const hasActiveOutgoingInviteForPlayer = (invites, playerId, now = Date.now()) => asList(invites).some(invite => {
  if (!invite?.inviteId || invite.status !== "pending") return false
  if (String(invite.toId) !== String(playerId)) return false
  return !getExpiry(invite) || getExpiry(invite) > now
})

export const mergeOutgoingInvites = (current, incoming) => {
  const byId = new Map(asList(current).filter(invite => invite?.inviteId).map(invite => [invite.inviteId, invite]))
  asList(incoming).filter(invite => invite?.inviteId).forEach(invite => byId.set(invite.inviteId, invite))
  return [...byId.values()]
}
