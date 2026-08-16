import * as THREE from "three"
import {assetRegistry} from "../assets/AssetRegistry"
import {GLBHeroController} from "./GLBHeroController"
import {worldToScene} from "../shared/coordinates"
import {disposeObjectTree} from "../shared/disposal"
import {createContactShadow} from "../shared/materials"
import {advanceSmoothTurn, blendAngle} from "./turning"
import {ANIMATION_REFERENCE_SPEED, HEROES_CONFIG, RUNTIME_ANIMATION_REFERENCE_SPEED} from "../../heroesConfig"
import {isInsideConcealment} from "../shared/concealment.js"
import {formatHeroHealthLabel, getHeroHealthFraction} from "./healthBadge.js"
import {
  BUSH_HERO_OPACITY,
  getBushConcealmentMix,
} from "./BushConcealment"
import {createClownTaunt} from "./tauntVisuals.js"
import {AttackReloadIndicator} from "./AttackReloadIndicator.js"
import {
  DEATH_PULSE_DURATION,
  getDeathFade,
  getDeathPulseState,
  getHeroDeathPalette,
} from "./deathVisuals.js"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const blend = (speed, delta) => 1 - Math.exp(-speed * delta)
const heroSpeed = heroName => HEROES_CONFIG.find(hero => hero.name === heroName)?.speed || ANIMATION_REFERENCE_SPEED

const createLabel = state => {
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 80
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({map: texture, transparent: true, depthTest: false, depthWrite: false})
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(4.8, 1.45, 1)
  sprite.position.y = 4.5
  sprite.renderOrder = 20
  sprite.userData = {canvas, texture, signature: ""}
  updateLabel(sprite, state)
  return sprite
}

const updateLabel = (sprite, state) => {
  if (!sprite) return
  const signature = `${state.name}:${state.lives}:${state.maxLives}`
  if (sprite.userData.signature === signature) return
  sprite.userData.signature = signature
  const {canvas, texture} = sprite.userData
  const context = canvas.getContext("2d")
  const health = getHeroHealthFraction(state)
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.font = "800 21px Arial"
  context.lineWidth = 6
  context.strokeStyle = "#17213b"
  context.strokeText(state.name || state.hero || "Hero", 128, 16)
  context.fillStyle = "#fff"
  context.fillText(state.name || state.hero || "Hero", 128, 16)
  context.font = "900 14px Arial"
  const healthText = formatHeroHealthLabel(state)
  context.strokeText(healthText, 128, 34)
  context.fillText(healthText, 128, 34)
  context.fillStyle = "#151d34"
  context.fillRect(38, 47, 180, 17)
  context.fillStyle = health < 0.35 ? "#ff4b57" : health < 0.65 ? "#ffc934" : "#55df57"
  context.fillRect(43, 52, 170 * health, 7)
  texture.needsUpdate = true
}

const collectMaterials = model => {
  const materials = new Set()
  model.traverse(child => {
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material]
    childMaterials.filter(Boolean).forEach(material => materials.add(material))
  })
  return [...materials]
}

const collectHitMaterials = materials => materials.filter(material => material?.uniforms?.hit)

const setOpacity = (materials, opacity) => {
  for (const material of materials) {
    if (!material) continue
    if (material.uniforms?.opacity) material.uniforms.opacity.value = opacity
    else material.opacity = opacity
    material.transparent = opacity < 0.999
    material.depthWrite = opacity >= 0.999
  }
}

const createDeathBurst = heroName => {
  const group = new THREE.Group()
  group.visible = false
  const palette = getHeroDeathPalette(heroName)
  const particleMaterials = palette.map(color => new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: .35,
    roughness: .65,
  }))
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: palette[0],
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.58, .065, 8, 32), ringMaterial)
  ring.rotation.x = Math.PI / 2
  ring.position.y = .08
  ring.userData.deathRole = "ring"
  const echo = new THREE.Mesh(new THREE.TorusGeometry(.42, .035, 7, 28), ringMaterial.clone())
  echo.rotation.x = Math.PI / 2
  echo.position.y = .12
  echo.userData.deathRole = "echo"
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: palette[1],
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const flash = new THREE.Mesh(new THREE.SphereGeometry(.52, 14, 10), flashMaterial)
  flash.position.y = 1.2
  flash.userData.deathRole = "flash"
  group.add(ring, echo, flash)
  for (let index = 0; index < 16; index += 1) {
    const material = particleMaterials[index % particleMaterials.length]
    const geometry = index % 3
      ? new THREE.SphereGeometry(.11 + index % 2 * .04, 8, 6)
      : new THREE.ConeGeometry(.07, .34, 7)
    const particle = new THREE.Mesh(geometry, material)
    const angle = index * Math.PI * 2 / 16
    particle.userData.velocity = new THREE.Vector3(Math.cos(angle) * (2.2 + index % 3), 2.7 + index % 4 * .55, Math.sin(angle) * (2.2 + index % 3))
    particle.userData.spin = new THREE.Vector3(3 + index, 5 - index * .18, 2 + index * .12)
    particle.userData.deathRole = "particle"
    group.add(particle)
  }
  return group
}

export class HeroView {
  constructor(id, state, isLocalPlayer = false) {
    this.id = id
    const readyInstance = assetRegistry.instantiateReadyHero(state.hero)
    this.group = new THREE.Group()
    this.shadow = createContactShadow(1.05)
    this.model = readyInstance ? readyInstance.root : new THREE.Group()
    this.modelMaterials = collectMaterials(this.model)
    this.hitMaterials = collectHitMaterials(this.modelMaterials)
    this.modelOpacity = 1
    this.label = createLabel(state)
    this.deathBurst = createDeathBurst(state.hero)
    this.taunt = createClownTaunt()
    this.tauntRemaining = 0
    this.bushConcealmentMix = 0
    this.deathTime = 0
    this.deathElapsed = 0
    this.group.add(this.model, this.deathBurst, this.taunt)
    if (this.shadow) this.group.add(this.shadow)
    if (this.label) this.group.add(this.label)
    this.x = this.targetX = state.x
    this.y = this.targetY = state.y
    this.aimAngle = Math.PI / 2 - (state.rotation || 0)
    this.bodyAngle = this.aimAngle
    this.bodyTurnVelocity = 0
    this.aimTurnVelocity = 0
    this.lastPulse = state.attackPulse
    this.lastSuperPulse = state.superPulse
    this.lastLives = state.lives
    this.spawnPulse = 0
    this.recoil = 0
    this.hit = 0
    this.animation = null
    this.disposed = false
    this.result = null
    this.state = state
    this.isLocalPlayer = false
    this.attackReloadIndicator = null
    this.setLocalPlayer(isLocalPlayer)
    this.group.position.copy(worldToScene(state.x, state.y))
    if (readyInstance) this.installGlbInstance(readyInstance, state.hero)
  }

  isReady() {
    return Boolean(this.animation && !this.disposed)
  }

  installGlbInstance(instance, heroName) {
    const previous = this.model
    this.model = instance.root
    this.modelMaterials = collectMaterials(this.model)
    this.hitMaterials = collectHitMaterials(this.modelMaterials)
    this.modelOpacity = 1
    this.animation = new GLBHeroController(instance.root, instance.animations, instance.asset.clips, {
      companionAnimations: instance.companionAnimations,
      heroName,
      attackPulse: this.state.attackPulse,
      superPulse: this.state.superPulse,
      gadgetPulse: this.state.gadgetPulse,
      spawnPulse: this.spawnPulse,
      fullBodySuper: true,
    })
    if (previous !== instance.root) {
      this.group.remove(previous)
      disposeObjectTree(previous)
      this.group.add(this.model)
    }
  }

  setState(state, networkSmoothed = false) {
    this.state = state
    this.targetX = state.x
    this.targetY = state.y
    if (!networkSmoothed) {
      // Non-network callers may intentionally hard-reset a view (for example
      // a local preview or a respawn). Network presentation already has a
      // render target and must let update() bridge snapshot corrections.
      this.x = state.x
      this.y = state.y
    }
    if (this.lastPulse !== undefined && state.attackPulse !== this.lastPulse) this.recoil = 1
    if (this.lastLives !== undefined && state.lives < this.lastLives) this.hit = 1
    if (this.lastLives > 0 && state.lives <= 0) {
      this.deathTime = DEATH_PULSE_DURATION
      this.deathElapsed = 0
      this.deathBurst.visible = true
      this.deathBurst.children.forEach(particle => {
        if (particle.userData.deathRole !== "particle") return
        particle.position.set(0, 1.25, 0)
        particle.scale.setScalar(1)
      })
    }
    if (this.lastLives <= 0 && state.lives > 0) {
      this.spawnPulse += 1
      this.model.visible = true
    }
    this.lastPulse = state.attackPulse
    this.lastLives = state.lives
    updateLabel(this.label, state)
    if (this.isLocalPlayer) this.attackReloadIndicator?.update(state)
  }

  setDisplayState(state) {
    this.state = state
    this.targetX = state.x
    this.targetY = state.y
    updateLabel(this.label, state)
    if (this.isLocalPlayer) this.attackReloadIndicator?.update(state)
  }

  setLocalPlayer(isLocalPlayer) {
    this.isLocalPlayer = Boolean(isLocalPlayer)
    if (!this.isLocalPlayer) {
      if (this.attackReloadIndicator) this.attackReloadIndicator.group.visible = false
      return
    }
    if (!this.attackReloadIndicator) {
      this.attackReloadIndicator = new AttackReloadIndicator()
      this.group.add(this.attackReloadIndicator.group)
    }
    this.attackReloadIndicator.update(this.state)
  }

  setResult(result) {
    this.result = result
  }

  isDeathAnimationComplete() {
    if (this.state.lives > 0 || this.deathTime > 0) return false
    return this.animation ? this.animation.isDeathComplete() : true
  }

  showTaunt(tauntId = "clown_laugh") {
    if (tauntId !== "clown_laugh" || this.disposed) return
    this.tauntRemaining = 1.7
    this.taunt.visible = true
    this.taunt.position.y = 5.5
    this.taunt.rotation.set(0, 0, 0)
    this.taunt.scale.setScalar(.15)
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
    if (moving) {
      const desiredBodyAngle = Math.atan2(moveX, moveY)
      const bodyTurn = advanceSmoothTurn(
        this.bodyAngle,
        desiredBodyAngle,
        this.bodyTurnVelocity,
        delta,
      )
      this.bodyAngle = bodyTurn.angle
      this.bodyTurnVelocity = bodyTurn.velocity
    } else {
      this.bodyTurnVelocity *= Math.exp(-18 * delta)
    }
    const desiredAim = this.state.aiming || this.recoil > 0.05
      ? Math.PI / 2 - (this.state.rotation || 0)
      : moving ? this.bodyAngle : this.aimAngle
    const aimTurn = advanceSmoothTurn(
      this.aimAngle,
      desiredAim,
      this.aimTurnVelocity,
      delta,
      this.state.aiming ? 12 : 9,
      this.state.aiming ? 7.5 : 6.5,
      this.state.aiming ? 38 : 28,
    )
    this.aimAngle = aimTurn.angle
    this.aimTurnVelocity = aimTurn.velocity
    // During the attack recoil window the whole hero eases toward the actual
    // strike angle, even if movement is still held in another direction. The
    // old `moving ? bodyAngle : aimAngle` switch made attacks visually face
    // movement while the server hit in the aimed direction, then snapped back.
    const attackFacingMix = clamp(this.recoil * 5, 0, 1)
    const visualAngle = blendAngle(this.bodyAngle, this.aimAngle, attackFacingMix)
    this.group.position.copy(worldToScene(this.x, this.y))
    this.model.rotation.y = visualAngle
    this.model.userData.animate?.(time, moving ? 1 : 0.08, this.recoil)
    if (this.animation) {
      const configuredSpeed = heroSpeed(this.state.hero || this.state.name)
      this.model.rotation.y = visualAngle
      // The server's configured hero speed is authoritative for the gait. The
      // interpolated positional delta is noisy and must not erase per-hero
      // differences (Kaze should visibly cycle faster than Needle).
      const effectiveSpeed = moving
        ? Math.max(configuredSpeed, Number(this.state.speed) || 0)
        : 0
      const aimDelta = Math.atan2(
        Math.sin(this.aimAngle - visualAngle),
        Math.cos(this.aimAngle - visualAngle),
      )
      this.animation.update(delta, {
        alive: this.state.lives > 0,
        moving,
        speed: effectiveSpeed,
        referenceSpeed: RUNTIME_ANIMATION_REFERENCE_SPEED,
        aiming: Boolean(this.state.aiming),
        superAiming: Number(this.state.channel) > 0,
        aimYaw: this.state.aiming || this.recoil > 0.05 ? aimDelta : 0,
        attackHalfArcDegrees: this.state.attackHalfArcDegrees,
        attackPulse: this.state.attackPulse,
        superPulse: this.state.superPulse,
        gadgetPulse: this.state.gadgetPulse,
        spawnPulse: this.spawnPulse,
        result: this.result,
      })
      this.model.rotation.y += this.animation.attackSwingYaw
      this.animation.setHitFlash(this.hit)
    }
    if (this.deathTime > 0) {
      this.deathElapsed += delta
      this.deathTime = Math.max(0, this.deathTime - delta)
      this.deathBurst.children.forEach(particle => {
        if (particle.userData.deathRole !== "particle") return
        particle.position.addScaledVector(particle.userData.velocity, delta)
        particle.userData.velocity.y -= 8.5 * delta
        particle.rotation.x += particle.userData.spin.x * delta
        particle.rotation.y += particle.userData.spin.y * delta
        particle.scale.setScalar(Math.max(0.01, this.deathTime / DEATH_PULSE_DURATION))
      })
      const pulse = getDeathPulseState(this.deathElapsed)
      const ring = this.deathBurst.children.find(child => child.userData.deathRole === "ring")
      const echo = this.deathBurst.children.find(child => child.userData.deathRole === "echo")
      const flash = this.deathBurst.children.find(child => child.userData.deathRole === "flash")
      ring?.scale.setScalar(pulse.ringScale)
      echo?.scale.setScalar(pulse.ringScale * .72)
      if (ring?.material) ring.material.opacity = pulse.ringOpacity
      if (echo?.material) echo.material.opacity = pulse.ringOpacity * .55
      if (flash?.material) flash.material.opacity = pulse.flashOpacity
      flash?.scale.setScalar(.65 + pulse.ringScale * .28)
      this.deathBurst.visible = this.deathTime > 0
    }
    if (this.tauntRemaining > 0) {
      this.tauntRemaining = Math.max(0, this.tauntRemaining - delta)
      const elapsed = 1.7 - this.tauntRemaining
      const entrance = Math.min(1, elapsed / .18)
      const exit = this.tauntRemaining < .28 ? this.tauntRemaining / .28 : 1
      this.taunt.visible = this.tauntRemaining > 0
      this.taunt.position.y = 5.5 + Math.sin(elapsed * 6) * .12
      this.taunt.rotation.y += delta * 3.8
      this.taunt.scale.setScalar((.92 + .12 * Math.sin(elapsed * 8)) * entrance * exit)
    }
    this.recoil *= Math.exp(-15 * delta)
    this.hit *= Math.exp(-12 * delta)
    this.bushConcealmentMix = getBushConcealmentMix(this.bushConcealmentMix, inBush, delta)
    const deathProgress = this.state.lives <= 0
      ? this.animation?.getDeathProgress?.() ?? Math.min(1, this.deathElapsed / DEATH_PULSE_DURATION)
      : 0
    const deathFade = this.state.lives <= 0 ? getDeathFade(deathProgress) : 1
    const opacity = THREE.MathUtils.lerp(1, BUSH_HERO_OPACITY, this.bushConcealmentMix) * deathFade
    if (Math.abs(opacity - this.modelOpacity) > .002) {
      setOpacity(this.modelMaterials, opacity)
      this.modelOpacity = opacity
    }
    if (this.shadow) this.shadow.material.opacity = THREE.MathUtils.lerp(0.34, 0.18, this.bushConcealmentMix) * deathFade
    if (this.label) this.label.material.opacity = deathFade
  }

  dispose() {
    this.disposed = true
    this.animation?.dispose()
    disposeObjectTree(this.group)
  }
}

export const isInsideBush = isInsideConcealment
