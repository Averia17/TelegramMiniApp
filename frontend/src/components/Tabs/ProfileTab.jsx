import {useEffect, useMemo, useState} from "react"
import axios from "axios"
import {API_URL, LB_URL} from "../../utils/urls.js"
import "./Tabs.css"

export const ProfileTab = ({id}) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user

  useEffect(() => {
    let active = true
    Promise.allSettled([
      axios.get(`${API_URL}/users/${id}/profile`, {timeout: 7000}),
      axios.get(`${LB_URL}/profile/${id}`, {timeout: 7000}),
    ]).then(([account, battle]) => {
      if (!active) return
      setData({
        account: account.status === "fulfilled" ? account.value.data : {},
        battle: battle.status === "fulfilled" ? battle.value.data : {},
      })
    }).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [id])

  const profile = useMemo(() => {
    const account = data?.account || {}, battle = data?.battle || {}
    return {
      name: account.full_name || telegramUser?.first_name || battle.name || `БОЕЦ ${id}`,
      username: account.username || telegramUser?.username,
      tag: `#${String(id || 0).toUpperCase()}`,
      score: battle.score || 0, best: battle.score || 0, rank: battle.rank || 0,
      games: battle.games || 0, wins: battle.wins || 0, kills: battle.kills || 0,
    }
  }, [data, id, telegramUser])

  if (loading) return <State icon="⏳" text="Загружаем профиль..."/>
  const winRate = profile.games ? Math.round(profile.wins / profile.games * 100) : 0
  const rank = rankInfo(profile.score)

  return <section className="bs-profile">
    <div className="bs-player-card">
      <div className="bs-card-glow"/>
      <div className="bs-avatar">{profile.name[0]?.toUpperCase()}</div>
      <div className="bs-identity"><small>{profile.tag}</small><h2>{profile.name}</h2><span>{profile.username ? `@${profile.username}` : "ВНЕ КЛУБА"}</span></div>
      <div className="bs-title">ЗВЕЗДА АРЕНЫ</div>
    </div>
    <div className="bs-profile-grid">
      <Stat icon="🏆" label="ТРОФЕИ" value={profile.score}/><Stat icon="⭐" label="ЛУЧШИЙ РЕЗУЛЬТАТ" value={profile.best}/>
    </div>
    <div className="bs-ranked-card">
      <div className="bs-rank-emblem">{rank.icon}</div><div><small>РЕЙТИНГОВЫЙ РАНГ</small><h3>{rank.name}</h3><span>{profile.rank ? `#${profile.rank} в глобальном рейтинге` : "Сыграй бой для калибровки"}</span></div>
      <strong>{profile.score}</strong>
    </div>
    <h3 className="bs-section-title">СТАТИСТИКА БОЙЦА</h3>
    <div className="bs-stats-grid">
      <Stat icon="⚔" label="БОИ" value={profile.games}/><Stat icon="👑" label="ПОБЕДЫ" value={profile.wins}/><Stat icon="💥" label="УСТРАНЕНИЯ" value={profile.kills}/><Stat icon="%" label="ПОБЕД" value={`${winRate}%`}/>
    </div>
  </section>
}

const rankInfo = score => score >= 11250 ? {name:"PRO",icon:"🔥"} : score >= 8500 ? {name:"МАСТЕР",icon:"👑"} : score >= 6000 ? {name:"ЛЕГЕНДА",icon:"🌟"} : score >= 4500 ? {name:"МИФИЧЕСКИЙ",icon:"🔮"} : score >= 3000 ? {name:"АЛМАЗ",icon:"💎"} : score >= 1500 ? {name:"ЗОЛОТО",icon:"🏅"} : score >= 750 ? {name:"СЕРЕБРО",icon:"⚙"} : {name:"БРОНЗА",icon:"🛡"}
const Stat = ({icon,label,value}) => <div className="bs-stat"><i>{icon}</i><span>{label}</span><b>{value}</b></div>
const State = ({icon,text}) => <div className="bs-state"><b>{icon}</b><span>{text}</span></div>
