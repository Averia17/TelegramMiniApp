import * as THREE from "three"
import {
  BATTLE_FONT_SIZES,
  battleCanvasFont,
  getBattleHealthFontSize,
  getBattleViewportFontSize,
} from "../../battleTypography.js"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const LABEL_WIDTH = 256
const LABEL_HEIGHT = 80
const LABEL_RESOLUTION = 2

const healthValues = state => {
  const maximum = Math.max(1, Math.round(Number(state?.maxLives) || 1))
  const current = Math.max(0, Math.min(maximum, Math.round(Number(state?.lives) || 0)))
  return {current, maximum}
}

export const getHeroHealthFraction = state => {
  const {current, maximum} = healthValues(state)
  return clamp(current / maximum, 0, 1)
}

export const getHeroShieldValue = state => Math.max(0, Math.round(Number(state?.shieldHp) || 0))

export const getHeroShieldFraction = state => {
  const {maximum} = healthValues(state)
  return clamp(getHeroShieldValue(state) / maximum, 0, 1)
}

export const getHeroHealthBarSegments = state => {
  const {current, maximum} = healthValues(state)
  const shield = getHeroShieldValue(state)
  const total = Math.max(1, maximum + shield)
  return {
    health: clamp(current / total, 0, 1),
    shield: clamp(shield / total, 0, 1),
  }
}

export const formatHeroHealthLabel = state => {
  const {current, maximum} = healthValues(state)
  return `${current} / ${maximum}`
}

export const formatHeroShieldLabel = state => {
  const shield = getHeroShieldValue(state)
  return shield > 0 ? `ЩИТ ${shield}` : ""
}

export const createHealthBadge = ({
  scale = [4.8, 1.45, 1],
  positionY = 4.5,
  showName = true,
  renderOrder = 20,
  parentScale = 1,
} = {}) => {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }))
  sprite.scale.set(...scale)
  sprite.position.y = positionY
  sprite.renderOrder = renderOrder
  sprite.userData = {
    canvas: null,
    texture: null,
    signature: "",
    healthBadge: true,
    showName,
    healthFontSize: getBattleHealthFontSize({canvasHeight: LABEL_HEIGHT, spriteHeight: scale[1], parentScale}),
  }
  if (typeof document === "undefined") return sprite

  const canvas = document.createElement("canvas")
  canvas.width = LABEL_WIDTH * LABEL_RESOLUTION
  canvas.height = LABEL_HEIGHT * LABEL_RESOLUTION
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  sprite.material.map = texture
  sprite.material.needsUpdate = true
  sprite.userData.canvas = canvas
  sprite.userData.texture = texture
  document.fonts?.ready?.then(() => {
    sprite.userData.signature = ""
    updateHealthBadge(sprite, sprite.userData.state, sprite.userData.options)
  })
  return sprite
}

export const updateHealthBadge = (sprite, state, options = {}) => {
  if (!sprite || !state) return
  const {canvas, texture, showName = true} = sprite.userData || {}
  sprite.userData.state = state
  sprite.userData.options = options
  if (!canvas || !texture) return

  const displayName = options.displayName || state.name || state.hero || "Hero"
  const marker = options.marker || null
  const health = getHeroHealthFraction(state)
  const shield = getHeroShieldValue(state)
  const {health: healthBarFraction, shield: shieldBarFraction} = getHeroHealthBarSegments(state)
  const shieldLabel = formatHeroShieldLabel(state)
  const nameFontSize = getBattleViewportFontSize(BATTLE_FONT_SIZES.heroName, BATTLE_FONT_SIZES.heroNameCompact)
  const healthFontSize = options.healthFontSize || sprite.userData.healthFontSize || BATTLE_FONT_SIZES.health
  const healthColor = options.healthColor || (health < 0.35 ? "#ff4b57" : health < 0.65 ? "#ffc934" : "#55df57")
  const signature = `${state.name}:${state.hero}:${state.lives}:${state.maxLives}:${shield}:${showName}:${displayName}:${nameFontSize}:${healthFontSize}:${healthColor}:${marker?.id || ""}:${marker?.filled || 0}`
  if (sprite.userData.signature === signature) return
  sprite.userData.signature = signature

  const context = canvas.getContext("2d")
  context.setTransform(LABEL_RESOLUTION, 0, 0, LABEL_RESOLUTION, 0, 0)
  context.clearRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT)
  context.textAlign = "center"
  context.textBaseline = "middle"
  if (showName) {
    context.font = battleCanvasFont(800, nameFontSize)
    context.lineWidth = 6
    context.strokeStyle = "#17213b"
    context.strokeText(displayName, 128, 16)
    context.fillStyle = "#fff"
    context.fillText(displayName, 128, 16)
  }
  context.font = battleCanvasFont(900, healthFontSize)
  const healthText = formatHeroHealthLabel(state)
  context.lineWidth = 6
  context.strokeStyle = "#17213b"
  context.strokeText(healthText, 128, 34)
  context.fillStyle = "#fff"
  context.fillText(healthText, 128, 34)
  context.fillStyle = "#151d34"
  context.fillRect(38, 47, 180, 17)
  // Stack both resources in one track: green is current HP, amber is the
  // extra shield to its right. Hits visibly shorten the amber segment first.
  const barX = 43
  const barY = 52
  const barWidth = 170
  const barHeight = 7
  context.fillStyle = "#0d1428"
  context.fillRect(barX, barY, barWidth, barHeight)
  context.fillStyle = healthColor
  const healthWidth = barWidth * healthBarFraction
  context.fillRect(barX, barY, healthWidth, barHeight)
  if (shield > 0) {
    const shieldX = barX + healthWidth
    const shieldWidth = barWidth * shieldBarFraction
    context.fillStyle = "#ffc247"
    context.fillRect(shieldX, barY, shieldWidth, barHeight)
    context.fillStyle = "#fff0a6"
    context.fillRect(shieldX, barY, shieldWidth, 2)
    context.font = battleCanvasFont(900, BATTLE_FONT_SIZES.marker)
    context.textAlign = "right"
    context.lineWidth = 4
    context.strokeStyle = "#17213b"
    context.strokeText(shieldLabel, 213, 73)
    context.fillStyle = "#ffd45c"
    context.fillText(shieldLabel, 213, 73)
  }
  if (marker) {
    context.font = battleCanvasFont(900, BATTLE_FONT_SIZES.marker)
    context.textAlign = "left"
    context.fillStyle = marker.color
    context.fillText(marker.label, 43, 73)
    for (let index = 0; index < 3; index += 1) {
      const x = 112 + index * 25
      context.beginPath()
      context.arc(x, 70, 6, 0, Math.PI * 2)
      context.fillStyle = index < marker.filled ? marker.color : "#2a3150"
      context.fill()
      context.lineWidth = 2
      context.strokeStyle = "#17213b"
      context.stroke()
    }
  }
  texture.needsUpdate = true
}

export const getHeroPaintStacks = state => {
  const stacks = Math.round(Number(state?.paintStacks) || 0)
  return clamp(stacks, 0, 2)
}

export const getHeroCombatMarker = state => {
  const paintStacks = getHeroPaintStacks(state)
  if (paintStacks > 0) {
    return {id: "paintStacks", label: "КРАСКА", color: "#ff5fb3", filled: paintStacks}
  }
  if (state?.hero === "Brock Zeus" && state?.gadgetArmed) {
    return {id: "zeusBeam", label: "ЛУЧ ГОТОВ", color: "#9eeaff", filled: 3}
  }
  if (Number(state?.marks) > 0) {
    return {id: "minaMark", label: "МЕТКА", color: "#ff9bea", filled: 1}
  }
  if (Number(state?.focusCharge) >= 100) {
    return {id: "focus", label: "ФОКУС", color: "#ffe255", filled: 3}
  }
  const micoRage = clamp(Math.round(Number(state?.micoRage) || 0), 0, 5)
  if (micoRage > 0) {
    return {id: "micoRage", label: `ЯРОСТЬ ${micoRage}/5`, color: "#ffb33e", filled: Math.max(1, Math.ceil(micoRage * 3 / 5))}
  }
  const lumiFlowers = clamp(Math.round(Number(state?.lumiFlowers) || 0), 0, 5)
  if (lumiFlowers > 0) {
    return {id: "lumiFlowers", label: `ЦВЕТЫ ${lumiFlowers}/5`, color: "#f07bd0", filled: Math.max(1, Math.ceil(lumiFlowers * 3 / 5))}
  }
  return null
}
