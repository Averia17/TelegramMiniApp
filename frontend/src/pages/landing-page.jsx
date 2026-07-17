import {useCallback, useEffect, useState} from "react"
import {useNavigate, useSearchParams} from "react-router-dom"
import {HeroSelect} from "../components/HeroSelect/HeroSelect.jsx"
import {Leaderboard} from "../components/Tabs/Leaderboard.jsx"
import {ProfileTab} from "../components/Tabs/ProfileTab.jsx"
import "./landing-page.css"

const TABS = ["play", "rating", "profile"]

const LandingPage = ({id}) => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get("tab")
  const [tab, setTab] = useState(() => TABS.includes(tabParam) ? tabParam : "play")
  const [selectedHero, setSelectedHero] = useState(() => window.localStorage.getItem("battle_hero"))

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

  const handlePlay = useCallback(() => {
    if (selectedHero) navigate(`/battle?hero=${encodeURIComponent(selectedHero)}`)
  }, [navigate, selectedHero])

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
              <Currency icon="⚡" value="20" color="#b663f1"/>
              <Currency icon="◆" value="0" color="#53e473"/>
              <Currency icon="●" value="100" color="#ffd340"/>
            </div>
          </header>

          <div className="lp-lobby-backdrop"><i/><i/><i/></div>

          <nav className="lp-side-nav">
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
          </footer>
        </>
      )}

      {tab !== "play" && (
        <>
          <header className="lp-page-header">
            <button onClick={() => switchTab("play")}>‹</button>
            <div><small>{tab === "rating" ? "ЛУЧШИЕ ИГРОКИ" : "КАРТОЧКА ИГРОКА"}</small><h1>{tab === "rating" ? "РЕЙТИНГ" : "ПРОФИЛЬ"}</h1></div>
          </header>
          <div className="lp-content lp-content--page">
            {tab === "rating" && <Leaderboard/>}
            {tab === "profile" && <ProfileTab id={id}/>}
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

export default LandingPage
