import {MyPlayer} from "./MyPlayer.jsx";
import {Player} from "./Player.jsx";
import {Camp} from "./Camp.jsx";
import React from "react";

import "./style.scss"


export const Map = ({id, ws, camps, players}) => {
    const myPlayer = {id: id, ...players[id]}

    const handleAttack = (event, player_id) => {
        event.preventDefault();
        if (id === player_id) {
            return;
        }
        ws.send(JSON.stringify({action: 'attack', data: {player_id: player_id}}));
    };

    let offsetX = window.innerWidth / 2 - myPlayer.location[0]
    let offsetY = myPlayer.location[1] - window.innerHeight
    if (offsetX > 0) {
        offsetX = 0
    }
    if (offsetX < -600) {
        offsetX = -600
    }
    if (offsetY > 0) {
        offsetY = 0
    }
    if (offsetY < -450) {
        offsetY = -450
    }

    return <div className="map" style={{transform: `translate(${offsetX}px, ${offsetY}px)`}}>
        <MyPlayer id={id} player={myPlayer}/>
        {Object.entries(players)
            .filter(([key, value]) => Number.parseInt(key) !== id)
            .map(([key, value]) => ({
                id: Number.parseInt(key),
                health: value.health,
                level: value.level,
                location: value.location
            }))
            .map((player) => <Player key={player.id} handleAttack={handleAttack} player={player}/>)}

        {Object.entries(camps)
            .map(([key, value]) => ({
                id: Number.parseInt(key),
                health: value.health,
                level: value.level,
                location: value.location
            }))
            .map((camp) => <Camp key={camp.id} ws={ws} camp={camp}/>)}
    </div>
}