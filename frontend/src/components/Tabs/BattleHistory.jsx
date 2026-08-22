import {useEffect, useRef, useState} from "react"
import {Link} from "react-router-dom"
import {
  formatBattleDate,
  formatBattleDuration,
  getBattleMapLabel,
  getBattleModeLabel,
  getBattleHistoryPresentation,
} from "../../utils/battleHistory.js"
import {getBattleResumeRoute} from "../../utils/battlePreferences.js"
import "./BattleHistory.css"

export const BattleHistory = ({history = [], activeBattle = null, playerName = "", hasMore = false, loadingMore = false, historyError = "", onLoadMore}) => {
  const [isOpen, setIsOpen] = useState(false)
  const closeButtonRef = useRef(null)
  const listRef = useRef(null)
  const loadMoreRef = useRef(null)
  const latestBattle = history[0]

  useEffect(() => {
    if (!isOpen) return undefined
    closeButtonRef.current?.focus()
    const closeOnEscape = event => event.key === "Escape" && setIsOpen(false)
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !hasMore || !loadMoreRef.current || !listRef.current || typeof IntersectionObserver === "undefined") return undefined
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) onLoadMore?.()
    }, {root: listRef.current, rootMargin: "180px 0px"})
    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [hasMore, isOpen, onLoadMore])

  return <section className="bs-battle-history" aria-labelledby="battle-history-title">
    <div className="bs-battle-history__header">
      <div>
        <span className="bs-battle-history__eyebrow">После арены</span>
        <h3 id="battle-history-title">История боёв</h3>
      </div>
      {history.length > 0 && <button className="bs-battle-history__all" type="button" onClick={() => setIsOpen(true)}>
        Все бои <span aria-hidden="true">→</span>
      </button>}
    </div>

    {activeBattle && <ActiveBattleCard battle={activeBattle} playerName={playerName}/>}
    {latestBattle
      ? <BattleCard battle={latestBattle} featured/>
      : !activeBattle && <div className="bs-battle-history__empty">
        <span aria-hidden="true">◌</span>
        <strong>Пока без боёв</strong>
        <p>Здесь появится последний результат после первой арены.</p>
      </div>}

    {isOpen && <div className="bs-battle-modal" role="presentation" onMouseDown={event => event.target === event.currentTarget && setIsOpen(false)}>
      <div className="bs-battle-modal__sheet" role="dialog" aria-modal="true" aria-labelledby="all-battles-title">
        <div className="bs-battle-modal__handle" aria-hidden="true"/>
        <header className="bs-battle-modal__header">
          <div>
            <span>Архив результатов</span>
            <h2 id="all-battles-title">Все бои <small>{history.length}</small></h2>
          </div>
          <button ref={closeButtonRef} type="button" className="bs-battle-modal__close" onClick={() => setIsOpen(false)} aria-label="Закрыть историю боёв">×</button>
        </header>
        <div ref={listRef} className="bs-battle-modal__list">
          {history.map(battle => <BattleCard key={battle.id} battle={battle}/>) }
          {(hasMore || loadingMore || historyError) && <div ref={loadMoreRef} className="bs-battle-history__loader" aria-live="polite">
            {loadingMore && <span>Загружаем ещё…</span>}
            {!loadingMore && historyError && <button type="button" onClick={onLoadMore}>{historyError} · Повторить</button>}
          </div>}
        </div>
      </div>
    </div>}
  </section>
}

const ActiveBattleCard = ({battle, playerName}) => <article className="bs-active-battle" data-testid="active-battle">
  <div className="bs-active-battle__copy">
    <span>Бой ещё идёт</span>
    <strong>{getBattleModeLabel(battle.mode)}</strong>
    <small>Можно вернуться на арену и продолжить с текущего места.</small>
  </div>
  <Link
    className="bs-active-battle__link"
    to={getBattleResumeRoute(battle)}
    state={{playerName}}
  >
    ПОДКЛЮЧИТЬСЯ
  </Link>
</article>

const BattleCard = ({battle, featured = false}) => {
  const presentation = getBattleHistoryPresentation(battle)
  const partyNames = battle.partyMembers?.map(member => member.name).filter(Boolean) || []
  const statItems = [
    [battle.kills, "устранения"],
    [battle.deaths, "падения"],
    [formatBattleDuration(battle.duration), "длительность"],
  ]

  return <article className={`bs-battle-card bs-battle-card--${presentation.kind}${presentation.tone ? ` bs-battle-card--${presentation.tone}` : ""}${featured ? " bs-battle-card--featured" : ""}`} data-testid={featured ? "latest-battle" : undefined}>
    <div className="bs-battle-card__topline">
      <div className="bs-battle-card__result">
        <span className="bs-battle-card__result-icon" aria-hidden="true">{presentation.icon}</span>
        <div><strong>{presentation.label}</strong><small>{formatBattleDate(battle.finishedAt)}</small></div>
      </div>
      <span className="bs-battle-card__map-mark" aria-hidden="true">⌖</span>
    </div>
    <div className="bs-battle-card__main">
      <div className="bs-battle-card__arena">
        <strong>{getBattleMapLabel(battle.mapName)}</strong>
        <span>{getBattleModeLabel(battle.mode)}</span>
      </div>
    </div>
    <div className="bs-battle-card__stats" aria-label="Краткая статистика боя">
      {statItems.map(([value, label]) => <span key={label}><b>{value}</b><small>{label}</small></span>)}
    </div>
    {partyNames.length > 0 && <div className="bs-battle-card__party">
      <span aria-hidden="true">+</span><small>С отрядом</small><strong>{partyNames.slice(0, 3).join(" · ")}{partyNames.length > 3 ? ` +${partyNames.length - 3}` : ""}</strong>
    </div>}
  </article>
}
