import React from 'react';
import {Touchpad} from "./Touchpad.jsx";
import {Map} from "./Map.jsx";

import "./style.scss"


export const BattleScreen = ({id, ws, handleMove, camps, players}) => {
    return <div className="battle-screen">
        <Touchpad handleMove={handleMove}/>
        <Map id={id} ws={ws} camps={camps} players={players}/>
    </div>
}