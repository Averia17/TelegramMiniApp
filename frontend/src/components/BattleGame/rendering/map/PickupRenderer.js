import * as THREE from "three"
import {worldToScene, WORLD_SCALE} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {createColoredBox, createContactShadow, flatMaterial} from "../shared/materials.js"

const pickupKey = pickup =>
  `${pickup.type}:${Math.round(Number(pickup.x) || 0)}:${Math.round(Number(pickup.y) || 0)}`

const lunarColor = lootType => {
  if (lootType === "speed") return 0x4ea7ff
  if (lootType === "damage") return 0xff4e57
  return 0xffd34e
}

export const createHealthBoost = () => {
  const group = new THREE.Group()
  group.userData.type = "health_boost"
  group.userData.healthBoost = true
  group.userData.palette = "green"
  group.userData.rarity = "hero"
  group.userData.primaryColor = 0x2fbf5a
  group.userData.haloColor = 0x3cff6b
  group.userData.spin = true
  group.userData.pulse = true

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(17 * WORLD_SCALE, 32),
    flatMaterial(0x3cff6b, {
      transparent: true,
      opacity: .2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  halo.rotation.x = -Math.PI / 2
  halo.position.y = .03
  halo.userData.role = "health-boost-halo"

  const cubeRoot = new THREE.Group()
  cubeRoot.rotation.y = Math.PI / 4
  const cube = createColoredBox(
    19 * WORLD_SCALE,
    19 * WORLD_SCALE,
    19 * WORLD_SCALE,
    0x2fbf5a,
  )
  cube.position.y = 12 * WORLD_SCALE
  cube.userData.role = "health-boost-cube"

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(19.4 * WORLD_SCALE, 19.4 * WORLD_SCALE, 19.4 * WORLD_SCALE)),
    new THREE.LineBasicMaterial({color: 0xbaffc9, transparent: true, opacity: .82}),
  )
  edge.position.y = cube.position.y
  edge.userData.role = "health-boost-edge"

  const boltShape = new THREE.Shape()
  const boltWidth = 5.5 * WORLD_SCALE
  const boltHeight = 12 * WORLD_SCALE
  boltShape.moveTo(-boltWidth * .1, boltHeight / 2)
  boltShape.lineTo(-boltWidth * .82, -boltHeight * .02)
  boltShape.lineTo(-boltWidth * .12, -boltHeight * .02)
  boltShape.lineTo(-boltWidth * .52, -boltHeight / 2)
  boltShape.lineTo(boltWidth * .82, boltHeight * .12)
  boltShape.lineTo(boltWidth * .1, boltHeight * .12)
  boltShape.closePath()
  const bolt = new THREE.Mesh(
    new THREE.ExtrudeGeometry(boltShape, {
      depth: 1.4 * WORLD_SCALE,
      bevelEnabled: true,
      bevelThickness: .45 * WORLD_SCALE,
      bevelSize: .35 * WORLD_SCALE,
      bevelSegments: 2,
    }),
    flatMaterial(0xfff3a3),
  )
  bolt.geometry.center()
  bolt.position.set(0, 12 * WORLD_SCALE, 10.3 * WORLD_SCALE)
  bolt.userData.role = "health-boost-bolt"

  const shards = [
    [-13, 18, 1],
    [13, 16, -1],
    [-2, 28, -8],
    [1, 3, 9],
  ].map(([x, y, z]) => {
    const shard = new THREE.Mesh(
      new THREE.OctahedronGeometry(2.2 * WORLD_SCALE, 0),
      flatMaterial(0x9dffb5),
    )
    shard.position.set(x * WORLD_SCALE, y * WORLD_SCALE, z * WORLD_SCALE)
    shard.scale.y = 1.35
    shard.userData.role = "health-boost-shard"
    return shard
  })

  cubeRoot.add(cube, edge, bolt, ...shards)
  group.add(createContactShadow(14 * WORLD_SCALE), halo, cubeRoot)
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
  if (pickup.type === "health_boost") return createHealthBoost(pickup)
  if (pickup.type === "lunar_crate") return createLunarCrate(pickup)
  if (String(pickup.type).startsWith("lunar_")) return createLunarReward(pickup)
  return null
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
        if (!view) continue
        view.userData.phase = this.pickups.size * 1.7
        this.pickups.set(key, view)
        this.root.add(view)
      }
      if (view.userData.type === "health_boost") view.userData.stacks = Number(pickup.healthBoosts) || 0
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
