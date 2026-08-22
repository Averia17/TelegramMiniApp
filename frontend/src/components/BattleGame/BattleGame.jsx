import {Profiler, useEffect, useRef, useState, useCallback} from "react"
import {useNavigate} from "react-router-dom"
import {GameClient} from "./GameClient"
import {Renderer} from "./Renderer"
import {Input, MOBILE_INPUT_MEDIA_QUERY} from "./Input"
import {NetworkSimulation} from "./NetworkSimulation"
import {getHeroSkill} from "./heroSkills.js"
import {getBattlePlayerCount, getBattleResultView, getPlayerBattleStats, getPresentedBattleResult, getSynchronizedBattleView} from "./battleOutcome"
import {AbilityButton, ActiveStatusEffects, BattleMatchTimer, BattleMiniMap, BattleResultCard, BattleResultStats, IslandPhaseHud, IslandVoiceNotice, NetworkStatusNotice, TauntButton, TeamBattleHud, TeamObjectiveHud, TowerThreatNotice, TouchStick} from "./BattleGameUI.jsx"
import {getAttackCooldownVisual} from "./attackCooldownVisual.js"
import {getActiveStatusEffects} from "./statusEffects.js"
import {formatBattleMessage} from "./battleMessages.js"
import {chooseTauntTarget} from "./tauntTarget.js"
import {releaseAllPreviewContexts} from "./rendering/shared/previewContextRegistry.js"
import {getBattlePerformanceSnapshot, recordBattleMetric} from "./rendering/shared/performance.js"
import {isInsideConcealment} from "./rendering/shared/concealment.js"
import {assetRegistry} from "./rendering/assets/AssetRegistry.js"
import {MAX_PARTY_SIZE, WS_URL} from "../../utils/urls.js"
import {getAccessToken} from "../../utils/auth.js"
import {BattleLoading} from "../BattleLoading/BattleLoading.jsx"
import {getBattleLoadingProgress} from "./battleLoadingProgress.js"
import {getBattleErrorMessage} from "./battleErrors.js"
import {normalizeTeamBattleResult} from "./teamBattleUi.js"
import {isTeamBattleMode} from "./battleMode.js"
import {BATTLE_RECOVERY_TIMEOUT_MS, getBattleRecoveryDecision, getBattleRecoveryTimeoutDecision} from "./battleRecovery.js"
import {clearActiveBattle, saveActiveBattle, saveBattleHistoryRecord} from "../../utils/battleHistory.js"
import "./BattleGame.css"


const saveBattleResult = (result, playerId, metadata = {}) => {
  try {
    saveBattleHistoryRecord(result, playerId, metadata)
    const stats = JSON.parse(window.localStorage.getItem("battle_stats") || "{}")
    window.localStorage.setItem("battle_stats", JSON.stringify({battles:(stats.battles||0)+1,wins:(stats.wins||0)+(result.won?1:0),kills:(stats.kills||0)+(result.kills||0),monsters:(stats.monsters||0)+(result.monsters||0),deaths:(stats.deaths||0)+(result.deaths||0),towerDamage:(stats.towerDamage||0)+(result.towerDamage||0)}))
  } catch (error) { console.warn("Could not save battle result", error) }
}

const profileBattleUi = (_id, phase, actualDuration) => {
  if (import.meta.env.DEV) recordBattleMetric("ui.commit", actualDuration, {phase})
}

export const BattleGame = ({playerId, playerName: configuredPlayerName = "", roomId, heroName, mode = "solo", partyId = "", partyTicket = "", tauntActive = false, startNewBattle = false}) => {
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
  const pendingDeathInfoRef = useRef(null)
  const deathRevealTimerRef = useRef(null)
  const deathRevealStartedRef = useRef(false)
  const battleErrorHandledRef = useRef(false)
  const suppressDisconnectRef = useRef(false)
  const battleContextRef = useRef({mode, partyId, mapName: "battle-royale", mapId: ""})
  const [mobileMode, setMobileMode] = useState(() => window.matchMedia(MOBILE_INPUT_MEDIA_QUERY).matches)
  const [touchControls, setTouchControls] = useState({move: null, aim: null})
  const [tauntCooldown, setTauntCooldown] = useState(0)
  const tauntTimerRef = useRef(null)

  const [gameState, setGameState] = useState(null)
  const [connected, setConnected] = useState(false)
  const [networkQuality, setNetworkQuality] = useState(null)
  const [roomInfo, setRoomInfo] = useState(null)
  const [messages, setMessages] = useState([])
  const [islandVoice, setIslandVoice] = useState(null)
  const [view, setViewState] = useState("connecting")
  const [deathInfo, setDeathInfo] = useState(null)
  const [battleResult, setBattleResult] = useState(null)
  const [sceneReady, setSceneReady] = useState(false)
  const [assetsReady, setAssetsReady] = useState(false)
  const [assetLoadError, setAssetLoadError] = useState(false)
  const [recoveryAction, setRecoveryAction] = useState(null)

  const setView = useCallback((v) => {
    viewRef.current = v
    setViewState(v)
  }, [])

  const debugPlayerId = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("debugPlayer") : null
  const effectivePlayerId = debugPlayerId || playerId
  const playerName = configuredPlayerName.trim() || "БОЕЦ"

  const reportBattleError = useCallback(source => {
    if (battleErrorHandledRef.current) return
    battleErrorHandledRef.current = true
    suppressDisconnectRef.current = true
    joinedRef.current = false
    clientRef.current?.disconnect()
    navigate("/", {
      replace: true,
      state: {battleError: getBattleErrorMessage(source)},
    })
  }, [navigate])

  const finishBattle = useCallback(result => {
    if (savedResultRef.current) return
    savedResultRef.current = true
    const snapshotStats = getPlayerBattleStats(
      latestStateRef.current,
      clientRef.current?.playerId,
      Date.now(),
      {eliminated: result.won === false},
    )
    const normalized = normalizeTeamBattleResult(
      {duration:0,kills:0,monsters:0,...snapshotStats,...result},
      latestStateRef.current,
      clientRef.current?.playerId,
    )
    const localPlayerId = clientRef.current?.playerId || effectivePlayerId
    clearActiveBattle(localPlayerId)
    const players = latestStateRef.current?.players || {}
    const localPlayer = players[localPlayerId]
    const partyIdForHistory = localPlayer?.partyId || battleContextRef.current.partyId
    const partyMembers = partyIdForHistory
      ? Object.entries(players)
        .filter(([id, player]) => id !== String(localPlayerId) && (
          player?.partyId === partyIdForHistory || (localPlayer?.team && player?.team === localPlayer.team)
        ))
        .map(([, player]) => ({name: player?.name, hero: player?.hero}))
        .filter(member => member.name)
      : []
    saveBattleResult(normalized, localPlayerId, {
      mode: normalized.mode || battleContextRef.current.mode,
      mapName: normalized.mapName || battleContextRef.current.mapName,
      mapId: normalized.mapId || battleContextRef.current.mapId,
      partyMembers,
    })
    setBattleResult(normalized)
    setView(getBattleResultView(normalized, mode))
    try {
      rendererRef.current?.setOutcome(normalized.won ? "victory" : "defeat")
    } catch (error) {
      // The result popup is authoritative. A cosmetic renderer failure must
      // never strand the player on the arena with zero health.
      console.warn("Could not play battle outcome animation", error)
    }
  }, [effectivePlayerId, mode, setView])

  const revealPresentedDeath = useCallback(result => {
    if (!result || deathRevealStartedRef.current) return
    deathRevealStartedRef.current = true
    // Let the interpolated lethal frame and the authored death pose be visible
    // before the result overlay takes over the arena.
    deathRevealTimerRef.current = window.setTimeout(() => {
      deathRevealTimerRef.current = null
      finishBattle({...result, ...pendingDeathInfoRef.current})
    }, 420)
  }, [finishBattle])

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
    const query = window.matchMedia(MOBILE_INPUT_MEDIA_QUERY)
    const updateMode = () => setMobileMode(query.matches)
    query.addEventListener?.("change", updateMode)
    window.Telegram?.WebApp?.expand?.()
    return () => query.removeEventListener?.("change", updateMode)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const shell = canvas.parentElement
      const rect = shell?.getBoundingClientRect()
      const visualViewport = window.visualViewport
      const width = Math.max(1, Math.round(rect?.width || visualViewport?.width || window.innerWidth))
      // The shell height is backed by --battle-viewport-height, so using its
      // rect as the source after an orientation change would preserve the old
      // height forever. The visual viewport is the authoritative mobile size.
      const height = Math.max(1, Math.round(visualViewport?.height || window.innerHeight || rect?.height || 1))
      shell?.style.setProperty("--battle-viewport-height", `${height}px`)
      rendererRef.current?.resize(width, height)
    }
    resize()
    window.addEventListener("resize", resize)
    window.addEventListener("orientationchange", resize)
    window.screen?.orientation?.addEventListener?.("change", resize)
    window.visualViewport?.addEventListener("resize", resize)

    let renderer = null
    let simulation = null
    let client = null
    let input = null
    let disposed = false
    let connectionTimer = null

    const clearConnectionTimer = () => {
      if (connectionTimer) window.clearTimeout(connectionTimer)
      connectionTimer = null
    }

    const startBattle = async () => {
      try {
        await assetRegistry.preloadBattleAssets()
      } catch (error) {
        console.error("Could not preload battle GLBs:", error)
        if (!disposed) {
          setAssetLoadError(true)
          reportBattleError({kind: "asset_load"})
        }
        return
      }
      if (!assetRegistry.areBattleAssetsReady()) {
        if (!disposed) {
          setAssetLoadError(true)
          reportBattleError({kind: "asset_load"})
        }
        return
      }
      if (disposed) return
      setAssetsReady(true)
      releaseAllPreviewContexts()
      renderer = new Renderer(canvas)
      simulation = new NetworkSimulation()
      simulationRef.current = simulation
      if (import.meta.env.DEV) window.__battleSimulation = simulation
      rendererRef.current = renderer
      if (import.meta.env.DEV) window.__battleRenderer = renderer
      resize()

      client = new GameClient(
        `${WS_URL}/ws`,
        getAccessToken(),
        (state) => {
          latestStateRef.current = state
          const receivedAt = Date.now()
          if (client.playerId) {
            renderer.setLocalPlayerId(client.playerId)
            simulation.setLocalPlayerId(client.playerId)
          }
          simulation.ingest(state, client.clockOffset, receivedAt)
          setNetworkQuality(client.getNetworkQuality(receivedAt))
          const now = performance.now()
          const shouldUpdateUi = !lastUiUpdateRef.current || now - lastUiUpdateRef.current >= 100
          if (shouldUpdateUi) {
            lastUiUpdateRef.current = now
            const displayState = simulation.getDisplayState(receivedAt, {copyEntities: true}) || state
            setGameState(displayState)
          }
          const v = viewRef.current
          const synchronizedView = getSynchronizedBattleView(state?.game?.state, v)
          if (synchronizedView && synchronizedView !== v) setView(synchronizedView)
        },
        (msg) => {
          addMessage(msg)
          if (msg.type === "island_voice") {
            setIslandVoice({text: msg.params?.text || "Остров смотрит.", trigger: msg.params?.trigger || "unknown"})
          }
          if (msg.type === "taunt") {
            rendererRef.current?.showTaunt(msg.params?.targetId || msg.params?.playerId, msg.params?.tauntId)
          }
          if (msg.type === "battle_recovered") {
            const decision = getBattleRecoveryDecision({
              status: msg.params?.status,
              roomId: msg.params?.roomId,
              result: msg.params?.result,
              startNewBattle,
            })
            if (msg.params?.playerId && !client.playerId) client.playerId = msg.params.playerId
            setRecoveryAction(decision.kind)
            if (decision.kind === "resume") {
              joinedRef.current = true
              client.joinById(decision.roomId, playerName, heroName)
            } else if (decision.kind === "result") {
              finishBattle(decision.result)
            } else if (decision.kind === "menu") {
              clearActiveBattle(effectivePlayerId)
              navigate("/", {replace: true})
            }
          }
          if (msg.type === "room_joined") {
            setRoomInfo(msg.params)
            battleContextRef.current = {
              ...battleContextRef.current,
              mode: msg.params?.mode || battleContextRef.current.mode,
              mapName: msg.params?.mapName || battleContextRef.current.mapName,
              mapId: msg.params?.mapId || battleContextRef.current.mapId,
            }
            saveActiveBattle({
              roomId: msg.params?.roomId,
              mode: msg.params?.mode || battleContextRef.current.mode,
              mapName: msg.params?.mapName || battleContextRef.current.mapName,
              partyId: battleContextRef.current.partyId,
            }, effectivePlayerId)
            setView("lobby")
            const localPlayerId = client.playerId || msg.params?.playerId
            if (localPlayerId) {
              renderer.setLocalPlayerId(localPlayerId)
              simulation.setLocalPlayerId(localPlayerId)
            }
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
              draw: Boolean(msg.params?.draw),
              timedOut: true,
              winner: msg.params?.name,
              reason: msg.params?.reason || "Время вышло",
              duration: Math.round((msg.params?.duration || 0) / 1000),
            })
          }
          if (msg.type === "won") {
            finishBattle({won:msg.params?.name === playerName,draw:Boolean(msg.params?.draw),winner:msg.params?.name,reason:msg.params?.reason,duration:Math.round((msg.params?.duration || 0) / 1000)})
          }
          if (msg.type === "you_died") {
            const info = {killerName: msg.params?.killerName || "Unknown"}
            pendingDeathInfoRef.current = info
            setDeathInfo(info)
          }
          if (msg.type === "killed" && msg.params?.killedName === playerName) {
            const info = {killerName: msg.params?.killerName || "Unknown"}
            pendingDeathInfoRef.current = info
            setDeathInfo(info)
          }
          if (msg.type === "error" && viewRef.current !== "game") {
            reportBattleError({kind: "server", message: msg.params?.message})
          }
        },
        () => {
          clearConnectionTimer()
          setConnected(true)
        },
        event => {
          setConnected(false)
          setNetworkQuality(client.getNetworkQuality())
          if (!disposed && !suppressDisconnectRef.current) {
            reportBattleError({kind: "connection_closed", code: event?.code})
          }
        }
      )
      client.setShootPrediction?.(details => simulation.predictLocalShoot(details))
      clientRef.current = client
      if (import.meta.env.DEV) window.__battleClient = client
      client.connect()
      connectionTimer = window.setTimeout(() => {
        if (!disposed && !client.connected) reportBattleError({kind: "connection_timeout"})
      }, 12_000)

      input = new Input(canvas, client, setTouchControls, (x, y, ack) => simulation.setInput(x, y, ack))
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
            metrics: getBattlePerformanceSnapshot(),
          })
        }
        window.advanceTime = milliseconds => {
          const steps = Math.max(1, Math.round(milliseconds / (1000 / 60)))
          for (let step = 0; step < steps; step++) simulation.update(1 / 60)
          const state = simulation.getDisplayState()
          if (state) renderer.setState(state)
          renderer.render()
        }
        window.getBattleMetrics = getBattlePerformanceSnapshot
      }

      let rendererFailed = false
      let sceneFrameReady = false
      let renderedSnapshotTimestamp = null
      let previousFrameAt = performance.now()
      const gameLoop = () => {
        const loopStartedAt = performance.now()
        const frameAt = performance.now()
        const frameInterval = frameAt - previousFrameAt
        const delta = Math.max(0, frameInterval / 1000)
        previousFrameAt = frameAt
        recordBattleMetric("game.frame_interval", frameInterval)
        if (frameInterval > 20) recordBattleMetric("game.frame_jank", frameInterval)
        const networkNow = Date.now()
        input.update()
        simulation.advance(delta)
        simulation.setRenderTime(networkNow)
        // Prediction and snapshot interpolation are time-based, so the
        // renderer must consume the current display frame on every RAF. The
        // websocket snapshot rate is only the input to the interpolation
        // buffer; it must not become the visual frame rate.
        const displayState = simulation.getDisplayState()
        const renderedStateThisFrame = Boolean(displayState)
        if (displayState) {
          const snapshotTimestamp = Number(displayState.ts)
          if (snapshotTimestamp !== renderedSnapshotTimestamp) {
            renderedSnapshotTimestamp = snapshotTimestamp
            renderer.setState(displayState)
          } else {
            renderer.setDisplayState(displayState)
          }
        }
        try {
          renderer.render()
          if (renderedStateThisFrame && !sceneFrameReady && renderer.isReady()) {
            sceneFrameReady = true
            setSceneReady(renderer.isReady())
          }
          rendererFailed = false
        } catch (error) {
          if (!rendererFailed) {
            console.error("Battle renderer error:", error)
            rendererFailed = true
          }
        }
        const presentedDeath = getPresentedBattleResult(
          latestStateRef.current,
          displayState,
          client.playerId,
          viewRef.current,
        )
        revealPresentedDeath(presentedDeath)
        recordBattleMetric("game.loop", performance.now() - loopStartedAt)
        animFrameRef.current = requestAnimationFrame(gameLoop)
      }
      gameLoop()
    }

    const startupTimer = window.setTimeout(startBattle, 0)

    return () => {
      disposed = true
      window.removeEventListener("resize", resize)
      window.removeEventListener("orientationchange", resize)
      window.screen?.orientation?.removeEventListener?.("change", resize)
      window.visualViewport?.removeEventListener("resize", resize)
      window.clearTimeout(startupTimer)
      clearConnectionTimer()
      if (deathRevealTimerRef.current) window.clearTimeout(deathRevealTimerRef.current)
      deathRevealTimerRef.current = null
      if (tauntTimerRef.current) window.clearInterval(tauntTimerRef.current)
      tauntTimerRef.current = null
      cancelAnimationFrame(animFrameRef.current)
      input?.destroy()
      client?.disconnect()
      if (import.meta.env.DEV && window.__battleClient === client) delete window.__battleClient
      if (import.meta.env.DEV && window.__battleRenderer === renderer) delete window.__battleRenderer
      if (import.meta.env.DEV && window.__battleSimulation === simulation) delete window.__battleSimulation
      if (import.meta.env.DEV) {
        delete window.render_game_to_text
        delete window.advanceTime
        delete window.getBattleMetrics
      }
      renderer?.destroy()
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
    if (!connected || view !== "game") return undefined
    const refreshNetworkQuality = () => {
      const client = clientRef.current
      if (client) setNetworkQuality(client.getNetworkQuality())
    }
    refreshNetworkQuality()
    const timer = window.setInterval(refreshNetworkQuality, 250)
    return () => window.clearInterval(timer)
  }, [connected, view])

  useEffect(() => {
    if (!connected || recoveryAction !== null || !clientRef.current) return undefined
    const client = clientRef.current
    client.recoverBattle(roomId || "")
    const timeout = window.setTimeout(() => {
      const decision = getBattleRecoveryTimeoutDecision({startNewBattle})
      setRecoveryAction(decision.kind)
      if (decision.kind === "menu") {
        reportBattleError({kind: "connection_timeout"})
      }
    }, BATTLE_RECOVERY_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [connected, recoveryAction, roomId, startNewBattle, reportBattleError])

  useEffect(() => {
    if (connected && recoveryAction === "new" && !joinedRef.current && clientRef.current) {
      joinedRef.current = true
      if (mode === "team" && partyId) clientRef.current.joinParty(partyId, MAX_PARTY_SIZE, partyTicket)
      clientRef.current.findMatch(playerName, heroName, mode === "team"
        ? {mode: "team deathmatch", mapName: "team-battle", maxPlayers: 6, partyId, partySize: partyId ? MAX_PARTY_SIZE : 1, partyTicket}
        : {})
    }
  }, [connected, recoveryAction, playerName, heroName, effectivePlayerId, mode, partyId, partyTicket])

  const handleBackToMenu = () => {
    suppressDisconnectRef.current = true
    joinedRef.current = false
    setView("connecting")
    setRoomInfo(null)
    setGameState(null)
    if (clientRef.current) {
      clientRef.current.leaveBattle?.()
      clientRef.current.disconnect()
    }
    navigate("/")
  }

  const localPlayer = clientRef.current?.playerId
    ? gameState?.players?.[clientRef.current.playerId]
    : null
  const lobbyPlayers = Object.entries(gameState?.players || {}).map(([id, player]) => ({...player, id}))
  const lobbyMaxPlayers = Math.max(1, Number(roomInfo?.maxPlayers) || 1)
  const playerCount = lobbyPlayers.length
  const lobbyState = gameState?.game?.state
  const lobbyCountdown = lobbyState === "lobby" && gameState?.game?.lobbyEndsAt > 0
    ? Math.max(0, Math.ceil((gameState.game.lobbyEndsAt - Date.now()) / 1000))
    : null
  const lobbyHasFoundMatch = lobbyState === "lobby"
  const alivePlayerCount = getBattlePlayerCount(gameState)
  const health = localPlayer?.lives ?? 0
  const maxHealth = localPlayer?.maxLives ?? 1
  const healthPercent = Math.max(0, Math.min(100, (health / maxHealth) * 100))
  const tauntTargetId = chooseTauntTarget({
    players: gameState?.players,
    localId: clientRef.current?.playerId,
    isVisible: id => rendererRef.current?.isPlayerVisible(id) ?? false,
  })
  const sendTaunt = () => {
    if (tauntCooldown > 0 || !tauntTargetId || !tauntActive) return
    clientRef.current?.taunt("clown_laugh", tauntTargetId)
    setTauntCooldown(1.5)
    if (tauntTimerRef.current) window.clearInterval(tauntTimerRef.current)
    tauntTimerRef.current = window.setInterval(() => {
      setTauntCooldown(value => {
        const next = Math.max(0, value - .1)
        if (next === 0 && tauntTimerRef.current) {
          window.clearInterval(tauntTimerRef.current)
          tauntTimerRef.current = null
        }
        return next
      })
    }, 100)
  }
  const localPlayerInBush = isInsideConcealment(localPlayer, gameState?.map?.walls)
  const attackCooldownVisual = getAttackCooldownVisual(localPlayer || {})
  const activeStatusEffects = getActiveStatusEffects(localPlayer || {}, {inBush: localPlayerInBush})
  const islandPhase = gameState?.game?.phase || "none"
  const isTeamBattle = mode === "team" || isTeamBattleMode(gameState?.game?.mode)
  const isTeamPlayerDown = isTeamBattle && view === "game" && localPlayer && Number(localPlayer.lives) <= 0
  const respawnSeconds = Number(localPlayer?.respawnAt) > Date.now()
    ? Math.ceil((Number(localPlayer.respawnAt) - Date.now()) / 1000)
    : null
  const loadingStatus = assetLoadError
    ? "Не удалось загрузить 3D-модели. Обновите страницу."
    : !assetsReady
      ? "Загружаем 3D-модели арены..."
      : connected ? "Получаем карту арены..." : "Подключаемся к арене..."
  const loadingProgress = getBattleLoadingProgress({assetsReady, connected, assetLoadError})

  return (
    <Profiler id="battle-ui" onRender={profileBattleUi}>
      <div className={`battle-game ${isTeamBattle ? "battle-game--team" : ""} battle-game--phase-${islandPhase} ${mobileMode ? "battle-game--mobile" : "battle-game--desktop"}`}>
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
          inBush: isInsideConcealment(localPlayer, gameState?.map?.walls),
        })}</output>}
        <canvas ref={canvasRef} className="battle-canvas"/>

        {(!assetsReady || !sceneReady || view === "connecting" || assetLoadError) && (
          <BattleLoading
            progress={loadingProgress}
            status={loadingStatus}
          />

        )}

        {view === "lobby" && roomInfo && (
          <div className="battle-lobby-hud">
            <div className="lobby-info" role="dialog" aria-labelledby="battle-lobby-title">
              <div className="lobby-info__header">
                <span className="lobby-kicker">ПОДБОР БОЯ</span>
                <span className="lobby-live"><i/> LIVE</span>
              </div>

              <div className="lobby-mode-block">
                <span className="lobby-mode-icon" aria-hidden="true">⚔</span>
                <div>
                  <h3 id="battle-lobby-title">{roomInfo.roomName}</h3>
                  <p className="lobby-mode">{roomInfo.mode} · {roomInfo.mapName === "battle-royale" ? "Остров Первого Испытания" : roomInfo.mapName}</p>
                </div>
              </div>

              <div className={`lobby-status${lobbyHasFoundMatch ? " is-ready" : ""}`}>
                <span className="lobby-status__signal"><i/></span>
                <div>
                  <strong>{lobbyHasFoundMatch ? "Матч найден" : "Ищем бойцов"}</strong>
                  <small>{lobbyHasFoundMatch ? "Состав собирается — старт скоро" : "Подключаем игроков к арене"}</small>
                </div>
              </div>

              <div className="lobby-roster">
                <div className="lobby-roster__label">
                  <span>СОСТАВ БОЯ</span>
                  <strong>{playerCount}<b>/{lobbyMaxPlayers}</b></strong>
                </div>
                <div className="lobby-slots" aria-label={`В бою ${playerCount} из ${lobbyMaxPlayers} игроков`}>
                  {Array.from({length: lobbyMaxPlayers}, (_, index) => {
                    const player = lobbyPlayers[index]
                    const playerLetter = String(player?.hero || player?.name || "?").slice(0, 1).toUpperCase()
                    return <span key={player?.id || player?.name || index} className={`lobby-slot${player ? " is-filled" : ""}${player?.id === clientRef.current?.playerId ? " is-me" : ""}`} title={player?.name || "Ожидаем игрока"}>{player ? playerLetter : "?"}</span>
                  })}
                </div>
              </div>

              {localPlayer?.hero && (
                <div className="lobby-hero-card">
                  <span className="lobby-hero-card__avatar">{String(localPlayer.hero).slice(0, 1).toUpperCase()}</span>
                  <div><small>ТВОЙ БОЕЦ</small><strong>{localPlayer.hero}</strong></div>
                  <span className="lobby-hero-card__ready">ГОТОВ</span>
                </div>
              )}

              <div className="lobby-meta">
                <button className="room-code" onClick={() => navigator.clipboard.writeText(roomInfo.roomId)} title="Скопировать код команды" aria-label={`Скопировать код команды ${roomInfo.roomId}`}>
                  <span>КОД КОМАНДЫ</span><strong>{roomInfo.roomId}</strong><i aria-hidden="true">⧉</i>
                </button>
                <div className="lobby-timer">
                  <span>{lobbyHasFoundMatch ? "СТАРТ ЧЕРЕЗ" : "ОЖИДАНИЕ"}</span>
                  <strong>{lobbyCountdown !== null ? `${lobbyCountdown} сек.` : "···"}</strong>
                </div>
              </div>

              <button className="lobby-cancel" onClick={handleBackToMenu}>ОТМЕНИТЬ ПОИСК</button>
            </div>
          </div>
        )}

        {view === "game" && (
          <>
            <header className="battle-topbar">
              <button className="battle-exit-btn" onClick={handleBackToMenu} aria-label="Выйти">✕</button>
              <div className="battle-topbar__center">
                <BattleMatchTimer game={gameState?.game}/>
              </div>
              <div className="battle-alive"><i/> {alivePlayerCount} В БОЮ</div>
            </header>
            <NetworkStatusNotice quality={networkQuality}/>
            {!isTeamBattle && (
              <IslandPhaseHud state={gameState?.game}/>
            )}
            {!isTeamBattle && (
              <IslandVoiceNotice voice={islandVoice}/>
            )}
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
                  <ActiveStatusEffects effects={activeStatusEffects}/>
                </div>
              </div>
            )}
            {gameState?.map && <BattleMiniMap state={gameState} localId={clientRef.current?.playerId} renderer={rendererRef.current}/>}
            <TeamBattleHud state={gameState} localId={clientRef.current?.playerId}/>
            <TeamObjectiveHud state={gameState} localId={clientRef.current?.playerId}/>
            <TowerThreatNotice state={gameState} localId={clientRef.current?.playerId}/>
            {isTeamPlayerDown && (
              <div className="team-respawn-overlay" role="status" aria-live="polite">
                <div className="team-respawn-overlay__icon">↻</div>
                <h2>ВОЗРОЖДЕНИЕ НА БАЗЕ</h2>
                <p>Ты временно выбыл из боя</p>
                <strong>{respawnSeconds === null ? "ОЖИДАНИЕ" : `ЧЕРЕЗ ${respawnSeconds} СЕК.`}</strong>
                <small>Возродишься на своей базе. Бой продолжается.</small>
              </div>
            )}
            {localPlayer && (
              <div className="battle-abilities">
                <AbilityButton slot="primary" keyName="Q" label={getHeroSkill(localPlayer.hero, "primary").name} description={getHeroSkill(localPlayer.hero, "primary").description} cooldown={localPlayer.cooldowns?.primary} charge={localPlayer.superCharge || 0} isSuper onUse={() => clientRef.current?.ability?.("primary")}/>
                <AbilityButton slot="secondary" keyName="E" label={`${getHeroSkill(localPlayer.hero, "secondary").name} · ${localPlayer.gadgetCharges || 0}`} description={getHeroSkill(localPlayer.hero, "secondary").description} cooldown={localPlayer.cooldowns?.secondary} disabled={!localPlayer.gadgetCharges || localPlayer.gadgetArmed} onUse={() => clientRef.current?.ability?.("secondary")}/>
              </div>
            )}
            {localPlayer && tauntActive && (
              <div className="battle-taunt-slot">
                <TauntButton cooldown={tauntCooldown} disabled={!tauntTargetId} onUse={sendTaunt}/>
              </div>
            )}
          </>
        )}

        {(view === "game" || (view === "lobby" && roomInfo)) && (
          <>
            <TouchStick kind="move" control={touchControls.move}/>
            <TouchStick kind="fire" control={touchControls.aim} cooldownVisual={attackCooldownVisual}/>
          </>
        )}

        {view === "dead" && !isTeamBattle && (
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
          <BattleResultCard result={battleResult} onBack={handleBackToMenu}/>
        )}

        {view === "timeout" && (
          <BattleResultCard result={battleResult} timedOut onBack={handleBackToMenu}/>
        )}

        <div className="battle-messages">
          {messages.map((msg, i) => {
            const text = formatBattleMessage(msg)
            return text ? <div key={i} className={`msg-${msg.type}`}>{text}</div> : null
          })}
        </div>

        <div className="battle-controls">
          {localPlayer && attackCooldownVisual.state === "cooldown" && <div className="control-hint control-hint--cooldown">АТАКА через {attackCooldownVisual.remaining.toFixed(1)} с</div>}
          <div className="control-hint">WASD — движение · мышь — прицел · клик / пробел — атака</div>
        </div>
      </div>
    </Profiler>
  )
}

// Legacy JSX kept below only as a migration note; live components are in BattleGameUI.jsx.
