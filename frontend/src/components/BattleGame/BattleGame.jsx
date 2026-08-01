import {useEffect, useRef, useState, useCallback} from "react"
import {useNavigate} from "react-router-dom"
import {GameClient} from "./GameClient"
import {Renderer} from "./Renderer"
import {Input} from "./Input"
import {NetworkSimulation} from "./NetworkSimulation"
import {getHeroSkill} from "./heroSkills.js"
import {getBattlePlayerCount, getPlayerBattleStats, getStateBattleResult} from "./battleOutcome"
import {AbilityButton, BattleMiniMap, BattleRewardNotice, BattleResultStats, IslandPhaseHud, IslandVoiceNotice, TouchStick} from "./BattleGameUI.jsx"
import {releaseAllPreviewContexts} from "./rendering/shared/previewContextRegistry.js"
import {WS_URL} from "../../utils/urls.js"
import {getAccessToken} from "../../utils/auth.js"
import {BattleLoading} from "../BattleLoading/BattleLoading.jsx"
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
  const [islandVoice, setIslandVoice] = useState(null)
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
    const snapshotStats = getPlayerBattleStats(latestStateRef.current, clientRef.current?.playerId)
    const normalized = {duration:0,kills:0,monsters:0,...snapshotStats,...result}
    saveBattleResult(normalized)
    setBattleResult(normalized)
    setView(normalized.won ? "result" : normalized.timedOut ? "timeout" : "dead")
    try {
      rendererRef.current?.setOutcome(normalized.won ? "victory" : "defeat")
    } catch (error) {
      // The result popup is authoritative. A cosmetic renderer failure must
      // never strand the player on the arena with zero health.
      console.warn("Could not play battle outcome animation", error)
    }
  }, [setView])

  const debugPlayerId = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("debugPlayer") : null
  const effectivePlayerId = debugPlayerId || playerId
  const playerName = effectivePlayerId ? `P${String(effectivePlayerId).slice(0, 6)}` : "Player"

  const addMessage = useCallback((msg) => {
    if (msg.type === "island_voice") return
    setMessages(prev => [...prev.slice(-9), msg])
  }, [])

  useEffect(() => {
    if (!islandVoice) return undefined
    const timeout = window.setTimeout(() => setIslandVoice(null), 6500)
    return () => window.clearTimeout(timeout)
  }, [islandVoice])

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

    releaseAllPreviewContexts()
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
        const displayState = simulation.getDisplayState(undefined, {copyEntities: true}) || state
        const now = performance.now()
        if (!lastUiUpdateRef.current || now - lastUiUpdateRef.current >= 100) {
          lastUiUpdateRef.current = now
          setGameState(displayState)
        }
        const v = viewRef.current
        if (state?.game?.state === "game" && v !== "game") {
          setView("game")
        }
        if (state?.game?.state === "lobby" && v !== "lobby" && v !== "connecting") {
          setView("lobby")
        }
        const stateResult = getStateBattleResult(state, clientRef.current?.playerId, v)
        if (stateResult) finishBattle(stateResult)
      },
      (msg) => {
        addMessage(msg)
        if (msg.type === "island_voice") {
          setIslandVoice({text: msg.params?.text || "Остров смотрит.", trigger: msg.params?.trigger || "unknown"})
        }
        if (msg.type === "room_joined") {
          setRoomInfo(msg.params)
          setView("lobby")
          if (msg.params?.roomId) {
            window.history.replaceState(null, "", `/battle/${msg.params.roomId}`)
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
          finishBattle({
            won: msg.params?.name === playerName,
            timedOut: true,
            winner: msg.params?.name,
            reason: "Время вышло",
            duration: Math.round((msg.params?.duration || 0) / 1000),
          })
        }
        if (msg.type === "won") {
          finishBattle({won:msg.params?.name === playerName,winner:msg.params?.name,duration:Math.round((msg.params?.duration || 0) / 1000)})
        }
        if (msg.type === "you_died") {
          setDeathInfo({killerName: msg.params?.killerName || "Unknown"})
          finishBattle({won:false,killerName:msg.params?.killerName || "Unknown"})
        }
        if (msg.type === "killed" && msg.params?.killedName === playerName) {
          setDeathInfo({killerName: msg.params?.killerName || "Unknown"})
          finishBattle({won:false,killerName:msg.params?.killerName || "Unknown"})
        }
        if (msg.type === "error" && roomId && msg.params?.message === "Room not found") {
          joinedRef.current = false
          navigate("/battle", {replace: true, state: {heroName}})
        }
      },
      () => {
        setConnected(true)
      },
      () => setConnected(false)
    )
    client.setShootPrediction?.(details => simulation.predictLocalShoot(details))
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
          island: {
            name: state?.game?.islandName || null,
            phase: state?.game?.phase || null,
            phaseEndsAt: state?.game?.phaseEndsAt || 0,
            event: state?.game?.islandEvent || null,
            stormRadius: state?.game?.stormRadius || 0,
            beaconOpen: Boolean(state?.game?.beaconOpen),
            beaconHolder: state?.game?.beaconHolder || null,
            beaconProgress: state?.game?.beaconProgress || 0,
            suddenDeathDamage: state?.game?.suddenDeathDamage || 0,
          },
          localPlayerId: localId || null,
          player: local ? {
            x: local.x,
            y: local.y,
            health: local.lives,
            ammo: local.ammo,
            hero: local.hero,
            lunarSpeed: local.lunarSpeed || 0,
            lunarDamage: local.lunarDamage || 0,
            lunarShield: Boolean(local.lunarShield),
          } : null,
          visiblePlayers: Object.keys(state?.players || {}).length,
          projectiles: (state?.bullets || []).length,
          lunarCrates: (state?.props || []).filter(prop => prop.type === "lunar_crate").length,
          lunarRewards: (state?.props || []).filter(prop => String(prop.type).startsWith("lunar_") && prop.type !== "lunar_crate").length,
          mapWalls: state?.map?.walls?.length || 0,
          mapObjects: renderer.impl?.mapRenderer?.objects?.size || 0,
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
      const delta = Math.max(0, (frameAt - previousFrameAt) / 1000)
      previousFrameAt = frameAt
      input.update()
      simulation.advance(delta)
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
  const alivePlayerCount = getBattlePlayerCount(gameState)
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
        <BattleLoading
          progress={connected ? 62 : 42}
          status={connected ? "Получаем карту арены..." : "Подключаемся к арене..."}
        />

      )}

      {view === "lobby" && roomInfo && (
        <div className="battle-lobby-hud">
          <div className="lobby-info">
            <div className="lobby-kicker">BATTLE ARENA</div>
            <h3>{roomInfo.roomName}</h3>
            <p className="lobby-mode">{roomInfo.mode} · {roomInfo.mapName === "battle-royale" ? "Остров Первого Испытания" : roomInfo.mapName}</p>
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
            <div className="battle-mode-pill"><span>⚡</span> BRAWL STARS</div>
            <div className="battle-alive"><i/> {alivePlayerCount} В БОЮ</div>
          </header>
          <IslandPhaseHud state={gameState?.game}/>
          <IslandVoiceNotice voice={islandVoice}/>
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
                {localPlayer.hero === "Mandy" && (
                  <div className={`focus-track${localPlayer.focusCharge >= 100 ? " is-ready" : ""}`} aria-label={`Фокус ${localPlayer.focusCharge || 0}%`}>
                    <span style={{width: `${localPlayer.focusCharge || 0}%`}}/>
                  </div>
                )}
                <small>❤ {health} / {maxHealth}</small>
              </div>
            </div>
          )}
          {gameState?.map && <BattleMiniMap state={gameState} localId={clientRef.current?.playerId} renderer={rendererRef.current}/>}
          {localPlayer && (
            <div className="battle-abilities">
              <AbilityButton slot="primary" keyName="Q" label={getHeroSkill(localPlayer.hero, "primary").name} description={getHeroSkill(localPlayer.hero, "primary").description} cooldown={localPlayer.cooldowns?.primary} charge={localPlayer.superCharge || 0} isSuper onUse={() => clientRef.current?.ability?.("primary")}/>
              <AbilityButton slot="secondary" keyName="E" label={`${getHeroSkill(localPlayer.hero, "secondary").name} · ${localPlayer.gadgetCharges || 0}`} description={getHeroSkill(localPlayer.hero, "secondary").description} cooldown={localPlayer.cooldowns?.secondary} disabled={!localPlayer.gadgetCharges || localPlayer.gadgetArmed} onUse={() => clientRef.current?.ability?.("secondary")}/>
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
            <BattleRewardNotice result={battleResult}/>
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
            <BattleRewardNotice result={battleResult}/>
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

// Legacy JSX kept below only as a migration note; live components are in BattleGameUI.jsx.
