import {useEffect, useRef, useState, useCallback} from "react"
import {useNavigate} from "react-router-dom"
import {GameClient} from "./GameClient"
import {Renderer} from "./Renderer"
import {Input} from "./Input"
import {WS_URL} from "../../utils/urls.js"
import "./BattleGame.css"

export const BattleGame = ({playerId, roomId, heroName}) => {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const clientRef = useRef(null)
  const rendererRef = useRef(null)
  const inputRef = useRef(null)
  const animFrameRef = useRef(null)
  const joinedRef = useRef(false)
  const viewRef = useRef(roomId ? "lobby" : "connecting")
  const latestStateRef = useRef(null)
  const lastUiUpdateRef = useRef(0)

  const [gameState, setGameState] = useState(null)
  const [connected, setConnected] = useState(false)
  const [roomInfo, setRoomInfo] = useState(null)
  const [messages, setMessages] = useState([])
  const [view, setViewState] = useState(roomId ? "lobby" : "connecting")
  const [deathInfo, setDeathInfo] = useState(null)

  const setView = useCallback((v) => {
    viewRef.current = v
    setViewState(v)
  }, [])

  const playerName = playerId ? `P${String(playerId).slice(0, 6)}` : "Player"

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev.slice(-9), msg])
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      rendererRef.current?.resize(window.innerWidth, window.innerHeight)
    }
    resize()
    window.addEventListener("resize", resize)

    const renderer = new Renderer(canvas)
    rendererRef.current = renderer
    renderer.resize(window.innerWidth, window.innerHeight)

    const client = new GameClient(
      `${WS_URL}/ws`,
      (state) => {
        latestStateRef.current = state
        renderer.setState(state)
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
          setView("lobby")
        }
        if (msg.type === "you_died") {
          setDeathInfo({killerName: msg.params?.killerName || "Unknown"})
          setView("dead")
          setTimeout(() => {
            if (clientRef.current) {
              clientRef.current.disconnect()
            }
            navigate("/")
          }, 4000)
        }
        if (msg.type === "error" && roomId && msg.params?.message === "Room not found") {
          joinedRef.current = false
          const heroQuery = heroName ? `?hero=${encodeURIComponent(heroName)}` : ""
          navigate(`/battle${heroQuery}`, {replace: true})
        }
      },
      () => setConnected(true),
      () => setConnected(false)
    )
    clientRef.current = client
    client.connect()

    const input = new Input(canvas, client)
    inputRef.current = input

    let rendererFailed = false
    const gameLoop = () => {
      input.update()
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
      cancelAnimationFrame(animFrameRef.current)
      input.destroy()
      client.disconnect()
      renderer.destroy()
      inputRef.current = null
      clientRef.current = null
      rendererRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gameState && clientRef.current) {
      const pid = clientRef.current.playerId
      if (pid && gameState.players && gameState.players[pid]) {
        rendererRef.current?.setLocalPlayerId(pid)
        inputRef.current?.setLocalPlayer(pid, () => clientRef.current?.lastState || latestStateRef.current || gameState)
      }
    }
  }, [gameState])

  useEffect(() => {
    if (connected && roomId && !joinedRef.current && clientRef.current) {
      joinedRef.current = true
      clientRef.current.joinById(roomId, playerName, heroName)
    }
  }, [connected, roomId, playerName, heroName])

  useEffect(() => {
    if (connected && !roomId && !joinedRef.current && clientRef.current) {
      joinedRef.current = true
      clientRef.current.findMatch(playerName, heroName)
    }
  }, [connected, roomId, playerName, heroName])

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
    <div className="battle-game">
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
                <small>❤ {health} / {maxHealth}</small>
              </div>
            </div>
          )}
        </>
      )}

      {(view === "game" || (view === "lobby" && roomInfo)) && (
        <>
          <div className="mobile-stick mobile-stick-move"><span/></div>
          <div className="mobile-stick mobile-stick-fire"><span>✦</span></div>
        </>
      )}

      {view === "dead" && (
        <div className="battle-overlay" style={{background: "rgba(139, 0, 0, 0.85)"}}>
          <div style={{textAlign: "center", color: "#fff"}}>
            <div className="death-skull">☠</div>
            <h2>ТЫ ВЫБЫЛ</h2>
            <p>Победитель: {deathInfo?.killerName || "Неизвестный боец"}</p>
            <small>Возвращаемся в меню...</small>
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
