import {Camp} from "./Camp.jsx";
import React from "react";
import {useWebSocket} from "./WebSocketProvider.jsx";

export const Camps = React.memo(() => {
    const { camps, attackCamp } = useWebSocket();

    return <>
        {camps && Object.keys(camps).length > 0 && Object.entries(camps)
            .map(([key, value]) => (
                <Camp key={key} attackCamp={attackCamp} camp={{
                    id: Number.parseInt(key),
                    health: value.health,
                    level: value.level,
                    location: value.location
                }}/>
            ))
        }
    </>
},)
