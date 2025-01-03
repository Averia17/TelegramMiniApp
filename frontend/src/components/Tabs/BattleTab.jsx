import {useEffect, useState} from "react";
import {Map} from "../Battle/Map.jsx";
import {getCookie} from "../../utils/cookie.js";

export const BattleTab = () => {
    const [players, setPlayers] = useState([]);
    const [ws, setWs] = useState(null);
    const id = getCookie("user_id")

    useEffect(() => {
        const socket = new WebSocket('ws://localhost:3779/battle/connect');
        setWs(socket);

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data)
            setPlayers(data.players_data)
        };
        socket.onclose = (event) => {
            setPlayers((prevPlayers) =>prevPlayers.filter(({player_id}) => player_id !== id))
        }

        // return () => {
        //     socket.close();
        // };
    }, []);

    return (
        <div>
            <h1>Battle Game</h1>
            <div>Player {id}</div>
            {ws ?
                <Map id={id} ws={ws} players={players}/>:
                <div>Loading...</div>
            }
        </div>
    );
}