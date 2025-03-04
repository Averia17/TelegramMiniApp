import React, {createContext, useState, useEffect, useCallback} from 'react';
import {getCookie} from "../../utils/cookie.js";

const WebSocketContext = createContext(null);

const deepUpdate = (data, newData) => {
    const updatedData = {...data};
    for (const key in newData) {
        updatedData[key] = {
            ...(updatedData[key] || {}),
            ...newData[key]
        };
    }
    return updatedData;
}

export const WebSocketProvider = ({children, url}) => {
    const [ws, setWs] = useState(null);
    const [players, setPlayers] = useState({});
    const [camps, setCamps] = useState({});
    const [startTime, setStartTime] = useState(undefined);
    const id = Number.parseInt(getCookie("user_id"))

    useEffect(() => {
        const socket = new WebSocket(url);
        setWs(socket);
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            Object.keys(data).forEach((entity) => {
                const entityData = data[entity];
                if (typeof entityData === 'object' && entityData !== null) {
                    if (entity === "player") {
                        setPlayers(prevPlayers => deepUpdate(prevPlayers, entityData))
                    }
                    if (entity === "camp") {
                        setCamps(prevCamps => deepUpdate(prevCamps, entityData))
                    }
                }
                if (entity === "start_time") {
                    setStartTime(entityData)
                }
            });
        };
        socket.onclose = (event) => {
            setPlayers((prevPlayers) => {
                const newPlayers = {...prevPlayers};
                delete newPlayers[id];
                return newPlayers;
            });
        };
        // return () => {
        //     socket.close();
        // };
    }, [url]);

    const move = useCallback((direction) => {
        ws && ws.send(JSON.stringify({action: 'move', data: {direction: direction}}));
    }, [ws]);

    const attackPlayer = useCallback((playerId) => {
        ws.send(JSON.stringify({action: 'attack_player', data: {player_id: playerId}}));
    }, [ws]);

    const attackCamp = useCallback((campId) => {
        ws.send(JSON.stringify({action: 'attack_camp', data: {camp_id: campId}}));
    }, [ws]);

    return (
        <WebSocketContext.Provider
            value={{
                move,
                attackPlayer,
                attackCamp,
                players,
                startTime,
                camps
            }}
        >
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => React.useContext(WebSocketContext);