import {lazy, Suspense, useEffect, useState} from "react"
import {BrowserRouter, Route, Routes, useLocation, useParams} from "react-router-dom"
import axios from "axios"
import {API_URL} from "./utils/urls.js"
import {authenticate} from "./utils/auth.js"
import {BattleLoading} from "./components/BattleLoading/BattleLoading.jsx"
import {loadBattleHero} from "./utils/battlePreferences.js"

const BattleGame = lazy(() => import("./components/BattleGame/BattleGame.jsx").then(module => ({default: module.BattleGame})))
const LandingPage = lazy(() => import("./pages/landing-page.jsx"))

const BattlePage = ({id}) => {
  const {roomId} = useParams()
  const location = useLocation()
  const hero = location.state?.heroName || loadBattleHero(id)
  return (
    <Suspense fallback={<BattleLoading progress={32} status="Загружаем арену..." />}>
      <BattleGame playerId={id} roomId={roomId} heroName={hero}/>
    </Suspense>
  )
}

const App = () => {
  const [id, setId] = useState(undefined)
  const [authError, setAuthError] = useState("")

  useEffect(() => {
    authenticate().then(async ({user_id: userId}) => {
      setId(userId)
      const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param || ""
      if (startParam.startsWith("inviterId")) {
        const inviterId = Number(startParam.slice("inviterId".length))
        if (inviterId > 0) await axios.post(`${API_URL}/users/me/accept_invite`, {inviter_id: inviterId})
      }
    }).catch(error => setAuthError(error.response?.data?.detail || "Authentication failed"))
  }, [])

  return (
    <BrowserRouter>
      <Suspense fallback={<BattleLoading progress={18} status="Загружаем интерфейс..." />}>
        <Routes>
          <Route path="/" element={id ? <LandingPage id={id}/> : <div role="alert">{authError || "Авторизация…"}</div>}/>
          <Route path="/battle/:roomId?" element={id ? <BattlePage id={id}/> : <></>}/>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
