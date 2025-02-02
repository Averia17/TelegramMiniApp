import React, { useMemo, useState} from "react";

import "./style.scss"
import {Players} from "./Players.jsx";
import {Camps} from "./Camps.jsx";


export const Map = React.memo(({id}) => {
    const [myPlayerLocation, setMyPlayerLocation] = useState(undefined)

    const offsets = useMemo(() => {
        if (!myPlayerLocation) return [0, 0];

        const OFFSET_X_MIN = -600;
        const OFFSET_X_MAX = 0;
        const OFFSET_Y_MIN = -450;
        const OFFSET_Y_MAX = 0;

        const [playerX, playerY] = myPlayerLocation;

        let offsetX = window.innerWidth / 2 - playerX;
        let offsetY = playerY - window.innerHeight;

        offsetX = Math.max(OFFSET_X_MIN, Math.min(offsetX, OFFSET_X_MAX));
        offsetY = Math.max(OFFSET_Y_MIN, Math.min(offsetY, OFFSET_Y_MAX));

        return [offsetX, offsetY];
    }, [myPlayerLocation]);

    return <div className="map" style={{transform: `translate(${offsets[0]}px, ${offsets[1]}px)`}}>
        <Players id={id} setMyPlayerLocation={setMyPlayerLocation}/>
        <Camps/>
    </div>
},)