import * as THREE from "three"
import {worldToScene, WORLD_SCALE} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {createContactShadow, flatMaterial} from "../shared/materials.js"

const pickupKey = pickup =>
  `${pickup.type}:${Math.round(Number(pickup.x) || 0)}:${Math.round(Number(pickup.y) || 0)}`

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
        view = createHealthPotion()
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
