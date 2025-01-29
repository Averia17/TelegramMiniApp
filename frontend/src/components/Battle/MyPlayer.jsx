import React, {useEffect} from 'react';
import {PlayerInfo} from "./Player.jsx";


export const MyPlayer = ({id, player}) => {

    return (
        <div
            style={{
                position: 'absolute',
                left: `${player.location[0]}px`,
                bottom: `${player.location[1]}px`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                userSelect: 'none',
            }}
        >
            <PlayerInfo player={player} id={id}/>
        </div>
    );
};
