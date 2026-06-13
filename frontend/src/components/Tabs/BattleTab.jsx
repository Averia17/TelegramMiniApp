import {BattleGame} from "../BattleGame/BattleGame.jsx";

export const BattleTab = ({id}) => {
    return <div className="battle-tab">
        <BattleGame playerId={id} />
    </div>
}
