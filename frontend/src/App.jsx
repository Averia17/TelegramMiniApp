import {lazy, Suspense, useEffect, useState} from "react"
import {BrowserRouter, Route, Routes, useParams, useSearchParams} from "react-router-dom"
import LandingPage from "./pages/landing-page.jsx"
import axios from "axios"
import {getCookie, setCookie} from "./utils/cookie.js"
import {API_URL} from "./utils/urls.js"

const BattleGame = lazy(() => import("./components/BattleGame/BattleGame.jsx").then(module => ({default: module.BattleGame})))

const BattlePage = ({id}) => {
  const {roomId} = useParams()
  const [searchParams] = useSearchParams()
  const hero = searchParams.get("hero") || window.localStorage.getItem("battle_hero") || ""
  useEffect(() => {
    if (hero) window.localStorage.setItem("battle_hero", hero)
  }, [hero])
  return (
    <Suspense fallback={null}>
      <BattleGame playerId={id} roomId={roomId} heroName={hero}/>
    </Suspense>
  )
}

const App = () => {
  const [id, setId] = useState(undefined)

  useEffect(() => {
    const initData = window.Telegram?.WebApp.initDataUnsafe
    let userId = getCookie("user_id")
    if (!userId) userId = window.localStorage.getItem("battle_user_id")
    if (initData?.start_param && initData.start_param.includes("inviterId") && initData?.user?.id) {
      userId = initData.user.id
      const inviterId = Number(initData.start_param.replace("inviterId", ""))
      if (userId && inviterId) {
        axios.post(`${API_URL}/users/${userId}/accept_invite`, {inviter_id: inviterId})
      }
    }
    if (initData?.user?.id) {
      userId = initData.user.id
    }
    const parsedId = Number.parseInt(userId)
    const stableId = Number.isFinite(parsedId) ? parsedId : Math.floor(Math.random() * 900000) + 100000
    setId(stableId)
    setCookie("user_id", stableId, 1)
    window.localStorage.setItem("battle_user_id", String(stableId))
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={id ? <LandingPage id={id}/> : <></>}/>
        <Route path="/battle/:roomId?" element={id ? <BattlePage id={id}/> : <></>}/>
      </Routes>
    </BrowserRouter>
  )
}

export default App
