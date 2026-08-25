import * as THREE from "three"
import {assetRegistry} from "../assets/AssetRegistry"
import {GLBHeroController} from "./GLBHeroController"
import {worldToScene} from "../shared/coordinates"
import {disposeObjectTree} from "../shared/disposal"
import {createContactShadow} from "../shared/materials"
import {advanceSmoothTurn, blendAngle} from "./turning"
import {ANIMATION_REFERENCE_SPEED, HEROES_CONFIG, RUNTIME_ANIMATION_REFERENCE_SPEED} from "../../heroesConfig"
import {isInsideConcealment} from "../shared/concealment.js"
import {
  createHealthBadge,
  getHeroCombatMarker,
  updateHealthBadge,
} from "./healthBadge.js"
import {
  BUSH_HERO_OPACITY,
  getBushConcealmentMix,
} from "./BushConcealment"
import {CLOWN_TAUNT_DISPLAY_SCALE, createClownTaunt} from "./tauntVisuals.js"
import {AttackReloadIndicator} from "./AttackReloadIndicator.js"
import {getSpawnProtectionVisualState} from "./spawnProtectionVisuals.js"
import {
  DEATH_PULSE_DURATION,
  getDeathFade,
  getDeathPulseState,
  getHeroDeathPalette,
} from "./deathVisuals.js"
import {
  FLIGHT_HOVER_HEIGHT,
  advanceFlightVisualHeight,
  getFlightBodyHeight,
} from "./flightVisuals.js"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const blend = (speed, delta) => 1 - Math.exp(-speed * delta)
const TAUNT_BASE_HEIGHT = 6
const heroSpeed = heroName => HEROES_CONFIG.find(hero => hero.name === heroName)?.speed || ANIMATION_REFERENCE_SPEED
export const getTeamPresentation = (state, teamBattle, localTeam, isLocalPlayer = false) => {
  if (!teamBattle || !state?.team) return {role: "", color: "#55df57", ring: "#55df57"}
  if (isLocalPlayer) return {role: "ТЫ", color: "#49d9ff", ring: "#ffd84d"}
  if (localTeam && state.team === localTeam) return {role: "СОЮЗНИК", color: "#49d9ff", ring: "#27a9ff"}
  return {role: "ВРАГ", color: "#ff4657", ring: "#ff334d"}
}

const createLabel = (state, teamBattle = false, localTeam = "", isLocalPlayer = false) => {
  const sprite = createHealthBadge({scale: [4.8, 1.45, 1], positionY: 4.5})
  sprite.userData.teamBattle = teamBattle
  sprite.userData.localTeam = localTeam
  sprite.userData.isLocalPlayer = isLocalPlayer
  updateLabel(sprite, state)
  return sprite
}

const updateLabel = (sprite, state) => {
  if (!sprite) return
  const {teamBattle = false, localTeam = "", isLocalPlayer = false} = sprite.userData || {}
  const presentation = getTeamPresentation(state, teamBattle, localTeam, isLocalPlayer)
  const marker = getHeroCombatMarker(state)
  const displayName = presentation.role ? `${presentation.role} · ${state.name || state.hero || "Hero"}` : (state.name || state.hero || "Hero")
  updateHealthBadge(sprite, state, {
    displayName,
    healthColor: teamBattle && presentation.role ? presentation.color : undefined,
    marker,
  })
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

const installFlightDepthReset = model => {
  const flightDepthResetter = new THREE.Mesh(
    new THREE.CircleGeometry(.01, 3),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    }),
  )
  flightDepthResetter.name = "flight-depth-resetter"
  flightDepthResetter.renderOrder = -1
  flightDepthResetter.frustumCulled = false
  flightDepthResetter.onBeforeRender = renderer => {
    if (model.userData.flightDepthActive) renderer.clearDepth()
  }
  model.add(flightDepthResetter)
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

const createSpawnProtectionAura = () => {
  const group = new THREE.Group()
  group.visible = false
  group.name = "spawn-protection-aura"
  const shieldMaterial = new THREE.MeshBasicMaterial({
    color: "#7ce8ff",
    transparent: true,
    opacity: 0.045,
    wireframe: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.24, 18, 12), shieldMaterial)
  shield.position.y = 1.28
  shield.userData.role = "spawn-protection-shield"
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: "#7ce8ff",
    transparent: true,
    opacity: 0.72,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.045, 8, 48), ringMaterial)
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.08
  ring.userData.role = "spawn-protection-ring"
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.025, 8, 40), ringMaterial.clone())
  innerRing.rotation.x = Math.PI / 2
  innerRing.position.y = 0.1
  innerRing.userData.role = "spawn-protection-inner-ring"
  group.add(shield, ring, innerRing)
  return group
}

export class HeroView {
  constructor(id, state, isLocalPlayer = false, teamBattle = false, localTeam = "") {
    this.id = id
    this.teamBattle = teamBattle
    this.localTeam = localTeam
    const readyInstance = assetRegistry.instantiateReadyHero(state.hero)
    this.group = new THREE.Group()
    this.shadow = createContactShadow(1.05)
    this.model = readyInstance ? readyInstance.root : new THREE.Group()
    this.orientationOffset = readyInstance?.asset?.rotationOffset || 0
    this.modelMaterials = collectMaterials(this.model)
    this.hitMaterials = collectHitMaterials(this.modelMaterials)
    this.modelOpacity = 1
    this.label = createLabel(state, teamBattle, localTeam, isLocalPlayer)
    this.teamMarker = new THREE.Mesh(
      new THREE.TorusGeometry(.95, .075, 8, 40),
      new THREE.MeshBasicMaterial({color: "#55df57", transparent: true, opacity: .95, depthTest: false, depthWrite: false}),
    )
    this.teamMarker.rotation.x = Math.PI / 2
    this.teamMarker.position.y = .06
    this.teamMarker.renderOrder = 12
    this.teamMarker.userData.role = "team-marker"
    this.spawnProtectionAura = createSpawnProtectionAura()
    this.deathBurst = createDeathBurst(state.hero)
    this.taunt = createClownTaunt()
    this.tauntRemaining = 0
    this.bushConcealmentMix = 0
    this.deathTime = 0
    this.deathElapsed = 0
    this.group.add(this.teamMarker, this.spawnProtectionAura, this.model, this.deathBurst, this.taunt)
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
    this.flightVisualHeight = 0
    this.recoil = 0
    this.hit = 0
    this.animation = null
    this.disposed = false
    this.result = null
    this.state = state
    this.isLocalPlayer = false
    this.attackReloadIndicator = null
    this.setLocalPlayer(isLocalPlayer)
    this.updateTeamPresentation()
    this.group.position.copy(worldToScene(state.x, state.y))
    if (readyInstance) this.installGlbInstance(readyInstance, state.hero)
  }

  isReady() {
    return Boolean(this.animation && !this.disposed)
  }

  installGlbInstance(instance, heroName) {
    const previous = this.model
    this.model = instance.root
    this.orientationOffset = instance.asset?.rotationOffset || 0
    this.modelMaterials = collectMaterials(this.model)
    this.hitMaterials = collectHitMaterials(this.modelMaterials)
    this.modelOpacity = 1
    installFlightDepthReset(this.model)
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
      // A respawn is a new authoritative placement, not ordinary network
      // movement. Snap both the interpolation target and current position
      // so the hero never visibly travels from the death site to base.
      this.x = state.x
      this.y = state.y
      this.targetX = state.x
      this.targetY = state.y
      this.deathTime = 0
      this.deathElapsed = 0
      this.deathBurst.visible = false
      this.model.visible = true
      this.flightVisualHeight = 0
    }
    this.lastPulse = state.attackPulse
    this.lastLives = state.lives
    updateLabel(this.label, state)
    this.updateTeamPresentation()
    if (this.isLocalPlayer) this.attackReloadIndicator?.update(state)
  }

  setDisplayState(state) {
    this.state = state
    this.targetX = state.x
    this.targetY = state.y
    updateLabel(this.label, state)
    this.updateTeamPresentation()
    if (this.isLocalPlayer) this.attackReloadIndicator?.update(state)
  }

  setLocalPlayer(isLocalPlayer) {
    this.isLocalPlayer = Boolean(isLocalPlayer)
    this.label.userData.isLocalPlayer = this.isLocalPlayer
    updateLabel(this.label, this.state)
    this.updateTeamPresentation()
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

  setTeamContext(teamBattle, localTeam) {
    this.teamBattle = Boolean(teamBattle)
    this.localTeam = localTeam || ""
    this.label.userData.teamBattle = this.teamBattle
    this.label.userData.localTeam = this.localTeam
    this.label.userData.isLocalPlayer = this.isLocalPlayer
    updateLabel(this.label, this.state)
    this.updateTeamPresentation()
  }

  updateTeamPresentation() {
    const presentation = getTeamPresentation(this.state, this.teamBattle, this.localTeam, this.isLocalPlayer)
    this.teamMarker.visible = this.teamBattle && Boolean(this.state?.team)
    if (this.teamMarker.material) this.teamMarker.material.color.set(presentation.ring)
    this.teamMarker.scale.setScalar(this.state?.lives > 0 ? 1 : .86)
    const protectionColor = presentation.ring || "#7ce8ff"
    this.spawnProtectionAura.traverse(child => {
      if (child.material?.color) child.material.color.set(protectionColor)
    })
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
    this.taunt.position.y = TAUNT_BASE_HEIGHT
    this.taunt.rotation.set(0, 0, 0)
    this.taunt.scale.setScalar(CLOWN_TAUNT_DISPLAY_SCALE * .15)
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
    // Keep the contact shadow and team ring on the ground while the hero body
    // rises above the authored wall tops during the authoritative flight window.
    this.flightVisualHeight = advanceFlightVisualHeight(this.flightVisualHeight, this.state, delta)
    const flightMix = clamp(this.flightVisualHeight / FLIGHT_HOVER_HEIGHT, 0, 1)
    const flightBodyHeight = getFlightBodyHeight(this.flightVisualHeight, time)
    if (this.label) this.label.position.y = 4.5 + this.flightVisualHeight
    if (this.taunt) this.taunt.position.y = TAUNT_BASE_HEIGHT + this.flightVisualHeight + Math.sin((Number(time) || 0) * 6) * .12
    if (this.shadow) {
      const shadowScale = 1 - flightMix * .32
      this.shadow.scale.set(shadowScale, .48, shadowScale)
    }
    const protection = getSpawnProtectionVisualState(this.state, this.teamBattle)
    this.spawnProtectionAura.visible = protection.active
    if (protection.active) {
      const pulse = 0.5 + 0.5 * Math.sin((Number(time) || 0) * 7)
      const remainingMix = clamp(protection.remaining / 3, 0, 1)
      this.spawnProtectionAura.scale.setScalar(1 + pulse * 0.06)
      const shield = this.spawnProtectionAura.children.find(child => child.userData.role === "spawn-protection-shield")
      const ring = this.spawnProtectionAura.children.find(child => child.userData.role === "spawn-protection-ring")
      const innerRing = this.spawnProtectionAura.children.find(child => child.userData.role === "spawn-protection-inner-ring")
      if (shield?.material) shield.material.opacity = 0.025 + pulse * 0.035
      if (ring?.material) ring.material.opacity = 0.4 + remainingMix * 0.32 + pulse * 0.12
      if (innerRing?.material) innerRing.material.opacity = 0.25 + remainingMix * 0.26 + pulse * 0.1
    }
    this.model.rotation.y = visualAngle + this.orientationOffset
    this.model.userData.animate?.(time, moving ? 1 : 0.08, this.recoil)
    if (this.animation) {
      const configuredSpeed = heroSpeed(this.state.hero || this.state.name)
      this.model.rotation.y = visualAngle + this.orientationOffset
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
      this.taunt.position.y = TAUNT_BASE_HEIGHT + this.flightVisualHeight + Math.sin(elapsed * 6) * .12
      this.taunt.rotation.y = Math.sin(elapsed * 3.2) * .16
      this.taunt.rotation.z = Math.sin(elapsed * 4.4) * .035
      this.taunt.scale.setScalar(CLOWN_TAUNT_DISPLAY_SCALE * (.92 + .12 * Math.sin(elapsed * 8)) * entrance * exit)
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
    if (this.shadow) {
      this.shadow.material.opacity = THREE.MathUtils.lerp(0.34, 0.18, this.bushConcealmentMix)
        * THREE.MathUtils.lerp(1, .55, flightMix)
        * deathFade
    }
    // Authored animation clips may touch the root transform. Apply the flight
    // offset after the mixer so the model cannot be pulled back into a prop.
    this.model.position.y = flightBodyHeight
    this.model.userData.flightDepthActive = flightMix > 0.05
    // The depth reset lets the elevated model pass over obstacles. Keep the
    // GLB's normal depth testing so overlapping body parts retain their own
    // order; disabling it makes inner surfaces bleed through as black patches.
    this.model.renderOrder = flightMix > 0.05 ? 16 : 0
    if (this.label) this.label.material.opacity = deathFade
  }

  dispose() {
    this.disposed = true
    this.animation?.dispose()
    this.taunt?.userData?.tauntTexture?.dispose?.()
    disposeObjectTree(this.group)
  }
}

export const isInsideBush = isInsideConcealment
