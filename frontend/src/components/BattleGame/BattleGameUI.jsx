import {memo, useEffect, useRef, useState} from "react"
import {getBattleRewardMessage} from "./battleOutcome"
import {getIncomingTowerThreat, getObjectiveHudModel, getTeamHudModel, getTeamObjectiveGroups, getTeamPerspectiveLabel} from "./teamBattleUi.js"
import {getIslandPhaseIndex, getIslandPhaseProgress, ISLAND_PHASE_ORDER} from "./phaseVisuals.js"
import {isTeamBattleMode} from "./battleMode.js"
import {formatBattleTime} from "./battleTimer.js"

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

export const BattleMatchTimer = ({game}) => {
  const endsAt = Number(game?.gameEndsAt)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!Number.isFinite(endsAt) || endsAt <= 0) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [endsAt])

  if (!Number.isFinite(endsAt) || endsAt <= 0) return null
  const time = formatBattleTime(endsAt, now)
  return <div className="battle-match-timer" aria-label={`Время боя: ${time}`}><span>ВРЕМЯ БОЯ</span><strong>{time}</strong></div>
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

export const BattleResultStats = ({result}) => {
  if (!result) return null
  const stats = result.teamBattle
    ? [
      ["⚔", result.kills || 0, "убийства", "combat"],
      ["☠", result.deaths || 0, "смерти", "danger"],
      ["✹", result.playerDamage || 0, "урон бойцам", "damage"],
      ["▰", result.towerDamage || 0, "урон башням", "objective"],
      ["⌂", result.townHallDamage || 0, "урон ратуше", "objective"],
      ["◆", result.towersDestroyed || 0, "башни разрушены", "objective"],
      ["⌂", result.townHallsDestroyed || 0, "ратуши разрушены", "objective"],
      ["◷", String(Math.round(result.duration || 0)) + "с", "время", "time"],
    ]
    : [
      ["#", "#" + (result.place || (result.won ? 1 : "—")), "место", "place"],
      ["⚔", result.kills || 0, "бойцов", "combat"],
      ["✦", result.monsters || 0, "мобов", "damage"],
      ["◷", String(Math.round(result.duration || 0)) + "с", "время", "time"],
    ]
  return (
    <div className={"battle-result-stats" + (result.teamBattle ? " battle-result-stats--team" : "")}>
      {stats.map(([icon, value, label, tone]) => <div className={`battle-result-stat battle-result-stat--${tone}`} key={label}>
        <i aria-hidden="true">{icon}</i>
        <span><b>{value}</b><small>{label}</small></span>
      </div>)}
    </div>
  )
}

export const BattleRewardNotice = ({result}) => {
  const message = getBattleRewardMessage(result)
  return message ? <p className="battle-reward-notice">{message}</p> : null
}

export const BattleResultCard = ({result, timedOut = false, onBack}) => {
  if (!result) return null
  const teamBattle = Boolean(result.teamBattle)
  const draw = Boolean(result.draw)
  const outcome = draw ? "draw" : timedOut ? "timeout" : result.won ? "win" : "loss"
  const title = draw ? "НИЧЬЯ" : timedOut ? (result.won ? "ПОБЕДА ПО ТАЙМЕРУ" : "ВРЕМЯ ВЫШЛО") : result.won ? (teamBattle ? "ПОБЕДА КОМАНДЫ" : "ПОБЕДА!") : "ПОРАЖЕНИЕ"
  const subtitle = timedOut
    ? draw ? "Команды закончили бой с одинаковым результатом." : "Матч завершён по таймеру."
    : result.won
      ? teamBattle ? "Союзники удержали арену до конца." : "Арена зачищена — результат сохранён."
      : draw ? "Ни одна команда не получила преимущества." : teamBattle ? "Соперники забрали контроль над ареной." : "Бой завершён — результат сохранён."
  const teamLine = teamBattle
    ? draw ? "КОМАНДЫ РАЗОШЛИСЬ ВНИЧЬЮ" : result.won ? "ТВОЯ КОМАНДА ЗАБРАЛА АРЕНУ" : "СОПЕРНИКИ ЗАБРАЛИ АРЕНУ"
    : null
  return <div className={`battle-overlay battle-result-overlay battle-result-overlay--${outcome}`} role="dialog" aria-modal="true" aria-labelledby="battle-result-title">
    <div className={`battle-result-card battle-result-card--${outcome}`}>
      <div className="battle-result-card__shine" aria-hidden="true" />
      <div className="battle-result-card__topline"><span>{teamBattle ? "КОМАНДНЫЙ БОЙ" : "БОЕВОЙ ОТЧЁТ"}</span><i aria-hidden="true" /><span className="battle-result-card__status">{timedOut ? "ФИНАЛЬНЫЙ СИГНАЛ" : "МАТЧ ЗАВЕРШЁН"}</span></div>
      <div className="battle-result-card__hero">
        <div className="battle-result-emblem" aria-hidden="true">{draw ? "＝" : timedOut ? "⌛" : result.won ? "✦" : "✕"}</div>
        <div className="battle-result-card__heading">
          <p className="battle-result-eyebrow">{timedOut ? "ФИНАЛЬНЫЙ СИГНАЛ" : result.won ? "АРЕНА ЗА ВАМИ" : "БОЙ ОКОНЧЕН"}</p>
          <h2 id="battle-result-title">{title}</h2>
          <p className="battle-result-subtitle">{subtitle}</p>
        </div>
      </div>
      {teamLine && <div className="battle-result-team-line"><span>{teamLine}</span></div>}
      {result.reason && <div className="battle-result-reason"><span>ПРИЧИНА РЕЗУЛЬТАТА</span><b>{result.reason}</b></div>}
      <BattleRewardNotice result={result}/>
      <div className="battle-result-section-label">ТВОЙ ВКЛАД</div>
      <BattleResultStats result={result}/>
      <button className="battle-result-button" autoFocus onClick={onBack}><span>В МЕНЮ</span><kbd>ENTER</kbd></button>
    </div>
  </div>
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
    {model.teams.map(team => <div key={team.id} className={`team-battle-hud__team${team.isLocal ? " is-local" : " is-enemy"}`}>
      <b>{team.label}</b><span>{team.alive} живы · {team.kills} фрагов</span>
    </div>)}
  </section>
}

export const TeamObjectiveHud = ({state, localId}) => {
  const objectives = getObjectiveHudModel(state)
  if (!objectives) return null
  const localTeam = state?.players?.[localId]?.team || ""
  const grouped = getTeamObjectiveGroups(objectives, localTeam)
  return <section className="team-objective-hud" aria-label="Состояние укреплений">
    {grouped.map(([team, items]) => <div key={team} className={`team-objective-hud__team${team === localTeam ? " is-local" : " is-enemy"}`}>
      <b>{getTeamPerspectiveLabel(team, localTeam)}</b>
      {items.map(objective => <div key={objective.id} className={`team-objective-hud__objective${objective.destroyed ? " is-destroyed" : ""}`}>
        <span>{objective.type === "town_hall" ? (objective.protected ? "РАТУША 🔒" : "РАТУША") : "БАШНЯ"}</span><i><em style={{width: `${objective.percent}%`}}/></i>
      </div>)}
    </div>)}
  </section>
}

export const TowerThreatNotice = ({state, localId}) => {
  const threat = getIncomingTowerThreat(state, localId)
  if (!threat) return null
  return <div className="tower-threat-notice" role="status" aria-live="polite">
    <b>⚠ В ЗОНЕ ОБСТРЕЛА</b>
    <span>Башня рядом · {Math.round(threat.distance)} м</span>
  </div>
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
  const localTeam = state.players?.[localId]?.team || ""
  const baseObjectives = isTeamBattleMode(state.game?.mode)
    ? (state.objectives || []).filter(objective => objective?.type === "town_hall")
    : []
  const visibleEnemies = Object.entries(state.players || {}).filter(([id]) =>
    String(id) !== String(localId) && renderer?.isPlayerVisible(id))
  return (
    <aside className="battle-minimap" aria-label="Миникарта">
      {state.game?.stormRadius > 0 && <i className="mini-storm" style={{width: `${state.game.stormRadius / width * 200}%`, height: `${state.game.stormRadius / height * 200}%`}}/>}
      {state.game?.beaconOpen && <i className="mini-beacon"/>}
      <BattleMiniMapObstacles map={map}/>
      {baseObjectives.map(objective => (
        <i
          key={objective.id}
          className={`mini-base ${objective.team === localTeam ? "mini-base--own" : "mini-base--enemy"}${Number(objective.lives) <= 0 ? " is-destroyed" : ""}`}
          style={{left: `${Number(objective.x || 0) / width * 100}%`, top: `${Number(objective.y || 0) / height * 100}%`}}
          aria-label={objective.team === localTeam ? "Своя база" : "База противника"}
        />
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
