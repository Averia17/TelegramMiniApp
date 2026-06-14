import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameClient } from './GameClient';
import { Renderer } from './Renderer';
import { Input } from './Input';
import './BattleGame.css';

const WS_URL = import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:8000';

export const BattleGame = ({ playerId, roomId, onExit }) => {
    const navigate = useNavigate();
    const canvasRef = useRef(null);
    const clientRef = useRef(null);
    const rendererRef = useRef(null);
    const inputRef = useRef(null);
    const animFrameRef = useRef(null);
    const joinedRef = useRef(false);

    const [gameState, setGameState] = useState(null);
    const [connected, setConnected] = useState(false);
    const [roomInfo, setRoomInfo] = useState(null);
    const [messages, setMessages] = useState([]);
    const [searching, setSearching] = useState(false);
    const [rooms, setRooms] = useState([]);
    const [joinCode, setJoinCode] = useState('');
    const [view, setView] = useState(roomId ? 'lobby' : 'menu');

    const playerName = playerId ? `P${String(playerId).slice(0, 6)}` : 'Player';

    const addMessage = useCallback((msg) => {
        setMessages(prev => [...prev.slice(-9), msg]);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        const renderer = new Renderer(canvas);
        rendererRef.current = renderer;

        const client = new GameClient(
            `${WS_URL}/ws`,
            (state) => {
                setGameState(state);
                renderer.setState(state);
                if (state?.game?.state === 'game' && view !== 'game') {
                    setView('game');
                }
                if (state?.game?.state === 'lobby' && view !== 'lobby' && view !== 'menu') {
                    setView('lobby');
                }
            },
            (msg) => {
                addMessage(msg);
                if (msg.type === 'room_joined') {
                    setRoomInfo(msg.params);
                    setView('lobby');
                }
                if (msg.type === 'match_found') {
                    setSearching(false);
                    if (msg.params?.roomId && clientRef.current) {
                        clientRef.current.joinById(msg.params.roomId, playerName);
                    }
                }
                if (msg.type === 'room_list') {
                    setRooms(msg.params || []);
                }
                if (msg.type === 'start') {
                    setView('game');
                }
                if (msg.type === 'stop') {
                    setView('lobby');
                }
            },
            () => setConnected(true),
            () => setConnected(false)
        );
        clientRef.current = client;
        client.connect();

        const input = new Input(canvas, client);
        inputRef.current = input;

        const gameLoop = () => {
            input.update();
            renderer.render();
            animFrameRef.current = requestAnimationFrame(gameLoop);
        };
        gameLoop();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animFrameRef.current);
            client.disconnect();
        };
    }, [addMessage]);

    useEffect(() => {
        if (gameState && clientRef.current) {
            const pid = clientRef.current.playerId;
            if (pid && gameState.players && gameState.players[pid]) {
                rendererRef.current?.setLocalPlayerId(pid);
                inputRef.current?.setLocalPlayer(pid, () => clientRef.current?.lastState || gameState);
            }
        }
    }, [gameState]);

    useEffect(() => {
        if (connected && roomId && !joinedRef.current && clientRef.current) {
            joinedRef.current = true;
            clientRef.current.joinById(roomId, playerName);
        }
    }, [connected, roomId, playerName]);

    useEffect(() => {
        if (roomInfo?.roomId && roomId && window.location.pathname !== `/room/${roomInfo.roomId}`) {
            joinedRef.current = true;
            navigate(`/room/${roomInfo.roomId}`, { replace: true });
        }
    }, [roomInfo, navigate, roomId]);

    const handleCreateRoom = () => {
        if (clientRef.current) {
            clientRef.current.join(playerName, '', 'arena', 8, 'deathmatch');
        }
    };

    const handleJoinById = () => {
        if (clientRef.current && joinCode.trim()) {
            clientRef.current.joinById(joinCode.trim(), playerName);
        }
    };

    const handleRefreshRooms = () => {
        if (clientRef.current) {
            clientRef.current.listRooms();
        }
    };

    const handleJoinRoom = (roomId) => {
        if (clientRef.current) {
            clientRef.current.joinById(roomId, playerName);
        }
    };

    const handleFindMatch = () => {
        setSearching(true);
        if (clientRef.current) {
            clientRef.current.findMatch(playerName);
        }
    };

    const handleCancelSearch = () => {
        setSearching(false);
        if (clientRef.current) {
            clientRef.current.cancelMatch();
        }
    };

    const handleBackToMenu = () => {
        setView('menu');
        setRoomInfo(null);
        setGameState(null);
        joinedRef.current = false;
        if (clientRef.current) {
            clientRef.current.disconnect();
            clientRef.current.connect();
        }
        if (onExit) {
            onExit();
        } else {
            navigate('/');
        }
    };

    return (
        <div className="battle-game">
            <canvas ref={canvasRef} className="battle-canvas" />

            {/* Main Menu */}
            {view === 'menu' && !roomInfo && !searching && (
                <div className="battle-overlay">
                    <div className="battle-menu">
                        <h2>Battle</h2>
                        <p className="connection-status">
                            {connected ? 'Connected' : 'Connecting...'}
                        </p>

                        <button onClick={handleCreateRoom} disabled={!connected}>
                            Create Room
                        </button>

                        <div className="join-section">
                            <input
                                type="text"
                                placeholder="Room code..."
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleJoinById()}
                                disabled={!connected}
                            />
                            <button onClick={handleJoinById} disabled={!connected || !joinCode.trim()}>
                                Join
                            </button>
                        </div>

                        <button onClick={handleFindMatch} disabled={!connected}>
                            Find Match
                        </button>

                        <button onClick={handleRefreshRooms} disabled={!connected} className="secondary">
                            Refresh Rooms
                        </button>

                        {rooms.length > 0 && (
                            <div className="room-list">
                                <h3>Available Rooms</h3>
                                {rooms.map((room) => (
                                    <div key={room.roomId} className="room-item">
                                        <div className="room-info">
                                            <span className="room-name">{room.roomName}</span>
                                            <span className="room-meta">
                                                {room.mode} | {room.mapName} | {room.playerCount}/{room.maxPlayers}
                                            </span>
                                            <span className={`room-status status-${room.status}`}>
                                                {room.status}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleJoinRoom(room.roomId)}
                                            disabled={room.playerCount >= room.maxPlayers || room.status !== 'waiting'}
                                        >
                                            Join
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {onExit && (
                            <button className="exit-btn" onClick={onExit}>
                                Back
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Searching */}
            {searching && (
                <div className="battle-overlay">
                    <div className="battle-menu">
                        <h2>Searching...</h2>
                        <div className="spinner" />
                        <button onClick={handleCancelSearch}>Cancel</button>
                    </div>
                </div>
            )}

            {/* Lobby */}
            {view === 'lobby' && roomInfo && (
                <div className="battle-lobby-hud">
                    <div className="lobby-info">
                        <h3>Room: {roomInfo.roomName}</h3>
                        <p>Code: <span className="room-code" onClick={() => {navigator.clipboard.writeText(roomInfo.roomId);}} title="Click to copy">{roomInfo.roomId}</span></p>
                        <p>Map: {roomInfo.mapName} | Mode: {roomInfo.mode}</p>
                        <p>Players: {Object.keys(gameState?.players || {}).length}/{roomInfo.maxPlayers}</p>
                        {gameState?.players && clientRef.current?.playerId && (() => {
                            const me = gameState.players[clientRef.current.playerId];
                            return me?.hero ? <p className="hint">Your hero: {me.hero}</p> : null;
                        })()}
                        {!connected && <p className="hint">Connecting...</p>}
                        {connected && gameState?.game?.state === 'waiting' && <p className="hint">Waiting for players...</p>}
                        {connected && gameState?.game?.state === 'lobby' && gameState?.game?.lobbyEndsAt > 0 && (
                            <p className="hint">Game starts in {Math.max(0, Math.ceil((gameState.game.lobbyEndsAt - Date.now()) / 1000))}s</p>
                        )}
                        {connected && gameState?.game?.state === 'game' && <p className="hint">Battle in progress!</p>}
                        <button onClick={handleBackToMenu}>Leave</button>
                    </div>
                </div>
            )}

            {/* Connecting overlay when no roomId */}
            {view === 'lobby' && !roomInfo && !connected && (
                <div className="battle-overlay">
                    <div className="battle-menu">
                        <h2>Connecting...</h2>
                        <div className="spinner" />
                    </div>
                </div>
            )}

            {/* Game Messages */}
            {view === 'game' && (
                <button className="battle-exit-btn" onClick={handleBackToMenu}>
                    ✕
                </button>
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
    );
};
