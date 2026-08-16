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
  outlineVertical.rotation.y = Math.PI / 2

  const greenMaterial = flatMaterial(0x2fd65c)
  const greenHorizontal = new THREE.Mesh(
    roundedBarGeometry(barLength, barWidth),
    greenMaterial,
  )
  greenHorizontal.position.y = 1.5 * WORLD_SCALE
  const greenVertical = new THREE.Mesh(
    roundedBarGeometry(barLength, barWidth),
    greenMaterial.clone(),
  )
  greenVertical.rotation.y = Math.PI / 2
  greenVertical.position.y = 1.5 * WORLD_SCALE

  cross.add(outlineHorizontal, outlineVertical, greenHorizontal, greenVertical)
  cross.position.y = 14 * WORLD_SCALE
  cross.rotation.x = -0.35

  group.add(createHealGlow(14 * WORLD_SCALE), cross)
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
      view.rotation.y += deltaSeconds * 1.8
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
