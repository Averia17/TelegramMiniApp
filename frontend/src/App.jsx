import {useEffect, useState} from "react"
import {BrowserRouter, Route, Routes} from "react-router-dom"

import LandingPage from "./pages/landing-page.jsx"

import {useHapticFeedback, useShowPopup} from "@vkruglikov/react-telegram-web-app"
import axios from "axios";
import {getCookie, setCookie} from "./utils/cookie.js";

const App = () => {
    const showPopup = useShowPopup()
    const [impactOccurred, notificationOccurred, selectionChanged] = useHapticFeedback()
    // const [isInvalidVersion, setIsInvalidVersion] = useState(false)
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
                axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/users/${userId}/accept_invite`, {inviter_id: inviterId}).then(({data}) => {

                })
            }
        }
        if(initData?.user?.id) {
            userId = initData?.user?.id
        }
        setId(Number.parseInt(userId))
        setCookie("user_id", userId, 1)
        // if (window.Telegram && window.Telegram.WebApp) {
        //     if (!window.Telegram.WebApp.isVersionAtLeast("6.9")) {
        //         notificationOccurred("error")
        //         if (window.Telegram.WebApp.isVersionAtLeast("6.2")) {
        //             showPopup({message: "Please update your Telegram app to the latest version to use this app."})
        //         } else {
        //             console.log("the version is not supported")
        //             setIsInvalidVersion(true)
        //         }
        //     }
        //     // Alternatively to what can be set with react-telegram-web-app, you can directly set the following properties:
        //     try {
        //         window.Telegram.WebApp.requestWriteAccess()
        //     } catch (e) {
        //         console.log(e)
        //     }
        //     window.Telegram.WebApp.expand()
        // }
    }, [])

    return (
        <>
            {/*{isInvalidVersion &&*/}
            {/*          (<div className="invalid-version">*/}
            {/*            <div className="invalid-version__content">*/}
            {/*              <h1>Sorry but this version is outdated!*/}
            {/*              </h1>*/}
            {/*              <h1>Please update your Telegram app to the latest*/}
            {/*                          version to*/}
            {/*                          use this app.</h1>*/}
            {/*            </div>*/}
            {/*          </div>*/}
            {/*          )}*/}
            {/*{!isInvalidVersion && (*/}
            <BrowserRouter>
                <Routes>
                    {<Route path="/" element={id ? <LandingPage id={id}/> : <></>}/>}
                </Routes>
            </BrowserRouter>
            {/*)}*/}
        </>
    )
}

export default App
