import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import axios from "axios"
import {MAX_PARTY_SIZE, PARTY_URL} from "../../utils/urls.js"
import {arrangePartyMembers, shouldApplyPartyState} from "./partyRoster.js"
import {getInviteProgress, getInviteRemainingSeconds, getVisiblePartyInvites, hasActiveOutgoingInviteForPlayer, INVITE_INVALID_DISPLAY_MS, mergeOutgoingInvites} from "./partyInvites.js"
import {normalizePlayerSearchInput, shouldSearchPlayers} from "./partySearch.js"
import "./PartyPanel.css"

const headers = id => ({"X-User-ID": String(id)})
const relativeTime = timestamp => {
  const seconds = Math.max(0, Math.round((Date.now() - Number(timestamp || 0)) / 1000))
  if (seconds < 60) return "только что"
  if (seconds < 3600) return `${Math.round(seconds / 60)} мин назад`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} ч назад`
  return `${Math.round(seconds / 86400)} дн назад`
}

export const PartyPanel = ({id, playerName = "", selectedHero, partyState, incomingInviteStatuses = [], outgoingInvites = [], onClose, onPartyReady, onInviteSent}) => {
  const [tab, setTab] = useState("recent")
  const [party, setParty] = useState(partyState || null)
  const partyRef = useRef(partyState || null)
  const [recent, setRecent] = useState([])
  const [pending, setPending] = useState([])
  const [clock, setClock] = useState(() => Date.now())
  const [removingInviteIds, setRemovingInviteIds] = useState(() => new Set())
  const invalidInviteTimers = useRef(new Map())
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [sentInvites, setSentInvites] = useState([])
  const [sendingInviteIds, setSendingInviteIds] = useState(() => new Set())
  const sendingInviteIdsRef = useRef(new Set())
  const searchRequestRef = useRef(0)
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState("error")
  const auth = useMemo(() => ({headers: headers(id)}), [id])
  const trackedOutgoingInvites = useMemo(() => mergeOutgoingInvites(sentInvites, outgoingInvites), [outgoingInvites, sentInvites])
  const showMessage = (text, type = "error") => {
    setMessage(text)
    setMessageType(type)
  }

  const applyParty = useCallback((nextParty, {force = false} = {}) => {
    const normalizedParty = nextParty?.partyId ? nextParty : null
    if (!shouldApplyPartyState(partyRef.current, normalizedParty, force)) return false
    partyRef.current = normalizedParty
    setParty(normalizedParty)
    onPartyReady?.(normalizedParty, {force})
    return true
  }, [onPartyReady])

  const refresh = useCallback(async () => {
    const [recentResponse, pendingResponse, partyResponse] = await Promise.allSettled([
      axios.get(`${PARTY_URL}/recent-teammates`, auth),
      axios.get(`${PARTY_URL}/invites/inbox`, auth),
      axios.get(`${PARTY_URL}/mine`, auth),
    ])
    if (recentResponse.status === "fulfilled") setRecent(recentResponse.value.data || [])
    if (pendingResponse.status === "fulfilled") setPending(pendingResponse.value.data || [])
    if (partyResponse.status === "fulfilled") {
      const nextParty = partyResponse.value.data?.partyId ? partyResponse.value.data : null
      applyParty(nextParty, {force: !nextParty})
    }
  }, [applyParty, auth])

  useEffect(() => { refresh().catch(() => {}) }, [refresh])
  useEffect(() => { const timer = setInterval(() => refresh().catch(() => {}), 2500); return () => clearInterval(timer) }, [refresh])
  useEffect(() => {
    if (!pending.some(invite => invite.status === "pending") && !trackedOutgoingInvites.some(invite => invite.status === "pending")) return undefined
    const timer = window.setInterval(() => setClock(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [pending, trackedOutgoingInvites])
  useEffect(() => {
    if (!outgoingInvites.length) return
    setSentInvites(current => current.map(invite => outgoingInvites.find(item => item.inviteId === invite.inviteId) || invite))
  }, [outgoingInvites])
  useEffect(() => {
    incomingInviteStatuses.forEach(invite => {
      if (!invite?.inviteId) return
      setPending(current => {
        const existing = current.some(item => item.inviteId === invite.inviteId)
        return existing
          ? current.map(item => item.inviteId === invite.inviteId ? invite : item)
          : [...current, invite]
      })
    })
  }, [incomingInviteStatuses])
  useEffect(() => {
    pending.filter(invite => invite.status === "invalid").forEach(invite => {
      if (invalidInviteTimers.current.has(invite.inviteId)) return
      const respondedAt = Number(invite.respondedAt || 0)
      const remaining = respondedAt ? Math.max(0, respondedAt + INVITE_INVALID_DISPLAY_MS - Date.now()) : 0
      if (!respondedAt || remaining === 0) {
        setPending(current => current.filter(item => item.inviteId !== invite.inviteId))
        return
      }
      const fadeTimer = window.setTimeout(() => {
        setRemovingInviteIds(current => new Set(current).add(invite.inviteId))
        const removeTimer = window.setTimeout(() => {
          setPending(current => current.filter(item => item.inviteId !== invite.inviteId))
          setRemovingInviteIds(current => {
            const next = new Set(current)
            next.delete(invite.inviteId)
            return next
          })
          invalidInviteTimers.current.delete(invite.inviteId)
        }, Math.min(300, remaining))
        invalidInviteTimers.current.set(invite.inviteId, {fadeTimer: null, removeTimer})
      }, Math.max(0, remaining - 300))
      invalidInviteTimers.current.set(invite.inviteId, {fadeTimer, removeTimer: null})
    })
  }, [pending])
  useEffect(() => () => {
    invalidInviteTimers.current.forEach(({fadeTimer, removeTimer}) => {
      if (fadeTimer) window.clearTimeout(fadeTimer)
      if (removeTimer) window.clearTimeout(removeTimer)
    })
    invalidInviteTimers.current.clear()
  }, [])
  useEffect(() => {
    const nextParty = partyState?.partyId ? partyState : null
    if (!nextParty && partyRef.current?.partyId) {
      partyRef.current = null
      setParty(null)
      return
    }
    if (!shouldApplyPartyState(partyRef.current, nextParty)) return
    partyRef.current = nextParty
    setParty(nextParty)
  }, [partyState])

  const createParty = async () => {
    try { const response = await axios.post(PARTY_URL, {maxSize: MAX_PARTY_SIZE, name: playerName}, auth); applyParty(response.data); return response.data } catch { showMessage("Не удалось создать пати"); return null }
  }
  const setInviteSending = (playerId, sending) => {
    const targetId = String(playerId)
    const next = new Set(sendingInviteIdsRef.current)
    if (sending) next.add(targetId)
    else next.delete(targetId)
    sendingInviteIdsRef.current = next
    setSendingInviteIds(next)
  }
  const invite = async (playerId, playerName = "") => {
    const targetId = String(playerId)
    if (sendingInviteIdsRef.current.has(targetId) || hasActiveOutgoingInviteForPlayer(trackedOutgoingInvites, targetId, clock)) return
    setInviteSending(targetId, true)
    try {
      const activeParty = party || await createParty()
      if (!activeParty) return
      const response = await axios.post(`${PARTY_URL}/${activeParty.partyId}/invites`, {playerId, toName: playerName}, auth)
      const sentInvite = {...response.data, toName: response.data?.toName || playerName}
      setSentInvites(current => mergeOutgoingInvites(current, sentInvite))
      onInviteSent?.(sentInvite)
      showMessage("Приглашение отправлено", "success")
    } catch (error) {
      const serverMessage = String(error.response?.data || "")
      const isDuplicateInvite = error.response?.status === 409 && serverMessage.includes("player already has an active invite")
      showMessage(isDuplicateInvite ? "У игрока уже есть активное приглашение" : error.response?.data || "Не удалось отправить приглашение")
    } finally {
      setInviteSending(targetId, false)
    }
  }
  useEffect(() => {
    const requestId = ++searchRequestRef.current
    const normalizedSearchQuery = normalizePlayerSearchInput(searchQuery)
    setSearchResults([])
    if (!shouldSearchPlayers(normalizedSearchQuery)) {
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const response = await axios.get(`${PARTY_URL}/search?query=${encodeURIComponent(normalizedSearchQuery)}`, auth)
        if (requestId !== searchRequestRef.current) return
        setSearchResults(Array.isArray(response.data) ? response.data : [])
        setMessage("")
      } catch (error) {
        if (requestId !== searchRequestRef.current) return
        setSearchResults([])
        showMessage(error.response?.status === 400 ? "Введи минимум 2 символа" : "Не удалось найти игроков")
      } finally {
        if (requestId === searchRequestRef.current) setSearching(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [auth, searchQuery])
  const updateOwnHero = useCallback(async currentParty => {
    if (!currentParty?.partyId || !selectedHero) return currentParty
    try {
      const response = await axios.post(`${PARTY_URL}/${currentParty.partyId}/members/${id}/hero`, {hero: selectedHero}, auth)
      applyParty(response.data)
      return response.data
    } catch {
      return currentParty
    }
  }, [applyParty, auth, id, selectedHero])
  const accept = async inviteId => {
    const invite = pending.find(item => item.inviteId === inviteId)
    if (!invite || invite.status !== "pending" || getInviteRemainingSeconds(invite) <= 0) return
    try { const response = await axios.post(`${PARTY_URL}/invites/${inviteId}/accept`, {}, auth); const joinedParty = await updateOwnHero(response.data); applyParty(joinedParty); setPending(items => items.filter(item => item.inviteId !== inviteId)) } catch { showMessage("Пати уже заполнено или приглашение устарело") }
  }
  const decline = async inviteId => {
    try {
      await axios.post(`${PARTY_URL}/invites/${inviteId}/decline`, {}, auth)
      setPending(items => items.filter(item => item.inviteId !== inviteId))
    } catch {
      showMessage("Не удалось отклонить приглашение")
    }
  }
  const canKick = Boolean(party?.members?.some(member => String(member.playerId) === String(id) && member.owner))
  const kick = async targetId => {
    if (!party?.partyId || !canKick || String(targetId) === String(id)) return
    try {
      const {data} = await axios.delete(`${PARTY_URL}/${party.partyId}/members/${targetId}`, auth)
      const nextParty = data?.party?.partyId ? data.party : null
      applyParty(nextParty, {force: true})
      if (!nextParty) onClose?.()
    } catch (error) {
      showMessage(error.response?.data || "Не удалось исключить игрока")
    }
  }
  const roster = arrangePartyMembers(party?.members || [], id)
  const visiblePending = getVisiblePartyInvites(pending, clock)
  const activeInvite = visiblePending.find(invite => invite.status === "pending")
  const inviteButton = player => {
    const targetId = String(player.playerId)
    const isSending = sendingInviteIds.has(targetId)
    const isActive = hasActiveOutgoingInviteForPlayer(trackedOutgoingInvites, targetId, clock)
    return <button type="button" disabled={isSending || isActive} onClick={() => invite(player.playerId, player.name)} aria-label={`${isSending ? "Отправляем приглашение игроку" : isActive ? "Приглашение уже отправлено игроку" : "Позвать игрока"} ${player.name || player.playerId}`} aria-busy={isSending}>{isSending ? <span className="party-invite-send-loader" role="status" aria-label="Отправка приглашения"/> : isActive ? "ОТПРАВЛЕНО" : "ПОЗВАТЬ"}</button>
  }
  useEffect(() => {
    const ownMember = party?.members?.find(member => String(member.playerId) === String(id))
    if (!party?.partyId || !selectedHero || ownMember?.hero === selectedHero) return
    updateOwnHero(party)
  }, [id, party, selectedHero, updateOwnHero])

  const leave = async () => {
    if (!party?.partyId) return
    try {
      await axios.delete(`${PARTY_URL}/${party.partyId}/members/${id}`, auth)
      applyParty(null, {force: true})
      onClose?.()
    } catch {
      showMessage("Не удалось выйти из пати")
    }
  }

  return <div className="party-panel" role="dialog" aria-modal="true">
    <div className="party-panel__card">
      <button className="party-panel__close" onClick={onClose} aria-label="Закрыть">×</button>
      <div className="party-panel__eyebrow">TEAM BATTLE · {party?.maxSize || MAX_PARTY_SIZE} МЕСТА</div>
      <h2>ТВОЯ ПАТИ</h2>
      <div className="party-roster">{roster.length ? roster.map(member => <div className={`party-member ${member.owner ? "party-member--owner" : ""}`} key={member.playerId}><b>{member.name || "Игрок"}</b><span>{member.hero || "Герой не выбран"}</span>{member.owner && <small>ЛИДЕР</small>}{canKick && !member.owner && <div className="party-member__actions"><button type="button" onClick={() => kick(member.playerId)}>КИКНУТЬ</button></div>}</div>) : <div className="party-empty">Позови союзника — пати создастся автоматически</div>}</div>
      <div className="party-tabs"><button className={tab === "recent" ? "active" : ""} onClick={() => setTab("recent")}>НЕДАВНИЕ СОЮЗНИКИ</button><button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>НАЙТИ ИГРОКА</button></div>
      {tab === "recent" && <div className="party-list">{recent.length ? recent.map(item => <div className="party-row" key={item.playerId}><div><b>{item.name || "Игрок"}</b><small>{relativeTime(item.lastPlayedAt)} · игр: {item.games}</small></div>{inviteButton(item)}</div>) : <p className="party-muted">Здесь появятся игроки, с которыми ты недавно играл.</p>}</div>}
      {tab === "search" && <div className="party-search"><input value={searchQuery} onChange={event => setSearchQuery(normalizePlayerSearchInput(event.target.value))} placeholder="Ник или ID игрока" aria-label="Ник или ID игрока" maxLength={20}/>{searching && <p className="party-search__hint">Ищем игроков...</p>}{searchQuery.length > 0 && searchQuery.length < 2 && <p className="party-search__hint">Введи минимум 2 символа</p>}{!searching && searchQuery.length >= 2 && searchResults.length === 0 && <p className="party-search__hint">Игроки не найдены</p>}{searchResults.map(result => <div className="party-row" key={result.playerId}><div><b>{result.name || "Игрок"}</b><small>ID: {result.playerId}</small></div>{inviteButton(result)}</div>)}</div>}
      {visiblePending.length > 0 && <div className="party-invites"><div className="party-invites__header"><b>ПРИГЛАШЕНИЯ</b>{activeInvite && <i className="party-invite-card__timer" style={{"--invite-progress": `${getInviteProgress(activeInvite, clock)}%`}} aria-label={`Осталось ${getInviteRemainingSeconds(activeInvite, clock)} секунд`}>{getInviteRemainingSeconds(activeInvite, clock)}</i>}</div>{visiblePending.map(inviteItem => {
        const invalid = inviteItem.status === "invalid"
        const invalidText = inviteItem.invalidReason === "canceled"
          ? "Приглашение отменено"
          : inviteItem.invalidReason === "party_disbanded"
            ? "Пати распалась"
            : inviteItem.invalidReason === "expired"
              ? "Истёк срок ожидания"
              : "Приглашение недействительно"
        const seconds = getInviteRemainingSeconds(inviteItem, clock)
        return <div className={`party-invite-card ${invalid ? "is-invalid" : ""} ${removingInviteIds.has(inviteItem.inviteId) ? "is-removing" : ""}`} key={inviteItem.inviteId}>
          <span className="party-invite-card__summary">{invalid ? `${inviteItem.fromName || inviteItem.fromId}: ${invalidText}` : `${inviteItem.fromName || inviteItem.fromId} зовёт в пати`}</span>
          <div className="party-invite-card__actions"><button disabled={invalid || seconds <= 0} onClick={() => accept(inviteItem.inviteId)}>ПРИНЯТЬ</button>{!invalid && <button className="secondary" onClick={() => decline(inviteItem.inviteId)}>ОТКЛОНИТЬ</button>}</div>
        </div>
      })}</div>}
      {message && <p className={`party-message party-message--${messageType}`} role={messageType === "error" ? "alert" : "status"}>{message}</p>}
      {party && <button className="party-leave" onClick={leave}>ПОКИНУТЬ ПАТИ</button>}
    </div>
  </div>
}
