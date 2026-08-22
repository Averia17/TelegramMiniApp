import {useCallback, useEffect, useRef, useState} from "react"
import axios from "axios"
import {PARTY_URL, PARTY_WS_URL} from "../../utils/urls.js"
import {dismissInviteNotification, getInviteNotificationDisplayMs, getInviteRemainingSeconds, getNotificationProgress, getVisibleIncomingInvites, shouldAcceptInviteUpdate} from "./partyInvites.js"
import "./PartyInviteNotifications.css"

const authHeaders = id => ({headers: {"X-User-ID": String(id)}})

export const PartyInviteNotifications = ({id, selectedHero, onAccepted, onPartyUpdated, onInviteStatus, onIncomingInviteStatus}) => {
  const [invites, setInvites] = useState([])
  const [clock, setClock] = useState(() => Date.now())
  const [hiddenInviteIds, setHiddenInviteIds] = useState(() => new Set())
  const hiddenInviteIdsRef = useRef(hiddenInviteIds)
  const knownInvites = useRef(new Map())
  hiddenInviteIdsRef.current = hiddenInviteIds
  const notificationTimers = useRef(new Map())
  const notificationDeadlines = useRef(new Map())
  const scheduleNotification = useCallback((invite, reset = false) => {
    if (!invite?.inviteId) return
    const displayMs = getInviteNotificationDisplayMs(invite)
    if (reset) {
      const existingTimer = notificationTimers.current.get(invite.inviteId)
      if (existingTimer) window.clearTimeout(existingTimer)
      notificationTimers.current.delete(invite.inviteId)
      notificationDeadlines.current.set(invite.inviteId, Date.now() + displayMs)
      setHiddenInviteIds(current => {
        const next = new Set(current)
        next.delete(invite.inviteId)
        return next
      })
    }
    if (!notificationDeadlines.current.has(invite.inviteId)) notificationDeadlines.current.set(invite.inviteId, Date.now() + displayMs)
    if (notificationTimers.current.has(invite.inviteId)) return
    const deadline = notificationDeadlines.current.get(invite.inviteId)
    const timer = window.setTimeout(() => {
      notificationTimers.current.set(invite.inviteId, null)
      setHiddenInviteIds(current => new Set(current).add(invite.inviteId))
    }, Math.max(0, deadline - Date.now()))
    notificationTimers.current.set(invite.inviteId, timer)
  }, [])
  const rememberInvite = useCallback(invite => {
    if (!invite?.inviteId) return false
    const previous = knownInvites.current.get(invite.inviteId)
    if (previous && !shouldAcceptInviteUpdate(previous, invite)) return false
    knownInvites.current.set(invite.inviteId, invite)
    return true
  }, [])
  const loadPending = useCallback(async () => {
    try {
      const {data} = await axios.get(`${PARTY_URL}/invites/inbox`, authHeaders(id))
      const pending = getVisibleIncomingInvites(data).filter(invite => invite.status === "pending" && rememberInvite(invite))
      setInvites(current => {
        const now = Date.now()
        const invalid = current.filter(invite => invite.status === "invalid" && !hiddenInviteIdsRef.current.has(invite.inviteId) && Number(invite.respondedAt || 0) + getInviteNotificationDisplayMs(invite) > now)
        const byId = new Map([...invalid, ...pending].map(invite => [invite.inviteId, invite]))
        return [...byId.values()]
      })
    } catch { /* auth or service may be unavailable during app bootstrap */ }
  }, [id, rememberInvite])
  const dismiss = useCallback(async invite => {
    await dismissInviteNotification({
      invite,
      hide: () => {
        const timer = notificationTimers.current.get(invite?.inviteId)
        if (timer) window.clearTimeout(timer)
        notificationTimers.current.delete(invite?.inviteId)
        notificationDeadlines.current.delete(invite?.inviteId)
        setHiddenInviteIds(current => new Set(current).add(invite?.inviteId))
        setInvites(current => current.filter(item => item.inviteId !== invite?.inviteId))
      },
      decline: () => axios.post(`${PARTY_URL}/invites/${invite.inviteId}/decline`, {}, authHeaders(id)),
    })
  }, [id])

  useEffect(() => {
    if (!id) return undefined
    loadPending()
    const token = axios.defaults.headers.common.Authorization?.replace(/^Bearer\s+/, "") || ""
    const query = token ? `?token=${encodeURIComponent(token)}` : `?userId=${encodeURIComponent(id)}`
    const socket = new WebSocket(`${PARTY_WS_URL}${query}`)
    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === "party_invite" && message.invite) {
          if (rememberInvite(message.invite)) {
            setInvites(current => current.some(item => item.inviteId === message.invite.inviteId) ? current : [...current, message.invite])
            scheduleNotification(message.invite, true)
          }
        }
        if (message.type === "party_invite_status" && message.invite) {
          const invite = message.invite
          if (rememberInvite(invite)) {
            if (String(invite.toId) === String(id)) {
              onIncomingInviteStatus?.(invite)
              if (invite.status === "invalid") {
                setInvites(current => {
                  const existing = current.some(item => item.inviteId === invite.inviteId)
                  return existing ? current.map(item => item.inviteId === invite.inviteId ? invite : item) : [...current, invite]
                })
                scheduleNotification(invite, true)
              } else if (invite.status === "declined" || invite.status === "accepted") {
                setInvites(current => current.filter(item => item.inviteId !== invite.inviteId))
              }
            }
            if (String(invite.fromId) === String(id)) onInviteStatus?.(invite)
          }
        }
        if (message.type === "party_update") onPartyUpdated?.(message.party || null, {force: true})
      } catch { /* ignore malformed notification frames */ }
    }
    const refresh = window.setInterval(loadPending, 2500)
    return () => { window.clearInterval(refresh); socket.close() }
  }, [id, loadPending, onIncomingInviteStatus, onInviteStatus, onPartyUpdated, rememberInvite, scheduleNotification])

  useEffect(() => {
    const shouldTick = invites.some(invite => invite.status === "pending" || !hiddenInviteIds.has(invite.inviteId))
    if (!shouldTick) return undefined
    const timer = window.setInterval(() => setClock(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [hiddenInviteIds, invites])

  useEffect(() => {
    invites.forEach(invite => {
      scheduleNotification(invite)
    })
  }, [invites, scheduleNotification])

  useEffect(() => () => {
    notificationTimers.current.forEach(timer => { if (timer) window.clearTimeout(timer) })
    notificationTimers.current.clear()
    notificationDeadlines.current.clear()
  }, [])

  const accept = async invite => {
    if (invite.status !== "pending" || getInviteRemainingSeconds(invite) <= 0) return
    try {
      const {data} = await axios.post(`${PARTY_URL}/invites/${invite.inviteId}/accept`, {}, authHeaders(id))
      let party = data
      if (selectedHero && data?.partyId) {
        const response = await axios.post(`${PARTY_URL}/${data.partyId}/members/${id}/hero`, {hero: selectedHero}, authHeaders(id))
        party = response.data
      }
      dismiss({...invite, status: "accepted"})
      onAccepted?.(party)
    } catch { dismiss({...invite, status: "accepted"}) }
  }
  const toastInvites = invites.filter(invite => !hiddenInviteIds.has(invite.inviteId))
  if (!toastInvites.length) return null
  return <div className="party-invite-toasts" aria-live="polite">{toastInvites.map(invite => <div className="party-invite-toast" key={invite.inviteId}>
    <div className="party-invite-toast__dismiss"><span className="party-invite-toast__lifetime" style={{"--notification-progress": `${getNotificationProgress(notificationDeadlines.current.get(invite.inviteId) || clock + getInviteNotificationDisplayMs(invite), clock, getInviteNotificationDisplayMs(invite))}%`}} aria-label="Индикатор времени показа уведомления"/><button className="party-invite-toast__close" onClick={() => dismiss(invite)} aria-label="Закрыть">×</button></div>
    <small>{invite.status === "invalid" ? "ПРИГЛАШЕНИЕ НЕДЕЙСТВИТЕЛЬНО" : "ПРИГЛАШЕНИЕ В ПАТИ"}</small><strong>{invite.status === "invalid" ? `${invite.fromName || invite.fromId}: ${invite.invalidReason === "canceled" ? "приглашение отменено" : invite.invalidReason === "party_disbanded" ? "пати распалась" : "истёк срок ожидания"}` : `${invite.fromName || invite.fromId} зовёт тебя в команду`}</strong>
    <div><button onClick={() => accept(invite)} disabled={invite.status !== "pending"}>ПРИНЯТЬ</button><button className="secondary" onClick={() => dismiss(invite)}>{invite.status === "invalid" ? "ЗАКРЫТЬ" : "ОТКЛОНИТЬ"}</button></div>
  </div>)}</div>
}
