import {memo, useEffect, useRef} from "react"
import {getBattleRewardMessage} from "./battleOutcome"
import {getTeamHudModel} from "./teamBattleUi.js"
import {getIslandPhaseIndex, getIslandPhaseProgress, ISLAND_PHASE_ORDER} from "./phaseVisuals.js"

const ISLAND_PHASES = {
  hunt: {label: "Охота и бой", icon: "◈", tone: "hunt", hint: "Дерись с первой секунды и ломай лунные ящики"},
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

const ISLAND_PHASE_STEP_LABELS = {
  hunt: "ОХОТА",
  challenge: "ИСПЫТАНИЕ",
  collapse: "СЖАТИЕ",
  beacon: "МАЯК",
}

export const IslandPhaseHud = ({state}) => {
  const phase = ISLAND_PHASES[state?.phase]
  if (!phase) return null
  const seconds = state.phaseEndsAt ? Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000)) : null
  const timer = seconds === null ? "ФИНАЛ" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
  const challengeEvent = state.phase === "challenge" && state.islandEvent ? ISLAND_EVENTS[state.islandEvent] || state.islandEvent : null
  const suddenDeath = state.suddenDeath ? `Дуэль острова · −${state.suddenDeathDamage || 0} HP/с` : null
  const phaseIndex = getIslandPhaseIndex(state.phase)
  const phaseProgress = getIslandPhaseProgress(state)
  return (
    <section className={`island-phase-hud island-phase-hud--${phase.tone}`} aria-label={`Фаза матча: ${phase.label}`}>
      <div className="island-phase-hud__header">
        <div className="island-phase-hud__title"><span>{phase.icon}</span><div><small>ФАЗА {phaseIndex + 1} / {ISLAND_PHASE_ORDER.length}</small><strong>{phase.label}</strong></div></div>
        <time>{timer}</time>
      </div>
      <div className="island-phase-hud__meta"><b>{state.islandName || "Остров Первого Испытания"}</b><span>{ISLAND_PHASE_STEP_LABELS[state.phase]}</span></div>
      <div className="island-phase-hud__progress" aria-hidden="true"><i style={{width: `${Math.round(phaseProgress * 100)}%`}}/></div>
      <p>{challengeEvent || suddenDeath || phase.hint}</p>
      {state.phase === "collapse" && state.stormDamage > 0 && <small className="island-storm-warning"><i/>Шторм: −{state.stormDamage} HP/с</small>}
      {state.phase === "beacon" && state.beaconHolder && state.beaconProgress > 0 && (
        <div className="island-beacon-progress"><div><span>Удерживает {state.beaconHolder}</span><b>{Math.round(state.beaconProgress * 100)}%</b></div><i style={{width: `${Math.round(state.beaconProgress * 100)}%`}}/></div>
      )}
      <div className="island-phase-rail" aria-hidden="true">{ISLAND_PHASE_ORDER.map((tone, index) => <i key={tone} className={index <= phaseIndex ? "is-active" : ""}><span>{index + 1}</span></i>)}</div>
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

export const TouchStick = ({kind, control, cooldownVisual}) => {
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
  const isFire = kind === "fire"
  const state = isFire ? cooldownVisual?.state : null
  const className = `mobile-stick mobile-stick-${kind}${control ? " mobile-stick--active" : ""}${state ? ` mobile-stick-fire--${state}` : ""}`
  const style = control
    ? {left: control.start.x, top: control.start.y, "--stick-x": `${x}px`, "--stick-y": `${y}px`, ...(isFire ? {"--cooldown-progress": cooldownVisual?.progress || 0} : {})}
    : isFire ? {"--cooldown-progress": cooldownVisual?.progress || 0} : undefined
  return <div className={className} style={style} aria-label={isFire && state === "cooldown" ? `Атака перезаряжается, ${cooldownVisual.remaining.toFixed(1)} с` : undefined}>
    <span>{kind === "fire" ? "✦" : ""}</span>
    {isFire && state === "cooldown" && <small className="mobile-stick__cooldown">{cooldownVisual.remaining.toFixed(1)}</small>}
  </div>
}

export const BattleResultStats = ({result}) => result && (
  <div className="battle-result-stats">
    <span><b>#{result.place || (result.won ? 1 : "—")}</b>место</span>
    <span><b>{result.kills || 0}</b>бойцов</span>
    <span><b>{result.monsters || 0}</b>мобов</span>
    <span><b>{Math.round(result.duration || 0)}с</b>время</span>
  </div>
)

export const BattleRewardNotice = ({result}) => {
  const message = getBattleRewardMessage(result)
  return message ? <p className="battle-reward-notice">{message}</p> : null
}

const formatEffectTime = seconds => seconds < 10 ? `${seconds.toFixed(1)}с` : `${Math.ceil(seconds)}с`

export const ActiveStatusEffects = ({effects = []}) => {
  if (!effects.length) return null
  return (
    <div className="active-status-effects" aria-label="Активные эффекты">
      {effects.map(effect => (
        <div key={effect.id} className={`status-effect status-effect--${effect.tone}`} title={effect.label}>
          <span className="status-effect__icon" aria-hidden="true">{effect.icon}</span>
          <span className="status-effect__label">{effect.label}</span>
          {effect.remaining !== null && <small>{formatEffectTime(effect.remaining)}</small>}
        </div>
      ))}
    </div>
  )
}

export const AbilityButton = ({keyName, label, description, cooldown = 0, charge = 100, isSuper = false, disabled = false, onUse}) => (
  <button className={`battle-ability${isSuper && charge >= 100 ? " battle-ability--ready" : ""}`} title={`${label}: ${description}`} aria-label={`${label}: ${description}`} disabled={disabled || cooldown > 0 || (isSuper && charge < 100)} onClick={onUse} style={isSuper ? {"--charge": `${charge}%`} : undefined}>
    {isSuper && <i className="battle-ability__charge"/>}
    <b>{cooldown > 0 ? cooldown.toFixed(1) : isSuper && charge < 100 ? `${Math.round(charge)}%` : keyName}</b>
    <span>{label}</span>
  </button>
)

export const TeamBattleHud = ({state, localId}) => {
  const model = getTeamHudModel(state, localId)
  if (!model) return null
  return <section className="team-battle-hud" aria-label="Счёт команд">
    {model.teams.map(team => <div key={team.id} className={`team-battle-hud__team${team.isLocal ? " is-local" : ""}`}>
      <b>{team.label}</b><span>{team.alive} живы · {team.kills} фрагов</span>
    </div>)}
  </section>
}

export const TauntButton = ({cooldown = 0, disabled = false, onUse}) => (
  <button className="battle-ability battle-taunt" title="Показать клоуна над ближайшим противником" aria-label="Показать клоуна над ближайшим противником" disabled={disabled || cooldown > 0} onClick={onUse}>
    <b>{cooldown > 0 ? cooldown.toFixed(1) : "🤡"}</b>
    <span>НАСМЕШКА</span>
  </button>
)

const MINI_MAP_COLORS = {
  bush: "#48ad50",
  half: "#48ad50",
  water: "#43bde8",
  crates: "#d89037",
  barrels: "#d89037",
  crystal: "#9c63f5",
  bones: "#eee1bb",
  cactus: "#248a57",
}

const BattleMiniMapObstacles = memo(function BattleMiniMapObstacles({map}) {
  const canvasRef = useRef(null)
  const mapWidth = map?.width
  const mapHeight = map?.height
  const walls = map?.walls

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !mapWidth || !mapHeight) return
    const width = 200
    const height = 150
    const context = canvas.getContext("2d")
    if (!context) return
    canvas.width = width
    canvas.height = height
    context.clearRect(0, 0, width, height)
    ;(walls || []).forEach(wall => {
      context.fillStyle = MINI_MAP_COLORS[wall.type] || "#d56d48"
      const x = wall.minX / mapWidth * width
      const y = wall.minY / mapHeight * height
      const wallWidth = Math.max(3, (wall.maxX - wall.minX) / mapWidth * width)
      const wallHeight = Math.max(3.75, (wall.maxY - wall.minY) / mapHeight * height)
      context.fillRect(x, y, wallWidth, wallHeight)
    })
  }, [mapWidth, mapHeight, walls])

  return <canvas ref={canvasRef} className="mini-obstacles-canvas" aria-hidden="true"/>
})

export const BattleMiniMap = ({state, localId, renderer}) => {
  const map = state?.map
  if (!map) return null
  const width = map.width || 1
  const height = map.height || 1
  const visibleEnemies = Object.entries(state.players || {}).filter(([id]) =>
    String(id) !== String(localId) && renderer?.isPlayerVisible(id))
  return (
    <aside className="battle-minimap" aria-label="Миникарта">
      {state.game?.stormRadius > 0 && <i className="mini-storm" style={{width: `${state.game.stormRadius / width * 200}%`, height: `${state.game.stormRadius / height * 200}%`}}/>}
      {state.game?.beaconOpen && <i className="mini-beacon"/>}
      <BattleMiniMapObstacles map={map}/>
      {state.players[localId] && (
        <b className="mini-player mini-player--me" style={{left: `${state.players[localId].x / width * 100}%`, top: `${state.players[localId].y / height * 100}%`}}/>
      )}
      {visibleEnemies.map(([id, player]) => (
        <b key={id} className="mini-player" style={{left: `${player.x / width * 100}%`, top: `${player.y / height * 100}%`}}/>
      ))}
    </aside>
  )
}
