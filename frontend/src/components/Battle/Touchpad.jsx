import React from "react";

const Button = ({onClick, children}) => (
    <button className="touch-button" onClick={onClick} >
        {children}
    </button>
);

const MoveButton = ({direction, handleMove}) => (
    <Button onClick={(event) => handleMove(event, direction)}>
        {direction === 'TOP' && '↑'}
        {direction === 'LEFT' && '←'}
        {direction === 'RIGHT' && '→'}
        {direction === 'BOTTOM' && '↓'}
    </Button>
);

export const Touchpad = ({handleMove}) => {
    return <div className="touchpad">
        <div>
            <MoveButton direction="TOP" handleMove={handleMove}/>
        </div>
        <div className="vertical-buttons">
            <MoveButton direction="LEFT" handleMove={handleMove}/>
            <MoveButton direction="RIGHT" handleMove={handleMove}/>
        </div>
        <div>
            <MoveButton direction="BOTTOM" handleMove={handleMove}/>
        </div>
    </div>
}