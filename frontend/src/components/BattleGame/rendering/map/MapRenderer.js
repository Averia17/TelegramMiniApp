import * as THREE from "three"
import {
  createBushField,
  getBushVisibilityOpacity,
  setBushVisibilityOpacity,
  splitBushWallComponents,
} from "./BushRenderer.js"
import {GroundRenderer, createWaterTexture} from "./GroundRenderer.js"
import {createProp} from "./PropRenderer.js"
import {createWildflowerField} from "./WildflowerRenderer.js"
import {createStoneBlockGeometry} from "./StoneBlockGeometry.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {WORLD_SCALE} from "../shared/coordinates.js"
import {createMapSignature} from "./mapSignature.js"
import {ISLAND_PHASE_ATMOSPHERES} from "../../phaseVisuals.js"
import {isTeamBattleMode} from "../../battleMode.js"

const ISLAND_TERRAIN_LAYER_HEIGHTS = [0.003, 0.006, 0.009]
const STORM_SEGMENTS = 96
// Rebuilds dispose and recreate instanced environment batches. Keep this
// coarse so ordinary movement never turns into a stream of scene rebuilds.
const ENVIRONMENT_FOCUS_REBUILD_DISTANCE = 256
const STONE_PROP_TYPES = new Set(["wall", "destructible", "sacrificial_stone", "menhir"])
const COLLISION_ONLY_TYPES = new Set(["objective"])
const DEFAULT_MAP_TILE_SIZE = 40
const BEACON_VISUAL_SCALE = 24

const objectiveHealthFraction = (lives, maxLives) => (
  Math.max(0, Math.min(1, (Number(lives) || 0) / Math.max(1, Number(maxLives) || 1)))
)

const formatObjectiveHealth = (lives, maxLives) => {
  const maximum = Math.max(1, Math.round(Number(maxLives) || 1))
  const current = Math.max(0, Math.min(maximum, Math.round(Number(lives) || 0)))
  return `${current} / ${maximum}`
}

const createObjectiveHealthBadge = color => {
  const group = new THREE.Group()
  group.name = "team-objective-health"
  group.scale.setScalar(1.75)
  group.userData.baseScale = 1.75
  group.renderOrder = 24
  const background = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0x241329,
    depthTest: false,
    depthWrite: false,
  }))
  background.renderOrder = 1
  background.scale.set(3.1, .36, 1)
  const fill = new THREE.Sprite(new THREE.SpriteMaterial({
    color,
    depthTest: false,
    depthWrite: false,
  }))
  fill.renderOrder = 2
  fill.center.set(0, .5)
  fill.scale.set(2.86, .22, 1)
  fill.position.set(-1.43, -.11, .01)
  fill.userData.fullWidth = 2.86

  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }))
  label.renderOrder = 3
  label.scale.set(3.55, .62, 1)
  label.position.set(0, .38, .02)
  label.userData = {canvas: null, texture: null, signature: ""}
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas")
    canvas.width = 512
    canvas.height = 80
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    label.material.map = texture
    label.material.needsUpdate = true
    label.userData.canvas = canvas
    label.userData.texture = texture
  }
  group.add(background, fill, label)
  return {group, fill, label}
}

const updateObjectiveHealthLabel = (label, objective) => {
  if (!label?.userData?.canvas || !label.userData.texture) return
  const text = formatObjectiveHealth(objective.lives, objective.maxLives)
  if (label.userData.signature === text) return
  label.userData.signature = text
  const {canvas, texture} = label.userData
  const context = canvas.getContext("2d")
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.font = "900 56px Arial"
  context.lineWidth = 12
  context.strokeStyle = "#241329"
  context.strokeText(text, canvas.width / 2, canvas.height / 2)
  context.fillStyle = "#fff"
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  texture.needsUpdate = true
}

const createObjectiveCrack = (name, points, z) => {
  const crack = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(
      points.map(([x, y]) => new THREE.Vector3(x, y, z)),
    ),
    new THREE.LineBasicMaterial({color: 0x101827, transparent: true, opacity: .95}),
  )
  crack.name = name
  crack.userData.role = "team-objective-crack"
  return crack
}

const createBrokenObjectiveVisual = (hall, blue) => {
  const group = new THREE.Group()
  group.name = hall ? "team-town-hall-broken" : "team-tower-broken"
  const brokenColor = blue ? 0x3a465f : 0x55313a
  const brokenMaterial = new THREE.MeshStandardMaterial({
    color: brokenColor,
    roughness: .96,
    metalness: .02,
    flatShading: true,
  })

  if (hall) {
    const brokenHouse = new THREE.Mesh(new THREE.BoxGeometry(4.9, 1.35, 3.9), brokenMaterial)
    brokenHouse.position.y = 1.08
    brokenHouse.name = "team-town-hall-broken-house"
    const brokenRoof = new THREE.Mesh(new THREE.ConeGeometry(3.75, 1.05, 4), brokenMaterial)
    brokenRoof.rotation.set(.08, Math.PI / 4, -.42)
    brokenRoof.position.set(.35, 2.28, .05)
    brokenRoof.name = "team-town-hall-broken-roof"
    group.add(
      brokenHouse,
      brokenRoof,
      createObjectiveCrack("team-town-hall-broken-crack", [[-.8, .55], [-.2, 1.12], [-.36, 1.65], [.4, 2.08]], 2.02),
      createObjectiveCrack("team-town-hall-broken-crack-side", [[.65, .6], [.25, 1.05], [.7, 1.48]], -2.02),
    )
  } else {
    const brokenShaft = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.55, 1.12, 8), brokenMaterial)
    brokenShaft.position.y = .9
    brokenShaft.name = "team-tower-broken-shaft"
    const brokenRoof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.18, 6), brokenMaterial)
    brokenRoof.rotation.set(.08, .2, -.46)
    brokenRoof.position.set(.3, 2.24, .04)
    brokenRoof.name = "team-tower-broken-roof"
    const brokenCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(.38, 0),
      new THREE.MeshBasicMaterial({color: 0x29313e, transparent: true, opacity: .72}),
    )
    brokenCore.position.set(-.48, 1.65, .18)
    brokenCore.rotation.z = .5
    brokenCore.name = "team-tower-broken-core"
    const debris = [
      [-1.42, .42, .2, .34],
      [1.34, .5, -.25, .28],
      [.82, .31, .38, .22],
    ].map(([x, y, z, size], index) => {
      const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(size, 0), brokenMaterial)
      shard.position.set(x, y, z)
      shard.rotation.set(index * .6, index * .8, -.25 * index)
      shard.name = `team-tower-broken-debris-${index}`
      return shard
    })
    group.add(
      brokenShaft,
      brokenRoof,
      brokenCore,
      ...debris,
      createObjectiveCrack("team-tower-broken-crack", [[-.72, .48], [-.2, 1.02], [-.38, 1.55], [.35, 2.04]], 1.32),
      createObjectiveCrack("team-tower-broken-crack-side", [[.65, .55], [.2, .95], [.62, 1.4]], -1.32),
    )
  }

  group.visible = false
  group.userData.role = "team-objective-broken"
  return group
}

const setObjectiveBrokenState = (object, broken) => {
  object.userData.objectiveBroken = broken
  object.userData.objectiveLiveParts?.forEach(part => { part.visible = !broken })
  if (object.userData.objectiveBrokenVisual) object.userData.objectiveBrokenVisual.visible = broken
}

const createProtectionBadge = color => {
  const group = new THREE.Group()
  group.name = "town-hall-protection"
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(4.45, 24, 16),
    new THREE.MeshBasicMaterial({color: 0x8fe7ff, transparent: true, opacity: .14, wireframe: true, depthTest: false, depthWrite: false}),
  )
  shield.name = "town-hall-protected-shield"
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.15, .1, 8, 32),
    new THREE.MeshBasicMaterial({color: 0xd8f7ff, transparent: true, opacity: .92, depthTest: false, depthWrite: false}),
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = .15
  ring.name = "town-hall-protected-ring"
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(.52, 0),
    new THREE.MeshBasicMaterial({color, transparent: true, opacity: .95, depthTest: false, depthWrite: false}),
  )
  core.position.y = 4.75
  core.name = "town-hall-protected-lock"
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }))
  label.renderOrder = 4
  label.position.y = 4.45
  label.scale.set(4.2, .85, 1)
  label.name = "town-hall-protected-label"
  label.userData.role = "town-hall-protected-label"
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas")
    canvas.width = 420
    canvas.height = 64
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const context = canvas.getContext("2d")
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.font = "900 36px Arial"
    context.lineWidth = 9
    context.strokeStyle = "#143b59"
    context.strokeText("ЗАЩИЩЕНА", canvas.width / 2, canvas.height / 2)
    context.fillStyle = "#d8f7ff"
    context.fillText("ЗАЩИЩЕНА", canvas.width / 2, canvas.height / 2)
    label.material.map = texture
    label.material.needsUpdate = true
    label.userData.texture = texture
  }
  group.add(shield, ring, core, label)
  group.visible = false
  return group
}

const createObjectiveVisual = objective => {
  const group = new THREE.Group()
  const blue = String(objective.team) === "Blue"
  const color = blue ? 0x4b9dff : 0xff5f6d
  const material = new THREE.MeshStandardMaterial({color, roughness: .72, metalness: .14, flatShading: true})
  const dark = new THREE.MeshStandardMaterial({color: blue ? 0x172d63 : 0x5e1826, roughness: .8, flatShading: true})
  const hall = objective.type === "town_hall"
  const health = createObjectiveHealthBadge(blue ? 0x4b9dff : 0xff5f6d)
  health.group.position.y = hall ? 5.55 : 4.82
  const protection = hall ? createProtectionBadge(color) : null
  if (protection) group.add(protection)
  group.add(health.group)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(hall ? 3.8 : 1.85, hall ? 4.35 : 2.25, hall ? .72 : .55, hall ? 8 : 8), dark)
  base.position.y = hall ? .36 : .28
  base.name = hall ? "team-town-hall-foundation" : "team-tower-foundation"
  if (hall) {
    const house = new THREE.Mesh(new THREE.BoxGeometry(4.9, 2.35, 3.9), material)
    house.position.y = 1.72
    house.name = "team-town-hall-house"
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.75, 1.65, 4), material)
    roof.rotation.y = Math.PI / 4
    roof.position.y = 3.72
    roof.name = "team-town-hall-roof"
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.55, .12, 8, 24), new THREE.MeshBasicMaterial({color, transparent: true, opacity: .7, depthWrite: false}))
    ring.rotation.x = Math.PI / 2
    ring.position.y = .8
    ring.name = "team-town-hall-ring"
    group.add(base, house, roof, ring)
  } else {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.55, 2.5, 8), material)
    shaft.position.y = 1.55
    shaft.name = "team-tower-shaft"
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.45, 6), material)
    roof.position.y = 3.52
    roof.name = "team-tower-roof"
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(.42, 0), new THREE.MeshBasicMaterial({color: 0xffe28a, transparent: true, opacity: .9}))
    core.position.y = 3.45
    core.name = "team-tower-core"
    const attackRange = Number(objective.attackRange) || 0
    const rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(1, attackRange * WORLD_SCALE - .08), attackRange * WORLD_SCALE, 64),
      new THREE.MeshBasicMaterial({color, transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide}),
    )
    rangeRing.rotation.x = Math.PI / 2
    rangeRing.position.y = .08
    rangeRing.name = "team-tower-attack-range"
    group.add(base, shaft, roof, core, rangeRing)
    group.userData.objectiveRangeRing = rangeRing
  }
  const brokenVisual = createBrokenObjectiveVisual(hall, blue)
  group.add(brokenVisual)
  group.position.set(Number(objective.x) * WORLD_SCALE, 0, Number(objective.y) * WORLD_SCALE)
  group.userData.objectiveId = objective.id
  group.userData.objectiveMaterial = material
  group.userData.objectiveHealthBar = health.group
  group.userData.objectiveHealthFill = health.fill
  group.userData.objectiveHealthLabel = health.label
  group.userData.objectiveProtection = protection
  group.userData.objectiveBrokenVisual = brokenVisual
  group.userData.objectiveLiveParts = hall
    ? [group.getObjectByName("team-town-hall-house"), group.getObjectByName("team-town-hall-roof")]
    : [group.getObjectByName("team-tower-shaft"), group.getObjectByName("team-tower-roof"), group.getObjectByName("team-tower-core")]
  group.userData.objectiveBroken = false
  return group
}

const shapeGeometry = points => {
  const shape = new THREE.Shape()
  shape.moveTo(points[0][0], points[0][1])
  points.slice(1).forEach(point => shape.lineTo(point[0], point[1]))
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
}

const riverProfile = [
  // Both banks widen into estuary mouths. The endpoints stop at the island's
  // shoreline so the river joins the ocean instead of cutting through it.
  [-108, 4.15], [-96, 3.5], [-84, 3.1], [-72, 2.8], [-60, 2.6], [-48, 2.3], [-36, 2.45],
  [-24, 2.2], [-12, 2.4], [0, 2.2], [12, 2.4], [24, 2.2], [36, 2.45], [48, 2.3],
  [60, 2.6], [72, 2.8], [84, 3.1], [96, 3.5], [108, 4.15],
]

const riverBankGeometry = extra => shapeGeometry([
  ...riverProfile.map(([x, width]) => [x, width + extra]),
  ...[...riverProfile].reverse().map(([x, width]) => [x, -width - extra]),
])

const createRiverVisual = scale => {
  const group = new THREE.Group()
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x3e9ca8, roughness: .7, metalness: .02, transparent: true, opacity: .78,
  })
  const water = new THREE.Mesh(riverBankGeometry(0), waterMaterial)
  water.rotation.x = -Math.PI / 2
  water.position.y = .035
  water.scale.setScalar(scale)
  water.name = "team-river-water"
  group.add(water)

  const shoreMaterial = new THREE.MeshStandardMaterial({color: 0x9b845d, roughness: .98, flatShading: true})
  const makeShore = side => {
    const shore = new THREE.Mesh(shapeGeometry([
      ...riverProfile.map(([x, width]) => [x, side * width]),
      ...[...riverProfile].reverse().map(([x, width]) => [x, side * (width + 1.55)]),
    ]), shoreMaterial)
    shore.rotation.x = -Math.PI / 2
    shore.position.y = .025
    shore.scale.setScalar(scale)
    shore.name = "team-river-shore"
    return shore
  }
  group.add(makeShore(-1), makeShore(1))

  const rockMaterial = new THREE.MeshStandardMaterial({color: 0x667477, roughness: .9, flatShading: true})
  const reedMaterial = new THREE.MeshStandardMaterial({color: 0x386d43, roughness: 1, flatShading: true})
  for (const [x, z, size] of [
    [-84, -3.1, .42], [-61, 3.15, .34], [-36, -3.05, .3], [-11, 3.1, .38],
    [14, -3.05, .36], [39, 3.1, .32], [64, -3.05, .4], [86, 3.1, .34],
  ]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size * scale, 0), rockMaterial)
    rock.position.set(x * scale, size * .45 * scale, z * scale)
    rock.scale.set(1.25, .72, .95)
    rock.name = "team-river-rock"
    group.add(rock)
  }
  for (const [x, z] of [[-73, -3.3], [-48, 3.25], [-22, -3.25], [2, 3.25], [27, -3.25], [52, 3.25], [76, -3.3]]) {
    const reed = new THREE.Mesh(new THREE.ConeGeometry(.09 * scale, .8 * scale, 5), reedMaterial)
    reed.position.set(x * scale, .4 * scale, z * scale)
    reed.rotation.z = (x % 2 ? -.18 : .16)
    reed.name = "team-river-reed"
    group.add(reed)
  }
  return group
}

const createRiverBridgeVisual = scale => {
  const group = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({color: 0x8f6847, roughness: .92, flatShading: true})
  const plank = new THREE.MeshStandardMaterial({color: 0xb08859, roughness: .9, flatShading: true})
  const stone = new THREE.MeshStandardMaterial({color: 0x6b7776, roughness: .95, flatShading: true})
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.5 * scale, .28 * scale, 8.2 * scale), wood)
  deck.position.y = .22 * scale
  deck.name = "team-river-bridge-deck"
  group.add(deck)
  for (let index = -2; index <= 2; index += 1) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(4.25 * scale, .12 * scale, .82 * scale), plank)
    board.position.set(0, .41 * scale, index * 1.55 * scale)
    board.name = "team-river-bridge-plank"
    group.add(board)
  }
  for (const z of [-3.35, 3.35]) {
    const support = new THREE.Mesh(new THREE.DodecahedronGeometry(.72 * scale, 0), stone)
    support.position.set(0, -.08 * scale, z * scale)
    support.scale.set(1.35, .55, .85)
    support.name = "team-river-bridge-stone"
    group.add(support)
  }
  for (const x of [-2.05, 2.05]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.14 * scale, .13 * scale, 7.2 * scale), wood)
    rail.position.set(x * scale, .92 * scale, 0)
    rail.name = "team-river-bridge-rail"
    group.add(rail)
    for (const z of [-3.1, 0, 3.1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.12 * scale, .14 * scale, 1.15 * scale, 6), wood)
      post.position.set(x * scale, .58 * scale, z * scale)
      post.name = "team-river-bridge-post"
      group.add(post)
    }
  }
  return group
}

const createTeamFeatureVisual = feature => {
  const group = new THREE.Group()
  const type = String(feature.type || "")
  const scale = Number(feature.scale) > 0 ? Number(feature.scale) : 1
  group.rotation.y = Number(feature.rotation) || -Math.PI / 4
  if (type === "river") group.add(createRiverVisual(scale))
  if (type === "river_bridge") group.add(createRiverBridgeVisual(scale))
  group.position.set(Number(feature.x) * WORLD_SCALE, 0, Number(feature.y) * WORLD_SCALE)
  group.userData.featureId = feature.id
  return group
}

const createBeaconVisual = () => {
  const group = new THREE.Group()
  group.userData.role = "beacon"
  group.scale.setScalar(BEACON_VISUAL_SCALE)

  const pedestalMaterial = new THREE.MeshStandardMaterial({
    color: 0x59686d,
    roughness: .9,
    metalness: .04,
    flatShading: true,
  })
  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: 0x778487,
    roughness: .84,
    metalness: .02,
    flatShading: true,
  })
  const towerMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9dbd4,
    roughness: .7,
    metalness: .03,
    flatShading: true,
  })
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0xc49b45,
    roughness: .35,
    metalness: .7,
    flatShading: true,
  })
  const darkMetalMaterial = new THREE.MeshStandardMaterial({
    color: 0x4d5d60,
    roughness: .42,
    metalness: .72,
    flatShading: true,
  })

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(5.5 * WORLD_SCALE, 5.95 * WORLD_SCALE, .28 * WORLD_SCALE, 16),
    pedestalMaterial,
  )
  pedestal.name = "beacon-pedestal"
  pedestal.position.y = .14 * WORLD_SCALE

  const pedestalInset = new THREE.Mesh(
    new THREE.CylinderGeometry(4.55 * WORLD_SCALE, 4.8 * WORLD_SCALE, .12 * WORLD_SCALE, 12),
    new THREE.MeshStandardMaterial({color: 0x6e7d7e, roughness: .82, flatShading: true}),
  )
  pedestalInset.name = "beacon-pedestal-inset"
  pedestalInset.position.y = .32 * WORLD_SCALE

  const activationRing = new THREE.Mesh(
    new THREE.TorusGeometry(4.1 * WORLD_SCALE, .18 * WORLD_SCALE, 8, 40),
    new THREE.MeshBasicMaterial({color: 0xffdc72, transparent: true, opacity: .22, depthWrite: false}),
  )
  activationRing.name = "beacon-activation-ring"
  activationRing.rotation.x = Math.PI / 2
  activationRing.position.y = .38 * WORLD_SCALE

  const pedestalRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.18 * WORLD_SCALE, .13 * WORLD_SCALE, 8, 24),
    darkMetalMaterial,
  )
  pedestalRing.name = "beacon-pedestal-ring"
  pedestalRing.rotation.x = Math.PI / 2
  pedestalRing.position.y = .56 * WORLD_SCALE

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.68 * WORLD_SCALE, 2.02 * WORLD_SCALE, .62 * WORLD_SCALE, 8),
    stoneMaterial,
  )
  base.name = "beacon-base"
  base.position.y = .83 * WORLD_SCALE

  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.18 * WORLD_SCALE, 1.52 * WORLD_SCALE, 2.5 * WORLD_SCALE, 8),
    towerMaterial,
  )
  tower.name = "beacon-tower"
  tower.position.y = 2.35 * WORLD_SCALE

  const towerShadowBand = new THREE.Mesh(
    new THREE.CylinderGeometry(1.23 * WORLD_SCALE, 1.4 * WORLD_SCALE, .18 * WORLD_SCALE, 8),
    darkMetalMaterial,
  )
  towerShadowBand.name = "beacon-shadow-band"
  towerShadowBand.position.y = 1.32 * WORLD_SCALE

  const lowerCollar = new THREE.Mesh(
    new THREE.TorusGeometry(1.32 * WORLD_SCALE, .12 * WORLD_SCALE, 8, 24),
    metalMaterial,
  )
  lowerCollar.name = "beacon-lower-collar"
  lowerCollar.rotation.x = Math.PI / 2
  lowerCollar.position.y = 1.47 * WORLD_SCALE

  const upperCollar = new THREE.Mesh(
    new THREE.TorusGeometry(1.2 * WORLD_SCALE, .15 * WORLD_SCALE, 8, 24),
    metalMaterial,
  )
  upperCollar.name = "beacon-upper-collar"
  upperCollar.rotation.x = Math.PI / 2
  upperCollar.position.y = 3.57 * WORLD_SCALE

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(1.22 * WORLD_SCALE, 1.02 * WORLD_SCALE, .24 * WORLD_SCALE, 8),
    towerMaterial,
  )
  cap.name = "beacon-cap"
  cap.position.y = 3.48 * WORLD_SCALE

  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(.72 * WORLD_SCALE, 1),
    new THREE.MeshStandardMaterial({
      color: 0xffc33f,
      emissive: 0xff9d20,
      emissiveIntensity: .72,
      roughness: .24,
      metalness: .12,
      flatShading: true,
    }),
  )
  core.name = "beacon-core"
  core.position.y = 4.15 * WORLD_SCALE

  const coreGlow = new THREE.Mesh(
    new THREE.SphereGeometry(.48 * WORLD_SCALE, 16, 10),
    new THREE.MeshBasicMaterial({
      color: 0xfff1a6,
      transparent: true,
      opacity: .48,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  coreGlow.name = "beacon-core-glow"
  coreGlow.position.copy(core.position)

  const topRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.02 * WORLD_SCALE, .08 * WORLD_SCALE, 8, 28),
    new THREE.MeshBasicMaterial({color: 0xffe58b, transparent: true, opacity: .48, depthWrite: false}),
  )
  topRing.name = "beacon-top-ring"
  topRing.rotation.x = Math.PI / 2
  topRing.position.y = 4.15 * WORLD_SCALE

  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(1.95 * WORLD_SCALE, 9.2 * WORLD_SCALE, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffdf67,
      transparent: true,
      opacity: .1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  beam.name = "beacon-beam"
  beam.position.y = 8.75 * WORLD_SCALE

  const beamCore = new THREE.Mesh(
    new THREE.ConeGeometry(.88 * WORLD_SCALE, 8.6 * WORLD_SCALE, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2a3,
      transparent: true,
      opacity: .04,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  )
  beamCore.name = "beacon-beam-core"
  beamCore.position.y = 8.55 * WORLD_SCALE

  const groundGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6 * WORLD_SCALE, 2.15 * WORLD_SCALE, .08 * WORLD_SCALE, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffd447,
      transparent: true,
      opacity: .34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  groundGlow.name = "beacon-ground-glow"
  groundGlow.position.y = .48 * WORLD_SCALE

  group.add(
    beam,
    beamCore,
    groundGlow,
    pedestal,
    pedestalInset,
    activationRing,
    pedestalRing,
    base,
    tower,
    towerShadowBand,
    lowerCollar,
    upperCollar,
    cap,
    core,
    coreGlow,
    topRing,
  )
  group.userData.beam = beam
  group.userData.beamCore = beamCore
  group.userData.glow = coreGlow
  group.userData.groundGlow = groundGlow
  group.userData.core = core
  group.userData.crown = core
  group.userData.activationRing = activationRing
  return group
}

const createIslandBridge = () => {
  const group = new THREE.Group()
  group.name = "island-bridge"
  const stone = new THREE.MeshStandardMaterial({
    color: 0x7d8981,
    vertexColors: true,
    roughness: .9,
    metalness: 0,
    flatShading: true,
  })
  const moss = new THREE.MeshStandardMaterial({
    color: 0x5e8e4d,
    roughness: 1,
    flatShading: true,
  })

  for (let index = 0; index < 5; index += 1) {
    const stoneBlock = new THREE.Mesh(
      createStoneBlockGeometry().scale(28 * WORLD_SCALE, .22, 34 * WORLD_SCALE),
      stone,
    )
    stoneBlock.position.set((index - 2) * 29 * WORLD_SCALE, .12, 0)
    stoneBlock.rotation.y = (index - 2) * .025
    stoneBlock.userData.role = "bridge-stone"
    stoneBlock.castShadow = true
    stoneBlock.receiveShadow = true

    const mossPatch = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.8 * WORLD_SCALE, 0),
      moss,
    )
    mossPatch.position.set((index - 2) * 29 * WORLD_SCALE + (index % 2 ? 1 : -1) * WORLD_SCALE, .28, (index % 2 ? 5 : -5) * WORLD_SCALE)
    mossPatch.scale.set(1.5, .34, .72)
    mossPatch.userData.role = "bridge-moss"
    mossPatch.castShadow = true
    mossPatch.receiveShadow = true

    group.add(stoneBlock, mossPatch)
  }
  return group
}

const splitStoneWall = (wall, tileSize) => {
  const cellSize = Math.max(1, Number(tileSize) || DEFAULT_MAP_TILE_SIZE)
  const width = Math.max(0, Number(wall.maxX) - Number(wall.minX))
  const depth = Math.max(0, Number(wall.maxY) - Number(wall.minY))
  const columns = Math.max(1, Math.ceil(width / cellSize))
  const rows = Math.max(1, Math.ceil(depth / cellSize))
  const blocks = []

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const minX = Number(wall.minX) + column * cellSize
      const minY = Number(wall.minY) + row * cellSize
      blocks.push({
        ...wall,
        minX,
        minY,
        maxX: Math.min(Number(wall.maxX), minX + cellSize),
        maxY: Math.min(Number(wall.maxY), minY + cellSize),
      })
    }
  }
  return blocks
}

const expandStoneWalls = (walls, tileSize) =>
  walls.flatMap(wall => splitStoneWall(wall, tileSize))

export const smoothStormRadius = (current, target, delta, speed = 9) => {
  const currentRadius = Number(current)
  const targetRadius = Number(target)
  if (!Number.isFinite(targetRadius)) return Number.isFinite(currentRadius) ? currentRadius : 0
  if (!Number.isFinite(currentRadius)) return targetRadius
  if (Math.abs(targetRadius - currentRadius) < 0.01) return targetRadius
  const blend = 1 - Math.exp(-Math.max(0, Number(delta) || 0) * speed)
  const next = currentRadius + (targetRadius - currentRadius) * blend
  return Math.abs(targetRadius - next) < 0.01 ? targetRadius : next
}

export const updateStormRingGeometry = (geometry, innerRadius, outerRadius) => {
  const position = geometry?.getAttribute?.("position")
  const segments = geometry?.userData?.stormSegments
  if (!position || !Number.isInteger(segments) || segments < 3) return geometry

  for (let index = 0; index <= segments; index++) {
    const angle = index / segments * Math.PI * 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    position.setXYZ(index, cos * innerRadius, sin * innerRadius, 0)
    position.setXYZ(segments + 1 + index, cos * outerRadius, sin * outerRadius, 0)
  }
  position.needsUpdate = true
  geometry.computeBoundingSphere()
  return geometry
}

export const createStormRingGeometry = (innerRadius, outerRadius, segments = STORM_SEGMENTS) => {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array((segments + 1) * 2 * 3)
  const indices = []
  for (let index = 0; index < segments; index++) {
    const inner = index
    const nextInner = index + 1
    const outer = segments + 1 + index
    const nextOuter = segments + 1 + index + 1
    indices.push(inner, outer, nextInner, nextInner, outer, nextOuter)
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.userData.stormSegments = segments
  geometry.userData.outerRadius = outerRadius
  updateStormRingGeometry(geometry, innerRadius, outerRadius)
  return geometry
}

const mergeWalls = walls => [...walls]
  .sort((a, b) => a.type.localeCompare(b.type) || a.minY - b.minY || a.maxY - b.maxY || a.minX - b.minX)
  .reduce((merged, wall) => {
    const previous = merged.at(-1)
    if (previous && wall.type === "water" && previous.type === wall.type && previous.visual === wall.visual && previous.minY === wall.minY &&
      previous.maxY === wall.maxY && Math.abs(previous.maxX - wall.minX) < 0.01) {
      previous.maxX = wall.maxX
    } else {
      merged.push({...wall})
    }
    return merged
  }, [])

const mapWallKey = wall =>
  `${wall.minX}:${wall.minY}:${wall.maxX}:${wall.maxY}:${wall.type}:${wall.visual || ""}`

export const shouldRefreshEnvironmentFocus = (previous, next, distance = ENVIRONMENT_FOCUS_REBUILD_DISTANCE) => {
  if (!previous) return true
  const dx = Number(next?.x) - Number(previous.x)
  const dy = Number(next?.y) - Number(previous.y)
  const threshold = Number(distance)
  return Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(threshold) &&
    Math.hypot(dx, dy) >= Math.max(0, threshold)
}

export class MapRenderer {
  constructor(root, {waterTexture = null} = {}) {
    this.root = root
    this.ground = new GroundRenderer(root)
    this.waterTexture = waterTexture || createWaterTexture()
    this.objects = new Map()
    this.debris = []
    this.signature = ""
    this.stormMesh = null
    this.stormRadius = 0
    this.stormTargetRadius = 0
    this.phaseAtmosphere = null
    this.beaconGroup = null
    this.islandTerrain = null
    this.mapState = null
    this.focus = null
    this.bushVisuals = new Map()
    this.wildflowerField = null
    this.objectiveObjects = new Map()
    this.featureObjects = new Map()
  }

  syncIsland(game, width, height) {
    const teamBattle = isTeamBattleMode(game?.mode)
    const isFirstTrial = !teamBattle && game?.islandName === "Остров Первого Испытания"
    const themeChanged = (this.ground.theme === "island") !== isFirstTrial
    this.ground.setTheme(isFirstTrial ? "island" : "default")
    if (themeChanged && this.mapState) this.syncWildflowers()
    this.syncIslandTerrain(isFirstTrial, width, height)
    this.syncPhaseAtmosphere(teamBattle ? "" : game?.phase, width, height)
    const stormRadius = teamBattle ? 0 : Number(game?.stormRadius) || 0
    if (stormRadius > 0) {
      const outerRadius = Math.hypot(width, height) * 0.5 * WORLD_SCALE
      const mapKey = `${width}:${height}:${outerRadius}`
      if (!this.stormMesh || this.stormMesh.userData.mapKey !== mapKey) {
        if (this.stormMesh) {
          this.root.remove(this.stormMesh)
          disposeObjectTree(this.stormMesh)
        }
        this.stormMesh = new THREE.Mesh(
          createStormRingGeometry(stormRadius * WORLD_SCALE, outerRadius),
          new THREE.MeshBasicMaterial({color: 0x5a174f, transparent: true, opacity: .48, depthTest: false, depthWrite: false, side: THREE.DoubleSide}),
        )
        this.stormMesh.rotation.x = -Math.PI / 2
        this.stormMesh.position.set(width * WORLD_SCALE * .5, .04, height * WORLD_SCALE * .5)
        this.stormMesh.renderOrder = 8
        this.stormMesh.userData.mapKey = mapKey
        this.stormMesh.userData.role = "storm-overlay"
        this.stormRadius = stormRadius
        this.root.add(this.stormMesh)
      }
      this.stormTargetRadius = stormRadius
    } else if (this.stormMesh) {
      this.root.remove(this.stormMesh)
      disposeObjectTree(this.stormMesh)
      this.stormMesh = null
      this.stormRadius = 0
      this.stormTargetRadius = 0
    }

    if (isFirstTrial) {
      if (!this.beaconGroup) {
        const group = createBeaconVisual()
        group.userData.open = false
        group.position.set(width * WORLD_SCALE * .5, 0, height * WORLD_SCALE * .5)
        this.beaconGroup = group
        this.root.add(group)
      }
      this.beaconGroup.position.set(width * WORLD_SCALE * .5, this.beaconGroup.position.y, height * WORLD_SCALE * .5)
      this.beaconGroup.visible = true
      const open = Boolean(game?.beaconOpen)
      const data = this.beaconGroup.userData
      data.open = open
      if (data.beam) data.beam.material.opacity = open ? .32 : .1
      if (data.beamCore) data.beamCore.material.opacity = open ? .16 : .04
      if (data.glow) data.glow.material.opacity = open ? .78 : .48
      if (data.groundGlow) data.groundGlow.material.opacity = open ? .58 : .34
      if (data.core) {
        data.core.material.emissiveIntensity = open ? 1.8 : .72
        data.core.scale.setScalar(open ? 1.12 : 1)
      }
      if (data.activationRing) data.activationRing.material.opacity = open ? .66 : .22
    } else if (this.beaconGroup) {
      this.beaconGroup.visible = false
    }
  }

  syncPhaseAtmosphere(phase, width, height) {
    const atmosphere = ISLAND_PHASE_ATMOSPHERES[phase]
    if (!atmosphere) {
      if (this.phaseAtmosphere) this.phaseAtmosphere.visible = false
      return
    }

    const sceneWidth = width * WORLD_SCALE
    const sceneHeight = height * WORLD_SCALE
    const mapKey = `${sceneWidth}:${sceneHeight}`
    if (!this.phaseAtmosphere || this.phaseAtmosphere.userData.mapKey !== mapKey) {
      if (this.phaseAtmosphere) {
        this.root.remove(this.phaseAtmosphere)
        disposeObjectTree(this.phaseAtmosphere)
      }
      const material = new THREE.MeshBasicMaterial({
        color: atmosphere.color,
        transparent: true,
        opacity: atmosphere.opacity,
        depthTest: false,
        depthWrite: false,
      })
      this.phaseAtmosphere = new THREE.Mesh(new THREE.PlaneGeometry(sceneWidth, sceneHeight), material)
      this.phaseAtmosphere.rotation.x = -Math.PI / 2
      this.phaseAtmosphere.position.set(sceneWidth / 2, .065, sceneHeight / 2)
      this.phaseAtmosphere.renderOrder = 7
      this.phaseAtmosphere.userData.mapKey = mapKey
      this.phaseAtmosphere.userData.role = "phase-atmosphere"
      this.root.add(this.phaseAtmosphere)
    }
    this.phaseAtmosphere.visible = true
    this.phaseAtmosphere.material.color.setHex(atmosphere.color)
    this.phaseAtmosphere.material.opacity = atmosphere.opacity
  }

  syncIslandTerrain(island, width, height) {
    if (!island) {
      if (this.islandTerrain) this.islandTerrain.visible = false
      return
    }
    if (!this.islandTerrain) {
      const group = new THREE.Group()
      const outerIslandRadius = width * .5 * WORLD_SCALE * .9
      const forestRadius = width * .5 * WORLD_SCALE * .68
      const plazaRadius = 205 * WORLD_SCALE
      const terrainMaterial = color => new THREE.MeshStandardMaterial({
        color,
        map: this.ground.texture,
        roughness: 1,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
      // Keep the decorative terrain surfaces adjacent instead of stacking
      // full discs. Overlapping coplanar CircleGeometry faces depth-fight and
      // show radial wedges across the playable map.
      const waterRing = new THREE.Mesh(new THREE.RingGeometry(forestRadius, outerIslandRadius, 96), terrainMaterial(0x4f9b50))
      const forest = new THREE.Mesh(new THREE.RingGeometry(plazaRadius, forestRadius, 96), terrainMaterial(0x438e48))
      const plaza = new THREE.Mesh(new THREE.CircleGeometry(plazaRadius, 64), terrainMaterial(0x57616a))
      ;[waterRing, forest, plaza].forEach((mesh, index) => {
        mesh.rotation.x = -Math.PI / 2
        mesh.position.y = ISLAND_TERRAIN_LAYER_HEIGHTS[index]
        mesh.receiveShadow = true
        group.add(mesh)
      })
      const bridgeNorth = createIslandBridge()
      const bridgeSouth = createIslandBridge()
      bridgeNorth.position.set(0, 0, -205 * WORLD_SCALE)
      bridgeSouth.position.set(0, 0, 205 * WORLD_SCALE)
      group.add(bridgeNorth, bridgeSouth)
      group.position.set(width * WORLD_SCALE * .5, 0, height * WORLD_SCALE * .5)
      this.islandTerrain = group
      this.root.add(group)
    }
    this.islandTerrain.visible = true
  }

  syncWildflowers() {
    if (this.wildflowerField) {
      this.root.remove(this.wildflowerField)
      disposeObjectTree(this.wildflowerField)
      this.wildflowerField = null
    }
    if (this.ground.theme === "island" && this.mapState) {
      this.wildflowerField = createWildflowerField(this.mapState)
      this.root.add(this.wildflowerField)
    }
  }

  sync(map) {
    if (!map) return
    this.mapState = map
    this.syncFeatures(map.features)
    const walls = map.walls || []
    const signature = createMapSignature(map)
    if (signature === this.signature) return
    this.signature = signature
    this.ground.sync(map.width, map.height, this.ground.theme, walls.filter(wall => wall.type === "water"))
    this.syncWildflowers()

    const active = new Set()
    const bushWalls = walls.filter(wall => wall.type === "bush" || wall.type === "half" || wall.type === "moon_mist")
    // Gameplay bushes stay in one shared procedural field. Environment GLBs
    // are intentionally reserved for heroes and are never mounted here.
    const bushGroups = bushWalls.reduce((groups, wall) => {
      const kind = wall.type === "moon_mist" ? "moon_mist" : "bush"
      groups[kind] = groups[kind] || []
      groups[kind].push(wall)
      return groups
    }, {})
    Object.entries(bushGroups).forEach(([kind, kindWalls]) => {
      splitBushWallComponents(kindWalls).forEach(component => {
        const key = `${kind}:${component.map(wall =>
          `${wall.minX}:${wall.minY}:${wall.maxX}:${wall.maxY}:${wall.visual || ""}`).join("|")}`
        active.add(key)
        if (!this.objects.has(key)) {
          this.add(key, createBushField(component, kind), component)
        }
      })
    })
    const nonBushWalls = walls.filter(wall => wall.type !== "bush" && wall.type !== "half" && wall.type !== "moon_mist" && wall.type !== "river" && wall.type !== "river_bridge" && !COLLISION_ONLY_TYPES.has(wall.type))
    const renderWalls = [
      ...mergeWalls(nonBushWalls.filter(wall => wall.type === "water")),
      ...nonBushWalls.filter(wall => wall.type !== "water" && !STONE_PROP_TYPES.has(wall.type)),
      ...expandStoneWalls(nonBushWalls.filter(wall => STONE_PROP_TYPES.has(wall.type)), map.tileSize),
    ]
    renderWalls.forEach((wall, index) => {
      const key = mapWallKey(wall)
      active.add(key)
      if (!this.objects.has(key)) {
        this.add(key, createProp(wall, index, this.waterTexture))
      }
    })
    this.objects.forEach((object, key) => {
      if (active.has(key)) return
      this.objects.delete(key)
      this.bushVisuals.delete(key)
      this.debris.push({object, age: 0, life: 0.28, baseY: object.position.y})
    })
  }

  syncObjectives(objectives) {
    const incoming = Array.isArray(objectives) ? objectives : []
    const active = new Set()
    const towersAlive = new Set(incoming
      .filter(objective => objective?.type === "tower" && Number(objective.lives) > 0)
      .map(objective => String(objective.team)))
    incoming.forEach(objective => {
      if (!objective?.id) return
      active.add(String(objective.id))
      let object = this.objectiveObjects.get(String(objective.id))
      if (!object) {
        object = createObjectiveVisual(objective)
        this.objectiveObjects.set(String(objective.id), object)
        this.root.add(object)
      }
      const material = object.userData.objectiveMaterial
      const maxLives = Math.max(1, Number(objective.maxLives) || 1)
      const lives = Math.max(0, Number(objective.lives) || 0)
      const ratio = objectiveHealthFraction(lives, maxLives)
      object.visible = true
      const visualScale = .82 + ratio * .18
      object.scale.setScalar(visualScale)
      if (object.userData.objectiveRangeRing) object.userData.objectiveRangeRing.scale.setScalar(1 / visualScale)
      if (object.userData.objectiveRangeRing?.material) object.userData.objectiveRangeRing.material.opacity = lives > 0 ? .12 : 0
      if (object.userData.objectiveHealthBar) {
        const badgeScale = Number(object.userData.objectiveHealthBar.userData.baseScale) || 1
        object.userData.objectiveHealthBar.scale.setScalar(badgeScale / visualScale)
        object.userData.objectiveHealthFill.scale.x = object.userData.objectiveHealthFill.userData.fullWidth * ratio
        updateObjectiveHealthLabel(object.userData.objectiveHealthLabel, objective)
      }
      if (object.userData.objectiveProtection) {
        const protectedHall = objective.type === "town_hall" && lives > 0 && towersAlive.has(String(objective.team))
        object.userData.objectiveProtection.visible = protectedHall
        object.userData.objectiveProtection.scale.setScalar(1 / visualScale)
      }
      setObjectiveBrokenState(object, lives <= 0)
      if (material) material.emissive?.setHex?.(String(objective.team) === "Blue" ? 0x102f68 : 0x651622)
      object.userData.objectiveState = objective
      object.userData.objectiveProtected = objective.type === "town_hall" && towersAlive.has(String(objective.team))
    })
    this.objectiveObjects.forEach((object, id) => {
      if (active.has(id)) return
      this.root.remove(object)
      disposeObjectTree(object)
      this.objectiveObjects.delete(id)
    })
  }

  syncFeatures(features) {
    const incoming = Array.isArray(features) ? features : []
    const active = new Set()
    incoming.forEach(feature => {
      if (!feature?.id || !feature?.type) return
      const id = String(feature.id)
      active.add(id)
      if (!this.featureObjects.has(id)) {
        const object = createTeamFeatureVisual(feature)
        this.featureObjects.set(id, object)
        this.root.add(object)
      }
    })
    this.featureObjects.forEach((object, id) => {
      if (active.has(id)) return
      this.root.remove(object)
      disposeObjectTree(object)
      this.featureObjects.delete(id)
    })
  }

  add(key, object, bushWalls = null) {
    this.objects.set(key, object)
    this.root.add(object)
    const walls = bushWalls || object?.userData?.bushWalls
    if (Array.isArray(walls) && walls.length) {
      object.userData.bushWalls = walls
      this.bushVisuals.set(key, {object, walls})
    }
  }

  setFocus(x, y) {
    const next = {x: Number(x), y: Number(y)}
    if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) return
    this.focus = next
  }

  isReady() {
    return true
  }

  createBushFallback(wall) {
    const width = wall.maxX - wall.minX
    const depth = wall.maxY - wall.minY
    const group = new THREE.Group()
    group.position.set(
      (wall.minX + wall.maxX) * 0.5 * WORLD_SCALE,
      0,
      (wall.minY + wall.maxY) * 0.5 * WORLD_SCALE,
    )
    group.add(createBushField([{minX: -width / 2, minY: -depth / 2, maxX: width / 2, maxY: depth / 2}], wall.type))
    group.userData.bushWalls = [wall]
    return group
  }

  update(delta) {
    this.waterTexture.offset.add({x: delta * 0.035, y: delta * 0.018})
    for (const [key, entry] of this.bushVisuals) {
      if (this.objects.get(key) !== entry.object) {
        this.bushVisuals.delete(key)
        continue
      }
      setBushVisibilityOpacity(
        entry.object,
        getBushVisibilityOpacity(this.focus, entry.walls),
        this.focus,
      )
    }
    if (this.stormMesh) {
      this.stormRadius = smoothStormRadius(this.stormRadius, this.stormTargetRadius, delta)
      updateStormRingGeometry(this.stormMesh.geometry, this.stormRadius * WORLD_SCALE, this.stormMesh.geometry.userData.outerRadius)
    }
    if (this.beaconGroup) {
      this.beaconGroup.position.y = Math.sin(performance.now() / 300) * .015
      const data = this.beaconGroup.userData
      const pulse = Math.sin(performance.now() / 180) * (data.open ? .08 : .025)
      if (data.core) {
        data.core.rotation.y += delta * 1.8
        data.core.rotation.x += delta * .45
        data.core.scale.setScalar((data.open ? 1.12 : 1) + pulse)
      }
      if (data.glow) data.glow.scale.setScalar(1 + pulse * 1.8)
      if (data.activationRing) data.activationRing.rotation.z += delta * (data.open ? .7 : .25)
    }
    for (const piece of this.debris) {
      piece.age += delta
      const progress = Math.min(1, piece.age / piece.life)
      piece.object.scale.setScalar(1 - progress)
      piece.object.rotation.y += delta * 8
      piece.object.position.y = piece.baseY + Math.sin(progress * Math.PI) * 0.45
      if (piece.age >= piece.life) {
        this.root.remove(piece.object)
        disposeObjectTree(piece.object)
      }
    }
    this.debris = this.debris.filter(piece => piece.age < piece.life)
  }

  dispose() {
    if (this.stormMesh) disposeObjectTree(this.stormMesh)
    if (this.phaseAtmosphere) disposeObjectTree(this.phaseAtmosphere)
    if (this.beaconGroup) disposeObjectTree(this.beaconGroup)
    this.featureObjects.forEach(object => disposeObjectTree(object))
    this.featureObjects.clear()
    if (this.islandTerrain) disposeObjectTree(this.islandTerrain)
    if (this.wildflowerField) disposeObjectTree(this.wildflowerField)
    this.objectiveObjects.forEach(object => disposeObjectTree(object))
    this.objectiveObjects.clear()
    this.bushVisuals.clear()
    this.waterTexture.dispose()
  }
}
