import {Player} from "./Player.jsx";
import {Camp} from "./Camp.jsx";

export const Map = ({id, ws, camps, players}) => {
    return <div style={{width: "1000px", height: "600px", position: "relative", border: "1px solid black"}}>
        {Object.entries(players).map(([key, value]) => ({
            id: Number.parseInt(key),
            health: value.health,
            level: value.level,
            location: value.location
        })).map((player) => <Player ws={ws} id={id} player={player}/>)}

        {Object.entries(camps).map(([key, value]) => ({
            id: Number.parseInt(key),
            health: value.health,
            level: value.level,
            location: value.location
        })).map((camp) => <Camp ws={ws} camp={camp}/>)}
    </div>
}