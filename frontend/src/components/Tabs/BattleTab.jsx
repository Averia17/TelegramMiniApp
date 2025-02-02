import {BattleScreen} from "../Battle/BattleScreen.jsx";
import {getCookie} from "../../utils/cookie.js";

export const BattleTab = () => {
    const id = Number.parseInt(getCookie("user_id"))

    return (
        <div>
            <h1>Battle Game</h1>
            <div>Player {id}</div>
            <BattleScreen id={id}/>
        </div>
    );
}