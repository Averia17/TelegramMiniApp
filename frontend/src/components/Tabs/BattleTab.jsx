import {BattleScreen} from "../Battle/BattleScreen.jsx";
import {StartBattleComponent} from "../BattleSearch/StartBattleComponent.jsx";
import {WebSocketProvider} from "../Battle/WebSocketProvider.jsx";
import {useEffect, useState} from "react";
import axios from "axios";

export const BattleTab = ({id}) => {
    const [battleId, setBattleId] = useState(undefined)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        axios.get(`${import.meta.env.VITE_BACKEND_URL}/battle/player_state/${id}`).then(({data}) => {
            setBattleId(data.battle_id)
        }).finally(() => setLoading(false))
    }, [id])

    return <div className="battle-tab">
        <div className="battle-title">
            {loading ? <>Loading</> : <>
                <div>Player {id}</div>
                {battleId ? <div>BattleId {battleId}</div>: <StartBattleComponent setBattleId={setBattleId}/>}
            </>
            }
        </div>
        {battleId && <WebSocketProvider setBattleId={setBattleId} url={`${import.meta.env.VITE_WEBSOCKET_URL}/battle/connect/${battleId}`}>
            <BattleScreen id={id}/>
        </WebSocketProvider>}
    </div>
}
