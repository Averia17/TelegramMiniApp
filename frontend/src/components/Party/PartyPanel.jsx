import {useCallback, useEffect, useMemo, useState} from "react"
import axios from "axios"
import {MAX_PARTY_SIZE, PARTY_URL} from "../../utils/urls.js"
import {arrangePartyMembers, canStartTeamParty} from "./partyRoster.js"
import "./PartyPanel.css"

const headers = id => ({"X-User-ID": String(id)})
const relativeTime = timestamp => {
  const seconds = Math.max(0, Math.round((Date.now() - Number(timestamp || 0)) / 1000))
  if (seconds < 60) return "только что"
  if (seconds < 3600) return `${Math.round(seconds / 60)} мин назад`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} ч назад`
  return `${Math.round(seconds / 86400)} дн назад`
}

export const PartyPanel = ({id, selectedHero, onClose, onPartyReady}) => {
  const [tab, setTab] = useState("recent")
  const [party, setParty] = useState(null)
  const [recent, setRecent] = useState([])
  const [pending, setPending] = useState([])
  const [searchId, setSearchId] = useState("")
  const [searchResult, setSearchResult] = useState(null)
  const [message, setMessage] = useState("")
  const auth = useMemo(() => ({headers: headers(id)}), [id])

  const refresh = useCallback(async () => {
    const [recentResponse, pendingResponse] = await Promise.all([
      axios.get(`${PARTY_URL}/recent-teammates`, auth),
      axios.get(`${PARTY_URL}/invites/pending`, auth),
    ])
    setRecent(recentResponse.data || [])
    setPending(pendingResponse.data || [])
    if (party?.partyId) {
      const response = await axios.get(`${PARTY_URL}/${party.partyId}`, auth)
      setParty(response.data)
      onPartyReady?.(response.data)
    }
  }, [auth, onPartyReady, party?.partyId])

  useEffect(() => { refresh().catch(() => {}) }, [refresh])
  useEffect(() => { const timer = setInterval(() => refresh().catch(() => {}), 2500); return () => clearInterval(timer) }, [refresh])

  const createParty = async () => {
    try { const response = await axios.post(PARTY_URL, {maxSize: MAX_PARTY_SIZE, name: String(id)}, auth); setParty(response.data); onPartyReady?.(response.data); return response.data } catch { setMessage("Не удалось создать пати"); return null }
  }
  const invite = async playerId => {
    const activeParty = party || await createParty()
    if (!activeParty) return
    try { await axios.post(`${PARTY_URL}/${activeParty.partyId}/invites`, {playerId}, auth); setMessage("Приглашение отправлено") } catch (error) { setMessage(error.response?.data || "Не удалось отправить приглашение") }
  }
  const search = async event => {
    event.preventDefault()
    try { const response = await axios.get(`${PARTY_URL}/search?playerId=${encodeURIComponent(searchId)}`, auth); setSearchResult(response.data); setMessage("") } catch { setSearchResult(null); setMessage("Игрок не найден") }
  }
  const accept = async inviteId => { try { const response = await axios.post(`${PARTY_URL}/invites/${inviteId}/accept`, {}, auth); setParty(response.data); onPartyReady?.(response.data); setPending(items => items.filter(item => item.inviteId !== inviteId)) } catch { setMessage("Пати уже заполнено или приглашение устарело") } }
  const validation = canStartTeamParty(party?.members || [], party?.maxSize || MAX_PARTY_SIZE)
  const roster = arrangePartyMembers(party?.members || [], id)
  useEffect(() => { if (party?.partyId && selectedHero) axios.post(`${PARTY_URL}/${party.partyId}/members/${id}/hero`, {hero: selectedHero}, auth).then(response => { setParty(response.data); onPartyReady?.(response.data) }).catch(() => {}) }, [auth, id, onPartyReady, party?.partyId, selectedHero])

  return <div className="party-panel" role="dialog" aria-modal="true">
    <div className="party-panel__card">
      <button className="party-panel__close" onClick={onClose} aria-label="Закрыть">×</button>
    <div className="party-panel__eyebrow">TEAM BATTLE · {party?.maxSize || MAX_PARTY_SIZE} МЕСТА</div>
      <h2>ТВОЯ ПАТИ</h2>
      <div className="party-roster">{roster.length ? roster.map(member => <div className={`party-member ${member.owner ? "party-member--owner" : ""}`} key={member.playerId}><b>{member.name || member.playerId}</b><span>{member.hero || "Герой не выбран"}</span>{member.owner && <small>ЛИДЕР</small>}</div>) : <div className="party-empty">Создай пати и позови союзника</div>}</div>
      {party && <div className={`party-validation ${validation.ok ? "party-validation--ok" : ""}`}>{validation.ok ? "Герои пати уникальны" : validation.reason}</div>}
      <div className="party-tabs"><button className={tab === "recent" ? "active" : ""} onClick={() => setTab("recent")}>НЕДАВНИЕ СОЮЗНИКИ</button><button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>НАЙТИ ИГРОКА</button></div>
      {tab === "recent" && <div className="party-list">{recent.length ? recent.map(item => <div className="party-row" key={item.playerId}><div><b>{item.name || item.playerId}</b><small>{relativeTime(item.lastPlayedAt)} · игр: {item.games}</small></div><button onClick={() => invite(item.playerId)}>ПОЗВАТЬ</button></div>) : <p className="party-muted">Здесь появятся игроки, с которыми ты недавно играл.</p>}</div>}
      {tab === "search" && <form className="party-search" onSubmit={search}><input value={searchId} onChange={event => setSearchId(event.target.value)} placeholder="ID игрока"/><button>НАЙТИ</button>{searchResult && <div className="party-row"><div><b>{searchResult.name}</b><small>ID: {searchResult.playerId}</small></div><button type="button" onClick={() => invite(searchResult.playerId)}>ПОЗВАТЬ</button></div>}</form>}
      {pending.length > 0 && <div className="party-invites"><b>НОВЫЕ ПРИГЛАШЕНИЯ</b>{pending.map(inviteItem => <div key={inviteItem.inviteId}><span>{inviteItem.fromName} зовёт в пати</span><button onClick={() => accept(inviteItem.inviteId)}>ПРИНЯТЬ</button></div>)}</div>}
      {message && <p className="party-message">{message}</p>}
      {!party && <button className="party-create" onClick={createParty}>СОЗДАТЬ ПАТИ</button>}
      {party && <button className="party-create" disabled={!validation.ok} onClick={onClose}>В БОЙ</button>}
    </div>
  </div>
}
