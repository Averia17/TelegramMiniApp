import {useEffect, useState} from "react"
import {BrowserRouter, Route, Routes, useParams, useNavigate, useSearchParams} from "react-router-dom"
import LandingPage from "./pages/landing-page.jsx"
import {BattleGame} from "./components/BattleGame/BattleGame.jsx"
import axios from "axios"
import {getCookie, setCookie} from "./utils/cookie.js"
import {API_URL} from "./utils/urls.js"

const BattlePage = ({id}) => {
    const {roomId} = useParams()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const hero = searchParams.get('hero') || ''
    return <BattleGame playerId={id} roomId={roomId} heroName={hero} onExit={() => navigate("/")}/>
}

const App = () => {
    const [id, setId] = useState(undefined)

    useEffect(() => {
        const initData = window.Telegram?.WebApp.initDataUnsafe
        let userId = getCookie("user_id")
        const isLocalhost = window.location.hostname === 'localhost'
        if (isLocalhost && !userId) {
            userId = Math.floor(Math.random() * 100000) + 1
        }
        if (initData?.start_param && initData.start_param.includes("inviterId") && initData?.user?.id) {
            userId = initData.user.id
            const inviterId = Number(initData.start_param.replace("inviterId", ""))
            if (userId && inviterId) {
                axios.post(`${API_URL}/api/users/${userId}/accept_invite`, {inviter_id: inviterId})
            }
        }
        if (initData?.user?.id) {
            userId = initData.user.id
        }
        setId(Number.parseInt(userId))
        setCookie("user_id", userId, 1)
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
