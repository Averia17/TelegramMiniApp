export const Map = ({id, players}) => {

    return <div style={{width: "1000px", height: "600px", position: "relative", border: "1px solid black"}}>
        {Object.entries(players).map(([player_id, data], index) => {
            return <div key={index} style={{
                position: "absolute", top: `${data.location[0]}px`, left: `${data.location[1]}px`, padding: "3px",
                border: player_id === id && "1px solid orange" }}>
                <div>Player {player_id}</div>
                <div>HP {data.health}</div>
            </div>
        })}
    </div>
}