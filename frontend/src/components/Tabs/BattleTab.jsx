import {BattleScreen} from "../Battle/BattleScreen.jsx";
import {getCookie} from "../../utils/cookie.js";
import {LoadingComponent} from "../BattleSearch/LoadingComponent.jsx";
import {WebSocketProvider} from "../Battle/WebSocketProvider.jsx";
import {useState} from "react";

export const BattleTab = () => {
    const id = Number.parseInt(getCookie("user_id"))
    const [battleId, setBattleId] = useState(undefined)

    return <div>
        <div>Player {id}</div>
        {battleId ? <>
                <div>BattleId {battleId}</div>
                <WebSocketProvider url={`ws://localhost:3779/battle/connect/${battleId}`}>
                    <BattleScreen id={id}/>
                </WebSocketProvider>
            </> :
            <LoadingComponent setBattleId={setBattleId}/>
        }
    </div>

}