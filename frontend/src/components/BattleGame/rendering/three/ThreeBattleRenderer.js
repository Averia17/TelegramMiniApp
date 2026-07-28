import {HeroView, isInsideBush} from "../heroes/HeroView"
import {MapRenderer} from "../map/MapRenderer"
import {AimRenderer} from "../combat/AimRenderer"
import {EffectRenderer} from "../combat/EffectRenderer"
import {ProjectileRenderer} from "../combat/ProjectileRenderer"
import {CameraRig} from "../CameraRig"
import {SceneRoot} from "../SceneRoot"
import {detectLowQualityDevice} from "../shared/quality"
import {MonsterRenderer} from "../monsters/MonsterRenderer.js"

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
    this.projectileRoot = this.sceneRoot.roots.projectiles
    this.effectRoot = this.sceneRoot.roots.effects
    this.aimRoot = this.sceneRoot.roots.aim
    this.players = new Map()
    this.monsters = new MonsterRenderer(this.actorRoot)
    this.projectiles = new ProjectileRenderer(this.projectileRoot)
    this.effects = new EffectRenderer(this.effectRoot)
    this.aim = new AimRenderer(this.aimRoot)
    this.state = null
    this.localPlayerId = null
    this.mapRenderer = new MapRenderer(this.mapRoot)
    this.time = 0
    this.lastRenderAt = performance.now()
    this.performanceWindowAt = this.lastRenderAt
    this.performanceFrames = 0
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
    this.state = state
    this.mapRenderer.sync(state.map)
    const active = new Set()
    Object.entries(state.players || {}).forEach(([id, player]) => {
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
    const totemEffects = (state.totems || []).map(totem => ({
      id:`totem:${totem.owner}`,kind:"damian_totem",x:totem.x,y:totem.y,radius:24,
      color:"#8D52D9",life:1,maxLife:1,hp:totem.hp,maxHp:totem.maxHp,
    }))
    this.effects.sync([...(state.effects || []), ...totemEffects])
  }

  render() {
    const now=performance.now();const delta=clamp((now-this.lastRenderAt)/1000,1/240,.05);this.lastRenderAt=now;this.time+=delta
    const walls=this.state?.map?.walls||[]
    this.players.forEach((view,id)=>view.update(delta,this.time,(id===this.localPlayerId||Boolean(this.state?.players?.[id]?.team&&this.state.players[id].team===this.state?.players?.[this.localPlayerId]?.team))&&isInsideBush(view.state,walls)))
    this.mapRenderer.update(delta)
    this.projectiles.update(delta,this.time)
    this.monsters.update(delta,this.time)
    this.aim.update(this.state?.players?.[this.localPlayerId])
    const local=this.players.get(this.localPlayerId)
    const map=this.state?.map||{width:1024,height:768}
    this.cameraRig.follow(local, map, delta)
    this.sceneRoot.render(this.camera)
    this.performanceFrames++
    const elapsed=now-this.performanceWindowAt
    if(elapsed>=2000){
      this.fps=Math.round(this.performanceFrames*1000/elapsed);this.performanceFrames=0;this.performanceWindowAt=now
      if(this.fps<50&&!this.lowQuality)this.enableLowQuality()
    }
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
    this.monsters.dispose()
    this.mapRenderer.dispose()
    this.sceneRoot.dispose()
  }
}
