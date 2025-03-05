import {useEffect, useState} from "react";

export const StartBattleComponent = ({setBattleId}) => {
    const [startTime, setStartTime] = useState(undefined)
    const [seconds, setSeconds] = useState(undefined);
    const [ws, setWs] = useState(undefined)

    const startSearchBattle = () => {
        const socket = new WebSocket(`${import.meta.env.VITE_WEBSOCKET_URL}/battle/start`);
        setWs(socket)
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data?.battle_id) {
                setBattleId(data.battle_id)
            }
            if (data?.start_time) {
                setStartTime(data.start_time)
            }
        };
        socket.onclose = (event) => {
            setWs(undefined)
            setSeconds(undefined)
            setStartTime(undefined)
        };
    }

    useEffect(() => {
        if (!startTime) return

        const start = new Date(startTime).getTime();
        const now = new Date().getTime();
        const differenceInSeconds = Math.floor((now - start) / 1000);

        setSeconds(differenceInSeconds);

        const interval = setInterval(() => {
            setSeconds((prevSeconds) => prevSeconds + 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [startTime]);

    const stopSearchBattle = () => {
        ws.send(JSON.stringify({"type": "stop"}))
    }

    return <div className="loading-container">
        {startTime ? <div>
            <div>Finding {seconds}s</div>
            Start {new Date(startTime).toLocaleTimeString()}
            <button disabled={!ws} onClick={stopSearchBattle}>Stop</button>
        </div> : <button onClick={startSearchBattle}>Start Battle</button>
        }
    </div>

}