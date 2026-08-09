import {HeroView, isInsideBush} from "../heroes/HeroView"
import {isAlivePlayerState} from "../heroes/playerVisibility.js"
import {MapRenderer} from "../map/MapRenderer"
import {AimRenderer} from "../combat/AimRenderer"
import {EffectRenderer} from "../combat/EffectRenderer"
import {ProjectileRenderer} from "../combat/ProjectileRenderer"
import {CameraRig} from "../CameraRig"
import {SceneRoot} from "../SceneRoot"
import {detectLowQualityDevice} from "../shared/quality"
import {MonsterRenderer} from "../monsters/MonsterRenderer.js"
import {PickupRenderer} from "../map/PickupRenderer.js"
import {endBattlePerformance, recordBattleMetric, startBattlePerformance} from "../shared/performance.js"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export class ThreeBattleRenderer {
  constructor(canvas) {
    this.canvas = canvas
    const requestedLowQuality = detectLowQualityDevice()
    this.sceneRoot = new SceneRoot(canvas, requestedLowQuality)
    this.lowQuality = this.sceneRoot.lowQuality
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
    this.monsters = new MonsterRenderer(this.actorRoot, {lowQuality: this.lowQuality})
    this.pickups = new PickupRenderer(this.pickupRoot)
    this.projectiles = new ProjectileRenderer(this.projectileRoot, {lowQuality: this.lowQuality})
    this.effects = new EffectRenderer(this.effectRoot, {lowQuality: this.lowQuality})
    this.aim = new AimRenderer(this.aimRoot)
    this.state = null
    this.mapState = null
    this.localPlayerId = null
    this.mapRenderer = new MapRenderer(this.mapRoot, {lowQuality: this.lowQuality})
    this.time = 0
    this.lastRenderAt = performance.now()
    this.performanceWindowAt = this.lastRenderAt
    this.performanceFrames = 0
    this.slowFrameCount = 0
    this.fps = 60
    this.resize(window.innerWidth, window.innerHeight)
  }

  resize(width, height) {
    this.width = Math.max(1, Math.round(width))
    this.height = Math.max(1, Math.round(height))
    this.sceneRoot.resize(this.width, this.height)
    this.cameraRig.resize(this.width, this.height)
  }

  setLocalPlayerId(id) { this.localPlayerId = String(id) }

  setOutcome(outcome) {
    const result = outcome === "victory" ? "victory" : "defeat"
    this.players.forEach(view => view.setResult(view.id === this.localPlayerId ? result : null))
  }

  setState(state) {
    if (!state) return
    const perfToken = startBattlePerformance("renderer.setState")
    this.state = state
    const focusPlayer = state.players?.[this.localPlayerId] || Object.values(state.players || {})[0]
    if (focusPlayer) this.mapRenderer.setFocus?.(focusPlayer.x, focusPlayer.y)
    const mapSyncToken = startBattlePerformance("renderer.map.sync")
    const mapChanged = !this.mapState ||
      state.map?.width !== this.mapState.width ||
      state.map?.height !== this.mapState.height ||
      state.map?.walls !== this.mapState.walls
    if (mapChanged) {
      this.mapRenderer.sync(state.map)
    }
    this.mapState = state.map
    endBattlePerformance(mapSyncToken)
    const islandSyncToken = startBattlePerformance("renderer.map.island")
    if (state.map) this.mapRenderer.syncIsland(state.game, state.map.width, state.map.height)
    endBattlePerformance(islandSyncToken)
    const active = new Set()
    Object.entries(state.players || {}).forEach(([id, player]) => {
      if (!isAlivePlayerState(player)) return
      active.add(String(id))
      let view = this.players.get(String(id))
      if (!view || String(view.state.hero) !== String(player.hero)) {
        if (view) { this.actorRoot.remove(view.group); view.dispose() }
        view = new HeroView(String(id), player, this.lowQuality)
        this.players.set(String(id), view)
        this.actorRoot.add(view.group)
      }
      view.setState(player, Boolean(state.networkSmoothed))
    })
    this.players.forEach((view, id) => {
      if (!active.has(id)) { this.actorRoot.remove(view.group); view.dispose(); this.players.delete(id) }
    })
    this.projectiles.sync(state.bullets || [])
    this.monsters.sync(state.monsters || {})
    this.pickups.sync(state.props || [])
    this.effects.sync(state.effects || [])
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
      if (!isAlivePlayerState(player)) return
      const view = this.players.get(String(id))
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
    recordBattleMetric("renderer.frame_interval", frameInterval, {
      lowQuality: this.lowQuality,
    })
    const delta=clamp(frameInterval/1000,1/240,.05);this.lastRenderAt=now;this.time+=delta
    const sceneUpdateStartedAt = performance.now()
    const walls=this.state?.map?.walls||[]
    this.players.forEach((view,id)=>view.update(delta,this.time,(id===this.localPlayerId||Boolean(this.state?.players?.[id]?.team&&this.state.players[id].team===this.state?.players?.[this.localPlayerId]?.team))&&isInsideBush(view.state,walls)))
    this.mapRenderer.update(delta)
    this.projectiles.update(delta,this.time)
    this.monsters.update(delta,this.time)
    this.pickups.update(delta)
    this.aim.update(this.state?.players?.[this.localPlayerId], delta)
    const local=this.players.get(this.localPlayerId)
    const map=this.state?.map||{width:1024,height:768}
    this.cameraRig.follow(local, map, delta)
    recordBattleMetric("renderer.scene_update", performance.now() - sceneUpdateStartedAt, {
      players: this.players.size,
      monsters: this.monsters.views.size,
      bullets: this.projectiles.meshes.size,
    })
    const gpuRenderStartedAt = performance.now()
    this.sceneRoot.render(this.camera)
    recordBattleMetric("renderer.gpu", performance.now() - gpuRenderStartedAt, {
      lowQuality: this.lowQuality,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    })
    const frameElapsed = performance.now() - frameStartedAt
    recordBattleMetric("renderer.frame", frameElapsed, {
      lowQuality: this.lowQuality,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    })
    if (!this.lowQuality) {
      this.slowFrameCount = frameElapsed >= 22 ? this.slowFrameCount + 1 : 0
      if (this.slowFrameCount >= 10) this.enableLowQuality()
    }
    this.performanceFrames++
    const elapsed=now-this.performanceWindowAt
    if(elapsed>=2000){
      this.fps=Math.round(this.performanceFrames*1000/elapsed);this.performanceFrames=0;this.performanceWindowAt=now
      if(this.fps<50&&!this.lowQuality)this.enableLowQuality()
    }
    endBattlePerformance(perfToken)
  }

  enableLowQuality() {
    if (this.lowQuality) return
    this.sceneRoot.setLowQuality()
    this.players.forEach(view => view.setLowQuality?.())
    this.mapRenderer.setLowQuality?.()
    this.lowQuality=true
    this.resize(this.width,this.height)
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
    this.sceneRoot.dispose()
  }
}
