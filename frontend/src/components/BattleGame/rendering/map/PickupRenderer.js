import * as THREE from "three"
import {worldToScene, WORLD_SCALE} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {createContactShadow, flatMaterial} from "../shared/materials.js"

const pickupKey = pickup =>
  `${pickup.type}:${Math.round(Number(pickup.x) || 0)}:${Math.round(Number(pickup.y) || 0)}`

const lunarColor = lootType => {
  if (lootType === "speed") return 0x4ea7ff
  if (lootType === "damage") return 0xff4e57
  return 0xffd34e
}

export const getPropHealthFraction = (current, maximum) => (
  Math.max(0, Math.min(1, (Number(current) || 0) / Math.max(1, Number(maximum) || 1)))
)

const roundedBarGeometry = (length, width) => {
  const shape = new THREE.Shape()
  const radius = width / 2
  const half = length / 2
  shape.moveTo(-half + radius, -radius)
  shape.lineTo(half - radius, -radius)
  shape.absarc(half - radius, 0, radius, -Math.PI / 2, Math.PI / 2, false)
  shape.lineTo(-half + radius, radius)
  shape.absarc(-half + radius, 0, radius, Math.PI / 2, Math.PI * 1.5, false)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width * 0.9,
    bevelEnabled: true,
    bevelThickness: width * 0.18,
    bevelSize: width * 0.18,
    bevelSegments: 2,
  })
  geometry.center()
  return geometry
}

const createHealGlow = radius => {
  const glow = createContactShadow(radius)
  glow.material.color.set(0x59ff7a)
  glow.material.opacity = 0.45
  glow.material.blending = THREE.AdditiveBlending
  glow.position.y = 0.02
  glow.userData.role = "heal-glow"
  return glow
}

const createHealthPotion = pickup => {
  const group = new THREE.Group()
  group.userData.type = pickup.type
  group.userData.pulse = true

  const cross = new THREE.Group()
  const barLength = 22 * WORLD_SCALE
  const barWidth = 8.5 * WORLD_SCALE

  const outlineMaterial = flatMaterial(0xf4fff6)
  const outlineHorizontal = new THREE.Mesh(
    roundedBarGeometry(barLength + 3 * WORLD_SCALE, barWidth + 3 * WORLD_SCALE),
    outlineMaterial,
  )
  const outlineVertical = new THREE.Mesh(
    roundedBarGeometry(barLength + 3 * WORLD_SCALE, barWidth + 3 * WORLD_SCALE),
    outlineMaterial.clone(),
  )
  outlineVertical.rotation.z = Math.PI / 2

  const greenMaterial = flatMaterial(0x2fd65c)
  const greenHorizontal = new THREE.Mesh(
    roundedBarGeometry(barLength, barWidth),
    greenMaterial,
  )
  greenHorizontal.position.y = 1.5 * WORLD_SCALE
  greenHorizontal.position.z = 2 * WORLD_SCALE
  greenHorizontal.renderOrder = 2
  const greenVertical = new THREE.Mesh(
    roundedBarGeometry(barLength, barWidth),
    greenMaterial.clone(),
  )
  greenVertical.rotation.z = Math.PI / 2
  greenVertical.position.y = 1.5 * WORLD_SCALE
  greenVertical.position.z = 2 * WORLD_SCALE
  greenVertical.renderOrder = 2

  cross.add(outlineHorizontal, outlineVertical, greenHorizontal, greenVertical)
  cross.position.y = 14 * WORLD_SCALE
  cross.rotation.x = -0.35

  group.add(createHealGlow(14 * WORLD_SCALE), cross)
  return group
}

const createPropHealthBar = pickup => {
  const group = new THREE.Group()
  const background = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0x4a1116,
    depthTest: false,
    depthWrite: false,
  }))
  background.scale.set(.92, .13, 1)
  background.userData.role = "prop-health-background"
  const fill = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xe53935,
    depthTest: false,
    depthWrite: false,
  }))
  fill.center.set(0, .5)
  fill.scale.set(.8, .072, 1)
  fill.position.set(-.4, -.036, .01)
  fill.userData.fullWidth = .8
  fill.userData.role = "prop-health-fill"
  group.add(background, fill)
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas")
    canvas.width = 160
    canvas.height = 36
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }))
    label.scale.set(1.1, .25, 1)
    label.position.set(0, .12, .02)
    label.userData = {canvas, texture, signature: "", role: "prop-health-label"}
    group.add(label)
    group.userData.healthLabel = label
  }
  group.position.y = 44 * WORLD_SCALE
  group.scale.setScalar(1.75)
  group.renderOrder = 18
  group.userData.healthFill = fill
  group.userData.healthFraction = getPropHealthFraction(pickup.lives, pickup.maxLives)
  fill.scale.x = fill.userData.fullWidth * group.userData.healthFraction
  updatePropHealthLabel(group, pickup)
  return group
}

const updatePropHealthLabel = (healthBar, pickup) => {
  const label = healthBar?.userData?.healthLabel
  if (!label) return
  const text = `${Math.max(0, Math.round(Number(pickup.lives) || 0))} / ${Math.max(1, Math.round(Number(pickup.maxLives) || 1))}`
  if (label.userData.signature === text) return
  label.userData.signature = text
  const {canvas, texture} = label.userData
  const context = canvas.getContext("2d")
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.font = "900 23px Arial"
  context.lineWidth = 7
  context.strokeStyle = "#241329"
  context.strokeText(text, canvas.width / 2, canvas.height / 2)
  context.fillStyle = "#fff"
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  texture.needsUpdate = true
}

export const createHealthCrate = pickup => {
  const group = new THREE.Group()
  group.userData.type = "health_crate"
  group.userData.spin = false
  const bodyMaterial = flatMaterial(0x9b542d)
  const body = new THREE.Mesh(new THREE.BoxGeometry(29 * WORLD_SCALE, 24 * WORLD_SCALE, 29 * WORLD_SCALE), bodyMaterial)
  body.position.y = 14 * WORLD_SCALE
  body.userData.role = "health-crate-body"

  const sideBand = new THREE.Mesh(
    new THREE.BoxGeometry(31 * WORLD_SCALE, 4 * WORLD_SCALE, 6 * WORLD_SCALE),
    flatMaterial(0xe7953d),
  )
  sideBand.position.y = 14 * WORLD_SCALE
  sideBand.userData.role = "health-crate-band"
  const frontBand = sideBand.clone()
  frontBand.rotation.y = Math.PI / 2

  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(21 * WORLD_SCALE, 5 * WORLD_SCALE, 21 * WORLD_SCALE),
    flatMaterial(0x6e8792),
  )
  cap.position.y = 28 * WORLD_SCALE
  cap.userData.role = "health-crate-cap"
  const lock = new THREE.Mesh(
    new THREE.BoxGeometry(7 * WORLD_SCALE, 5 * WORLD_SCALE, 3 * WORLD_SCALE),
    flatMaterial(0xd9e6df),
  )
  lock.position.set(0, 28 * WORLD_SCALE, 11 * WORLD_SCALE)
  lock.userData.role = "health-crate-lock"

  const healthBar = createPropHealthBar(pickup)
  group.userData.healthBar = healthBar
  group.userData.healthFill = healthBar.userData.healthFill
  group.add(createContactShadow(17 * WORLD_SCALE), body, sideBand, frontBand, cap, lock, healthBar)
  return group
}

export const createHealthBoost = pickup => {
  const group = createHealthPotion({...pickup, type: "health_boost"})
  group.userData.type = "health_boost"
  group.userData.healthBoost = true
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(15 * WORLD_SCALE, 28),
    flatMaterial(0x59ff7a, {
      transparent: true,
      opacity: .28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  halo.rotation.x = -Math.PI / 2
  halo.position.y = .03
  halo.userData.role = "health-boost-halo"
  group.add(halo)
  return group
}

const createLunarCrate = pickup => {
  const color = lunarColor(pickup.lootType)
  const group = new THREE.Group()
  group.userData.type = pickup.type
  group.userData.color = color
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(27 * WORLD_SCALE, 20 * WORLD_SCALE, 27 * WORLD_SCALE),
    flatMaterial(color),
  )
  crate.position.y = 11 * WORLD_SCALE
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(29 * WORLD_SCALE, 4 * WORLD_SCALE, 29 * WORLD_SCALE),
    flatMaterial(0xfff1bd),
  )
  band.position.y = 11 * WORLD_SCALE
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(6 * WORLD_SCALE, 0),
    flatMaterial(0xffffff),
  )
  core.position.y = 22 * WORLD_SCALE
  group.add(createContactShadow(16 * WORLD_SCALE), crate, band, core)
  return group
}

const createLunarReward = pickup => {
  const color = lunarColor(pickup.lootType || pickup.type.replace("lunar_", ""))
  const group = new THREE.Group()
  group.userData.type = pickup.type
  group.userData.color = color
  const orb = new THREE.Mesh(
    new THREE.OctahedronGeometry(9 * WORLD_SCALE, 0),
    flatMaterial(color),
  )
  orb.position.y = 13 * WORLD_SCALE
  group.add(createContactShadow(11 * WORLD_SCALE), orb)
  return group
}

const createPickup = pickup => {
  if (pickup.type === "health_crate") return createHealthCrate(pickup)
  if (pickup.type === "health_boost") return createHealthBoost(pickup)
  if (pickup.type === "lunar_crate") return createLunarCrate(pickup)
  if (String(pickup.type).startsWith("lunar_")) return createLunarReward(pickup)
  return createHealthPotion(pickup)
}

export class PickupRenderer {
  constructor(root) {
    this.root = root
    this.pickups = new Map()
    this.elapsed = 0
  }

  sync(pickups = []) {
    const active = new Set()
    for (const pickup of pickups) {
      if (pickup.active === false) continue
      const key = pickupKey(pickup)
      active.add(key)
      let view = this.pickups.get(key)
      if (!view) {
        view = createPickup(pickup)
        view.userData.phase = this.pickups.size * 1.7
        this.pickups.set(key, view)
        this.root.add(view)
      }
      if (view.userData.type === "health_crate") {
        const healthFraction = getPropHealthFraction(pickup.lives, pickup.maxLives)
        view.userData.healthFraction = healthFraction
        view.userData.healthFill.scale.x = view.userData.healthFill.userData.fullWidth * healthFraction
        updatePropHealthLabel(view.userData.healthBar, pickup)
      }
      view.position.copy(worldToScene(pickup.x, pickup.y, 0))
      view.userData.baseY = view.position.y
    }
    this.pickups.forEach((view, key) => {
      if (active.has(key)) return
      this.root.remove(view)
      disposeObjectTree(view)
      this.pickups.delete(key)
    })
  }

  update(deltaSeconds) {
    this.elapsed += deltaSeconds
    this.pickups.forEach(view => {
      view.position.y = view.userData.baseY + (4 + Math.sin(this.elapsed * 3.5 + view.userData.phase) * 2) * WORLD_SCALE
      if (view.userData.spin !== false) view.rotation.y += deltaSeconds * 1.8
      if (view.userData.pulse) {
        const pulse = 1 + Math.sin(this.elapsed * 4.2 + view.userData.phase) * 0.08
        view.scale.setScalar(pulse)
      }
    })
  }

  dispose() {
    this.pickups.forEach(view => disposeObjectTree(view))
    this.pickups.clear()
  }
}
