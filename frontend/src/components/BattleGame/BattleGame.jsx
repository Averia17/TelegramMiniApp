import {useEffect, useRef, useState, useCallback} from "react"
import {useNavigate} from "react-router-dom"
import {GameClient} from "./GameClient"
import {Renderer} from "./Renderer"
import {Input} from "./Input"
import {NetworkSimulation} from "./NetworkSimulation"
import {WS_URL} from "../../utils/urls.js"
import {getAccessToken} from "../../utils/auth.js"
import "./BattleGame.css"

const saveBattleResult = result => {
  try {
    const history = JSON.parse(window.localStorage.getItem("battle_history") || "[]")
    window.localStorage.setItem("battle_history", JSON.stringify([{...result, finishedAt: new Date().toISOString()}, ...history].slice(0, 20)))
    const stats = JSON.parse(window.localStorage.getItem("battle_stats") || "{}")
    window.localStorage.setItem("battle_stats", JSON.stringify({battles:(stats.battles||0)+1,wins:(stats.wins||0)+(result.won?1:0),kills:(stats.kills||0)+(result.kills||0),monsters:(stats.monsters||0)+(result.monsters||0)}))
  } catch (error) { console.warn("Could not save battle result", error) }
}

export const BattleGame = ({playerId, roomId, heroName}) => {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const clientRef = useRef(null)
  const rendererRef = useRef(null)
  const inputRef = useRef(null)
  const animFrameRef = useRef(null)
  const joinedRef = useRef(false)
  const viewRef = useRef("connecting")
  const latestStateRef = useRef(null)
  const simulationRef = useRef(null)
  const lastUiUpdateRef = useRef(0)
  const savedResultRef = useRef(false)
  const [mobileMode, setMobileMode] = useState(() => window.matchMedia("(pointer: coarse), (max-width: 700px)").matches)
  const [touchControls, setTouchControls] = useState({move: null, aim: null})

  const [gameState, setGameState] = useState(null)
  const [connected, setConnected] = useState(false)
  const [roomInfo, setRoomInfo] = useState(null)
  const [messages, setMessages] = useState([])
  const [view, setViewState] = useState("connecting")
  const [deathInfo, setDeathInfo] = useState(null)
  const [battleResult, setBattleResult] = useState(null)

  const setView = useCallback((v) => {
    viewRef.current = v
    setViewState(v)
  }, [])

  const finishBattle = useCallback(result => {
    if (savedResultRef.current) return
    savedResultRef.current = true
    const normalized = {duration:0,kills:0,monsters:0,...result}
    saveBattleResult(normalized)
    setBattleResult(normalized)
    setView(normalized.won ? "result" : normalized.timedOut ? "timeout" : "dead")
  }, [setView])

  const debugPlayerId = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("debugPlayer") : null
  const effectivePlayerId = debugPlayerId || playerId
  const playerName = effectivePlayerId ? `P${String(effectivePlayerId).slice(0, 6)}` : "Player"

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev.slice(-9), msg])
  }, [])

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse), (max-width: 700px)")
    const updateMode = () => setMobileMode(query.matches)
    query.addEventListener?.("change", updateMode)
    window.Telegram?.WebApp?.expand?.()
    return () => query.removeEventListener?.("change", updateMode)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect?.width || window.innerWidth))
      const height = Math.max(1, Math.round(rect?.height || window.visualViewport?.height || window.innerHeight))
      rendererRef.current?.resize(width, height)
    }
    resize()
    window.addEventListener("resize", resize)
    window.visualViewport?.addEventListener("resize", resize)

    const renderer = new Renderer(canvas)
    const simulation = new NetworkSimulation()
    simulationRef.current = simulation
    if (import.meta.env.DEV) window.__battleSimulation = simulation
    rendererRef.current = renderer
    if (import.meta.env.DEV) window.__battleRenderer = renderer
    resize()

    const client = new GameClient(
      `${WS_URL}/ws`,
      getAccessToken(),
      (state) => {
        latestStateRef.current = state
        simulation.ingest(state)
        const now = performance.now()
        if (!lastUiUpdateRef.current || now - lastUiUpdateRef.current >= 100) {
          lastUiUpdateRef.current = now
          setGameState(state)
        }
        const v = viewRef.current
        if (state?.game?.state === "game" && v !== "game") {
          setView("game")
        }
        if (state?.game?.state === "lobby" && v !== "lobby" && v !== "connecting") {
          setView("lobby")
        }
      },
      (msg) => {
        addMessage(msg)
        if (msg.type === "room_joined") {
          setRoomInfo(msg.params)
          setView("lobby")
          if (msg.params?.roomId) {
            const heroQuery = heroName ? `?hero=${encodeURIComponent(heroName)}` : ""
            window.history.replaceState(null, "", `/battle/${msg.params.roomId}${heroQuery}`)
          }
        }
        if (msg.type === "match_found") {
          if (msg.params?.roomId && clientRef.current) {
			clientRef.current.joinById(msg.params.roomId, playerName, heroName)
          }
        }
        if (msg.type === "start") {
          setView("game")
        }
        if (msg.type === "stop") {
          finishBattle({won:false,reason:"Бой завершён сервером"})
        }
        if (msg.type === "timeout") {
          finishBattle({won:false,timedOut:true,reason:"Время вышло",duration:Math.round((msg.params?.duration || 0) / 1000)})
        }
        if (msg.type === "won") {
          finishBattle({won:msg.params?.name === playerName,winner:msg.params?.name,duration:Math.round((msg.params?.duration || 0) / 1000)})
        }
        if (msg.type === "you_died") {
          setDeathInfo({killerName: msg.params?.killerName || "Unknown"})
          finishBattle({won:false,killerName:msg.params?.killerName || "Unknown"})
        }
        if (msg.type === "error" && roomId && msg.params?.message === "Room not found") {
          joinedRef.current = false
          const heroQuery = heroName ? `?hero=${encodeURIComponent(heroName)}` : ""
          navigate(`/battle${heroQuery}`, {replace: true})
        }
      },
      () => {
        setConnected(true)
      },
      () => setConnected(false)
    )
    clientRef.current = client
    if (import.meta.env.DEV) window.__battleClient = client
    client.connect()

    const input = new Input(canvas, client, setTouchControls, (x, y, ack) => simulation.setInput(x, y, ack))
    inputRef.current = input

    if (import.meta.env.DEV) {
      window.render_game_to_text = () => {
        const state = simulation.getDisplayState() || latestStateRef.current
        const localId = client.playerId
        const local = state?.players?.[localId]
        return JSON.stringify({
          coordinateSystem: "origin top-left; x right; y down",
          mode: state?.game?.state || viewRef.current,
          localPlayerId: localId || null,
          player: local ? {
            x: local.x,
            y: local.y,
            health: local.lives,
            ammo: local.ammo,
            hero: local.hero,
          } : null,
          visiblePlayers: Object.keys(state?.players || {}).length,
          projectiles: (state?.bullets || []).length,
        })
      }
      window.advanceTime = milliseconds => {
        const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)))
        for (let step = 0; step < steps; step++) simulation.update(1 / 60)
        const state = simulation.getDisplayState()
        if (state) renderer.setState(state)
        renderer.render()
      }
    }

    let rendererFailed = false
    let previousFrameAt = performance.now()
    const gameLoop = () => {
      const frameAt = performance.now()
      const delta = Math.min(.05, Math.max(0, (frameAt - previousFrameAt) / 1000))
      previousFrameAt = frameAt
      input.update()
      simulation.update(delta)
      const displayState = simulation.getDisplayState()
      if (displayState) renderer.setState(displayState)
      try {
        renderer.render()
        rendererFailed = false
      } catch (error) {
        if (!rendererFailed) {
          console.error("Battle renderer error:", error)
          rendererFailed = true
        }
      }
      animFrameRef.current = requestAnimationFrame(gameLoop)
    }
    gameLoop()

    return () => {
      window.removeEventListener("resize", resize)
      window.visualViewport?.removeEventListener("resize", resize)
      cancelAnimationFrame(animFrameRef.current)
      input.destroy()
      client.disconnect()
      if (import.meta.env.DEV && window.__battleClient === client) delete window.__battleClient
      if (import.meta.env.DEV && window.__battleRenderer === renderer) delete window.__battleRenderer
      if (import.meta.env.DEV && window.__battleSimulation === simulation) delete window.__battleSimulation
      if (import.meta.env.DEV) {
        delete window.render_game_to_text
        delete window.advanceTime
      }
      renderer.destroy()
      inputRef.current = null
      clientRef.current = null
      rendererRef.current = null
      simulationRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gameState && clientRef.current) {
      const pid = clientRef.current.playerId
      if (pid && gameState.players && gameState.players[pid]) {
        rendererRef.current?.setLocalPlayerId(pid)
        simulationRef.current?.setLocalPlayerId(pid)
        inputRef.current?.setLocalPlayer(
          pid,
          () => clientRef.current?.lastState || latestStateRef.current || gameState,
          player => rendererRef.current?.worldToScreen(player.x, player.y),
          (screenX, screenY, player) => rendererRef.current?.screenToAimAngle?.(screenX, screenY, player),
        )
      }
    }
  }, [gameState])

  useEffect(() => {
    if (connected && roomId && !joinedRef.current && clientRef.current) {
      joinedRef.current = true
	  clientRef.current.joinById(roomId, playerName, heroName)
    }
	}, [connected, roomId, playerName, heroName, effectivePlayerId])

  useEffect(() => {
    if (connected && !roomId && !joinedRef.current && clientRef.current) {
      joinedRef.current = true
	  clientRef.current.findMatch(playerName, heroName)
    }
	}, [connected, roomId, playerName, heroName, effectivePlayerId])

  const handleBackToMenu = () => {
    joinedRef.current = false
    setView("connecting")
    setRoomInfo(null)
    setGameState(null)
    if (clientRef.current) {
      clientRef.current.disconnect()
    }
    navigate("/")
  }

  const localPlayer = clientRef.current?.playerId
    ? gameState?.players?.[clientRef.current.playerId]
    : null
  const playerCount = Object.keys(gameState?.players || {}).length
  const health = localPlayer?.lives ?? 0
  const maxHealth = localPlayer?.maxLives ?? 1
  const healthPercent = Math.max(0, Math.min(100, (health / maxHealth) * 100))

  return (
    <div className={`battle-game ${mobileMode ? "battle-game--mobile" : "battle-game--desktop"}`}>
	  {import.meta.env.DEV && <output data-testid="battle-debug" style={{display:"none"}}>{JSON.stringify({
		connected,
		stateHz: clientRef.current?.stateHz,
		stateBytes: clientRef.current?.lastStateBytes,
		renderer: rendererRef.current?.mode,
		fps: rendererRef.current?.impl?.fps,
		drawCalls: rendererRef.current?.impl?.renderer?.info?.render?.calls,
		triangles: rendererRef.current?.impl?.renderer?.info?.render?.triangles,
		playerId: clientRef.current?.playerId,
		state: gameState?.game?.state,
		x: localPlayer?.x,
		y: localPlayer?.y,
		ack: localPlayer?.ack,
		lives: localPlayer?.lives,
		invulnerable: localPlayer?.invulnerable,
		attackPulse: localPlayer?.attackPulse,
		ammo: localPlayer?.ammo,
		reloadProgress: localPlayer?.reloadProgress,
		shield: localPlayer?.shield,
		haste: localPlayer?.haste,
		stun: localPlayer?.stun,
		vine: localPlayer?.vine,
		vortex: localPlayer?.vortex,
		flying: localPlayer?.flying,
		inBush: Boolean(localPlayer && gameState?.map?.walls?.some(wall => (wall.type === "bush" || wall.type === "half") && localPlayer.x >= wall.minX && localPlayer.x <= wall.maxX && localPlayer.y >= wall.minY && localPlayer.y <= wall.maxY)),
	  })}</output>}
      <canvas ref={canvasRef} className="battle-canvas"/>

      {view === "connecting" && (
        <div className="battle-overlay">
          <div className="battle-menu">
            <div className="battle-logo"><span>STAR</span> BRAWL</div>
            <div className="spinner"/>
            <p>Поиск арены...</p>
          </div>
        </div>
      )}

      {view === "lobby" && roomInfo && (
        <div className="battle-lobby-hud">
          <div className="lobby-info">
            <div className="lobby-kicker">BATTLE ARENA</div>
            <h3>{roomInfo.roomName}</h3>
            <p className="lobby-mode">{roomInfo.mode} · {roomInfo.mapName}</p>
            <div className="lobby-player-count"><strong>{playerCount}</strong><span>/{roomInfo.maxPlayers}</span></div>
            <p>Код команды <span className="room-code" onClick={() => navigator.clipboard.writeText(roomInfo.roomId)} title="Скопировать">{roomInfo.roomId}</span></p>
            {gameState?.players && clientRef.current?.playerId && (() => {
              const me = gameState.players[clientRef.current.playerId]
              return me?.hero ? <p className="hint">Your hero: {me.hero}</p> : null
            })()}
            {connected && gameState?.game?.state === "waiting" && <p className="hint">Ждём других бойцов...</p>}
            {connected && gameState?.game?.state === "lobby" && gameState?.game?.lobbyEndsAt > 0 && (
              <p className="hint">До начала: {Math.max(0, Math.ceil((gameState.game.lobbyEndsAt - Date.now()) / 1000))} сек.</p>
            )}
            <button onClick={handleBackToMenu}>ВЫЙТИ</button>
          </div>
        </div>
      )}

      {view === "game" && (
        <>
          <header className="battle-topbar">
            <button className="battle-exit-btn" onClick={handleBackToMenu} aria-label="Выйти">✕</button>
            <div className="battle-mode-pill"><span>⚡</span> BATTLE ROYALE</div>
            <div className="battle-alive"><i/> {playerCount} В БОЮ</div>
          </header>
          {localPlayer && (
            <div className="battle-player-card">
              <div className="player-avatar">{String(localPlayer.hero || heroName || "H").slice(0, 1).toUpperCase()}</div>
              <div className="player-vitals">
                <strong>{localPlayer.name || playerName}</strong>
                <div className="health-track"><span style={{width: `${healthPercent}%`}}/></div>
                <div className="ammo-track" aria-label={`Боезапас ${localPlayer.ammo || 0} из ${localPlayer.maxAmmo || 3}`}>
                  {Array.from({length: localPlayer.maxAmmo || 3}, (_, index) => (
                    <i key={index} className={index < (localPlayer.ammo || 0) ? "is-ready" : ""}>
                      {index === (localPlayer.ammo || 0) && index < (localPlayer.maxAmmo || 3) && <span style={{width: `${(localPlayer.reloadProgress || 0) * 100}%`}}/>}
                    </i>
                  ))}
                </div>
                <small>❤ {health} / {maxHealth}</small>
              </div>
            </div>
          )}
          {gameState?.map && <BattleMiniMap state={gameState} localId={clientRef.current?.playerId} renderer={rendererRef.current}/>}
          {localPlayer && (
            <div className="battle-abilities">
              <AbilityButton slot="primary" keyName="Q" label={abilityLabel(localPlayer.hero, "primary")} cooldown={localPlayer.cooldowns?.primary} charge={localPlayer.superCharge || 0} isSuper onUse={() => clientRef.current?.ability?.("primary")}/>
              <AbilityButton slot="secondary" keyName="E" label={abilityLabel(localPlayer.hero, "secondary")} cooldown={localPlayer.cooldowns?.secondary} onUse={() => clientRef.current?.ability?.("secondary")}/>
            </div>
          )}
        </>
      )}

      {(view === "game" || (view === "lobby" && roomInfo)) && (
        <>
          <TouchStick kind="move" control={touchControls.move}/>
          <TouchStick kind="fire" control={touchControls.aim}/>
        </>
      )}

      {view === "dead" && (
        <div className="battle-overlay" style={{background: "rgba(139, 0, 0, 0.85)"}}>
          <div style={{textAlign: "center", color: "#fff"}}>
            <div className="death-skull">☠</div>
            <h2>ТЫ ВЫБЫЛ</h2>
            <p>Тебя победил: {battleResult?.killerName || deathInfo?.killerName || "Неизвестный боец"}</p>
            <BattleResultStats result={battleResult}/>
            <button className="battle-result-button" onClick={handleBackToMenu}>В МЕНЮ</button>
          </div>
        </div>
      )}

      {view === "result" && (
        <div className="battle-overlay battle-result-overlay">
          <div className="battle-result-card">
            <div className="battle-result-crown">♛</div>
            <h2>ПОБЕДА!</h2>
            <p>Арена зачищена — результат сохранён.</p>
            <BattleResultStats result={battleResult}/>
            <button className="battle-result-button" onClick={handleBackToMenu}>В МЕНЮ</button>
          </div>
        </div>
      )}

	  {view === "timeout" && (
		<div className="battle-overlay battle-result-overlay">
		  <div className="battle-result-card">
			<div className="battle-result-crown">⌛</div>
			<h2>ВРЕМЯ ВЫШЛО</h2>
			<p>Матч завершён по таймеру.</p>
			<BattleResultStats result={battleResult}/>
			<button className="battle-result-button" onClick={handleBackToMenu}>В МЕНЮ</button>
		  </div>
		</div>
	  )}

      <div className="battle-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`msg-${msg.type}`}>
            {msg.type === "killed" && `${msg.params?.killerName} killed ${msg.params?.killedName}`}
            {msg.type === "won" && `${msg.params?.name} won!`}
            {msg.type === "joined" && `${msg.params?.name} joined as ${msg.params?.hero || "Unknown"}`}
            {msg.type === "left" && `${msg.params?.name} left`}
            {msg.type === "start" && "Game started!"}
            {msg.type === "stop" && "Game over"}
            {msg.type === "timeout" && "Time out!"}
            {msg.type === "waiting" && "Waiting for players..."}
          </div>
        ))}
      </div>

      <div className="battle-controls">
        <div className="control-hint">WASD — движение · мышь — прицел · клик / пробел — атака</div>
      </div>
    </div>
  )
}

const TouchStick = ({kind, control}) => {
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
    <span>{kind === "fire" ? "✦" : ""}</span>
  </div>
}

const BattleResultStats = ({result}) => result && (
  <div className="battle-result-stats">
    <span><b>#{result.place || (result.won ? 1 : "—")}</b>место</span>
    <span><b>{result.kills || 0}</b>бойцов</span>
    <span><b>{result.monsters || 0}</b>мобов</span>
    <span><b>{Math.round(result.duration || 0)}с</b>время</span>
  </div>
)

const abilityLabel = (hero, slot) => {
  const name = String(hero || "").toLowerCase()
  const labels = {
    viper:["ИЗВЕРЖЕНИЕ","МАГМА-БРОНЯ"],titan:["ЦИФРОВОЙ СБОЙ","ТРОЙНОЙ ДИСК"],
    shadow:["ЖИВАЯ ЛИАНА","ФОТОСИНТЕЗ"],spark:["ЖАТВА","РОЙ ТЕНЕЙ"],
  }
  return labels[name]?.[slot === "primary" ? 0 : 1] || (slot === "primary" ? "ЗАЛП" : "ЩИТ")
}

const AbilityButton = ({keyName, label, cooldown = 0, charge = 100, isSuper = false, onUse}) => (
  <button className={`battle-ability${isSuper && charge >= 100 ? " battle-ability--ready" : ""}`} disabled={cooldown > 0 || (isSuper && charge < 100)} onClick={onUse} style={isSuper ? {"--charge": `${charge}%`} : undefined}>
    {isSuper && <i className="battle-ability__charge"/>}
    <b>{cooldown > 0 ? cooldown.toFixed(1) : isSuper && charge < 100 ? `${Math.round(charge)}%` : keyName}</b>
    <span>{label}</span>
  </button>
)

const BattleMiniMap = ({state, localId, renderer}) => {
  const map = state?.map
  if (!map) return null
  const width = map.width || 1
  const height = map.height || 1
  const visibleEnemies = Object.entries(state.players || {}).filter(([id]) =>
    String(id) !== String(localId) && renderer?.isPlayerVisible(id))
  return (
    <aside className="battle-minimap" aria-label="Миникарта">
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
