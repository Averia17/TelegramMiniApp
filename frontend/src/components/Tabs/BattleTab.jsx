import {BattleScreen} from "../Battle/BattleScreen.jsx";
import {LoadingComponent} from "../BattleSearch/LoadingComponent.jsx";
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

    return <div>
        {loading ? <>Loading</> : <>
            <div>Player {id}</div>
            {battleId ? <>
                    <div>BattleId {battleId}</div>
                    <WebSocketProvider url={`ws://localhost:3779/battle/connect/${battleId}`}>
                        <BattleScreen id={id}/>
                    </WebSocketProvider>
                </> :
                <LoadingComponent setBattleId={setBattleId}/>
            }
        </>
        }
    </div>
}
