import "./BattleLoading.css"

export const BattleLoading = ({progress = 28, status = "Подключаемся к арене..."}) => {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)))

  return (
    <div className="battle-loading-screen" data-testid="battle-loading" role="status" aria-live="polite">
      <div className="battle-loading__noise"/>
      <div className="battle-loading__card">
        <div className="battle-loading__radar" aria-hidden="true"><span/><i/><b>◈</b></div>
        <div className="battle-loading__eyebrow">ПОИСК СОПЕРНИКА</div>
        <h1>ВХОД В БОЙ</h1>
        <div className="battle-loading__stages" aria-hidden="true">
          <span className={safeProgress >= 34 ? "is-done" : "is-active"}>СВЯЗЬ</span>
          <i/>
          <span className={safeProgress >= 60 ? "is-done" : safeProgress >= 34 ? "is-active" : ""}>АРЕНА</span>
          <i/>
          <span className={safeProgress >= 90 ? "is-done" : safeProgress >= 60 ? "is-active" : ""}>БОЙ</span>
        </div>
        <div className="battle-loading__bar" aria-label={`Загрузка ${safeProgress}%`}>
          <span style={{width: `${safeProgress}%`}}/>
        </div>
        <div className="battle-loading__status">
          <span>{status}</span>
          <strong>{safeProgress}%</strong>
        </div>
      </div>
    </div>
  )
}
