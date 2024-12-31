import {useEffect, useState} from "react";
import {Map} from "../Battle/Map.jsx";
import {getCookie} from "../../utils/cookie.js";

export const BattleTab = () => {
    const [players, setPlayers] = useState([]);
    const [input, setInput] = useState('');
    const [ws, setWs] = useState(null);
    const id = getCookie("user_id")
    useEffect(() => {
        console.log("connect")
        const socket = new WebSocket('ws://localhost:3779/battle/connect');
        setWs(socket);

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data)
            setPlayers(data.players_data)
        };
        socket.onclose = (event) => {

        }

        // return () => {
        //     socket.close();
        // };
    }, []);

    const sendMessage = (event) => {
        event.preventDefault();
        if (ws && input) {
            ws.send(input);
            setInput('');
        }
    };
    console.log(players)
    return (
        <div>
            <h1>Battle Game</h1>
            <div>Player {id}</div>
            <Map id={id} players={players}/>
            <form onSubmit={sendMessage}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    autoComplete="off"
                />
                <button type="submit">Send</button>
            </form>
        </div>
    );
}