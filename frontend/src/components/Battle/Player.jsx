import React, {useEffect} from 'react';


export const PlayerInfo = ({player, isMyPlayer, handleAttack}) => (
    <button
        style={{
            position: 'relative',
            padding: '3px',
            width: '90px',
            height: '54px',
            border: isMyPlayer && '1px solid orange',
        }}
        disabled={player.health <= 0}
        key={player.id}
        onClick={(event) => handleAttack(event, player)}
    >
        <div>Player {player.id}</div>
        <div>HP {player.health}</div>
        <div>Level {player.level}</div>
    </button>
);


export const Player = React.memo(({isMyPlayer, player, handleAttack, setMyPlayerLocation}) => {
    useEffect(() => {
        if(isMyPlayer) {
            setMyPlayerLocation(player.location)
        }
    }, [isMyPlayer, player.location, setMyPlayerLocation]);

    return <div
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
        <PlayerInfo handleAttack={handleAttack} player={player} isMyPlayer={isMyPlayer}/>
    </div>
},
(prevProps, nextProps) => JSON.stringify(prevProps.player) === JSON.stringify(nextProps.player)
);
