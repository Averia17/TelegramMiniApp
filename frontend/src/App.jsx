import {lazy, Suspense, useEffect, useState} from "react"
import {BrowserRouter, Route, Routes, useLocation, useNavigate, useParams} from "react-router-dom"
import axios from "axios"
import {API_URL} from "./utils/urls.js"
import {authenticate} from "./utils/auth.js"
import {BattleLoading} from "./components/BattleLoading/BattleLoading.jsx"
import {loadBattleHero} from "./utils/battlePreferences.js"
import {isMobileLandscape, requestPortraitOrientationLock} from "./utils/orientation.js"
import {setupTelegramWebApp} from "./utils/telegramWebApp.js"

const BattleGame = lazy(() => import("./components/BattleGame/BattleGame.jsx").then(module => ({default: module.BattleGame})))
const LandingPage = lazy(() => import("./pages/landing-page.jsx"))
const KattyLab = lazy(() => import("./pages/katty-lab.jsx"))

const AppLoading = () => {
  const navigate = useNavigate()
  return <BattleLoading progress={18} status="Загружаем интерфейс..." onCancel={() => navigate("/", {replace: true})}/>
}

const BattlePage = ({id}) => {
  const {roomId} = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const hero = location.state?.heroName || loadBattleHero(id)
  const battleIntentId = location.state?.battleIntentId || ""
  const query = new URLSearchParams(location.search)
  const [startNewBattle] = useState(() => {
    if (!location.state?.startNewBattle || !battleIntentId) return false
    try {
      return window.sessionStorage.getItem(`battle-start:${battleIntentId}`) !== "consumed"
    } catch (_error) {
      return true
    }
  })
  const mode = query.get("mode") === "team" ? "team" : "solo"
  const partyId = query.get("party") || ""
  const mapName = query.get("map") || ""
  const partyTicket = location.state?.battleTicket || ""
  const playerName = location.state?.playerName || ""
  const [tauntActive, setTauntActive] = useState(Boolean(location.state?.tauntActive))
  useEffect(() => {
    if (!startNewBattle || !battleIntentId) return
    try {
      window.sessionStorage.setItem(`battle-start:${battleIntentId}`, "consumed")
    } catch (_error) {
      // Recovery remains safe if session storage is unavailable: the server
      // still decides whether an active or finished battle belongs to the user.
    }
    const nextState = {...(location.state || {})}
    delete nextState.startNewBattle
    delete nextState.battleIntentId
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: Object.keys(nextState).length ? nextState : null,
    })
  }, [battleIntentId, location.pathname, location.search, location.state, navigate, startNewBattle])
  useEffect(() => {
    axios.get(`${API_URL}/economy/me`).then(({data}) => {
      setTauntActive(Boolean(data.taunt_active))
    }).catch(() => {})
  }, [])
  return (
    <Suspense fallback={<BattleLoading progress={32} status="Загружаем арену..." onCancel={() => navigate("/", {replace: true})} />}>
      <BattleGame playerId={id} playerName={playerName} roomId={roomId} heroName={hero} mode={mode} mapName={mapName} partyId={partyId} partyTicket={partyTicket} tauntActive={tauntActive} startNewBattle={startNewBattle}/>
    </Suspense>
  )
}

const getMobileLandscapeState = () => isMobileLandscape({
  width: window.innerWidth,
  height: window.innerHeight,
  coarsePointer: window.matchMedia?.("(pointer: coarse)")?.matches,
})

const PortraitOrientationGuard = ({children}) => {
  const [isLandscape, setIsLandscape] = useState(getMobileLandscapeState)

  useEffect(() => {
    requestPortraitOrientationLock()
    const updateOrientation = () => setIsLandscape(getMobileLandscapeState())
    window.addEventListener("resize", updateOrientation)
    window.addEventListener("orientationchange", updateOrientation)
    window.visualViewport?.addEventListener("resize", updateOrientation)
    return () => {
      window.removeEventListener("resize", updateOrientation)
      window.removeEventListener("orientationchange", updateOrientation)
      window.visualViewport?.removeEventListener("resize", updateOrientation)
    }
  }, [])

  return <>
    {children}
    {isLandscape && (
      <div className="portrait-orientation-guard" role="status" aria-live="polite">
        <div className="portrait-orientation-guard__card">
          <span className="portrait-orientation-guard__icon" aria-hidden="true">↻</span>
          <h1>Поверните телефон вертикально</h1>
          <p>Игра рассчитана на портретный режим.</p>
        </div>
      </div>
    )}
  </>
}

const App = () => {
  const [id, setId] = useState(undefined)
  const [authError, setAuthError] = useState("")

  useEffect(() => setupTelegramWebApp(), [])

  useEffect(() => {
    if (window.location.pathname === "/katty-lab") return undefined
    authenticate().then(async ({user_id: userId}) => {
      setId(userId)
      const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param || ""
      if (startParam.startsWith("inviterId")) {
        const inviterId = Number(startParam.slice("inviterId".length))
        if (inviterId > 0) await axios.post(`${API_URL}/users/me/accept_invite`, {inviter_id: inviterId})
      }
    }).catch(error => setAuthError(error.response?.data?.detail || "Authentication failed"))
    return undefined
  }, [])

  return (
    <PortraitOrientationGuard>
      <BrowserRouter future={{v7_startTransition:true, v7_relativeSplatPath:true}}>
        <Suspense fallback={<AppLoading />}>
          <Routes>
            <Route path="/katty-lab" element={<KattyLab/>}/>
            <Route path="/" element={id ? <LandingPage id={id}/> : <div role="alert">{authError || "Авторизация…"}</div>}/>
            <Route path="/battle/:roomId?" element={id ? <BattlePage id={id}/> : <></>}/>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </PortraitOrientationGuard>
  )
}

export default App
