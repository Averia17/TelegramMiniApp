import {useCallback, useEffect, useState} from "react"
import {useNavigate, useSearchParams} from "react-router-dom"
import axios from "axios"
import {HeroSelect} from "../components/HeroSelect/HeroSelect.jsx"
import {Leaderboard} from "../components/Tabs/Leaderboard.jsx"
import {ProfileTab} from "../components/Tabs/ProfileTab.jsx"
import {StoreTab} from "../components/Tabs/StoreTab.jsx"
import "./landing-page.css"
import {API_URL} from "../utils/urls.js"

const TABS = ["play", "rating", "profile", "store"]

const LandingPage = ({id}) => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get("tab")
  const [tab, setTab] = useState(() => TABS.includes(tabParam) ? tabParam : "play")
  const [selectedHero, setSelectedHero] = useState(() => window.localStorage.getItem("battle_hero"))
  const [economy, setEconomy] = useState({energy:100,max_energy:100,gold:0,next_energy_in:0})
  const [playError, setPlayError] = useState("")

  const refreshEconomy = useCallback(() => axios.get(`${API_URL}/economy/me`).then(({data}) => setEconomy(data)).catch(() => {}), [])
  useEffect(() => { refreshEconomy(); const timer=setInterval(refreshEconomy,30000); return () => clearInterval(timer) }, [refreshEconomy])

  const selectHero = useCallback(hero => {
    setSelectedHero(hero)
    if (hero) window.localStorage.setItem("battle_hero", hero)
  }, [])

  useEffect(() => {
    if (TABS.includes(tabParam) && tabParam !== tab) setTab(tabParam)
  }, [tab, tabParam])

  const switchTab = useCallback(nextTab => {
    setTab(nextTab)
    setSearchParams({tab: nextTab}, {replace: true})
  }, [setSearchParams])

  const handlePlay = useCallback(async () => {
    if (!selectedHero) return
    setPlayError("")
    try {
      const {data}=await axios.post(`${API_URL}/economy/me/battle`)
      setEconomy(data)
      navigate(`/battle?hero=${encodeURIComponent(selectedHero)}`)
    } catch (error) { setPlayError(error.response?.data?.detail || "Не удалось начать бой") }
  }, [id,navigate,selectedHero])

  const playerTag = `P${String(id || 0).slice(-6)}`

  return (
    <main className={`lp lp--${tab}`}>
      {tab === "play" && (
        <>
          <header className="lp-topbar">
            <button className="lp-profile-chip" onClick={() => switchTab("profile")}>
              <span>{playerTag[1] || "P"}</span>
              <div><strong>{playerTag}</strong><small><i>🏆</i> 0</small></div>
            </button>
            <div className="lp-currencies">
              <Currency icon="⚡" value={`${economy.energy}/${economy.max_energy}`} color="#b663f1"/>
              <Currency icon="◆" value="0" color="#53e473"/>
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
            <HeroSelect onSelect={selectHero} selectedHero={selectedHero}/>
          </div>

          <footer className="lp-battle-dock">
            <button className="lp-team-button"><span>＋</span><small>КОМАНДА</small></button>
            <div className="lp-event-card">
              <div className="lp-event-icon">☠</div>
              <div><small>ОДИНОЧНОЕ СТОЛКНОВЕНИЕ</small><strong>Песчаный лабиринт</strong><span>Новая карта через 3ч.</span></div>
            </div>
            <button className="lp-play-btn" disabled={!selectedHero} onClick={handlePlay}>
              В БОЙ!
            </button>
            {playError && <div className="lp-play-error">{playError}</div>}
          </footer>
        </>
      )}

      {tab !== "play" && (
        <>
          <header className="lp-page-header">
            <button onClick={() => switchTab("play")}>‹</button>
            <PageTitle tab={tab}/>
          </header>
          <div className="lp-content lp-content--page">
            {tab === "rating" && <Leaderboard playerId={id}/>}
            {tab === "profile" && <ProfileTab id={id}/>}
            {tab === "store" && <StoreTab userId={id} economy={economy} onEconomyChange={setEconomy}/>}
          </div>
        </>
      )}
    </main>
  )
}

const Currency = ({icon, value, color}) => (
  <div className="lp-currency" style={{"--currency-color": color}}><span>{icon}</span><b>{value}</b><i>＋</i></div>
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
