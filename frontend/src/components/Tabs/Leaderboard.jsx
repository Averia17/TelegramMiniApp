import {useEffect, useMemo, useState} from "react"
import axios from "axios"
import {LB_URL} from "../../utils/urls.js"
import "./Tabs.css"

export const Leaderboard = ({playerId}) => {
  const [players, setPlayers] = useState([])
  const [status, setStatus] = useState("loading")
  const [scope, setScope] = useState("global")

  const load = () => {
    setStatus("loading")
    axios.get(`${LB_URL}?limit=100`, {timeout: 7000})
      .then(({data}) => { setPlayers(Array.isArray(data) ? data : []); setStatus("ready") })
      .catch(() => setStatus("error"))
  }
  useEffect(load, [])

  const visible = useMemo(() => scope === "friends"
    ? players.filter(p => String(p.playerId) === String(playerId))
    : players, [players, playerId, scope])
  const myRank = players.findIndex(p => String(p.playerId) === String(playerId)) + 1

  return <section className="bs-board">
    <div className="bs-tabs">
      <button className={scope === "global" ? "active" : ""} onClick={() => setScope("global")}>ГЛОБАЛЬНЫЙ</button>
      <button className={scope === "friends" ? "active" : ""} onClick={() => setScope("friends")}>МОЙ РЕЗУЛЬТАТ</button>
    </div>
    <div className="bs-season"><span>СЕЗОН АРЕНЫ</span><b>Лучшие бойцы</b><small>Побеждай и поднимайся в таблице</small></div>
    {myRank > 0 && <div className="bs-my-rank"><span>ТВОЁ МЕСТО</span><b>#{myRank}</b><strong>{players[myRank-1]?.score || 0} 🏆</strong></div>}
    {status === "loading" && <State icon="⏳" text="Загружаем рейтинг..."/>}
    {status === "error" && <State icon="!" text="Рейтинг временно недоступен" action={load}/>}
    {status === "ready" && visible.length === 0 && <State icon="🏆" text={scope === "friends" ? "Сыграй первый бой, чтобы попасть в рейтинг" : "В рейтинге пока никого нет"}/>}
    {status === "ready" && visible.length > 0 && <div className="bs-ranking-list">
      {visible.map((player, index) => <PlayerRow key={player.playerId} player={player} rank={scope === "friends" ? myRank : index + 1} me={String(player.playerId) === String(playerId)}/>) }
    </div>}
  </section>
}

const PlayerRow = ({player, rank, me}) => <article className={`bs-rank-row bs-rank-${Math.min(rank,4)}${me ? " is-me" : ""}`}>
  <div className="bs-rank-number">{rank <= 3 ? ["🥇","🥈","🥉"][rank-1] : `#${rank}`}</div>
  <div className="bs-player-icon">{(player.name || "P")[0].toUpperCase()}</div>
  <div className="bs-player-copy"><b>{player.name || `БОЕЦ ${player.playerId}`}</b><span>{player.games || 0} боёв · {player.wins || 0} побед · {player.kills || 0} устранений</span></div>
  <strong>{player.score || 0}<small>🏆</small></strong>
</article>

const State = ({icon, text, action}) => <div className="bs-state"><b>{icon}</b><span>{text}</span>{action && <button onClick={action}>ПОВТОРИТЬ</button>}</div>
