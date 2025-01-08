import React from "react";

export const Camp = ({ ws, camp }) => {
    const handleAttack = (event, camp) => {
        event.preventDefault();
        if (camp.health <= 0) {
            return;
        }
        ws.send(JSON.stringify({action: 'camp_attack', data: {camp_id: camp.id}}));
    };

    return <button
        style={{
            position: 'absolute',
            padding: '3px',
            pointerEvents: camp.health <= 0 ? 'none' : 'auto',
            left: `${camp.location[0]}px`,
            bottom: `${camp.location[1]}px`,
            userSelect: 'none',
        }}
        disabled={camp.health <= 0}
        key={camp.id}
        onClick={(event) => handleAttack(event, camp)}
    >
        <div>Camp {camp.id}</div>
        <div>HP {camp.health}</div>
        <div>Level {camp.level}</div>
    </button>
}
