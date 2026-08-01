import {getBattleRewardMessage} from "./battleOutcome"

const ISLAND_PHASES = {
  landing: {label: "Высадка", icon: "⚓", tone: "landing", hint: "Урон отключён · собирай ящики"},
  hunt: {label: "Охота", icon: "◈", tone: "hunt", hint: "Остров спокоен · ищи соперников"},
  challenge: {label: "Испытание", icon: "✦", tone: "challenge", hint: "Остров меняет правила"},
  collapse: {label: "Сжатие", icon: "◉", tone: "collapse", hint: "Шторм движется к центру"},
  beacon: {label: "Маяк", icon: "✹", tone: "beacon", hint: "Удерживай свет 10 секунд"},
}

const ISLAND_EVENTS = {
  fog: "Туман",
  moving_walls: "Движущиеся стены",
  poison_spores: "Ядовитые споры",
  ultimate_zone: "Зона ультиматума",
}

export const IslandPhaseHud = ({state}) => {
  const phase = ISLAND_PHASES[state?.phase]
  if (!phase) return null
  const seconds = state.phaseEndsAt ? Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000)) : null
  const timer = seconds === null ? "ФИНАЛ" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
  const challengeEvent = state.phase === "challenge" && state.islandEvent ? ISLAND_EVENTS[state.islandEvent] || state.islandEvent : null
  const suddenDeath = state.suddenDeath ? `Дуэль острова · −${state.suddenDeathDamage || 0} HP/с` : null
  return (
    <section className={`island-phase-hud island-phase-hud--${phase.tone}`} aria-label={`Фаза матча: ${phase.label}`}>
      <div className="island-phase-hud__title"><span>{phase.icon}</span><strong>{phase.label}</strong></div>
  <div className="island-phase-hud__meta"><b>{state.islandName || "Остров Первого Испытания"}</b><span>{timer}</span></div>
      <p>{challengeEvent || suddenDeath || phase.hint}</p>
      {state.phase === "collapse" && state.stormDamage > 0 && <small>Шторм: −{state.stormDamage} HP</small>}
      {state.phase === "beacon" && state.beaconHolder && state.beaconProgress > 0 && (
        <div className="island-beacon-progress"><i style={{width: `${Math.round(state.beaconProgress * 100)}%`}}/></div>
      )}
    </section>
  )
}

export const IslandVoiceNotice = ({voice}) => {
  if (!voice?.text) return null
  return (
    <aside className="island-voice-notice" aria-live="polite" aria-label="Глас острова">
      <div className="island-voice-notice__title"><span>◉</span> ГЛАС ОСТРОВА</div>
      <p>{voice.text}</p>
    </aside>
  )
}

export const TouchStick = ({kind, control}) => {
  let x = 0
  let y = 0
  if (control) {
    const dx = control.current.x - control.start.x
    const dy = control.current.y - control.start.y
    const distance = Math.hypot(dx, dy)
    const scale = distance > 28 ? 28 / distance : 1
    x = dx * scale
    y = dy * scale
  }
  return <div className={`mobile-stick mobile-stick-${kind}${control ? " mobile-stick--active" : ""}`}
    style={control ? {left: control.start.x, top: control.start.y, "--stick-x": `${x}px`, "--stick-y": `${y}px`} : undefined}>
    <span>{kind === "fire" ? "вњ¦" : ""}</span>
  </div>
}

export const BattleResultStats = ({result}) => result && (
  <div className="battle-result-stats">
    <span><b>#{result.place || (result.won ? 1 : "вЂ”")}</b>РјРµСЃС‚Рѕ</span>
    <span><b>{result.kills || 0}</b>Р±РѕР№С†РѕРІ</span>
    <span><b>{result.monsters || 0}</b>РјРѕР±РѕРІ</span>
    <span><b>{Math.round(result.duration || 0)}СЃ</b>РІСЂРµРјСЏ</span>
  </div>
)

export const BattleRewardNotice = ({result}) => {
  const message = getBattleRewardMessage(result)
  return message ? <p className="battle-reward-notice">{message}</p> : null
}

export const AbilityButton = ({keyName, label, description, cooldown = 0, charge = 100, isSuper = false, disabled = false, onUse}) => (
  <button className={`battle-ability${isSuper && charge >= 100 ? " battle-ability--ready" : ""}`} title={`${label}: ${description}`} aria-label={`${label}: ${description}`} disabled={disabled || cooldown > 0 || (isSuper && charge < 100)} onClick={onUse} style={isSuper ? {"--charge": `${charge}%`} : undefined}>
    {isSuper && <i className="battle-ability__charge"/>}
    <b>{cooldown > 0 ? cooldown.toFixed(1) : isSuper && charge < 100 ? `${Math.round(charge)}%` : keyName}</b>
    <span>{label}</span>
  </button>
)

export const BattleMiniMap = ({state, localId, renderer}) => {
  const map = state?.map
  if (!map) return null
  const width = map.width || 1
  const height = map.height || 1
  const visibleEnemies = Object.entries(state.players || {}).filter(([id]) =>
    String(id) !== String(localId) && renderer?.isPlayerVisible(id))
  return (
    <aside className="battle-minimap" aria-label="РњРёРЅРёРєР°СЂС‚Р°">
      {state.game?.stormRadius > 0 && <i className="mini-storm" style={{width: `${state.game.stormRadius / width * 200}%`, height: `${state.game.stormRadius / height * 200}%`}}/>}
      {state.game?.beaconOpen && <i className="mini-beacon"/>}
      {(map.walls || []).map((wall, index) => (
        <i key={index} className={`mini-obstacle mini-obstacle--${wall.type}`} style={{left: `${wall.minX / width * 100}%`, top: `${wall.minY / height * 100}%`, width: `${(wall.maxX - wall.minX) / width * 100}%`, height: `${Math.max(2.5, (wall.maxY - wall.minY) / height * 100)}%`}}/>
      ))}
      {state.players[localId] && (
        <b className="mini-player mini-player--me" style={{left: `${state.players[localId].x / width * 100}%`, top: `${state.players[localId].y / height * 100}%`}}/>
      )}
      {visibleEnemies.map(([id, player]) => (
        <b key={id} className="mini-player" style={{left: `${player.x / width * 100}%`, top: `${player.y / height * 100}%`}}/>
      ))}
    </aside>
  )
}
