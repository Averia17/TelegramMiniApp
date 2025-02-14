import React, {useCallback, useEffect} from 'react';
import {Touchpad} from "./Touchpad.jsx";
import {Map} from "./Map.jsx";

import "./style.scss"
import {useWebSocket} from "./WebSocketProvider.jsx";


export const BattleScreen = ({id}) => {
    const {move} = useWebSocket();

    const handleMove = useCallback((event, direction) => {
        event.preventDefault();
        move(direction)
    }, [move]);

    useEffect(() => {
        document.addEventListener('keydown', (event) => {
            switch (event.code) {
                case 'KeyA':
                    handleMove(event, 'LEFT');
                    break;
                case 'KeyS':
                    handleMove(event, 'BOTTOM');
                    break;
                case 'KeyD':
                    handleMove(event, 'RIGHT');
                    break;
                case 'KeyW':
                    handleMove(event, 'TOP');
                    break;
                default:
                    break;
            }
        });
    }, [handleMove]);

    return <div className="battle-screen">
        <Touchpad handleMove={handleMove}/>
        <Map id={id}/>
    </div>
}