import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import axios from "axios"
import {API_URL, BATTLE_URL, LB_URL} from "../../utils/urls.js"
import {mergeBattleHistory, readActiveBattle, readBattleHistory, normalizeBattleHistory} from "../../utils/battleHistory.js"
import {BattleHistory} from "./BattleHistory.jsx"
import {fetchRelease} from "../../utils/release.js"
import "./Tabs.css"

export const ProfileTab = ({id, onNicknameChange}) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingNickname, setEditingNickname] = useState(false)
  const [nicknameDraft, setNicknameDraft] = useState("")
  const [savingNickname, setSavingNickname] = useState(false)
  const [nicknameError, setNicknameError] = useState("")
  const [release, setRelease] = useState(null)
  const [battleHistory, setBattleHistory] = useState(() => readBattleHistory(id))
  const [historyPage, setHistoryPage] = useState({cursor: "", hasMore: false, loading: false, error: ""})
  const historyLoadingRef = useRef(false)
  const [activeBattle, setActiveBattle] = useState(() => readActiveBattle(id))
  const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user

  useEffect(() => {
    setBattleHistory(current => mergeBattleHistory(current, readBattleHistory(id)))
    setActiveBattle(readActiveBattle(id))
    const refreshHistory = () => {
      setBattleHistory(current => mergeBattleHistory(current, readBattleHistory(id)))
      setActiveBattle(readActiveBattle(id))
    }
    window.addEventListener("storage", refreshHistory)
    return () => window.removeEventListener("storage", refreshHistory)
  }, [id])

  useEffect(() => {
    let active = true
    Promise.allSettled([
      axios.get(`${API_URL}/users/me/profile`, {timeout: 7000}),
      axios.get(`${LB_URL}/profile/${id}`, {timeout: 7000}),
      axios.get(`${BATTLE_URL}/history?limit=20`, {timeout: 7000}),
    ]).then(([account, battle, history]) => {
      if (!active) return
      setData({
        account: account.status === "fulfilled" ? account.value.data : {},
        battle: battle.status === "fulfilled" ? battle.value.data : {},
      })
      if (account.status === "fulfilled") {
        setNicknameDraft(account.value.data.nickname || account.value.data.full_name || telegramUser?.first_name || "")
      }
      if (history.status === "fulfilled") {
        const payload = history.value.data || {}
        setBattleHistory(current => mergeBattleHistory(current, normalizeBattleHistory(payload.items)))
        setHistoryPage({cursor: String(payload.nextCursor || ""), hasMore: Boolean(payload.hasMore), loading: false, error: ""})
      } else {
        setHistoryPage({cursor: "", hasMore: false, loading: false, error: ""})
      }
    }).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [id, telegramUser?.first_name])

  useEffect(() => {
    let active = true
    fetchRelease().then(value => active && setRelease(value))
    return () => { active = false }
  }, [])

  const loadMoreBattleHistory = useCallback(async () => {
    if (!historyPage.hasMore || historyLoadingRef.current) return
    historyLoadingRef.current = true
    setHistoryPage(current => ({...current, loading: true, error: ""}))
    try {
      const query = new URLSearchParams({limit: "20"})
      if (historyPage.cursor) query.set("cursor", historyPage.cursor)
      const response = await axios.get(`${BATTLE_URL}/history?${query.toString()}`, {timeout: 7000})
      const payload = response.data || {}
      setBattleHistory(current => mergeBattleHistory(current, normalizeBattleHistory(payload.items)))
      setHistoryPage({cursor: String(payload.nextCursor || ""), hasMore: Boolean(payload.hasMore), loading: false, error: ""})
    } catch {
      setHistoryPage(current => ({...current, loading: false, error: "Не удалось загрузить ещё бои"}))
    } finally {
      historyLoadingRef.current = false
    }
  }, [historyPage.cursor, historyPage.hasMore])

  const saveNickname = async event => {
    event.preventDefault()
    setNicknameError("")
    if (nicknameDraft.trim().length < 4) {
      setNicknameError("Ник должен содержать минимум 4 символа")
      return
    }
    if (nicknameDraft.length > 20) {
      setNicknameError("Ник нельзя сделать длиннее 20 символов")
      return
    }
    setSavingNickname(true)
    try {
      const {data: result} = await axios.patch(`${API_URL}/users/me/nickname`, {nickname: nicknameDraft})
      setData(current => ({...current, account: {...(current?.account || {}), nickname: result.nickname}}))
      onNicknameChange?.(result.nickname)
      setEditingNickname(false)
    } catch (error) {
      setNicknameError(error.response?.data?.detail || "Не удалось сохранить ник")
    } finally {
      setSavingNickname(false)
    }
  }

  const profile = useMemo(() => {
    const account = data?.account || {}, battle = data?.battle || {}
    return {
      name: account.nickname || account.full_name || telegramUser?.first_name || battle.name || "БОЕЦ",
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
      <div className="bs-identity">
        <small>{profile.tag}</small>
        {editingNickname ? <form className="bs-nickname-editor" onSubmit={saveNickname}>
          <label htmlFor="nickname">ИГРОВОЙ НИК</label>
          <div className="bs-nickname-row"><input id="nickname" value={nicknameDraft} onChange={event => setNicknameDraft(event.target.value)} maxLength={20} autoFocus/><button type="submit" disabled={savingNickname}>{savingNickname ? "..." : "СОХРАНИТЬ"}</button></div>
          {nicknameError && <p role="alert">{nicknameError}</p>}
        </form> : <div className="bs-nickname-line"><h2>{profile.name}</h2><button className="bs-nickname-button" type="button" onClick={() => { setNicknameDraft(profile.name); setNicknameError(""); setEditingNickname(true) }}>✎ ИЗМЕНИТЬ НИК</button></div>}
        <span>{profile.username ? `@${profile.username}` : "ВНЕ КЛУБА"}</span>
      </div>
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
    <BattleHistory
      history={battleHistory}
      activeBattle={activeBattle}
      playerName={profile.name}
      hasMore={historyPage.hasMore}
      loadingMore={historyPage.loading}
      historyError={historyPage.error}
      onLoadMore={loadMoreBattleHistory}
    />
    <div className="bs-release-badge" data-testid="installed-release">
      <span>ВЕРСИЯ УСТАНОВКИ</span>
      <strong>{release?.tag || "..."}</strong>
      {release?.commit && <small>{release.commit.slice(0, 7)}</small>}
    </div>
  </section>
}

const rankInfo = score => score >= 11250 ? {name:"PRO",icon:"🔥"} : score >= 8500 ? {name:"МАСТЕР",icon:"👑"} : score >= 6000 ? {name:"ЛЕГЕНДА",icon:"🌟"} : score >= 4500 ? {name:"МИФИЧЕСКИЙ",icon:"🔮"} : score >= 3000 ? {name:"АЛМАЗ",icon:"💎"} : score >= 1500 ? {name:"ЗОЛОТО",icon:"🏅"} : score >= 750 ? {name:"СЕРЕБРО",icon:"⚙"} : {name:"БРОНЗА",icon:"🛡"}
const Stat = ({icon,label,value}) => <div className="bs-stat"><i>{icon}</i><span>{label}</span><b>{value}</b></div>
const State = ({icon,text}) => <div className="bs-state"><b>{icon}</b><span>{text}</span></div>
