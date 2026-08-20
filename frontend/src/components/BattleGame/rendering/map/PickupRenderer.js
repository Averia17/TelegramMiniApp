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

export const getPropHealthFraction = (current, maximum) => (
  Math.max(0, Math.min(1, (Number(current) || 0) / Math.max(1, Number(maximum) || 1)))
)

export const createHealthPotion = pickup => {
  const group = new THREE.Group()
  group.userData.type = pickup.type
  group.userData.palette = "green"
  group.userData.spin = true
  group.userData.pulse = true

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(14 * WORLD_SCALE, 32),
    flatMaterial(0x5dff76, {
      transparent: true,
      opacity: .22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  halo.rotation.x = -Math.PI / 2
  halo.position.y = .03
  halo.userData.role = "health-potion-halo"

  const cubeRoot = new THREE.Group()
  cubeRoot.rotation.y = Math.PI / 4
  const cubeSize = 17 * WORLD_SCALE
  const cube = createColoredBox(cubeSize, cubeSize, cubeSize, 0x3fcf62)
  cube.position.y = 11 * WORLD_SCALE
  cube.userData.role = "health-potion-cube"

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(cubeSize * 1.02, cubeSize * 1.02, cubeSize * 1.02)),
    new THREE.LineBasicMaterial({color: 0xb9ffc3, transparent: true, opacity: .7}),
  )
  edge.position.y = cube.position.y
  edge.userData.role = "health-potion-edge"

  const emblem = new THREE.Mesh(
    new THREE.OctahedronGeometry(4.6 * WORLD_SCALE, 0),
    flatMaterial(0xe8ffd9),
  )
  emblem.scale.y = .75
  emblem.position.set(0, 11 * WORLD_SCALE, 9.2 * WORLD_SCALE)
  emblem.userData.role = "health-potion-emblem"

  cubeRoot.add(cube, edge, emblem)
  group.add(createContactShadow(13 * WORLD_SCALE), halo, cubeRoot)
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

  const body = createColoredBox(
    31 * WORLD_SCALE,
    31 * WORLD_SCALE,
    31 * WORLD_SCALE,
    0x98502a,
  )
  body.position.y = 16 * WORLD_SCALE
  body.userData.role = "health-crate-body"

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(33 * WORLD_SCALE, 2 * WORLD_SCALE, 33 * WORLD_SCALE),
    flatMaterial(0x5e301f),
  )
  base.position.y = 2 * WORLD_SCALE
  base.userData.role = "health-crate-base"

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(32 * WORLD_SCALE, 32 * WORLD_SCALE, 32 * WORLD_SCALE)),
    new THREE.LineBasicMaterial({color: 0xd17a3b, transparent: true, opacity: .7}),
  )
  edge.position.y = body.position.y
  edge.userData.role = "health-crate-edge"

  const frontPanel = new THREE.Mesh(
    new THREE.BoxGeometry(27 * WORLD_SCALE, 27 * WORLD_SCALE, 1.3 * WORLD_SCALE),
    flatMaterial(0x824323),
  )
  frontPanel.position.set(0, 16 * WORLD_SCALE, 16.2 * WORLD_SCALE)
  frontPanel.userData.role = "health-crate-front-panel"

  const frontPlanks = [-9, 0, 9].map(x => {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(1.8 * WORLD_SCALE, 27 * WORLD_SCALE, 1.8 * WORLD_SCALE),
      flatMaterial(0x54291b),
    )
    rail.position.set(x * WORLD_SCALE, 16 * WORLD_SCALE, 17.2 * WORLD_SCALE)
    rail.userData.role = "health-crate-plank"
    return rail
  })

  const frontRails = [7, 24].map(y => {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(27 * WORLD_SCALE, 1.8 * WORLD_SCALE, 1.8 * WORLD_SCALE),
      flatMaterial(0x6d351f),
    )
    plank.position.set(0, y * WORLD_SCALE, 17.2 * WORLD_SCALE)
    plank.userData.role = "health-crate-plank"
    return plank
  })

  const corners = [-1, 1].flatMap(x => [5, 27].map(y => {
    const corner = new THREE.Mesh(
      new THREE.BoxGeometry(4 * WORLD_SCALE, 4 * WORLD_SCALE, 2.4 * WORLD_SCALE),
      flatMaterial(0xc47a3a),
    )
    corner.position.set(x * 12.5 * WORLD_SCALE, y * WORLD_SCALE, 18 * WORLD_SCALE)
    corner.userData.role = "health-crate-corner"
    return corner
  }))

  const createCrack = points => {
    const crack = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        points.map(([x, y]) => new THREE.Vector3(x * WORLD_SCALE, y * WORLD_SCALE, 18.25 * WORLD_SCALE)),
      ),
      new THREE.LineBasicMaterial({color: 0x351d17, transparent: true, opacity: .95}),
    )
    crack.userData.role = "health-crate-crack"
    return crack
  }
  const cracks = [
    createCrack([[-7, 22], [-3, 18], [-1, 19], [2, 14]]),
    createCrack([[2, 14], [5, 12], [4, 8], [8, 5]]),
    createCrack([[-1, 19], [1, 22], [5, 24]]),
  ]

  const gemGlow = new THREE.Mesh(
    new THREE.CircleGeometry(8 * WORLD_SCALE, 24),
    flatMaterial(0x4dff72, {
      transparent: true,
      opacity: .18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  gemGlow.position.set(0, 16 * WORLD_SCALE, 17.35 * WORLD_SCALE)
  gemGlow.userData.role = "health-crate-gem-glow"

  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(5 * WORLD_SCALE, 0),
    flatMaterial(0x82ff91),
  )
  gem.scale.y = .78
  gem.position.set(0, 16 * WORLD_SCALE, 18.35 * WORLD_SCALE)
  gem.userData.role = "health-crate-energy-gem"

  const healthBar = createPropHealthBar(pickup)
  group.userData.healthBar = healthBar
  group.userData.healthFill = healthBar.userData.healthFill
  group.add(
    createContactShadow(18 * WORLD_SCALE),
    base,
    body,
    edge,
    frontPanel,
    ...frontPlanks,
    ...frontRails,
    ...corners,
    ...cracks,
    gemGlow,
    gem,
    healthBar,
  )
  return group
}

export const createHealthBoost = () => {
  const group = new THREE.Group()
  group.userData.type = "health_boost"
  group.userData.healthBoost = true
  group.userData.palette = "purple"
  group.userData.rarity = "hero"
  group.userData.spin = true
  group.userData.pulse = true

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(17 * WORLD_SCALE, 32),
    flatMaterial(0xc55dff, {
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
    0x8747d7,
  )
  cube.position.y = 12 * WORLD_SCALE
  cube.userData.role = "health-boost-cube"

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(19.4 * WORLD_SCALE, 19.4 * WORLD_SCALE, 19.4 * WORLD_SCALE)),
    new THREE.LineBasicMaterial({color: 0xf0c2ff, transparent: true, opacity: .82}),
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
      flatMaterial(0xd8a0ff),
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
