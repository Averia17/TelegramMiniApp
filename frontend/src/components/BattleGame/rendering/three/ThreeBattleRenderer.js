import {HeroView, isInsideBush} from "../heroes/HeroView"
import {removeFinishedDeathViews} from "../heroes/deathLifecycle.js"
import {getDeathShakeAmount} from "../heroes/deathVisuals.js"
import {isAlivePlayerState} from "../heroes/playerVisibility.js"
import {shouldCreateAttackReloadIndicator} from "../heroes/AttackReloadIndicator.js"
import {MapRenderer} from "../map/MapRenderer"
import {AimRenderer} from "../combat/AimRenderer"
import {EffectRenderer} from "../combat/EffectRenderer"
import {CombatFeedbackRenderer} from "../combat/CombatFeedbackRenderer.js"
import {getCombatHitProfile} from "../combat/combatFeedback.js"
import {CombatAudio} from "../combat/combatAudio.js"
import {createLastContactEffects} from "../combat/lastContactEffects.js"
import {ProjectileRenderer} from "../combat/ProjectileRenderer"
import {CameraRig} from "../CameraRig"
import {SceneRoot} from "../SceneRoot"
import {MonsterRenderer} from "../monsters/MonsterRenderer.js"
import {PickupRenderer} from "../map/PickupRenderer.js"
import {endBattlePerformance, recordBattleMetric, startBattlePerformance} from "../shared/performance.js"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export class ThreeBattleRenderer {
  constructor(canvas) {
    this.canvas = canvas
    this.sceneRoot = new SceneRoot(canvas)
    this.renderer = this.sceneRoot.renderer
    this.scene = this.sceneRoot.scene
    this.cameraRig = new CameraRig()
    this.camera = this.cameraRig.camera
    this.mapRoot = this.sceneRoot.roots.map
    this.actorRoot = this.sceneRoot.roots.actors
    this.pickupRoot = this.sceneRoot.roots.pickups
    this.projectileRoot = this.sceneRoot.roots.projectiles
    this.effectRoot = this.sceneRoot.roots.effects
    this.aimRoot = this.sceneRoot.roots.aim
    this.players = new Map()
    this.monsters = new MonsterRenderer(this.actorRoot)
    this.pickups = new PickupRenderer(this.pickupRoot)
    this.projectiles = new ProjectileRenderer(this.projectileRoot)
    this.effects = new EffectRenderer(this.effectRoot)
    this.combatFeedback = new CombatFeedbackRenderer(this.effectRoot)
    this.combatAudio = new CombatAudio()
    this.aim = new AimRenderer(this.aimRoot)
    this.state = null
    this.mapState = null
    this.localPlayerId = null
    this.mapRenderer = new MapRenderer(this.mapRoot)
    this.time = 0
    this.hitStopRemaining = 0
    this.lastRenderAt = performance.now()
    this.resize(window.innerWidth, window.innerHeight)
  }

  resize(width, height) {
    this.width = Math.max(1, Math.round(width))
    this.height = Math.max(1, Math.round(height))
    this.sceneRoot.resize(this.width, this.height)
    this.cameraRig.resize(this.width, this.height)
  }

  setLocalPlayerId(id) {
    this.localPlayerId = String(id)
    this.combatFeedback.setLocalPlayerId(this.localPlayerId)
    const localPlayer = this.state?.players?.[this.localPlayerId]
    if (!localPlayer) return
    const teamBattle = String(this.state.game?.mode || "").toLowerCase().replace(/[_-]/g, " ") === "team deathmatch"
    const localTeam = localPlayer.team || ""
    this.players.forEach((view, playerId) => {
      view.setTeamContext(teamBattle, localTeam)
      view.setLocalPlayer(String(playerId) === this.localPlayerId)
    })
    this.mapRenderer.setFocus?.(localPlayer.x, localPlayer.y)
  }

  showTaunt(playerId, tauntId = "clown_laugh") {
    this.players.get(String(playerId))?.showTaunt(tauntId)
  }

  isReady() {
    return Boolean(
      this.state &&
      this.mapRenderer.isReady() &&
      this.players.size > 0 &&
      [...this.players.values()].every(view => view.isReady()),
    )
  }

  setOutcome(outcome) {
    const result = outcome === "victory" ? "victory" : "defeat"
    this.players.forEach(view => view.setResult(view.id === this.localPlayerId ? result : null))
  }

  setState(state) {
    if (!state) return
    const perfToken = startBattlePerformance("renderer.setState")
    this.state = state
    const teamBattle = String(state.game?.mode || "").toLowerCase().replace(/[_-]/g, " ") === "team deathmatch"
    this.sceneRoot.setTeamAtmosphere(teamBattle, state.map?.name || state.map?.id)
    const focusPlayer = state.players?.[this.localPlayerId] || Object.values(state.players || {})[0]
    if (focusPlayer) this.mapRenderer.setFocus?.(focusPlayer.x, focusPlayer.y)
    const mapSyncToken = startBattlePerformance("renderer.map.sync")
    const mapChanged = !this.mapState ||
      state.map?.width !== this.mapState.width ||
      state.map?.height !== this.mapState.height ||
      state.map?.walls !== this.mapState.walls ||
      state.map?.features !== this.mapState.features
    if (mapChanged) {
      this.mapRenderer.sync(state.map)
    }
    this.mapState = state.map
    endBattlePerformance(mapSyncToken)
    const islandSyncToken = startBattlePerformance("renderer.map.island")
    if (state.map) this.mapRenderer.syncIsland(state.game, state.map.width, state.map.height)
    this.mapRenderer.syncObjectives?.(state.objectives)
    endBattlePerformance(islandSyncToken)
    const active = new Set()
    const localTeam = state.players?.[this.localPlayerId]?.team || ""
    Object.entries(state.players || {}).forEach(([id, player]) => {
      const existingView = this.players.get(String(id))
      if (player.hidden) {
        if (existingView) {
          this.actorRoot.remove(existingView.group)
          existingView.dispose()
          this.players.delete(String(id))
        }
        return
      }
      // Keep an already-rendered hero for the authoritative death frame so
      // GLBHeroController can show its authored defeat pose. A player that was
      // never visible is still ignored while dead.
      if (!isAlivePlayerState(player) && !existingView) return
      active.add(String(id))
      let view = existingView
      if (!view || String(view.state.hero) !== String(player.hero)) {
        if (!isAlivePlayerState(player)) return
        if (view) { this.actorRoot.remove(view.group); view.dispose() }
        view = new HeroView(
          String(id),
          player,
          shouldCreateAttackReloadIndicator(id, this.localPlayerId),
          teamBattle,
          localTeam,
        )
        this.players.set(String(id), view)
        this.actorRoot.add(view.group)
      }
      view.setTeamContext(teamBattle, localTeam)
      const deathShake = getDeathShakeAmount(
        view.state,
        player,
        String(id) === this.localPlayerId,
      )
      if (deathShake > 0) this.cameraRig.addShake(deathShake)
      view.setLocalPlayer(shouldCreateAttackReloadIndicator(id, this.localPlayerId))
      view.setState(player, Boolean(state.networkSmoothed))
    })
    this.players.forEach((view, id) => {
      if (!active.has(id)) { this.actorRoot.remove(view.group); view.dispose(); this.players.delete(id) }
    })
    this.projectiles.sync(state.bullets || [])
    this.monsters.sync(state.monsters || {})
    this.pickups.sync(state.props || [])
    this.effects.sync([...(state.effects || []), ...createLastContactEffects(state.players || {}, state.ts || Date.now())])
    const newHits = this.combatFeedback.sync(state)
    newHits.forEach(event => {
      const targetIsLocal = String(event.targetId) === this.localPlayerId
      const sourceIsLocal = String(event.sourceId) === this.localPlayerId
      this.players.get(String(event.targetId))?.triggerHitReaction?.(event)
      this.combatAudio.playCombatEvent(event)
      this.cameraRig.addShake(targetIsLocal ? .18 : sourceIsLocal ? .07 : .025)
      this.hitStopRemaining = Math.max(this.hitStopRemaining, getCombatHitProfile(event).hitStopSeconds)
    })
    recordBattleMetric("renderer.scene_entity_count", active.size + Object.keys(state.monsters || {}).length + (state.bullets || []).length, {
      players: active.size,
      monsters: Object.keys(state.monsters || {}).length,
      bullets: (state.bullets || []).length,
      mapObjects: this.mapRenderer.objects.size,
    })
    endBattlePerformance(perfToken)
  }

  setDisplayState(state) {
    if (!state) return
    const perfToken = startBattlePerformance("renderer.setDisplayState")
    this.state = state
    Object.entries(state.players || {}).forEach(([id, player]) => {
      const view = this.players.get(String(id))
      if (!isAlivePlayerState(player)) {
        if (view) view.setState(player, Boolean(state.networkSmoothed))
        return
      }
      // Entity creation/removal stays on the authoritative full-sync path.
      // During the frames between snapshots, only feed existing views their
      // interpolated target so the visual path stays cheap and allocation-free.
      view?.setDisplayState?.(player)
    })
    this.projectiles.setDisplayState?.(state.bullets || [])
    this.monsters.setDisplayState?.(state.monsters || {})
    endBattlePerformance(perfToken)
  }

  render() {
    const perfToken = startBattlePerformance("renderer.render")
    const frameStartedAt = performance.now()
    const now=performance.now()
    const frameInterval = now - this.lastRenderAt
    recordBattleMetric("renderer.frame_interval", frameInterval)
    const delta=clamp(frameInterval/1000,1/240,.05);this.lastRenderAt=now
    const hitStopActive = this.hitStopRemaining > 0
    const visualDelta = hitStopActive ? 0 : delta
    this.hitStopRemaining = Math.max(0, this.hitStopRemaining - delta)
    this.time += visualDelta
    const sceneUpdateStartedAt = performance.now()
    const walls=this.state?.map?.walls||[]
    this.players.forEach((view,id)=>view.update(visualDelta,this.time,(id===this.localPlayerId||Boolean(this.state?.players?.[id]?.team&&this.state.players[id].team===this.state?.players?.[this.localPlayerId]?.team))&&isInsideBush(view.state,walls)))
    removeFinishedDeathViews(this.players, this.actorRoot)
    const local=this.players.get(this.localPlayerId)
    // Map focus is updated on snapshot/state boundaries; procedural props do
    // not trigger asset work from inside RAF.
    this.mapRenderer.update(visualDelta)
    this.projectiles.update(visualDelta,this.time)
    this.monsters.update(visualDelta,this.time)
    this.pickups.update(visualDelta)
    this.combatFeedback.update(visualDelta)
    this.aim.update(this.state?.players?.[this.localPlayerId], visualDelta)
    const map=this.state?.map||{width:1024,height:768}
    this.cameraRig.follow(local, map, visualDelta)
    recordBattleMetric("renderer.scene_update", performance.now() - sceneUpdateStartedAt, {
      players: this.players.size,
      monsters: this.monsters.views.size,
      bullets: this.projectiles.meshes.size,
    })
    const gpuRenderStartedAt = performance.now()
    this.sceneRoot.render(this.camera)
    recordBattleMetric("renderer.gpu", performance.now() - gpuRenderStartedAt, {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    })
    const frameElapsed = performance.now() - frameStartedAt
    recordBattleMetric("renderer.frame", frameElapsed, {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    })
    endBattlePerformance(perfToken)
  }

  worldToScreen(x,y) {
    return this.cameraRig.worldToScreen(x, y)
  }

  screenToAimAngle(screenX,screenY,player) {
    return this.cameraRig.screenToAimAngle(screenX, screenY, player)
  }

  isPlayerVisible(id) {
    const view=this.players.get(String(id));if(!view||!view.group.visible)return false
    const point=this.worldToScreen(view.x,view.y);return point.x>=-50&&point.x<=this.width+50&&point.y>=-80&&point.y<=this.height+80
  }

  destroy() {
    this.players.forEach(view=>view.dispose())
    this.pickups.dispose()
    this.monsters.dispose()
    this.mapRenderer.dispose()
    this.combatFeedback.dispose()
    this.combatAudio.dispose()
    this.sceneRoot.dispose()
  }
}
