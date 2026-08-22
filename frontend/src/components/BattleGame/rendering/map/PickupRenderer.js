import * as THREE from "three"
import {worldToScene, WORLD_SCALE} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {createColoredBox, createContactShadow, flatMaterial} from "../shared/materials.js"
import {battleCanvasFont, getBattleHealthFontSize} from "../../battleTypography.js"

const pickupKey = pickup =>
  `${pickup.type}:${Math.round(Number(pickup.x) || 0)}:${Math.round(Number(pickup.y) || 0)}`

const lunarColor = lootType => {
  if (lootType === "speed") return 0x4ea7ff
  if (lootType === "damage") return 0xff4e57
  return 0xffd34e
}

const PROP_HEALTH_FONT_SIZE = getBattleHealthFontSize({canvasHeight: 36, spriteHeight: .25, parentScale: 1.15})

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
  group.position.y = 32 * WORLD_SCALE
  group.scale.setScalar(1.15)
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
  context.font = battleCanvasFont(900, PROP_HEALTH_FONT_SIZE)
  context.lineWidth = Math.max(5, Math.round(PROP_HEALTH_FONT_SIZE * .25))
  context.strokeStyle = "#241329"
  context.strokeText(text, canvas.width / 2, canvas.height / 2)
  context.fillStyle = "#fff"
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  texture.needsUpdate = true
}

export const createHealthCrate = pickup => {
  const group = new THREE.Group()
  group.userData.type = "health_crate"
  group.userData.visualStyle = "reinforced_field_cache"
  group.userData.spin = false

  const body = createColoredBox(
    22 * WORLD_SCALE,
    21 * WORLD_SCALE,
    22 * WORLD_SCALE,
    0x6d4930,
  )
  body.position.y = 12.5 * WORLD_SCALE
  body.userData.role = "health-crate-body"

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(25 * WORLD_SCALE, 2 * WORLD_SCALE, 25 * WORLD_SCALE),
    flatMaterial(0x463326),
  )
  base.position.y = 1.5 * WORLD_SCALE
  base.userData.role = "health-crate-base"

  const lid = createColoredBox(
    26 * WORLD_SCALE,
    2.4 * WORLD_SCALE,
    26 * WORLD_SCALE,
    0x5d4935,
  )
  lid.position.y = 24.2 * WORLD_SCALE
  lid.userData.role = "health-crate-lid"

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(26 * WORLD_SCALE, 2.4 * WORLD_SCALE, 26 * WORLD_SCALE)),
    new THREE.LineBasicMaterial({color: 0x9a7a4f, transparent: true, opacity: .58}),
  )
  edge.position.y = lid.position.y
  edge.userData.role = "health-crate-edge"

  const frontPlanks = [-7, 7].map(x => {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(1.8 * WORLD_SCALE, 17.5 * WORLD_SCALE, 1.4 * WORLD_SCALE),
      flatMaterial(0x473326),
    )
    plank.position.set(x * WORLD_SCALE, 12.5 * WORLD_SCALE, 11.3 * WORLD_SCALE)
    plank.userData.role = "health-crate-plank"
    return plank
  })

  const sidePlanks = [-1, 1].flatMap(x => [-7, 7].map(z => {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(1.4 * WORLD_SCALE, 17.5 * WORLD_SCALE, 1.8 * WORLD_SCALE),
      flatMaterial(0x473326),
    )
    plank.position.set(x * 11.3 * WORLD_SCALE, 12.5 * WORLD_SCALE, z * WORLD_SCALE)
    plank.userData.role = "health-crate-side-plank"
    return plank
  }))

  const posts = [-1, 1].flatMap(x => [-1, 1].map(z => {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(2.4 * WORLD_SCALE, 20.5 * WORLD_SCALE, 2.4 * WORLD_SCALE),
      flatMaterial(0x9a7a4f),
    )
    post.position.set(x * 10.3 * WORLD_SCALE, 12.5 * WORLD_SCALE, z * 10.3 * WORLD_SCALE)
    post.userData.role = "health-crate-post"
    return post
  }))

  const metalMaterial = flatMaterial(0x8d6946)
  const bands = [
    ...[4.1, 20.9].map(y => {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(20 * WORLD_SCALE, .9 * WORLD_SCALE, .9 * WORLD_SCALE),
        metalMaterial,
      )
      band.position.set(0, y * WORLD_SCALE, 11.75 * WORLD_SCALE)
      band.userData.role = "health-crate-band"
      return band
    }),
    ...[-1, 1].map(x => {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(.9 * WORLD_SCALE, .9 * WORLD_SCALE, 20 * WORLD_SCALE),
        metalMaterial,
      )
      band.position.set(x * 11.75 * WORLD_SCALE, 20.9 * WORLD_SCALE, 0)
      band.userData.role = "health-crate-band"
      return band
    }),
  ]

  const bolts = [
    ...[4.1, 20.9].flatMap(y => [-8.8, 8.8].map(x => {
      const bolt = new THREE.Mesh(
        new THREE.CylinderGeometry(.85 * WORLD_SCALE, .85 * WORLD_SCALE, .55 * WORLD_SCALE, 8),
        flatMaterial(0xc09559),
      )
      bolt.rotation.x = Math.PI / 2
      bolt.position.set(x * WORLD_SCALE, y * WORLD_SCALE, 12.15 * WORLD_SCALE)
      bolt.userData.role = "health-crate-bolt"
      return bolt
    })),
    ...[4.1, 20.9].flatMap(y => [-8.8, 8.8].map(z => {
      const bolt = new THREE.Mesh(
        new THREE.CylinderGeometry(.85 * WORLD_SCALE, .85 * WORLD_SCALE, .55 * WORLD_SCALE, 8),
        flatMaterial(0xc09559),
      )
      bolt.rotation.z = Math.PI / 2
      bolt.position.set(12.15 * WORLD_SCALE, y * WORLD_SCALE, z * WORLD_SCALE)
      bolt.userData.role = "health-crate-bolt"
      return bolt
    })),
  ]

  const latch = new THREE.Mesh(
    new THREE.BoxGeometry(4.6 * WORLD_SCALE, 2.8 * WORLD_SCALE, 1.2 * WORLD_SCALE),
    flatMaterial(0xb4874d),
  )
  latch.position.set(0, 22.1 * WORLD_SCALE, 12.15 * WORLD_SCALE)
  latch.userData.role = "health-crate-latch"

  const lidPlanks = [-1, 1].map(x => {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(2 * WORLD_SCALE, .45 * WORLD_SCALE, 22.5 * WORLD_SCALE),
      flatMaterial(0x473326),
    )
    plank.position.set(x * 8 * WORLD_SCALE, 25.65 * WORLD_SCALE, 0)
    plank.userData.role = "health-crate-plank"
    return plank
  })

  const corners = [-1, 1].flatMap(x => [-1, 1].map(z => {
    const corner = new THREE.Mesh(
      new THREE.BoxGeometry(2.5 * WORLD_SCALE, 2.5 * WORLD_SCALE, 2.5 * WORLD_SCALE),
      flatMaterial(0x9a7a4f),
    )
    corner.position.set(x * 9.5 * WORLD_SCALE, 3 * WORLD_SCALE, z * 9.5 * WORLD_SCALE)
    corner.userData.role = "health-crate-corner"
    return corner
  }))

  const markMaterial = flatMaterial(0x6aa955)
  const mark = new THREE.Group()
  mark.userData.role = "health-crate-mark"
  const markStem = new THREE.Mesh(
    new THREE.BoxGeometry(2.1 * WORLD_SCALE, .4 * WORLD_SCALE, 7 * WORLD_SCALE),
    markMaterial,
  )
  const markBar = new THREE.Mesh(
    new THREE.BoxGeometry(7 * WORLD_SCALE, .4 * WORLD_SCALE, 2.1 * WORLD_SCALE),
    markMaterial,
  )
  markStem.position.y = 26.7 * WORLD_SCALE
  markBar.position.y = 26.7 * WORLD_SCALE
  mark.add(markStem, markBar)

  const healthBar = createPropHealthBar(pickup)
  group.userData.healthBar = healthBar
  group.userData.healthFill = healthBar.userData.healthFill
  group.add(
    createContactShadow(15 * WORLD_SCALE),
    base,
    body,
    lid,
    edge,
    ...frontPlanks,
    ...sidePlanks,
    ...posts,
    ...bands,
    ...bolts,
    latch,
    ...lidPlanks,
    ...corners,
    mark,
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
