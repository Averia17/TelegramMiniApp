import * as THREE from "three"
import {createHeroModel} from "../three/HeroModelFactory"
import {assetRegistry} from "../assets/AssetRegistry"
import {HeroAnimationController} from "./HeroAnimationController"
import {worldToScene} from "../shared/coordinates"
import {disposeObjectTree} from "../shared/disposal"
import {createContactShadow} from "../shared/materials"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const blend = (speed, delta) => 1 - Math.exp(-speed * delta)

const createLabel = state => {
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 64
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({map: texture, transparent: true, depthTest: false, depthWrite: false})
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(4.8, 1.2, 1)
  sprite.position.y = 4.35
  sprite.renderOrder = 20
  sprite.userData = {canvas, texture, signature: ""}
  updateLabel(sprite, state)
  return sprite
}

const updateLabel = (sprite, state) => {
  const signature = `${state.name}:${state.lives}:${state.maxLives}`
  if (sprite.userData.signature === signature) return
  sprite.userData.signature = signature
  const {canvas, texture} = sprite.userData
  const context = canvas.getContext("2d")
  const health = clamp((state.lives || 0) / (state.maxLives || 1), 0, 1)
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.textAlign = "center"
  context.font = "800 22px Arial"
  context.lineWidth = 7
  context.strokeStyle = "#17213b"
  context.strokeText(state.name || state.hero || "Hero", 128, 24)
  context.fillStyle = "#fff"
  context.fillText(state.name || state.hero || "Hero", 128, 24)
  context.fillStyle = "#151d34"
  context.fillRect(46, 37, 164, 16)
  context.fillStyle = health < 0.35 ? "#ff4b57" : health < 0.65 ? "#ffc934" : "#55df57"
  context.fillRect(51, 42, 154 * health, 6)
  texture.needsUpdate = true
}

const setOpacity = (model, opacity) => model.traverse(child => {
  const materials = Array.isArray(child.material) ? child.material : [child.material]
  for (const material of materials) {
    if (!material) continue
    if (material.uniforms?.opacity) material.uniforms.opacity.value = opacity
    else material.opacity = opacity
    material.transparent = opacity < 0.999
    material.depthWrite = opacity >= 0.999
  }
})

export class HeroView {
  constructor(id, state, simpleMaterials = false) {
    this.id = id
    this.group = new THREE.Group()
    this.shadow = createContactShadow(1.05)
    this.model = createHeroModel(state.hero, {simple: simpleMaterials})
    this.model.scale.setScalar(0.92)
    this.label = createLabel(state)
    this.group.add(this.shadow, this.model, this.label)
    this.x = this.targetX = state.x
    this.y = this.targetY = state.y
    this.aimAngle = Math.PI / 2 - (state.rotation || 0)
    this.bodyAngle = this.aimAngle
    this.lastPulse = state.attackPulse
    this.lastLives = state.lives
    this.recoil = 0
    this.hit = 0
    this.animation = null
    this.disposed = false
    this.state = state
    this.group.position.copy(worldToScene(state.x, state.y))
    this.loadGlb(state.hero)
  }

  async loadGlb(heroName) {
    if (!assetRegistry.hasHero(heroName)) return
    try {
      const instance = await assetRegistry.instantiateHero(heroName)
      if (!instance) return
      if (this.disposed) {
        disposeObjectTree(instance.root)
        return
      }
      const previous = this.model
      this.model = instance.root
      this.animation = new HeroAnimationController(instance.root, instance.animations, instance.asset.clips)
      this.animation.play("idle")
      this.group.remove(previous)
      disposeObjectTree(previous)
      this.group.add(this.model)
    } catch (error) {
      console.warn(`Could not load hero GLB: ${heroName}`, error)
    }
  }

  setState(state, networkSmoothed = false) {
    this.state = state
    this.targetX = state.x
    this.targetY = state.y
    if (networkSmoothed) {
      this.x = state.x
      this.y = state.y
    }
    if (this.lastPulse !== undefined && state.attackPulse !== this.lastPulse) this.recoil = 1
    if (this.lastLives !== undefined && state.lives < this.lastLives) this.hit = 1
    this.lastPulse = state.attackPulse
    this.lastLives = state.lives
    updateLabel(this.label, state)
  }

  update(delta, time, inBush) {
    const positionBlend = blend(14, delta)
    const previousX = this.x
    const previousY = this.y
    this.x = THREE.MathUtils.lerp(this.x, this.targetX, positionBlend)
    this.y = THREE.MathUtils.lerp(this.y, this.targetY, positionBlend)
    const moveX = Number.isFinite(this.state.moveX) ? this.state.moveX : this.x - previousX
    const moveY = Number.isFinite(this.state.moveY) ? this.state.moveY : this.y - previousY
    const moving = Math.hypot(moveX, moveY) > 0.01
    if (moving) this.bodyAngle = Math.atan2(moveX, moveY)
    const desiredAim = this.state.aiming || this.recoil > 0.05
      ? Math.PI / 2 - (this.state.rotation || 0)
      : moving ? this.bodyAngle : this.aimAngle
    this.aimAngle += Math.atan2(Math.sin(desiredAim - this.aimAngle), Math.cos(desiredAim - this.aimAngle)) * blend(this.state.aiming ? 22 : 15, delta)
    this.group.position.copy(worldToScene(this.x, this.y))
    this.model.rotation.y = this.aimAngle
    this.model.userData.animate?.(time, moving ? 1 : 0.08, this.recoil)
    this.animation?.play(this.recoil > 0.3 ? "attack" : moving ? "run" : "idle")
    this.animation?.update(delta)
    const legDelta = this.bodyAngle - this.aimAngle
    this.model.userData.bones?.legs?.forEach(leg => { leg.rotation.y = legDelta })
    this.recoil *= Math.exp(-15 * delta)
    this.hit *= Math.exp(-12 * delta)
    setOpacity(this.model, inBush ? 0.42 : 1)
    this.label.material.opacity = inBush ? 0.42 : 1
    this.model.traverse(child => {
      if (child.material?.uniforms?.hit) child.material.uniforms.hit.value = this.hit
    })
  }

  dispose() {
    this.disposed = true
    this.animation?.dispose()
    disposeObjectTree(this.group)
  }
}

export const isInsideBush = (entity, walls = []) => Boolean(entity && walls.some(wall =>
  (wall.type === "bush" || wall.type === "half") &&
  entity.x >= wall.minX && entity.x <= wall.maxX &&
  entity.y >= wall.minY && entity.y <= wall.maxY))
