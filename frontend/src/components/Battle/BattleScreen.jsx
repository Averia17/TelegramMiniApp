import React, {useCallback, useEffect} from 'react';
import {Touchpad} from "./Touchpad.jsx";
import {Map} from "./Map.jsx";

import "./style.scss"
import {useWebSocket} from "./WebSocketProvider.jsx";


export const BattleScreen = ({id}) => {
    const { move } = useWebSocket();

    const handleMove = useCallback((event, direction) => {
        event.preventDefault();
        move(direction)
    }, [move]);

    useEffect(() => {
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
    }, [handleMove]);

    return <div className="battle-screen">
        <Touchpad handleMove={handleMove}/>
        <Map id={id}/>
    </div>
}