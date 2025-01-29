import {useEffect, useState} from "react";
import {BattleScreen} from "../Battle/BattleScreen.jsx";
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

    const handleMove = (event, direction) => {
        event.preventDefault();
        ws.send(JSON.stringify({action: 'move', data: {direction: direction}}));
    };

    useEffect(() => {
        if(!ws) return

        document.addEventListener('keydown', (event) => {
            switch (event.key.toUpperCase()) {
                case 'A':
                    handleMove(event, 'LEFT');
                    break;
                case 'S':
                    handleMove(event, 'BOTTOM');
                    break;
                case 'D':
                    handleMove(event, 'RIGHT');
                    break;
                case 'W':
                    handleMove(event, 'TOP');
                    break;
                default:
                    break;
            }
        });
    }, [ws]);

    return (
        <div>
            <h1>Battle Game</h1>
            <div>Player {id}</div>
            {ws && Object.keys(players).length > 0 && Object.keys(camps).length > 0?
                <BattleScreen id={id} ws={ws} handleMove={handleMove} camps={camps} players={players}/>:
                <div>Loading...</div>
            }
        </div>
    );
}