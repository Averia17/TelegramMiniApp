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

const createHealthPotion = () => {
  const group = new THREE.Group()
  group.userData.type = "potion-red"

  const bottle = new THREE.Mesh(
    new THREE.SphereGeometry(8 * WORLD_SCALE, 12, 8),
    flatMaterial(0xff3f58),
  )
  bottle.scale.set(0.9, 1.08, 0.72)
  bottle.position.y = 10 * WORLD_SCALE

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2 * WORLD_SCALE, 4.2 * WORLD_SCALE, 7 * WORLD_SCALE, 10),
    flatMaterial(0xff7182),
  )
  neck.position.y = 18 * WORLD_SCALE

  const cork = new THREE.Mesh(
    new THREE.CylinderGeometry(4 * WORLD_SCALE, 4 * WORLD_SCALE, 3.5 * WORLD_SCALE, 10),
    flatMaterial(0xffd27a),
  )
  cork.position.y = 23 * WORLD_SCALE

  const crossMaterial = flatMaterial(0xffffff)
  const crossHorizontal = new THREE.Mesh(
    new THREE.BoxGeometry(8 * WORLD_SCALE, 2.6 * WORLD_SCALE, 1.2 * WORLD_SCALE),
    crossMaterial,
  )
  const crossVertical = new THREE.Mesh(
    new THREE.BoxGeometry(2.6 * WORLD_SCALE, 8 * WORLD_SCALE, 1.3 * WORLD_SCALE),
    crossMaterial.clone(),
  )
  crossHorizontal.position.set(0, 11 * WORLD_SCALE, 6.2 * WORLD_SCALE)
  crossVertical.position.copy(crossHorizontal.position)

  group.add(createContactShadow(10 * WORLD_SCALE), bottle, neck, cork, crossHorizontal, crossVertical)
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
  return createHealthPotion()
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
    })
  }

  dispose() {
    this.pickups.forEach(view => disposeObjectTree(view))
    this.pickups.clear()
  }
}
