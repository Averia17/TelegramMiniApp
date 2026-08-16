import {useCallback, useEffect, useState} from "react"
import axios from "axios"
import {PARTY_URL, PARTY_WS_URL} from "../../utils/urls.js"
import "./PartyInviteNotifications.css"

const authHeaders = id => ({headers: {"X-User-ID": String(id)}})

export const PartyInviteNotifications = ({id, onAccepted}) => {
  const [invites, setInvites] = useState([])
  const loadPending = useCallback(async () => {
    try {
      const {data} = await axios.get(`${PARTY_URL}/invites/pending`, authHeaders(id))
      setInvites(data || [])
    } catch { /* auth or service may be unavailable during app bootstrap */ }
  }, [id])
  const dismiss = useCallback(async inviteId => {
    try { await axios.post(`${PARTY_URL}/invites/${inviteId}/decline`, {}, authHeaders(id)) } catch { /* expired invites are already gone */ }
    setInvites(current => current.filter(item => item.inviteId !== inviteId))
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
          setInvites(current => current.some(item => item.inviteId === message.invite.inviteId) ? current : [...current, message.invite])
        }
      } catch { /* ignore malformed notification frames */ }
    }
    const refresh = window.setInterval(loadPending, 30000)
    return () => { window.clearInterval(refresh); socket.close() }
  }, [id, loadPending])

  useEffect(() => {
    if (!invites.length) return undefined
    const timer = window.setTimeout(() => dismiss(invites[0].inviteId), 15000)
    return () => window.clearTimeout(timer)
  }, [dismiss, invites])

  const accept = async invite => {
    try { const {data} = await axios.post(`${PARTY_URL}/invites/${invite.inviteId}/accept`, {}, authHeaders(id)); dismiss(invite.inviteId); onAccepted?.(data) } catch { dismiss(invite.inviteId) }
  }
  if (!invites.length) return null
  return <div className="party-invite-toasts" aria-live="polite">{invites.map(invite => <div className="party-invite-toast" key={invite.inviteId}>
    <button className="party-invite-toast__close" onClick={() => dismiss(invite.inviteId)} aria-label="Закрыть">×</button>
    <small>ПРИГЛАШЕНИЕ В ПАТИ</small><strong>{invite.fromName || invite.fromId} зовёт тебя в команду</strong>
    <div><button onClick={() => accept(invite)}>ПРИНЯТЬ</button><button className="secondary" onClick={() => dismiss(invite.inviteId)}>ОТКЛОНИТЬ</button></div>
  </div>)}</div>
}
