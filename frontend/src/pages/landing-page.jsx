import {lazy, Suspense, useCallback, useEffect, useRef, useState} from "react"
import {useLocation, useNavigate, useSearchParams} from "react-router-dom"
import axios from "axios"
import {Leaderboard} from "../components/Tabs/Leaderboard.jsx"
import {ProfileTab} from "../components/Tabs/ProfileTab.jsx"
import {StoreTab} from "../components/Tabs/StoreTab.jsx"
import "./landing-page.css"
import {API_URL, PARTY_URL} from "../utils/urls.js"
import {BattleLoading} from "../components/BattleLoading/BattleLoading.jsx"
import {getBattleRoute, loadBattleHero, loadBattleMode, saveBattleHero, saveBattleMode} from "../utils/battlePreferences.js"
import {PartyPanel} from "../components/Party/PartyPanel.jsx"
import {canStartTeamParty, getBattleModeAfterPartyState, getPartyBattleIntent, shouldApplyPartyState} from "../components/Party/partyRoster.js"
import {PartyInviteNotifications} from "../components/Party/PartyInviteNotifications.jsx"
import {PartyRoster} from "../components/Party/PartyRoster.jsx"
import {MAX_PARTY_SIZE} from "../utils/urls.js"
import {getVisibleOutgoingInvites, INVITE_INVALID_DISPLAY_MS, mergeOutgoingInvites, mergeOutgoingInvitesAfterRefresh, OUTGOING_DECLINED_DISPLAY_MS} from "../components/Party/partyInvites.js"
import {formatEnergyCountdown, getEnergyRemainingSeconds} from "../utils/energyTimer.js"
import {InteractivePopover} from "../components/InteractivePopover/InteractivePopover.jsx"

const HeroSelect = lazy(() => import("../components/HeroSelect/HeroSelect.jsx").then(module => ({default: module.HeroSelect})))

const TABS = ["play", "rating", "profile", "store"]

const syncEconomy = data => ({...data, _syncedAt: Date.now()})

const LandingPage = ({id}) => {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get("tab")
  const [tab, setTab] = useState(() => TABS.includes(tabParam) ? tabParam : "play")
  const [selectedHero, setSelectedHero] = useState(() => loadBattleHero(id))
  const [nickname, setNickname] = useState("")
  const [economy, setEconomy] = useState({energy:100,max_energy:100,gold:0,crystals:0,taunt_charges:0,next_energy_in:0,_syncedAt:Date.now()})
  const [playError, setPlayError] = useState(() => location.state?.battleError || "")
  const [battleStarting, setBattleStarting] = useState(false)
  const [battleMode, setBattleMode] = useState(() => loadBattleMode(id))
  const [partyId, setPartyId] = useState(() => new URLSearchParams(window.location.search).get("party") || "")
  const [partyState, setPartyState] = useState(null)
  const [outgoingInvites, setOutgoingInvites] = useState([])
  const [incomingInviteStatuses, setIncomingInviteStatuses] = useState([])
  const [partyOpen, setPartyOpen] = useState(false)
  const explicitlySelectedBattleModeRef = useRef("")
  const handledPartyBattles = useRef(new Set())
  const latestPartyState = useRef(null)
  const outgoingInvitesRef = useRef([])
  const resolvedOutgoingInvitesRef = useRef(new Map())
  const delayedPartyRemovalRef = useRef(null)
  const disbandedPartyIdsRef = useRef(new Set())
  outgoingInvitesRef.current = outgoingInvites

  const refreshEconomy = useCallback(() => axios.get(`${API_URL}/economy/me`).then(({data}) => setEconomy(syncEconomy(data))).catch(() => {}), [])
  useEffect(() => { refreshEconomy(); const timer=setInterval(refreshEconomy,30000); return () => clearInterval(timer) }, [refreshEconomy])
  const [energyClock, setEnergyClock] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setEnergyClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const energyRemaining = getEnergyRemainingSeconds(economy, energyClock)
  const energyCountdown = economy.energy < economy.max_energy && energyRemaining > 0 ? formatEnergyCountdown(energyRemaining) : ""
  const energyRefreshRequested = useRef(false)
  useEffect(() => {
    if (economy.energy >= economy.max_energy || energyRemaining > 0) {
      energyRefreshRequested.current = false
      return
    }
    if (!energyRefreshRequested.current) {
      energyRefreshRequested.current = true
      refreshEconomy()
    }
  }, [economy.energy, economy.max_energy, energyRemaining, refreshEconomy])
  useEffect(() => {
    let active = true
    axios.get(`${API_URL}/users/me/profile`, {timeout: 7000}).then(({data}) => {
      if (active) setNickname(data.nickname || data.full_name || window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name || "")
    }).catch(() => {})
    return () => { active = false }
  }, [])
  useEffect(() => () => {
    if (delayedPartyRemovalRef.current) window.clearTimeout(delayedPartyRemovalRef.current)
  }, [])

  const selectHero = useCallback(hero => {
    setSelectedHero(hero)
    saveBattleHero(id, hero)
  }, [id])
  const changeBattleMode = useCallback(mode => {
    const nextMode = mode === "team" ? "team" : "solo"
    explicitlySelectedBattleModeRef.current = nextMode
    setBattleMode(nextMode)
    saveBattleMode(id, nextMode)
    setPlayError("")
  }, [id])
  const enterBattle = useCallback(async ({partyId: nextPartyId = "", partyTicket = "", intentId = ""} = {}) => {
    if (!selectedHero) return false
    setPlayError("")
    setBattleStarting(true)
    try {
      const battleIntentId = intentId || `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const battleModeForStart = nextPartyId ? "team" : battleMode
      navigate(getBattleRoute(battleModeForStart, nextPartyId), {state: {
        heroName: selectedHero,
        tauntActive: Boolean(economy.taunt_active),
        playerName: nickname,
        startNewBattle: true,
        battleIntentId: `${nextPartyId || battleModeForStart}:${battleIntentId}`,
        battleTicket: partyTicket,
      }})
      return true
    } catch (error) {
      setBattleStarting(false)
      setPlayError(error.response?.data?.detail || "Не удалось начать бой")
      return false
    }
  }, [battleMode, economy.taunt_active, navigate, nickname, selectedHero])
  const handlePartyReady = useCallback((state, {force = false} = {}) => {
    const nextParty = state?.partyId ? state : null
    if (nextParty?.partyId && disbandedPartyIdsRef.current.has(nextParty.partyId)) return
    const declinedInviteIsVisible = outgoingInvitesRef.current.some(invite => invite?.status === "declined" && Number(invite.respondedAt || 0) + OUTGOING_DECLINED_DISPLAY_MS > Date.now())
    if (!nextParty && force && declinedInviteIsVisible) {
      const disbandedPartyId = latestPartyState.current?.partyId
      if (disbandedPartyId) disbandedPartyIdsRef.current.add(disbandedPartyId)
      if (!delayedPartyRemovalRef.current) {
        delayedPartyRemovalRef.current = window.setTimeout(() => {
          delayedPartyRemovalRef.current = null
          latestPartyState.current = null
          setPartyState(null)
          setPartyId("")
          const nextMode = getBattleModeAfterPartyState(battleMode, null, explicitlySelectedBattleModeRef.current)
          if (nextMode !== battleMode) setBattleMode(nextMode)
          saveBattleMode(id, nextMode)
        }, OUTGOING_DECLINED_DISPLAY_MS)
      }
      return
    }
    if (nextParty && delayedPartyRemovalRef.current && nextParty.partyId === latestPartyState.current?.partyId) return
    if (delayedPartyRemovalRef.current) {
      window.clearTimeout(delayedPartyRemovalRef.current)
      delayedPartyRemovalRef.current = null
    }
    if (!shouldApplyPartyState(latestPartyState.current, nextParty, force)) return
    latestPartyState.current = nextParty
    setPartyState(nextParty)
    setPartyId(nextParty?.partyId || "")
    const nextMode = getBattleModeAfterPartyState(battleMode, nextParty, explicitlySelectedBattleModeRef.current)
    if (nextMode !== battleMode) setBattleMode(nextMode)
    saveBattleMode(id, nextMode)
  }, [battleMode, id])
  const handlePartyAccepted = useCallback(state => { changeBattleMode("team"); handlePartyReady(state) }, [changeBattleMode, handlePartyReady])
  const handleLeaveParty = useCallback(async () => {
    const activePartyId = partyState?.partyId
    if (!activePartyId) return
    try {
      await axios.delete(`${PARTY_URL}/${activePartyId}/members/${id}`, {headers: {"X-User-ID": String(id)}})
      outgoingInvitesRef.current = []
      setOutgoingInvites([])
      handlePartyReady(null, {force: true})
      setPlayError("")
    } catch {
      setPlayError("Не удалось выйти из пати")
    }
  }, [handlePartyReady, id, partyState?.partyId])
  const handleKickPartyMember = useCallback(async targetId => {
    const activePartyId = partyState?.partyId
    if (!activePartyId || !targetId) return
    try {
      const {data} = await axios.delete(`${PARTY_URL}/${activePartyId}/members/${encodeURIComponent(targetId)}`, {headers: {"X-User-ID": String(id)}})
      const nextParty = data?.party?.partyId ? data.party : null
      if (!nextParty) {
        outgoingInvitesRef.current = []
        setOutgoingInvites([])
      }
      handlePartyReady(nextParty, {force: true})
      setPlayError("")
    } catch {
      setPlayError("Не удалось исключить игрока")
    }
  }, [handlePartyReady, id, partyState?.partyId])
  const handleInviteUpdate = useCallback(invite => {
    if (invite?.status === "declined" || invite?.status === "accepted") {
      const previous = resolvedOutgoingInvitesRef.current.get(invite.inviteId)
      if (previous && Number(previous.respondedAt || 0) >= Number(invite.respondedAt || 0)) return
      resolvedOutgoingInvitesRef.current.set(invite.inviteId, invite)
      const next = mergeOutgoingInvites(outgoingInvitesRef.current, invite)
      outgoingInvitesRef.current = next
      setOutgoingInvites(next)
      window.setTimeout(() => setOutgoingInvites(current => {
        const remaining = current.filter(item => item.inviteId !== invite.inviteId)
        outgoingInvitesRef.current = remaining
        return remaining
      }), OUTGOING_DECLINED_DISPLAY_MS)
      return
    }
    if (invite?.status === "invalid") {
      const previous = resolvedOutgoingInvitesRef.current.get(invite.inviteId)
      if (previous && Number(previous.respondedAt || 0) >= Number(invite.respondedAt || 0)) return
      resolvedOutgoingInvitesRef.current.set(invite.inviteId, invite)
    }
    const next = getVisibleOutgoingInvites(mergeOutgoingInvites(outgoingInvitesRef.current, invite))
    outgoingInvitesRef.current = next
    setOutgoingInvites(next)
    if (invite?.status === "invalid") {
      const remaining = Math.max(0, Number(invite.respondedAt || Date.now()) + INVITE_INVALID_DISPLAY_MS - Date.now())
      window.setTimeout(() => setOutgoingInvites(current => {
        const visible = getVisibleOutgoingInvites(current)
        outgoingInvitesRef.current = visible
        return visible
      }), remaining + 25)
    }
  }, [])
  const handleIncomingInviteStatus = useCallback(invite => {
    if (!invite?.inviteId || String(invite.toId) !== String(id)) return
    setIncomingInviteStatuses(current => [...current.filter(item => item.inviteId !== invite.inviteId), invite])
    window.setTimeout(() => setIncomingInviteStatuses(current => current.filter(item => item.inviteId !== invite.inviteId)), 10_500)
  }, [id])
  const handleCancelInvite = useCallback(async inviteId => {
    try {
      const {data} = await axios.post(`${PARTY_URL}/invites/${encodeURIComponent(inviteId)}/cancel`, {}, {headers: {"X-User-ID": String(id)}})
      handleInviteUpdate(data)
    } catch (error) {
      setPlayError(error.response?.data || "Не удалось отменить приглашение")
    }
  }, [handleInviteUpdate, id])

  const partyBattleIntent = getPartyBattleIntent(partyState)
  useEffect(() => {
    if (!partyBattleIntent || !selectedHero || handledPartyBattles.current.has(partyBattleIntent)) return
    handledPartyBattles.current.add(partyBattleIntent)
    enterBattle({partyId: partyState.partyId, partyTicket: partyState.battleTicket, intentId: partyBattleIntent}).then(started => {
      if (!started) handledPartyBattles.current.delete(partyBattleIntent)
    })
  }, [enterBattle, partyBattleIntent, partyState?.battleTicket, partyState?.partyId, selectedHero])

  const refreshParty = useCallback(async () => {
    try {
      const auth = {headers: {"X-User-ID": String(id)}}
      const [partyResponse, invitesResponse] = await Promise.allSettled([
        axios.get(`${PARTY_URL}/mine`, auth),
        axios.get(`${PARTY_URL}/invites/outgoing`, auth),
      ])
      if (partyResponse.status === "fulfilled") handlePartyReady(partyResponse.value.data, {force: !partyResponse.value.data?.partyId})
      if (invitesResponse.status === "fulfilled") {
        const nextOutgoingInvites = mergeOutgoingInvitesAfterRefresh(outgoingInvitesRef.current, invitesResponse.value.data, Date.now(), [...resolvedOutgoingInvitesRef.current.values()])
        outgoingInvitesRef.current = nextOutgoingInvites
        setOutgoingInvites(nextOutgoingInvites)
      }
    } catch {
      // Keep the last known party during a temporary party-service outage.
    }
  }, [handlePartyReady, id])

  useEffect(() => {
    refreshParty()
    const timer = window.setInterval(refreshParty, 2500)
    return () => window.clearInterval(timer)
  }, [refreshParty])

  useEffect(() => {
    const ownMember = partyState?.members?.find(member => String(member.playerId) === String(id))
    if (!partyState?.partyId || !selectedHero || ownMember?.hero === selectedHero) return undefined
    axios.post(`${PARTY_URL}/${partyState.partyId}/members/${id}/hero`, {hero: selectedHero}, {headers: {"X-User-ID": String(id)}})
      .then(({data}) => handlePartyReady(data))
      .catch(() => {})
    return undefined
  }, [handlePartyReady, id, partyState, selectedHero])

  useEffect(() => {
    if (TABS.includes(tabParam) && tabParam !== tab) setTab(tabParam)
  }, [tab, tabParam])

  const switchTab = useCallback(nextTab => {
    setTab(nextTab)
    setSearchParams({tab: nextTab}, {replace: true})
  }, [setSearchParams])

  const handlePlay = useCallback(async () => {
    if (!selectedHero) return
    const activePartyId = partyState?.partyId || partyId
    if (battleMode === "team" && activePartyId) {
      const partyValidation = canStartTeamParty(partyState?.members || [], partyState?.maxSize || MAX_PARTY_SIZE)
      if (partyState && !partyValidation.ok) {
        setPlayError(partyValidation.reason)
        return
      }
    }
    if (battleMode === "team" && activePartyId) {
      setPlayError("")
      setBattleStarting(true)
      try {
        const {data} = await axios.post(`${PARTY_URL}/${activePartyId}/start`, {}, {headers: {"X-User-ID": String(id)}})
        handlePartyReady(data)
      } catch (error) {
        setBattleStarting(false)
        setPlayError(error.response?.data?.detail || "Не удалось запустить пати")
      }
      return
    }
    enterBattle()
  }, [battleMode, enterBattle, handlePartyReady, id, partyId, partyState, selectedHero])

  const playerDisplayName = nickname.trim() || "БОЕЦ"

  return (
    <main className={`lp lp--${tab}`}>
      <PartyInviteNotifications id={id} selectedHero={selectedHero} onAccepted={handlePartyAccepted} onPartyUpdated={handlePartyReady} onInviteStatus={handleInviteUpdate} onIncomingInviteStatus={handleIncomingInviteStatus}/>
      {tab === "play" && (
        <>
          <header className="lp-topbar">
            <button className="lp-profile-chip" onClick={() => switchTab("profile")}>
              <span>{playerDisplayName[0]}</span>
              <div><strong>{playerDisplayName}</strong><small><i>🏆</i> 0</small></div>
            </button>
            <div className="lp-currencies">
              {energyCountdown ? <InteractivePopover className="lp-energy-popover" content={`Энергия пополнится через ${energyCountdown}`} label="Показать время пополнения энергии">
                <Currency icon="⚡" value={`${economy.energy}/${economy.max_energy}`} subvalue={energyCountdown} color="#b663f1"/>
              </InteractivePopover> : <Currency icon="⚡" value={`${economy.energy}/${economy.max_energy}`} color="#b663f1"/>}
              <Currency icon="◆" value={economy.crystals} color="#53e473"/>
              <Currency icon="●" value={economy.gold} color="#ffd340"/>
            </div>
          </header>

          <div className="lp-lobby-backdrop"><i/><i/><i/></div>

          <nav className="lp-side-nav">
            <SideButton icon="▣" label="МАГАЗИН" badge="!" onClick={() => switchTab("store")}/>
            <SideButton icon="🏆" label="РЕЙТИНГ" onClick={() => switchTab("rating")}/>
            <SideButton icon="👤" label="ПРОФИЛЬ" onClick={() => switchTab("profile")}/>
            <SideButton icon="☰" label="НОВОСТИ" badge="1"/>
          </nav>

          <div className="lp-content lp-content--play">
            <PartyRoster party={partyState} playerId={id} onLeave={handleLeaveParty} onKick={handleKickPartyMember} onCancelInvite={handleCancelInvite} outgoingInvites={outgoingInvites}/>
            <Suspense fallback={<BattleLoading progress={28} status="Загружаем героев..." />}>
              <HeroSelect onSelect={selectHero} selectedHero={selectedHero} battleMode={battleMode} onModeChange={changeBattleMode} party={partyState} playerId={id}/>
            </Suspense>
          </div>

          <footer className="lp-battle-dock">
            <button className={`lp-team-button ${battleMode === "team" ? "is-active" : ""}`} onClick={() => { changeBattleMode("team"); setPartyOpen(true) }}><span>＋</span><small>{partyId ? "ПАТИ" : "КОМАНДА"}</small></button>
            <div className="lp-event-card">
              <div className="lp-event-icon">☠</div>
              <div><small>{battleMode === "team" ? "КОМАНДНЫЙ БОЙ" : "ОДИНОЧНОЕ СТОЛКНОВЕНИЕ"}</small><strong>{battleMode === "team" ? "Командная арена" : "Песчаный лабиринт"}</strong><span>{battleMode === "team" ? "Две команды по три игрока" : "Новая карта через 3ч."}</span></div>
            </div>
            <button className="lp-play-btn" disabled={!selectedHero || battleStarting} onClick={handlePlay} aria-busy={battleStarting}>
              В БОЙ!
            </button>
            {playError && <div className="lp-play-error" role="alert" aria-live="assertive">{playError}</div>}
          </footer>
        </>
      )}

      {battleStarting && <BattleLoading progress={18} status="Подготавливаем бой..." />}

      {partyOpen && <PartyPanel id={id} playerName={playerDisplayName} selectedHero={selectedHero} partyState={partyState} incomingInviteStatuses={incomingInviteStatuses} outgoingInvites={outgoingInvites} onClose={() => setPartyOpen(false)} onPartyReady={handlePartyReady} onInviteSent={handleInviteUpdate}/>}
      {tab !== "play" && (
        <>
          <header className="lp-page-header">
            <button onClick={() => switchTab("play")}>‹</button>
            <PageTitle tab={tab}/>
          </header>
          <div className="lp-content lp-content--page">
            {tab === "rating" && <Leaderboard playerId={id}/>}
            {tab === "profile" && <ProfileTab id={id} onNicknameChange={setNickname}/>}
            {tab === "store" && <StoreTab userId={id} economy={economy} onEconomyChange={data => setEconomy(syncEconomy(data))}/>}
          </div>
        </>
      )}
    </main>
  )
}

const Currency = ({icon, value, subvalue, color}) => (
  <div className={`lp-currency ${subvalue ? "lp-currency--stacked" : ""}`} style={{"--currency-color": color}}><span>{icon}</span><div><b>{value}</b>{subvalue && <small>{subvalue}</small>}</div><i>＋</i></div>
)

const SideButton = ({icon, label, badge, onClick}) => (
  <button className="lp-side-button" onClick={onClick}>
    {badge && <b>{badge}</b>}<span>{icon}</span><small>{label}</small>
  </button>
)

const PageTitle = ({tab}) => {
  if (tab === "rating") return <div><small>ЛУЧШИЕ ИГРОКИ</small><h1>РЕЙТИНГ</h1></div>
  if (tab === "store") return <div><small>ПРЕДЛОЖЕНИЯ АРЕНЫ</small><h1>МАГАЗИН</h1></div>
  return <div><small>КАРТОЧКА ИГРОКА</small><h1>ПРОФИЛЬ</h1></div>
}

export default LandingPage
