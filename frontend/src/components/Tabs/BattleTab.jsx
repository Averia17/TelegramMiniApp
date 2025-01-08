import {useEffect, useState} from "react";
import {Map} from "../Battle/Map.jsx";
import {getCookie} from "../../utils/cookie.js";

export const BattleTab = () => {
    const [players, setPlayers] = useState([]);
    const [camps, setCamps] = useState([]);
    const [ws, setWs] = useState(null);
    const id = Number.parseInt(getCookie("user_id"))

    useEffect(() => {
        const socket = new WebSocket('ws://localhost:3779/battle/connect');
        setWs(socket);

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data)
            if(data.players_data) {
                setPlayers(data.players_data)
            }
            if(data.camps) {
                setCamps(data.camps)
            }
            if(data.player_id) {
                setPlayers((prevPlayers) => {
                    prevPlayers[id] = data.player_id
                    return {...prevPlayers}
                })
            }
        };
        socket.onclose = (event) => {
            setPlayers((prevPlayers) => {
                delete prevPlayers[id]
                return {...prevPlayers}
            })
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
                <Map id={id} ws={ws} camps={camps} players={players}/>:
                <div>Loading...</div>
            }
        </div>
    );
}