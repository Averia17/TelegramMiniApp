import {Player} from "./Player.jsx";

export const Map = ({id, ws, players}) => {
    return <div style={{width: "1000px", height: "600px", position: "relative", border: "1px solid black"}}>
        {players.map((player) => (
            <Player ws={ws} id={id} player={player}/>
        ))}
    </div>
}