import {useEffect, useRef, useState, useCallback} from 'react'
import {useNavigate} from 'react-router-dom'
import {GameClient} from './GameClient'
import {Renderer} from './Renderer'
import {Input} from './Input'
import {WS_URL} from '../../utils/urls.js'
import './BattleGame.css'

export const BattleGame = ({playerId, roomId, heroName, onExit}) => {
    const navigate = useNavigate()
    const canvasRef = useRef(null)
    const clientRef = useRef(null)
    const rendererRef = useRef(null)
    const inputRef = useRef(null)
    const animFrameRef = useRef(null)
    const joinedRef = useRef(false)
    const viewRef = useRef(roomId ? 'lobby' : 'connecting')

    const [gameState, setGameState] = useState(null)
    const [connected, setConnected] = useState(false)
    const [roomInfo, setRoomInfo] = useState(null)
    const [messages, setMessages] = useState([])
    const [view, setViewState] = useState(roomId ? 'lobby' : 'connecting')
    const [deathInfo, setDeathInfo] = useState(null)

    const setView = useCallback((v) => {
        viewRef.current = v
        setViewState(v)
    }, [])

    const playerName = playerId ? `P${String(playerId).slice(0, 6)}` : 'Player'

    const addMessage = useCallback((msg) => {
        setMessages(prev => [...prev.slice(-9), msg])
    }, [])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const resize = () => {
            canvas.width = window.innerWidth
            canvas.height = window.innerHeight
        }
        resize()
        window.addEventListener('resize', resize)

        const renderer = new Renderer(canvas)
        rendererRef.current = renderer

        const client = new GameClient(
            `${WS_URL}/ws`,
            (state) => {
                setGameState(state)
                renderer.setState(state)
                const v = viewRef.current
                if (state?.game?.state === 'game' && v !== 'game') {
                    setView('game')
                }
                if (state?.game?.state === 'lobby' && v !== 'lobby' && v !== 'connecting') {
                    setView('lobby')
                }
            },
            (msg) => {
                addMessage(msg)
                if (msg.type === 'room_joined') {
                    setRoomInfo(msg.params)
                    setView('lobby')
                    if (msg.params?.roomId) {
                        window.history.replaceState(null, '', `/battle/${msg.params.roomId}`)
                    }
                }
                if (msg.type === 'match_found') {
                    if (msg.params?.roomId && clientRef.current) {
                        clientRef.current.joinById(msg.params.roomId, playerName, heroName)
                    }
                }
                if (msg.type === 'start') {
                    setView('game')
                }
                if (msg.type === 'stop') {
                    setView('lobby')
                }
                if (msg.type === 'you_died') {
                    setDeathInfo({killerName: msg.params?.killerName || 'Unknown'})
                    setView('dead')
                    setTimeout(() => {
                        if (clientRef.current) {
                            clientRef.current.disconnect()
                        }
                        navigate('/')
                    }, 4000)
                }
            },
            () => setConnected(true),
            () => setConnected(false)
        )
        clientRef.current = client
        client.connect()

        const input = new Input(canvas, client)
        inputRef.current = input

        const gameLoop = () => {
            input.update()
            renderer.render()
            animFrameRef.current = requestAnimationFrame(gameLoop)
        }
        gameLoop()

        return () => {
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(animFrameRef.current)
            client.disconnect()
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (gameState && clientRef.current) {
            const pid = clientRef.current.playerId
            if (pid && gameState.players && gameState.players[pid]) {
                rendererRef.current?.setLocalPlayerId(pid)
                inputRef.current?.setLocalPlayer(pid, () => clientRef.current?.lastState || gameState)
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
        setView('connecting')
        setRoomInfo(null)
        setGameState(null)
        if (clientRef.current) {
            clientRef.current.disconnect()
        }
        navigate('/')
    }

    return (
        <div className="battle-game">
            <canvas ref={canvasRef} className="battle-canvas"/>

            {view === 'connecting' && (
                <div className="battle-overlay">
                    <div className="battle-menu">
                        <div className="spinner"/>
                        <p style={{color: '#888', marginTop: 12, fontSize: 14}}>Connecting...</p>
                    </div>
                </div>
            )}

            {view === 'lobby' && roomInfo && (
                <div className="battle-lobby-hud">
                    <div className="lobby-info">
                        <h3>Room: {roomInfo.roomName}</h3>
                        <p>Code: <span className="room-code" onClick={() => navigator.clipboard.writeText(roomInfo.roomId)} title="Copy">{roomInfo.roomId}</span></p>
                        <p>Map: {roomInfo.mapName} | Mode: {roomInfo.mode}</p>
                        <p>Players: {Object.keys(gameState?.players || {}).length}/{roomInfo.maxPlayers}</p>
                        {gameState?.players && clientRef.current?.playerId && (() => {
                            const me = gameState.players[clientRef.current.playerId]
                            return me?.hero ? <p className="hint">Your hero: {me.hero}</p> : null
                        })()}
                        {connected && gameState?.game?.state === 'waiting' && <p className="hint">Waiting for players...</p>}
                        {connected && gameState?.game?.state === 'lobby' && gameState?.game?.lobbyEndsAt > 0 && (
                            <p className="hint">Game starts in {Math.max(0, Math.ceil((gameState.game.lobbyEndsAt - Date.now()) / 1000))}s</p>
                        )}
                        <button onClick={handleBackToMenu}>Leave</button>
                    </div>
                </div>
            )}

            {view === 'game' && (
                <button className="battle-exit-btn" onClick={handleBackToMenu}>✕</button>
            )}

            {view === 'dead' && (
                <div className="battle-overlay" style={{background: 'rgba(139, 0, 0, 0.85)'}}>
                    <div style={{textAlign: 'center', color: '#fff'}}>
                        <div style={{fontSize: 64, marginBottom: 16}}>💀</div>
                        <h2 style={{fontSize: 24, fontWeight: 800, margin: '0 0 8px'}}>You Died</h2>
                        <p style={{fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: 0}}>
                            Killed by {deathInfo?.killerName || 'Unknown'}
                        </p>
                        <p style={{fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 16}}>
                            Returning to menu...
                        </p>
                    </div>
                </div>
            )}

            <div className="battle-messages">
                {messages.map((msg, i) => (
                    <div key={i} className={`msg-${msg.type}`}>
                        {msg.type === 'killed' && `${msg.params?.killerName} killed ${msg.params?.killedName}`}
                        {msg.type === 'won' && `${msg.params?.name} won!`}
                        {msg.type === 'joined' && `${msg.params?.name} joined as ${msg.params?.hero || 'Unknown'}`}
                        {msg.type === 'left' && `${msg.params?.name} left`}
                        {msg.type === 'start' && 'Game started!'}
                        {msg.type === 'stop' && 'Game over'}
                        {msg.type === 'timeout' && 'Time out!'}
                        {msg.type === 'waiting' && 'Waiting for players...'}
                    </div>
                ))}
            </div>

            <div className="battle-controls">
                <div className="control-hint">WASD / Arrows: Move | Mouse: Aim | Click / Space: Shoot</div>
            </div>
        </div>
    )
}
