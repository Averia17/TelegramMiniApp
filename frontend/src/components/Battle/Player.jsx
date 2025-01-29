import React from 'react';


export const PlayerInfo = ({player, id, handleAttack}) => (
    <button
        style={{
            position: 'relative',
            padding: '3px',
            width: '90px',
            height: '54px',
            border: player.id === id && '1px solid orange',
        }}
        disabled={player.health <= 0}
        key={player.id}
        onClick={(event) => handleAttack(event, player.id)}
    >
        <div>Player {player.id}</div>
        <div>HP {player.health}</div>
        <div>Level {player.level}</div>
    </button>
);


export const Player = ({player, handleAttack}) => {

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
            <PlayerInfo handleAttack={handleAttack} player={player}/>
        </div>
    );
};
