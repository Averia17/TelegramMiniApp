import React, {useCallback} from "react";


export const Camp = React.memo(({ camp, attackCamp }) => {
    const handleAttack = useCallback((event) => {
        event.preventDefault();
        if (camp.health <= 0) {
            return;
        }
        attackCamp(camp.id)
    },[camp, attackCamp]);

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
        onClick={handleAttack}
    >
        <div>Camp {camp.id}</div>
        <div>HP {camp.health}</div>
        <div>Level {camp.level}</div>
    </button>
}, (prevProps, nextProps) => JSON.stringify(prevProps.camp) === JSON.stringify(nextProps.camp)
)
