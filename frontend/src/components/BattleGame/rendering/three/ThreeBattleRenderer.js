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
import {endBattlePerformance, startBattlePerformance} from "../shared/performance.js"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export class ThreeBattleRenderer {
  constructor(canvas) {
    this.canvas = canvas
    this.lowQuality = detectLowQualityDevice()
    this.sceneRoot = new SceneRoot(canvas, this.lowQuality)
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
    this.aim = new AimRenderer(this.aimRoot)
    this.state = null
    this.mapState = null
    this.localPlayerId = null
    this.mapRenderer = new MapRenderer(this.mapRoot)
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
    if (state.map !== this.mapState) {
      this.mapState = state.map
      this.mapRenderer.sync(state.map)
    }
    if (state.map) this.mapRenderer.syncIsland(state.game, state.map.width, state.map.height)
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
    endBattlePerformance(perfToken)
  }

  render() {
    const perfToken = startBattlePerformance("renderer.render")
    const frameStartedAt = performance.now()
    const now=performance.now();const delta=clamp((now-this.lastRenderAt)/1000,1/240,.05);this.lastRenderAt=now;this.time+=delta
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
    this.sceneRoot.render(this.camera)
    const frameElapsed = performance.now() - frameStartedAt
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
    this.lowQuality=true
    this.sceneRoot.setLowQuality()
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
