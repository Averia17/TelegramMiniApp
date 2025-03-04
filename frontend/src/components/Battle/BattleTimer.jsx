import {useEffect, useState} from "react";
import {useWebSocket} from "./WebSocketProvider.jsx";

export const BattleTimer = () => {
    const {startTime} = useWebSocket()
    const [seconds, setSeconds] = useState(undefined);
    const BATTLE_TIME = 300

    useEffect(() => {
        if (!startTime) return

        const start = new Date(startTime).getTime();
        const now = new Date().getTime();
        const differenceInSeconds = Math.floor((now - start) / 1000);

        setSeconds(BATTLE_TIME - differenceInSeconds);

        const interval = setInterval(() => {
            setSeconds((prevSeconds) => prevSeconds - 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [startTime]);

    return <div>Left Time {seconds}s</div>
}