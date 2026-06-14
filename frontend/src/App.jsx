import {useEffect, useState} from "react"
import {BrowserRouter, Route, Routes, useParams, useNavigate} from "react-router-dom"

import LandingPage from "./pages/landing-page.jsx"
import {BattleGame} from "./components/BattleGame/BattleGame.jsx"

import axios from "axios";
import {getCookie, setCookie} from "./utils/cookie.js";

const RoomPage = ({id}) => {
    const {roomId} = useParams();
    const navigate = useNavigate();
    return <BattleGame playerId={id} roomId={roomId} onExit={() => navigate("/")}/>;
};

const App = () => {
    const [id, setId] = useState(undefined)

    useEffect(() => {
        const initData = window.Telegram?.WebApp.initDataUnsafe
        let userId = getCookie("user_id");
        if (import.meta.env.VITE_BACKEND_URL.includes("localhost") && !userId) {
            userId = Math.floor(Math.random() * 100000) + 1
        }
        if (initData?.start_param && initData.start_param.includes("inviterId") && initData?.user?.id) {
            userId = initData.user.id
            const inviterId = Number(initData.start_param.replace("inviterId", ""))
            if (userId && inviterId) {
                axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/users/${userId}/accept_invite`, {inviter_id: inviterId})
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
                <Route path="/room/:roomId" element={id ? <RoomPage id={id}/> : <></>}/>
            </Routes>
        </BrowserRouter>
    )
}

export default App
