import {Player} from "./Player.jsx";
import React, {useCallback} from "react";
import {useWebSocket} from "./WebSocketProvider.jsx";

export const Players = React.memo(({ id, setMyPlayerLocation }) => {
    const { players, attackPlayer } = useWebSocket();

    const handleAttack = useCallback((event, player) => {
        event.preventDefault();
        if (id === player.id || player.health <= 0) {
            return;
        }
        attackPlayer(player.id);
    }, [id, attackPlayer]);

    return (
        <>
            {players && Object.keys(players).length > 0 && Object.entries(players)
                .map(([key, value]) => {
                    const playerId = Number.parseInt(key);
                    return (
                        <Player
                            player={{
                                id: playerId,
                                health: value.health,
                                level: value.level,
                                location: value.location
                            }}
                            isMyPlayer={playerId === id}
                            key={playerId}
                            handleAttack={handleAttack}
                            setMyPlayerLocation={setMyPlayerLocation}
                        />
                    );
                })
            }
        </>
    );
},);