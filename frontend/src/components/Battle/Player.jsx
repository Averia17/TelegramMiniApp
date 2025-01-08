import React from 'react';

const Button = ({ onClick, children, style }) => (
    <button onClick={onClick} style={style}>
        {children}
    </button>
);

const MoveButton = ({ direction, handleMove }) => (
    <Button
        onClick={(event) => handleMove(event, direction)}
        style={{
            background: 'none',
            border: 'none',
            fontSize: '12px',
            padding: '6px',
        }}
    >
        {direction === 'TOP' && '↑'}
        {direction === 'LEFT' && '←'}
        {direction === 'RIGHT' && '→'}
        {direction === 'BOTTOM' && '↓'}
    </Button>
);

const PlayerInfo = ({ player, id, handleAttack }) => (
    <button
        style={{
            position: 'relative',
            padding: '3px',
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

export const Player = ({ id, ws, player }) => {
    const handleAttack = (event, player_id) => {
        event.preventDefault();
        if (id === player_id) {
            return;
        }
        ws.send(JSON.stringify({ action: 'attack', data: { player_id: player_id } }));
    };

    const handleMove = (event, direction) => {
        event.preventDefault();
        ws.send(JSON.stringify({ action: 'move', data: { direction: direction } }));
    };

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
            <div style={{ position: 'absolute', top: '-25px', left: '50%', transform: 'translateX(-50%)' }}>
                {player.id === id && <MoveButton direction="TOP" handleMove={handleMove} />}
            </div>
            <PlayerInfo player={player} id={id} handleAttack={handleAttack} />
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginLeft: '-30%',
                    width: '160%',
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                }}
            >
                {player.id === id && <MoveButton direction="LEFT" handleMove={handleMove} />}
                {player.id === id && <MoveButton direction="RIGHT" handleMove={handleMove} />}
            </div>
            <div style={{ position: 'absolute', bottom: '-25px', left: '50%', transform: 'translateX(-50%)' }}>
                {player.id === id && <MoveButton direction="BOTTOM" handleMove={handleMove} />}
            </div>
        </div>
    );
};
