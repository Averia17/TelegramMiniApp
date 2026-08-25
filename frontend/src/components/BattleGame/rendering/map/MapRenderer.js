import * as THREE from "three"
import {mergeGeometries} from "three/addons/utils/BufferGeometryUtils.js"
import {
  BUSH_VISIBILITY_FOCUS_EPSILON,
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
import {battleCanvasFont, getBattleHealthFontSize} from "../../battleTypography.js"
import {isTeamBattleMode} from "../../battleMode.js"

const ISLAND_TERRAIN_LAYER_HEIGHTS = [0.003, 0.006, 0.009]
const STORM_SEGMENTS = 96
const CONTACT_SHADOW_SEGMENTS = 20
const STATIC_BATCH_CELL_SIZE = 512
// Rebuilds dispose and recreate instanced environment batches. Keep this
// coarse so ordinary movement never turns into a stream of scene rebuilds.
const ENVIRONMENT_FOCUS_REBUILD_DISTANCE = 256
const STONE_PROP_TYPES = new Set(["wall", "destructible", "sacrificial_stone", "menhir"])
const COLLISION_ONLY_TYPES = new Set(["objective", "beacon"])
const DEFAULT_MAP_TILE_SIZE = 40
const BEACON_VISUAL_SCALE = 24
const OBJECTIVE_HEALTH_FONT_SIZE = getBattleHealthFontSize({canvasHeight: 80, spriteHeight: .62, parentScale: 1.75})

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
  context.font = battleCanvasFont(900, OBJECTIVE_HEALTH_FONT_SIZE)
  context.lineWidth = Math.max(5, Math.round(OBJECTIVE_HEALTH_FONT_SIZE * .32))
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
    new THREE.SphereGeometry(4.45, 8, 4),
    new THREE.MeshBasicMaterial({color: 0x8fe7ff, transparent: true, opacity: .018, wireframe: true, depthTest: false, depthWrite: false}),
  )
  shield.name = "town-hall-protected-shield"
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.15, .1, 8, 32),
    new THREE.MeshBasicMaterial({color: 0xd8f7ff, transparent: true, opacity: .72, depthTest: false, depthWrite: false}),
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
    context.font = battleCanvasFont(900, 36)
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
  const material = new THREE.MeshStandardMaterial({color, roughness: .78, metalness: .08, flatShading: true})
  const plaster = new THREE.MeshStandardMaterial({color: blue ? 0x9ca9aa : 0xa58b83, roughness: .96, flatShading: true})
  const timber = new THREE.MeshStandardMaterial({color: blue ? 0x4e4035 : 0x55342e, roughness: .98, flatShading: true})
  const roofMaterial = new THREE.MeshStandardMaterial({color: blue ? 0x3d4e56 : 0x543536, roughness: .98, flatShading: true})
  const stone = new THREE.MeshStandardMaterial({color: blue ? 0x46545a : 0x584448, roughness: .98, flatShading: true})
  const stoneLight = new THREE.MeshStandardMaterial({color: blue ? 0x697477 : 0x77585a, roughness: .98, flatShading: true})
  const windowMaterial = new THREE.MeshStandardMaterial({color: blue ? 0x102d38 : 0x301d27, roughness: .62, metalness: .08, flatShading: true})
  const accent = new THREE.MeshStandardMaterial({color: blue ? 0x78bdff : 0xff8790, roughness: .74, flatShading: true})
  const addPart = (parent, geometry, partMaterial, name, position, rotation = null) => {
    const part = new THREE.Mesh(geometry, partMaterial)
    part.name = name
    part.position.copy(position)
    if (rotation) part.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0)
    part.castShadow = true
    part.receiveShadow = true
    part.renderOrder = 38
    parent.add(part)
    return part
  }
  const hall = objective.type === "town_hall"
  const health = createObjectiveHealthBadge(blue ? 0x4b9dff : 0xff5f6d)
  health.group.position.y = hall ? 5.55 : 4.82
  const protection = hall ? createProtectionBadge(color) : null
  if (protection) group.add(protection)
  group.add(health.group)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(hall ? 3.8 : 1.85, hall ? 4.35 : 2.25, hall ? .72 : .55, hall ? 8 : 8), stone)
  base.position.y = hall ? .36 : .28
  base.name = hall ? "team-town-hall-foundation" : "team-tower-foundation"
  if (hall) {
    const house = new THREE.Group()
    house.name = "team-town-hall-house"
    house.position.y = 1.68
    addPart(house, new THREE.BoxGeometry(4.9, 2.25, 3.75), plaster, "team-town-hall-plaster", new THREE.Vector3(0, 0, 0))
    addPart(house, new THREE.BoxGeometry(5.05, .16, .18), timber, "team-town-hall-timber", new THREE.Vector3(0, .54, -1.94))
    addPart(house, new THREE.BoxGeometry(5.05, .16, .18), timber, "team-town-hall-timber", new THREE.Vector3(0, -.42, -1.94))
    addPart(house, new THREE.BoxGeometry(.18, 2.18, .18), timber, "team-town-hall-timber", new THREE.Vector3(-2.22, 0, -1.94))
    addPart(house, new THREE.BoxGeometry(.18, 2.18, .18), timber, "team-town-hall-timber", new THREE.Vector3(2.22, 0, -1.94))
    addPart(house, new THREE.BoxGeometry(.18, 2.18, .18), timber, "team-town-hall-timber", new THREE.Vector3(0, 0, -1.96), new THREE.Euler(0, 0, -.3))
    addPart(house, new THREE.BoxGeometry(.8, 1.05, .12), timber, "team-town-hall-door", new THREE.Vector3(0, -.55, -1.98))
    addPart(house, new THREE.BoxGeometry(.48, .64, .06), windowMaterial, "team-town-hall-window", new THREE.Vector3(-1.35, .18, -1.99))
    addPart(house, new THREE.BoxGeometry(.48, .64, .06), windowMaterial, "team-town-hall-window", new THREE.Vector3(1.35, .18, -1.99))
    addPart(house, new THREE.BoxGeometry(.58, .06, .08), accent, "team-town-hall-banner", new THREE.Vector3(0, 1.02, -2.02))
    addPart(house, new THREE.CylinderGeometry(.035, .045, 1.35, 6), timber, "team-town-hall-banner", new THREE.Vector3(0, 1.48, -2.02))
    addPart(house, new THREE.BoxGeometry(.5, .48, .06), accent, "team-town-hall-banner", new THREE.Vector3(.18, 1.34, -2.02), new THREE.Euler(0, 0, -.08))
    addPart(house, new THREE.CylinderGeometry(.28, .34, .72, 6), stoneLight, "team-town-hall-chimney", new THREE.Vector3(1.45, 1.48, .55))
    const roof = new THREE.Group()
    roof.name = "team-town-hall-roof"
    roof.position.y = 3.18
    addPart(roof, new THREE.BoxGeometry(2.65, .22, 4.35), roofMaterial, "team-town-hall-roof-slope", new THREE.Vector3(-1.15, .34, 0), new THREE.Euler(0, 0, -.52))
    addPart(roof, new THREE.BoxGeometry(2.65, .22, 4.35), roofMaterial, "team-town-hall-roof-slope", new THREE.Vector3(1.15, .34, 0), new THREE.Euler(0, 0, .52))
    addPart(roof, new THREE.BoxGeometry(.22, .22, 4.2), timber, "team-town-hall-roof-ridge", new THREE.Vector3(0, 1.03, 0))
    addPart(roof, new THREE.BoxGeometry(.48, .12, 1.25), stoneLight, "team-town-hall-roof-debris", new THREE.Vector3(-1.5, .55, -.65), new THREE.Euler(0, 0, .18))
    house.name = "team-town-hall-house"
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.55, .12, 8, 24), new THREE.MeshBasicMaterial({color, transparent: true, opacity: .7, depthWrite: false}))
    ring.rotation.x = Math.PI / 2
    ring.position.y = .8
    ring.name = "team-town-hall-ring"
    group.add(base, house, roof, ring)
  } else {
    const shaft = new THREE.Group()
    addPart(shaft, new THREE.CylinderGeometry(1.25, 1.55, 2.5, 8), stone, "team-tower-stone", new THREE.Vector3(0, 0, 0))
    addPart(shaft, new THREE.CylinderGeometry(1.38, 1.48, .18, 8), stoneLight, "team-tower-balcony", new THREE.Vector3(0, .84, 0))
    for (const x of [-.58, .58]) addPart(shaft, new THREE.BoxGeometry(.22, .16, .35), timber, "team-tower-battlement", new THREE.Vector3(x, 1.29, -1.06))
    for (const x of [-.58, .58]) addPart(shaft, new THREE.BoxGeometry(.22, .16, .35), timber, "team-tower-battlement", new THREE.Vector3(x, 1.29, 1.06))
    addPart(shaft, new THREE.BoxGeometry(.28, .64, .06), windowMaterial, "team-tower-window", new THREE.Vector3(0, .3, -1.36))
    addPart(shaft, new THREE.BoxGeometry(.28, .64, .06), windowMaterial, "team-tower-window", new THREE.Vector3(0, -.78, -1.38))
    addPart(shaft, new THREE.CylinderGeometry(.035, .045, 1.2, 6), timber, "team-tower-banner", new THREE.Vector3(.82, 2.12, -.15))
    addPart(shaft, new THREE.BoxGeometry(.48, .38, .06), accent, "team-tower-banner", new THREE.Vector3(.82, 2.35, -.15), new THREE.Euler(0, 0, -.08))
    shaft.position.y = 1.55
    shaft.name = "team-tower-shaft"
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.45, 6), roofMaterial)
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
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.64, .09, 6, 16), new THREE.MeshBasicMaterial({color, transparent: true, opacity: .8, depthWrite: false}))
    band.rotation.x = Math.PI / 2
    band.position.y = .84
    band.name = "team-tower-band"
    group.add(band)
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
  // Both banks widen into estuary mouths. Keep the endpoint inside the
  // island's shoreline; the outer water ring owns the ocean beyond it.
  [-94, 3.65], [-84, 3.25], [-72, 2.9], [-60, 2.6], [-48, 2.3], [-36, 2.45],
  [-24, 2.2], [-12, 2.4], [0, 2.2], [12, 2.4], [24, 2.2], [36, 2.45], [48, 2.3],
  [60, 2.6], [72, 2.9], [84, 3.25], [94, 3.65],
]

const riverBankGeometry = extra => shapeGeometry([
  ...riverProfile.map(([x, width]) => [x, width + extra]),
  ...[...riverProfile].reverse().map(([x, width]) => [x, -width - extra]),
])

const setMapRenderLayer = (object, renderOrder) => {
  object.renderOrder = renderOrder
  return object
}

const createBaseFeaturePart = (group, geometry, material, role, position, rotation = null) => {
  const part = new THREE.Mesh(geometry, material)
  part.position.copy(position)
  if (rotation) part.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0)
  part.userData.role = role
  part.castShadow = true
  part.receiveShadow = true
  part.renderOrder = 38
  group.add(part)
  return part
}

const createBaseWellVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const stone = new THREE.MeshStandardMaterial({color: 0x65706d, roughness: .98, flatShading: true})
  const stoneLight = new THREE.MeshStandardMaterial({color: 0x8a8b77, roughness: .98, flatShading: true})
  const wood = new THREE.MeshStandardMaterial({color: 0x60412f, roughness: .98, flatShading: true})
  const iron = new THREE.MeshStandardMaterial({color: 0x3d4140, roughness: .72, metalness: .2, flatShading: true})
  createBaseFeaturePart(group, new THREE.CylinderGeometry(1.05, 1.18, .28, 10), stone, "base-well-stone", new THREE.Vector3(0, .14, 0))
  createBaseFeaturePart(group, new THREE.TorusGeometry(.88, .16, 5, 10), stoneLight, "base-well-stone", new THREE.Vector3(0, .34, 0), new THREE.Euler(Math.PI / 2, 0, 0))
  for (const x of [-.78, .78]) createBaseFeaturePart(group, new THREE.CylinderGeometry(.09, .12, 1.8, 6), wood, "base-well-crank", new THREE.Vector3(x, 1.05, 0))
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.85, .1, .12), wood, "base-well-crank", new THREE.Vector3(0, 1.92, 0))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.055, .055, 1.05, 6), iron, "base-well-crank", new THREE.Vector3(0, 1.2, 0))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.22, .28, .42, 8), wood, "base-well-bucket", new THREE.Vector3(0, .72, -.38))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.3, .3, .05, 8), iron, "base-well-bucket", new THREE.Vector3(0, .94, -.38))
  return group
}

const createBaseWorkshopVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const wood = new THREE.MeshStandardMaterial({color: 0x5c402e, roughness: 1, flatShading: true})
  const roof = new THREE.MeshStandardMaterial({color: 0x6b5541, roughness: 1, flatShading: true})
  const stone = new THREE.MeshStandardMaterial({color: 0x6c746c, roughness: .98, flatShading: true})
  const iron = new THREE.MeshStandardMaterial({color: 0x343a39, roughness: .56, metalness: .3, flatShading: true})
  createBaseFeaturePart(group, new THREE.BoxGeometry(3.25, 1.35, 1.55), wood, "base-workshop-frame", new THREE.Vector3(0, .72, 0))
  createBaseFeaturePart(group, new THREE.BoxGeometry(3.65, .18, 1.95), roof, "base-workshop-roof", new THREE.Vector3(0, 1.55, 0), new THREE.Euler(0, 0, -.08))
  for (const x of [-1.35, 1.35]) createBaseFeaturePart(group, new THREE.CylinderGeometry(.09, .11, 1.8, 6), wood, "base-workshop-frame", new THREE.Vector3(x, .9, -.7))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.7, .34, .38), iron, "base-workshop-anvil", new THREE.Vector3(.58, .94, -.88))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.12, .16, .7, 6), iron, "base-workshop-anvil", new THREE.Vector3(.58, .55, -.88))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.42, .48, .7, 10), stone, "base-workshop-barrel", new THREE.Vector3(-.92, .42, -.87))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.5, .5, .35), roof, "base-workshop-crate", new THREE.Vector3(1.15, .28, .72), new THREE.Euler(0, .18, .05))
  createBaseFeaturePart(group, new THREE.ConeGeometry(.16, .48, 6), iron, "base-workshop-chimney", new THREE.Vector3(-1.05, 1.78, .2))
  return group
}

const createBaseWagonVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const wood = new THREE.MeshStandardMaterial({color: 0x6c472d, roughness: 1, flatShading: true})
  const darkWood = new THREE.MeshStandardMaterial({color: 0x493224, roughness: 1, flatShading: true})
  const cloth = new THREE.MeshStandardMaterial({color: 0x8b7560, roughness: 1, flatShading: true})
  createBaseFeaturePart(group, new THREE.BoxGeometry(2.7, .42, 1.35), wood, "base-wagon-body", new THREE.Vector3(0, .68, 0), new THREE.Euler(0, -.08, 0))
  createBaseFeaturePart(group, new THREE.BoxGeometry(2.35, .18, 1.05), cloth, "base-wagon-sack", new THREE.Vector3(.15, 1.03, 0), new THREE.Euler(0, -.08, .08))
  for (const x of [-.94, .94]) {
    const wheel = createBaseFeaturePart(group, new THREE.CylinderGeometry(.48, .48, .18, 10), darkWood, "base-wagon-wheel", new THREE.Vector3(x, .48, -.72), new THREE.Euler(Math.PI / 2, 0, 0))
    wheel.rotation.y = -.08
  }
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.25, .12, .12), darkWood, "base-wagon-pole", new THREE.Vector3(1.72, .65, 0), new THREE.Euler(0, 0, -.08))
  createBaseFeaturePart(group, new THREE.DodecahedronGeometry(.38, 0), cloth, "base-wagon-sack", new THREE.Vector3(-.8, 1.25, .1))
  createBaseFeaturePart(group, new THREE.DodecahedronGeometry(.26, 0), cloth, "base-wagon-sack", new THREE.Vector3(1.05, 1.12, .2))
  return group
}

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
  group.add(setMapRenderLayer(water, 10))

  const shoreMaterial = new THREE.MeshStandardMaterial({color: 0x566248, roughness: .98, flatShading: true})
  const makeShore = side => {
    const shore = new THREE.Mesh(shapeGeometry([
      ...riverProfile.map(([x, width]) => [x, side * width]),
      ...[...riverProfile].reverse().map(([x, width]) => [x, side * (width + 1.15)]),
    ]), shoreMaterial)
    shore.rotation.x = -Math.PI / 2
    shore.position.y = .065
    shore.scale.setScalar(scale)
    shore.name = "team-river-shore"
    return setMapRenderLayer(shore, 20)
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
    group.add(setMapRenderLayer(rock, 35))
  }
  for (const [x, z] of [[-73, -3.3], [-48, 3.25], [-22, -3.25], [2, 3.25], [27, -3.25], [52, 3.25], [76, -3.3]]) {
    const reed = new THREE.Mesh(new THREE.ConeGeometry(.09 * scale, .8 * scale, 5), reedMaterial)
    reed.position.set(x * scale, .4 * scale, z * scale)
    reed.rotation.z = (x % 2 ? -.18 : .16)
    reed.name = "team-river-reed"
    group.add(setMapRenderLayer(reed, 35))
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
  group.add(setMapRenderLayer(deck, 50))
  for (let index = -2; index <= 2; index += 1) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(4.25 * scale, .12 * scale, .82 * scale), plank)
    board.position.set(0, .41 * scale, index * 1.55 * scale)
    board.name = "team-river-bridge-plank"
    group.add(setMapRenderLayer(board, 55))
  }
  for (const z of [-3.35, 3.35]) {
    const support = new THREE.Mesh(new THREE.DodecahedronGeometry(.72 * scale, 0), stone)
    support.position.set(0, -.08 * scale, z * scale)
    support.scale.set(1.35, .55, .85)
    support.name = "team-river-bridge-stone"
    group.add(setMapRenderLayer(support, 15))
  }
  for (const x of [-2.05, 2.05]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.14 * scale, .13 * scale, 7.2 * scale), wood)
    rail.position.set(x * scale, .92 * scale, 0)
    rail.name = "team-river-bridge-rail"
    group.add(setMapRenderLayer(rail, 60))
    for (const z of [-3.1, 0, 3.1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.12 * scale, .14 * scale, 1.15 * scale, 6), wood)
      post.position.set(x * scale, .58 * scale, z * scale)
      post.name = "team-river-bridge-post"
      group.add(setMapRenderLayer(post, 60))
    }
  }
  return group
}

const createPondVisual = scale => {
  const group = new THREE.Group()
  const shoreMaterial = new THREE.MeshStandardMaterial({color: 0x536348, roughness: .98, flatShading: true})
  const waterMaterial = new THREE.MeshStandardMaterial({color: 0x3f9aa4, roughness: .74, transparent: true, opacity: .86, flatShading: true})
  const pondShape = [
    [-8.5, -2.2], [-6.3, -5.2], [-1.3, -6.1], [4.8, -5.3], [8.1, -2.1],
    [7.5, 2.7], [3.2, 5.2], [-2.8, 5.8], [-7.2, 3.2],
  ]
  const makeSurface = (extra, material, role, y, order) => {
    const points = pondShape.map(([x, z]) => [x * scale + (x < 0 ? -extra : extra), z * scale + (z < 0 ? -extra : extra)])
    const surface = new THREE.Mesh(shapeGeometry(points), material)
    surface.rotation.x = -Math.PI / 2
    surface.position.y = y
    surface.name = role
    group.add(setMapRenderLayer(surface, order))
  }
  makeSurface(.45, shoreMaterial, "team-pond-shore", .045, 8)
  makeSurface(0, waterMaterial, "team-pond-water", .06, 12)
  const reedMaterial = new THREE.MeshStandardMaterial({color: 0x386d43, roughness: 1, flatShading: true})
  for (const [x, z, lean] of [[-6.7, 2.5, -.18], [5.8, -2.4, .16], [1.8, 4.8, -.12]]) {
    const reed = new THREE.Mesh(new THREE.ConeGeometry(.1 * scale, .82 * scale, 5), reedMaterial)
    reed.position.set(x * scale, .42 * scale, z * scale)
    reed.rotation.z = lean
    reed.name = "team-pond-reed"
    group.add(setMapRenderLayer(reed, 25))
  }
  return group
}

const CITY_CELL = DEFAULT_MAP_TILE_SIZE * WORLD_SCALE

const cityMaterial = (color, options = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: .9,
  metalness: .02,
  flatShading: true,
  ...options,
})

const addCityPart = (group, geometry, material, role, position, name = "") => {
  const part = new THREE.Mesh(geometry, material)
  part.position.copy(position)
  part.castShadow = true
  part.receiveShadow = true
  part.renderOrder = 35
  part.userData.role = role
  if (name) part.name = name
  group.add(part)
  return part
}

const addCityWindowFrame = (group, x, y, z, width, height, frame, depth = .08) => {
  addCityPart(group, new THREE.BoxGeometry(width + .12, .07, depth), frame, "city-window-frame", new THREE.Vector3(x, y - height / 2, z))
  addCityPart(group, new THREE.BoxGeometry(width + .12, .07, depth), frame, "city-window-frame", new THREE.Vector3(x, y + height / 2, z))
  addCityPart(group, new THREE.BoxGeometry(.07, height, depth), frame, "city-window-frame", new THREE.Vector3(x - width / 2, y, z))
  addCityPart(group, new THREE.BoxGeometry(.07, height, depth), frame, "city-window-frame", new THREE.Vector3(x + width / 2, y, z))
  const mullion = addCityPart(group, new THREE.BoxGeometry(.045, height * .9, depth * 1.2), frame, "city-window-frame", new THREE.Vector3(x, y, z - .01))
  mullion.rotation.z = .05
}

const addCityIvy = (group, x, z, height, material, leafMaterial, variant) => {
  const vine = addCityPart(group, new THREE.CylinderGeometry(.035, .055, height, 5), material, "city-ivy", new THREE.Vector3(x, height / 2 + .22, z))
  vine.rotation.z = ((variant % 3) - 1) * .1
  for (let index = 0; index < 5; index += 1) {
    const leaf = addCityPart(
      group,
      new THREE.IcosahedronGeometry(.13 + (index % 2) * .035, 0),
      leafMaterial,
      "city-ivy-leaf",
      new THREE.Vector3(x + Math.sin(index * 2.2 + variant) * .16, .35 + index * height / 5.8, z + Math.cos(index * 1.7 + variant) * .12),
    )
    leaf.scale.set(1.25, .7, .7)
    leaf.rotation.set(index * .4, index * .6, index * .3)
  }
}

const cityBuildingArchetype = id => {
  const normalized = String(id || "").replace(/-mirror$/, "")
  if (normalized.includes("market")) return "market"
  if (normalized.includes("apartments")) return "apartments"
  if (normalized.includes("north-gate")) return "north_gate"
  if (normalized.includes("south-ward")) return "south_ward"
  return "depot"
}

const CITY_BUILDING_PROFILES = {
  // The depot is a small ruined loading house, not the generic oversized
  // gable that made the old city read as a pile of roofs from the battle cam.
  depot: {width: 2.72, depth: 2.02, wallHeight: 1.9, houseZ: -.42, roof: "warehouse"},
  market: {width: 3.9, depth: 2.2, wallHeight: 2.12, houseZ: -.68, roof: "market"},
  apartments: {width: 2.82, depth: 3.35, wallHeight: 2.65, houseZ: -.58, roof: "tower"},
  north_gate: {width: 4.25, depth: 1.9, wallHeight: 2.45, houseZ: -.72, roof: "gate"},
  south_ward: {width: 3.05, depth: 3.05, wallHeight: 2.18, houseZ: -.52, roof: "collapsed"},
}

// City landmarks are intentionally authored as small readable compositions.
// Each one has a distinct gameplay noun (dock, stalls, gate, homes, forge),
// instead of sharing one oversized house and changing its rotation.
const createReadableCityBuildingVisual = (scale, variant = 0, archetype = "depot") => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const U = CITY_CELL
  const timber = cityMaterial(variant % 2 ? 0x67462f : 0x51372a, {roughness: .98})
  const timberLight = cityMaterial(variant % 2 ? 0x8a5c38 : 0x70482e, {roughness: .98})
  const plaster = cityMaterial(variant % 2 ? 0x9a846d : 0x806d5b, {roughness: 1})
  const stone = cityMaterial(variant % 2 ? 0x77766a : 0x65655d, {roughness: 1})
  const stoneLight = cityMaterial(variant % 2 ? 0xaaa18b : 0x8c8879, {roughness: 1})
  const iron = cityMaterial(variant % 2 ? 0x3f4038 : 0x51483e, {roughness: .92, metalness: .08})
  const thatch = cityMaterial(variant % 2 ? 0x876c4f : 0x6f5a43, {roughness: 1})
  const redCloth = cityMaterial(variant % 2 ? 0x8a5140 : 0x6c4037, {roughness: 1})
  const greenCloth = cityMaterial(variant % 2 ? 0x61764c : 0x4d6543, {roughness: 1})
  const dark = cityMaterial(0x202d31, {roughness: .58})

  const part = (geometry, material, role, x, y, z, rotation = null) => addCityPart(
    group, geometry, material, role, new THREE.Vector3(x, y, z), rotation,
  )
  const roof = (width, depth, x, y, z, material = thatch, tilt = 0, role = "city-roof") => {
    const mesh = part(new THREE.BoxGeometry(width, .18, depth), material, role, x, y, z)
    mesh.rotation.z = tilt
    return mesh
  }
  const rubble = (x, z, size = .2) => part(new THREE.DodecahedronGeometry(size * U, 0), stoneLight, "city-rubble", x * U, .12, z * U)
  const beam = (width, height, depth, material, role, x, y, z, rotation = null) => part(new THREE.BoxGeometry(width, height, depth), material, role, x, y, z, rotation)

  if (archetype === "market") {
    // An open market court: three independent stalls create negative space
    // and a central landmark, so the player can still fight through it.
    part(new THREE.CylinderGeometry(1.0 * U, 1.08 * U, .28, 8), stone, "city-market-court", 0, .14, 0)
    part(new THREE.CylinderGeometry(.65 * U, .72 * U, .42, 8), stoneLight, "city-courtyard-well", 0, .35, 0)
    part(new THREE.TorusGeometry(.56 * U, .06 * U, 6, 10), timber, "city-courtyard-well", 0, .58, 0, new THREE.Euler(Math.PI / 2, 0, 0))
    const stalls = [[-1.35, -.45, redCloth, -.08], [1.25, -.35, greenCloth, .1], [0, 1.15, thatch, 0]]
    stalls.forEach(([x, z, cloth, tilt]) => {
      beam(1.45 * U, .18, .62 * U, timberLight, "city-market-stall", x, .58, z)
      for (const postX of [-.58, .58]) part(new THREE.CylinderGeometry(.045 * U, .06 * U, 1.55, 5), timber, "city-market-stall", (x + postX) * U, 1.28, z)
      roof(1.7 * U, .82 * U, x * U, 2.08, z * U, cloth, tilt, "city-market-canopy")
      part(new THREE.DodecahedronGeometry(.16 * U, 0), variant % 2 ? stoneLight : redCloth, "city-market-goods", (x - .18) * U, .8, (z - .06) * U)
      part(new THREE.DodecahedronGeometry(.12 * U, 0), greenCloth, "city-market-goods", (x + .22) * U, .76, (z + .04) * U)
    })
    beam(.5 * U, .52, .08, redCloth, "city-market-banner", 0, 2.48, -1.58 * U, new THREE.Euler(0, 0, -.08))
    rubble(-2.15, -1.5, .18); rubble(2.1, 1.3, .2)
    return group
  }

  if (archetype === "north_gate") {
    // Gatehouse = two chunky towers plus a deliberately open passage.
    for (const x of [-1.35, 1.35]) {
      part(new THREE.BoxGeometry(.95 * U, 2.55, 1.12 * U), stone, "city-gate-post", x * U, 1.28, 0)
      roof(.98 * U, 1.2 * U, x * U, 2.72, 0, thatch, x < 0 ? -.12 : .12)
      part(new THREE.CylinderGeometry(.11 * U, .14 * U, .56, 7), stoneLight, "city-gate-merlon", x * U, 2.85, -.42 * U)
      part(new THREE.CylinderGeometry(.11 * U, .14 * U, .56, 7), stoneLight, "city-gate-merlon", x * U, 2.85, .42 * U)
    }
    beam(2.25 * U, .46, .42 * U, timber, "city-gate-arch", 0, 2.38, 0)
    for (const x of [-.72, -.36, 0, .36, .72]) beam(.08 * U, 1.05, .08, iron, "city-gate-portcullis", x * U, 1.0, -.34 * U)
    beam(1.7 * U, .08, .08, iron, "city-gate-portcullis", 0, 1.48, -.34 * U)
    for (const x of [-1.82, 1.82]) {
      part(new THREE.CylinderGeometry(.045 * U, .07 * U, 1.15, 6), timber, "city-gate-torch", x * U, .72, -.48 * U)
      part(new THREE.ConeGeometry(.13 * U, .25, 6), redCloth, "city-gate-torch", x * U, 1.42, -.48 * U)
    }
    beam(.78 * U, .42, .08, redCloth, "city-gate-sign", 0, 3.0, -.25 * U)
    rubble(-2.0, .8, .18); rubble(2.05, -.75, .2)
    return group
  }

  if (archetype === "apartments") {
    // Two offset timber homes read as a small lived-in row, not a single box.
    beam(1.65 * U, 2.15, 1.55 * U, plaster, "city-house-body", -.48 * U, 1.08, .05 * U)
    beam(.9 * U, 1.55, 1.2 * U, timber, "city-house-body", 1.0 * U, .8, .38 * U)
    roof(1.78 * U, 1.72 * U, -.48 * U, 2.35, .05 * U, thatch, -.24)
    roof(1.02 * U, 1.28 * U, 1.0 * U, 1.72, .38 * U, redCloth, .18, "city-roof")
    beam(1.55 * U, .14, .55 * U, timberLight, "city-apartment-balcony", -.48 * U, 1.76, -.86 * U)
    beam(1.48 * U, .1, .08, timber, "city-apartment-balcony", -.48 * U, 2.18, -1.14 * U)
    for (const x of [-1.08, -.48, .12]) part(new THREE.CylinderGeometry(.035 * U, .05 * U, .58, 5), timber, "city-apartment-balcony", x * U, 1.98, -1.14 * U)
    for (const x of [-.95, -.05]) beam(.4 * U, .16, .24 * U, greenCloth, "city-apartment-flowerbox", x * U, 2.02, -1.22 * U)
    const ladder = beam(.1 * U, 2.2, .1 * U, timber, "city-apartment-ladder", 1.72 * U, 1.1, .48 * U, new THREE.Euler(0, 0, -.12))
    ladder.rotation.y = .12
    beam(1.7 * U, .04, .04, timber, "city-apartment-clothesline", 0, 2.62, .9 * U, new THREE.Euler(0, 0, .05))
    part(new THREE.BoxGeometry(.34 * U, .32, .06), redCloth, "city-apartment-clothesline", -.4 * U, 2.62, .9 * U)
    part(new THREE.BoxGeometry(.3 * U, .28, .06), greenCloth, "city-apartment-clothesline", .22 * U, 2.62, .9 * U)
    part(new THREE.BoxGeometry(.55 * U, .75, .06), dark, "city-window", -.48 * U, 1.18, -.76 * U)
    rubble(-1.8, 1.2, .2); rubble(1.85, -1.3, .18)
    return group
  }

  if (archetype === "south_ward") {
    // The forge is a low lean-to with an unmistakable hearth and work area.
    beam(2.1 * U, .42, 1.7 * U, stone, "city-forge-foundation", 0, .22, .1 * U)
    beam(1.55 * U, 1.55, .2 * U, plaster, "city-house-body", -.48 * U, .98, .52 * U)
    roof(1.85 * U, 1.3 * U, -.35 * U, 1.88, .1 * U, thatch, -.34)
    beam(1.35 * U, .16, 1.1 * U, timber, "city-forge-canopy", 1.0 * U, 1.56, -.35 * U, new THREE.Euler(0, 0, .12))
    beam(.46 * U, .72, .46 * U, stoneLight, "city-forge-hearth", -.62 * U, .72, -.58 * U)
    beam(.52 * U, .28, .28 * U, iron, "city-forge-anvil", .15 * U, .65, -.72 * U)
    part(new THREE.CylinderGeometry(.09 * U, .13 * U, .62, 6), iron, "city-forge-anvil", .15 * U, .94, -.72 * U)
    beam(.34 * U, .9, .34 * U, iron, "city-chimney", -.58 * U, 2.0, .55 * U)
    for (const x of [.72, 1.05, 1.38]) beam(.55 * U, .3, .24 * U, timberLight, "city-forge-woodpile", x * U, .48, .72 * U, new THREE.Euler(0, 0, x % .2 ? .08 : -.08))
    beam(.9 * U, .08, .08, iron, "city-forge-tool", .72 * U, .9, -.92 * U, new THREE.Euler(0, 0, -.55))
    rubble(-1.8, -1.25, .18); rubble(1.9, 1.3, .2)
    return group
  }

  // Depot: a compact warehouse with an open yard, not a roof covering the
  // whole landmark. The doors, dock and barrels provide the readable noun.
  beam(2.55 * U, .38, 1.62 * U, stone, "city-house-body", 0, .2, .1 * U)
  beam(2.35 * U, 1.5, .18 * U, plaster, "city-house-body", 0, .95, .52 * U)
  // Keep the roof on the rear half of the warehouse so the dock and doors
  // remain visible in the top-down battle camera.
  roof(1.45 * U, .78 * U, -.42 * U, 1.72, .45 * U, thatch, -.25)
  beam(1.55 * U, .18, .52 * U, timberLight, "city-depot-loading-dock", 0, .42, -1.04 * U)
  for (const x of [-.68, .68]) beam(.12 * U, .62, .12 * U, timber, "city-depot-loading-dock", x * U, .72, -1.29 * U)
  for (const x of [-.2, .2]) {
    beam(.36 * U, 1.16, .1, timber, "city-depot-double-door", x * U, .78, -.61 * U, new THREE.Euler(0, 0, x < 0 ? -.04 : .04))
    part(new THREE.SphereGeometry(.06 * U, 6, 4), iron, "city-depot-double-door", (x + (x < 0 ? .12 : -.12)) * U, .78, -.69 * U)
  }
  beam(.72 * U, .3, .08, timber, "city-depot-signboard", .82 * U, 1.88, -.7 * U, new THREE.Euler(0, 0, -.08))
  for (const [x, z] of [[-1.35, -.85], [1.35, -.78]]) {
    part(new THREE.CylinderGeometry(.28 * U, .32 * U, .58, 10), iron, "city-depot-barrel", x * U, .42, z * U)
    beam(.38 * U, .06, .06, timber, "city-depot-barrel", x * U, .72, z * U)
  }
  for (const [x, z, size] of [[-.82, -.92, .22], [.52, -.98, .18]]) part(new THREE.DodecahedronGeometry(size * U, 0), thatch, "city-depot-sack", x * U, size * U + .16, z * U)
  part(new THREE.TorusGeometry(.38 * U, .07 * U, 6, 12), timber, "city-depot-wheel", 1.18 * U, .5, -.96 * U, new THREE.Euler(Math.PI / 2, 0, .16))
  rubble(-1.85, 1.15, .18); rubble(1.9, 1.2, .2)
  return group
}

const createCityBuildingVisual = (scale, variant = 0, archetype = "depot") => {
  return createReadableCityBuildingVisual(scale, variant, archetype)
  /* Legacy composition kept below while old map snapshots are migrated.
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const profile = CITY_BUILDING_PROFILES[archetype] || CITY_BUILDING_PROFILES.depot
  const timber = cityMaterial(variant % 3 ? 0x634631 : 0x51372a, {roughness: .98})
  const thatch = cityMaterial(variant % 2 ? 0x806548 : 0x6f5a43, {roughness: 1})
  const plaster = cityMaterial(variant % 2 ? 0x927f69 : 0x806d5b, {roughness: 1})
  const stoneLight = cityMaterial(variant % 2 ? 0x9a9180 : 0x817b70, {roughness: 1})
  const window = cityMaterial(0x202d31, {roughness: .58, metalness: .05})
  const frame = cityMaterial(variant % 2 ? 0x4f392d : 0x634532, {roughness: .96})
  const iron = cityMaterial(variant % 2 ? 0x3f4038 : 0x51483e, {roughness: .92, metalness: .08})
  const cloth = cityMaterial(variant % 2 ? 0x80634d : 0x715b49, {roughness: 1})
  const moss = cityMaterial(variant % 2 ? 0x3f6841 : 0x4d7645, {roughness: 1})

  const houseWidth = CITY_CELL * profile.width
  const houseDepth = CITY_CELL * profile.depth
  const houseZ = CITY_CELL * profile.houseZ
  const wallHeight = profile.wallHeight
  const frontZ = houseZ - houseDepth / 2 - .05
  const sideX = houseWidth / 2
  addCityPart(group, new THREE.BoxGeometry(houseWidth, wallHeight, houseDepth), plaster, "city-house-body", new THREE.Vector3(0, wallHeight / 2, houseZ))
  addCityPart(group, new THREE.BoxGeometry(houseWidth * 1.02, .16, houseDepth * 1.02), timber, "city-wood-beam", new THREE.Vector3(0, .12, houseZ))
  for (const x of [-sideX * .86, sideX * .86]) {
    addCityPart(group, new THREE.BoxGeometry(.1, wallHeight, .14), timber, "city-wood-beam", new THREE.Vector3(x, wallHeight / 2, frontZ + .02))
  }
  addCityPart(group, new THREE.BoxGeometry(houseWidth * .92, .1, .14), timber, "city-wood-beam", new THREE.Vector3(0, 1.2, frontZ + .02))

  const windowWidth = CITY_CELL * .48
  const windowHeight = .7
  for (const x of [-CITY_CELL * .85, CITY_CELL * .85]) {
    addCityPart(group, new THREE.BoxGeometry(windowWidth, windowHeight, .08), window, "city-window", new THREE.Vector3(x, 1.48, frontZ - .04))
    addCityWindowFrame(group, x, 1.48, frontZ - .09, windowWidth, windowHeight, frame)
    addCityPart(group, new THREE.BoxGeometry(.13, windowHeight * .95, .1), frame, "city-shutter", new THREE.Vector3(x - windowWidth * .63, 1.48, frontZ - .1))
    addCityPart(group, new THREE.BoxGeometry(.13, windowHeight * .95, .1), frame, "city-shutter", new THREE.Vector3(x + windowWidth * .63, 1.48, frontZ - .1))
  }

  const doorZ = frontZ - .08
  addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .65, 1.45, .12), window, "city-door", new THREE.Vector3(0, .75, doorZ))
  addCityPart(group, new THREE.BoxGeometry(.1, 1.62, .16), frame, "city-door-frame", new THREE.Vector3(-CITY_CELL * .38, .82, doorZ - .02))
  addCityPart(group, new THREE.BoxGeometry(.1, 1.62, .16), frame, "city-door-frame", new THREE.Vector3(CITY_CELL * .38, .82, doorZ - .02))
  addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .86, .12, .18), frame, "city-door-frame", new THREE.Vector3(0, 1.62, doorZ - .02))
  addCityPart(group, new THREE.SphereGeometry(.055, 6, 4), iron, "city-door-handle", new THREE.Vector3(CITY_CELL * .2, .78, doorZ - .1))
  const awning = addCityPart(group, new THREE.BoxGeometry(CITY_CELL * 1.18, .12, CITY_CELL * .5), cloth, "city-awning", new THREE.Vector3(0, 1.92, doorZ - CITY_CELL * .16))
  awning.rotation.x = -.12
  for (const x of [-CITY_CELL * .42, CITY_CELL * .42]) addCityPart(group, new THREE.CylinderGeometry(.035, .045, .42, 5), frame, "city-awning-support", new THREE.Vector3(x, 1.72, doorZ - CITY_CELL * .12))
  addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .86, .3, .08), timber, "city-hanging-sign", new THREE.Vector3(0, 2.28, doorZ - .08))
  addCityPart(group, new THREE.CylinderGeometry(.018, .022, .42, 5), iron, "city-hanging-sign", new THREE.Vector3(-CITY_CELL * .3, 2.48, doorZ - .07))
  addCityPart(group, new THREE.CylinderGeometry(.018, .022, .42, 5), iron, "city-hanging-sign", new THREE.Vector3(CITY_CELL * .3, 2.48, doorZ - .07))

  const roofDepth = houseDepth * 1.12
  const roofWidth = houseWidth * .62
  if (profile.roof === "warehouse") {
    // One broken lean-to gives the depot a readable silhouette and leaves the
    // loading yard open. The double doors and dock explain the building's job
    // without relying on tiny decorative clutter.
    const roof = addCityPart(group, new THREE.BoxGeometry(houseWidth * .92, .18, roofDepth * .76), thatch, "city-roof", new THREE.Vector3(-CITY_CELL * .16, wallHeight + .28, houseZ - CITY_CELL * .06))
    roof.rotation.z = -.28
    addCityPart(group, new THREE.BoxGeometry(houseWidth * .46, .14, roofDepth * .42), timber, "city-roof-debris", new THREE.Vector3(CITY_CELL * .68, wallHeight + .06, houseZ + CITY_CELL * .28), new THREE.Euler(0, 0, .18))
    addCityPart(group, new THREE.BoxGeometry(CITY_CELL * 1.46, .18, CITY_CELL * .54), timber, "city-depot-loading-dock", new THREE.Vector3(0, .18, frontZ - CITY_CELL * .34))
    addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .12, .62, CITY_CELL * .12), frame, "city-depot-loading-dock", new THREE.Vector3(-CITY_CELL * .64, .52, frontZ - CITY_CELL * .55))
    addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .12, .62, CITY_CELL * .12), frame, "city-depot-loading-dock", new THREE.Vector3(CITY_CELL * .64, .52, frontZ - CITY_CELL * .55))
    for (const x of [-CITY_CELL * .2, CITY_CELL * .2]) {
      addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .34, 1.18, .1), timber, "city-depot-double-door", new THREE.Vector3(x, .66, doorZ - .08), new THREE.Euler(0, 0, x < 0 ? -.035 : .035))
      addCityPart(group, new THREE.BoxGeometry(.06, 1.2, .12), iron, "city-depot-double-door", new THREE.Vector3(x + (x < 0 ? CITY_CELL * .12 : -CITY_CELL * .12), .66, doorZ - .15))
    }
    addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .7, .3, .08), timber, "city-depot-signboard", new THREE.Vector3(CITY_CELL * .74, 2.05, frontZ - .12), new THREE.Euler(0, 0, -.08))
  } else if (profile.roof === "gable") {
    for (const [x, tilt] of [[-houseWidth * .23, -.48], [houseWidth * .23, .48]]) {
      const roof = addCityPart(group, new THREE.BoxGeometry(roofWidth, .2, roofDepth), thatch, "city-roof", new THREE.Vector3(x, wallHeight + .34, houseZ))
      roof.rotation.z = tilt
      for (const offset of [-.28, 0, .28]) {
        const roofBeam = addCityPart(group, new THREE.BoxGeometry(.07, .07, roofDepth * .86), timber, "city-roof-debris", new THREE.Vector3(x + offset * CITY_CELL, wallHeight + .48 + Math.abs(offset) * .12, houseZ))
        roofBeam.rotation.z = tilt
      }
    }
    const ridge = addCityPart(group, new THREE.CylinderGeometry(.07, .07, roofDepth, 6), timber, "city-roof-debris", new THREE.Vector3(0, wallHeight + .92, houseZ))
    ridge.rotation.x = Math.PI / 2
  } else if (profile.roof === "market") {
    for (const [x, tilt, material] of [[-houseWidth * .22, -.22, thatch], [houseWidth * .22, .22, cloth]]) {
      const roof = addCityPart(group, new THREE.BoxGeometry(houseWidth * .54, .16, roofDepth * .72), material, "city-roof", new THREE.Vector3(x, wallHeight + .3, houseZ))
      roof.rotation.z = tilt
    }
    addCityPart(group, new THREE.BoxGeometry(houseWidth * .34, .16, roofDepth * .46), thatch, "city-market-roof-ridge", new THREE.Vector3(0, wallHeight + .55, houseZ))
  } else if (profile.roof === "tower") {
    const towerWidth = houseWidth * .56
    const towerDepth = houseDepth * .52
    addCityPart(group, new THREE.BoxGeometry(towerWidth, 1.35, towerDepth), plaster, "city-apartment-tower", new THREE.Vector3(0, wallHeight + .56, houseZ))
    addCityPart(group, new THREE.BoxGeometry(towerWidth * 1.16, .12, towerDepth * 1.1), timber, "city-apartment-tower", new THREE.Vector3(0, wallHeight + 1.18, frontZ + .04))
    addCityPart(group, new THREE.ConeGeometry(towerWidth * .68, 1.25, 4), thatch, "city-roof", new THREE.Vector3(0, wallHeight + 1.55, houseZ), new THREE.Euler(0, Math.PI / 4, 0))
  } else if (profile.roof === "gate") {
    addCityPart(group, new THREE.BoxGeometry(houseWidth * 1.08, .24, roofDepth * .72), thatch, "city-roof", new THREE.Vector3(0, wallHeight + .38, houseZ))
    addCityPart(group, new THREE.BoxGeometry(houseWidth * .32, .16, roofDepth * .82), timber, "city-gate-roof-ridge", new THREE.Vector3(0, wallHeight + .55, houseZ))
  } else {
    const brokenRoof = addCityPart(group, new THREE.BoxGeometry(roofWidth * .88, .2, roofDepth * .72), thatch, "city-roof", new THREE.Vector3(-houseWidth * .13, wallHeight + .22, houseZ), new THREE.Euler(0, 0, -.58))
    brokenRoof.rotation.z = -.58
    addCityPart(group, new THREE.BoxGeometry(roofWidth * .44, .16, roofDepth * .45), timber, "city-collapsed-roof", new THREE.Vector3(houseWidth * .3, .32, houseZ + houseDepth * .42), new THREE.Euler(0, 0, .24))
    addCityPart(group, new THREE.BoxGeometry(.12, .12, roofDepth * .8), timber, "city-collapsed-roof", new THREE.Vector3(houseWidth * .3, .48, houseZ), new THREE.Euler(0, 0, -.35))
  }
  for (const [x, z, rotation] of [[-houseWidth * .35, houseZ - houseDepth * .36, -.2], [houseWidth * .42, houseZ + houseDepth * .34, .24], [houseWidth * .52, houseZ + houseDepth * .05, -.16]]) {
    const beam = addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .82, .1, .1), timber, "city-roof-debris", new THREE.Vector3(x, wallHeight + .23, z))
    beam.rotation.z = rotation
  }

  const chimneyX = houseWidth * .3
  addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .42, .62, CITY_CELL * .42), iron, "city-chimney", new THREE.Vector3(chimneyX, wallHeight + .42, houseZ + houseDepth * .18))
  addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .58, .1, CITY_CELL * .52), timber, "city-wood-beam", new THREE.Vector3(chimneyX, wallHeight + .76, houseZ + houseDepth * .18))

  addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .16, .22, CITY_CELL * .9), moss, "city-ivy", new THREE.Vector3(sideX + .03, 1.2, houseZ + houseDepth * .1))
  addCityIvy(group, sideX + .08, houseZ + houseDepth * .12, 1.4, moss, moss, variant)
  addCityIvy(group, -sideX - .08, houseZ - houseDepth * .2, 1.0, moss, moss, variant + 2)

  const wellStone = cityMaterial(variant % 2 ? 0x827a6c : 0x716a60, {roughness: 1})
  const wellX = -CITY_CELL * 1.45
  const wellZ = CITY_CELL * 1.2
  addCityPart(group, new THREE.CylinderGeometry(CITY_CELL * .42, CITY_CELL * .52, .42, 8), wellStone, "city-courtyard-well", new THREE.Vector3(wellX, .22, wellZ))
  const wellRing = addCityPart(group, new THREE.TorusGeometry(CITY_CELL * .38, .06, 5, 8), timber, "city-courtyard-well", new THREE.Vector3(wellX, .45, wellZ))
  wellRing.rotation.x = Math.PI / 2
  addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .88, .08, .08), timber, "city-wood-beam", new THREE.Vector3(wellX, .86, wellZ))
  for (const [x, z, height] of [[-.75, -.65, .38], [.45, -.85, .46], [1.05, .55, .3], [-1.3, .8, .34]]) {
    const weed = addCityPart(group, new THREE.ConeGeometry(.1, height, 5), moss, "city-courtyard-weed", new THREE.Vector3(x * CITY_CELL, height / 2 + .08, z * CITY_CELL))
    weed.rotation.z = ((x * 7 + z * 11) % 3 - 1) * .12
  }

  const rubbleMaterial = cityMaterial(variant % 2 ? 0x9a9180 : 0x817b70)
  const rubble = [
    [-2.5, .16, -1.8, .28], [-2.3, .2, 1.9, .34], [2.42, .13, 1.8, .24],
    [1.9, .18, -2.5, .25], [.8, .1, 2.55, .2], [-.8, .12, -2.5, .18],
  ]
  rubble.forEach(([x, y, z, size], index) => {
    const stone = addCityPart(
      group,
      new THREE.DodecahedronGeometry(size * CITY_CELL, 0),
      rubbleMaterial,
      "city-rubble",
      new THREE.Vector3(x * CITY_CELL, y, z * CITY_CELL),
    )
    stone.rotation.set(index * .2, index * .45, index * .13)
  })

  // Every district receives its own authored story object. These are deliberately
  // different silhouettes and prop clusters, not recolored copies of the same
  // house: the player should recognize the market, gate, homes and workshop
  // from a single camera pass.
  if (archetype === "depot") {
    for (const [x, z, size] of [[-1.42, .86, .34], [1.38, .72, .28]]) {
      addCityPart(group, new THREE.CylinderGeometry(size, size * 1.12, .62, 10), iron, "city-depot-barrel", new THREE.Vector3(x * CITY_CELL, .34, z * CITY_CELL))
      addCityPart(group, new THREE.BoxGeometry(size * 1.5, .07, .07), frame, "city-depot-barrel", new THREE.Vector3(x * CITY_CELL, .62, z * CITY_CELL))
    }
    for (const [x, z, size] of [[-.72, .98, .3], [.42, 1.12, .22]]) {
      addCityPart(group, new THREE.DodecahedronGeometry(size, 0), cloth, "city-depot-sack", new THREE.Vector3(x * CITY_CELL, size + .12, z * CITY_CELL))
    }
    const wheel = addCityPart(group, new THREE.TorusGeometry(.42, .09, 6, 12), timber, "city-depot-wheel", new THREE.Vector3(1.05 * CITY_CELL, .48, .98 * CITY_CELL), new THREE.Euler(Math.PI / 2, 0, .16))
    wheel.rotation.z = .16
    addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .72, .52, CITY_CELL * .62), timber, "city-depot-crate", new THREE.Vector3(-1.28 * CITY_CELL, .28, 1.22 * CITY_CELL), new THREE.Euler(0, -.14, .03))
  } else if (archetype === "market") {
    for (const [x, z, clothColor] of [[-1.48, .92, cloth], [1.36, 1.02, moss]]) {
      addCityPart(group, new THREE.BoxGeometry(CITY_CELL * 1.42, .16, CITY_CELL * .58), timber, "city-market-stall", new THREE.Vector3(x * CITY_CELL, .48, z * CITY_CELL))
      for (const postX of [-.58, .58]) addCityPart(group, new THREE.CylinderGeometry(.045, .06, 1.56, 5), frame, "city-market-stall", new THREE.Vector3((x + postX) * CITY_CELL, 1.2, z * CITY_CELL))
      addCityPart(group, new THREE.BoxGeometry(CITY_CELL * 1.62, .12, CITY_CELL * .82), clothColor, "city-market-canopy", new THREE.Vector3(x * CITY_CELL, 2.04, z * CITY_CELL), new THREE.Euler(0, 0, x < 0 ? -.08 : .1))
    }
    for (const [x, z, size, material] of [[-1.5, .58, .17, iron], [-1.12, .5, .14, moss], [1.28, .6, .18, cloth]]) {
      addCityPart(group, new THREE.DodecahedronGeometry(size, 0), material, "city-market-goods", new THREE.Vector3(x * CITY_CELL, .72, z * CITY_CELL))
    }
    addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .72, .36, .08), cloth, "city-market-banner", new THREE.Vector3(0, 2.5, frontZ - .14), new THREE.Euler(0, 0, -.08))
  } else if (archetype === "apartments") {
    const balconyZ = frontZ - .28
    addCityPart(group, new THREE.BoxGeometry(CITY_CELL * 1.92, .14, CITY_CELL * .62), timber, "city-apartment-balcony", new THREE.Vector3(0, 1.82, balconyZ))
    addCityPart(group, new THREE.BoxGeometry(CITY_CELL * 1.82, .1, .08), frame, "city-apartment-balcony", new THREE.Vector3(0, 2.28, balconyZ - CITY_CELL * .28))
    for (const x of [-.82, 0, .82]) addCityPart(group, new THREE.CylinderGeometry(.035, .05, .6, 5), frame, "city-apartment-balcony", new THREE.Vector3(x * CITY_CELL, 2.02, balconyZ - CITY_CELL * .28))
    const ladder = addCityPart(group, new THREE.BoxGeometry(.12, 2.15, .12), timber, "city-apartment-ladder", new THREE.Vector3(sideX + .22, 1.08, houseZ + .35), new THREE.Euler(0, 0, -.12))
    ladder.rotation.y = .12
    for (const x of [-.75, .48]) addCityPart(group, new THREE.BoxGeometry(.42, .18, .26), moss, "city-apartment-flowerbox", new THREE.Vector3(x * CITY_CELL, 1.98, balconyZ - CITY_CELL * .4))
    addCityPart(group, new THREE.CylinderGeometry(.025, .025, 1.25, 5), frame, "city-apartment-clothesline", new THREE.Vector3(-sideX * .9, 2.42, houseZ + .82))
    addCityPart(group, new THREE.CylinderGeometry(.025, .025, 1.25, 5), frame, "city-apartment-clothesline", new THREE.Vector3(sideX * .9, 2.42, houseZ + .82))
    addCityPart(group, new THREE.BoxGeometry(CITY_CELL * 1.9, .04, .04), cloth, "city-apartment-clothesline", new THREE.Vector3(0, 2.42, houseZ + .82), new THREE.Euler(0, 0, .05))
  } else if (archetype === "north_gate") {
    const gateZ = frontZ - .2
    for (const x of [-sideX * .78, sideX * .78]) addCityPart(group, new THREE.CylinderGeometry(.16, .22, 2.75, 7), stoneLight, "city-gate-post", new THREE.Vector3(x, 1.38, gateZ))
    addCityPart(group, new THREE.BoxGeometry(houseWidth * .9, .3, .34), timber, "city-gate-arch", new THREE.Vector3(0, 2.72, gateZ))
    for (const x of [-.72, -.36, 0, .36, .72]) addCityPart(group, new THREE.BoxGeometry(.09, .95, .08), iron, "city-gate-portcullis", new THREE.Vector3(x * CITY_CELL, 1.55, gateZ - .2))
    addCityPart(group, new THREE.BoxGeometry(CITY_CELL * 1.82, .1, .1), iron, "city-gate-portcullis", new THREE.Vector3(0, 1.98, gateZ - .2))
    for (const x of [-sideX * .68, sideX * .68]) {
      addCityPart(group, new THREE.CylinderGeometry(.05, .08, 1.35, 6), timber, "city-gate-torch", new THREE.Vector3(x, .72, gateZ - .42))
      addCityPart(group, new THREE.ConeGeometry(.14, .28, 6), cloth, "city-gate-torch", new THREE.Vector3(x, 1.48, gateZ - .42))
    }
    addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .8, .5, .08), cloth, "city-gate-sign", new THREE.Vector3(0, 3.08, gateZ - .18))
  } else if (archetype === "south_ward") {
    const forgeX = sideX + CITY_CELL * .45
    const forgeZ = houseZ + CITY_CELL * .12
    addCityPart(group, new THREE.BoxGeometry(CITY_CELL * 1.22, .18, CITY_CELL * .86), timber, "city-forge-canopy", new THREE.Vector3(forgeX, 1.76, forgeZ), new THREE.Euler(0, 0, -.12))
    for (const z of [-.32, .32]) addCityPart(group, new THREE.CylinderGeometry(.045, .06, 1.8, 5), frame, "city-forge-canopy", new THREE.Vector3(forgeX, .9, forgeZ + z * CITY_CELL))
    addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .66, .28, CITY_CELL * .34), iron, "city-forge-anvil", new THREE.Vector3(forgeX - .2, .95, forgeZ - .5))
    addCityPart(group, new THREE.CylinderGeometry(.11, .15, .62, 6), timber, "city-forge-anvil", new THREE.Vector3(forgeX - .2, .52, forgeZ - .5))
    addCityPart(group, new THREE.CylinderGeometry(.22, .28, .68, 7), iron, "city-forge-chimney", new THREE.Vector3(forgeX + .72, 1.02, forgeZ + .18))
    for (const x of [-1.08, -.72, -.36]) addCityPart(group, new THREE.CylinderGeometry(.09, .11, .74, 6), timber, "city-forge-woodpile", new THREE.Vector3((x * CITY_CELL) + forgeX, .38, houseZ + 1.1))
    addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .9, .1, .1), iron, "city-forge-tool", new THREE.Vector3(forgeX + .18, 1.55, forgeZ - .18), new THREE.Euler(0, 0, -.32))
  }
  return group
  */
}

const createCityTowerVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const stone = cityMaterial(0x766b5d, {roughness: 1})
  const stoneLight = cityMaterial(0x918271, {roughness: 1})
  const timber = cityMaterial(0x503724, {roughness: .98})
  const roof = cityMaterial(0x5f4938, {roughness: 1})
  const iron = cityMaterial(0x343a36, {roughness: .88, metalness: .08})
  const dark = cityMaterial(0x1f2929, {roughness: .7})
  addCityPart(group, new THREE.CylinderGeometry(1.52, 1.76, 2.75, 8), stone, "city-tower-base", new THREE.Vector3(0, 1.38, 0))
  addCityPart(group, new THREE.CylinderGeometry(1.28, 1.42, .2, 8), stoneLight, "city-tower-base", new THREE.Vector3(0, 2.82, 0))
  addCityPart(group, new THREE.ConeGeometry(1.55, 1.42, 4), roof, "city-tower-roof", new THREE.Vector3(0, 3.62, 0))
  addCityPart(group, new THREE.BoxGeometry(.62, 1.05, .08), dark, "city-tower-window", new THREE.Vector3(0, 1.85, 1.43))
  addCityPart(group, new THREE.BoxGeometry(.1, 1.16, .12), timber, "city-tower-window", new THREE.Vector3(-.38, 1.85, 1.48))
  addCityPart(group, new THREE.BoxGeometry(.1, 1.16, .12), timber, "city-tower-window", new THREE.Vector3(.38, 1.85, 1.48))
  for (const [x, z] of [[-.78, -.84], [.8, -.82], [-.86, .8], [.84, .76]]) {
    addCityPart(group, new THREE.BoxGeometry(.2, .42, .08), dark, "city-tower-window", new THREE.Vector3(x, 2.35, z))
  }
  addCityPart(group, new THREE.BoxGeometry(.72, 1.1, .1), dark, "city-tower-door", new THREE.Vector3(0, .57, 1.47))
  addCityPart(group, new THREE.BoxGeometry(.84, .08, .12), timber, "city-tower-door", new THREE.Vector3(0, 1.14, 1.48))
  addCityPart(group, new THREE.CylinderGeometry(.035, .05, 1.15, 5), iron, "city-tower-flag", new THREE.Vector3(0, 4.55, 0))
  addCityPart(group, new THREE.ConeGeometry(.26, .38, 3), timber, "city-tower-flag", new THREE.Vector3(.22, 4.32, 0))
  return group
}

const createCityStreetVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const dirt = cityMaterial(0x675a4d, {roughness: 1})
  const cobble = cityMaterial(0x6d6759, {roughness: 1})
  const puddle = cityMaterial(0x4a5f5a, {roughness: .72, transparent: true, opacity: .68})
  const rut = cityMaterial(0x4c4238, {roughness: 1})
  const wood = cityMaterial(0x5b402b, {roughness: .98})
  const iron = cityMaterial(0x3f4038, {roughness: .92, metalness: .08})
  const lanternGlass = cityMaterial(0xb17b43, {roughness: .38, emissive: 0x6e2b0a, emissiveIntensity: .45})
  const cloth = cityMaterial(0x7b6048, {roughness: 1})
  const surface = new THREE.Mesh(new THREE.CircleGeometry(CITY_CELL * 1.35, 10), dirt)
  surface.rotation.x = -Math.PI / 2
  surface.position.y = .11
  surface.name = "city-dirt-path"
  surface.receiveShadow = true
  group.add(setMapRenderLayer(surface, 30))

  const stones = [
    [-2.45, -.38, .22, .14], [-1.78, .31, .18, -.1], [-1.05, -.28, .2, .18], [-.38, .24, .16, -.22],
    [.32, -.3, .23, .12], [1.05, .28, .19, -.18], [1.82, -.25, .22, .16], [2.45, .3, .16, -.1],
    [-2.12, .02, .14, .28], [-.7, .03, .15, -.24], [.76, .02, .17, .2], [2.1, .04, .13, -.18],
  ]
  stones.forEach(([x, z, size, rotation], index) => {
    const stone = addCityPart(group, new THREE.DodecahedronGeometry(CITY_CELL * size, 0), cobble, "city-path-stone", new THREE.Vector3(x * CITY_CELL, .18 + index % 2 * .015, z * CITY_CELL))
    stone.scale.y = .28
    stone.rotation.y = rotation
  })
  for (const [x, z, rx, rz] of [[-1.72, -.4, .48, .17], [1.55, .36, .35, .14]]) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(CITY_CELL * rx, 12), puddle)
    water.scale.y = rz / rx
    water.rotation.x = -Math.PI / 2
    water.position.set(x * CITY_CELL, .16, z * CITY_CELL)
    water.name = "city-path-puddle"
    group.add(setMapRenderLayer(water, 32))
  }
  for (const [x, z, length, rotation] of [[-2.25, .4, 1.05, -.22], [.1, -.4, .76, .45], [2.15, .26, .9, -.1]]) {
    const rutPart = addCityPart(group, new THREE.BoxGeometry(CITY_CELL * length, .035, .07), rut, "city-path-rut", new THREE.Vector3(x * CITY_CELL, .18, z * CITY_CELL))
    rutPart.rotation.y = rotation
  }
  const lanternX = -CITY_CELL * 2.55
  addCityPart(group, new THREE.CylinderGeometry(.055, .09, 1.72, 6), wood, "city-lantern", new THREE.Vector3(lanternX, .86, CITY_CELL * .43))
  const lanternArm = addCityPart(group, new THREE.BoxGeometry(.46, .07, .07), wood, "city-lantern", new THREE.Vector3(lanternX + .18, 1.68, CITY_CELL * .43))
  lanternArm.rotation.z = -.16
  addCityPart(group, new THREE.BoxGeometry(.2, .3, .2), iron, "city-lantern", new THREE.Vector3(lanternX + .38, 1.5, CITY_CELL * .43))
  addCityPart(group, new THREE.SphereGeometry(.09, 6, 4), lanternGlass, "city-lantern-glow", new THREE.Vector3(lanternX + .38, 1.5, CITY_CELL * .43))

  const cart = new THREE.Group()
  cart.position.set(CITY_CELL * 1.35, .08, -CITY_CELL * .48)
  cart.rotation.y = -.1
  addCityPart(cart, new THREE.BoxGeometry(CITY_CELL * 1.35, .18, CITY_CELL * .68), wood, "city-cart-body", new THREE.Vector3(0, .46, 0))
  addCityPart(cart, new THREE.BoxGeometry(CITY_CELL * 1.08, .08, CITY_CELL * .55), cloth, "city-cart-cloth", new THREE.Vector3(0, .6, 0))
  for (const x of [-CITY_CELL * .47, CITY_CELL * .47]) {
    const wheel = addCityPart(cart, new THREE.CylinderGeometry(.25, .25, .1, 10), wood, "city-cart-wheel", new THREE.Vector3(x, .27, CITY_CELL * .39))
    wheel.rotation.x = Math.PI / 2
    const farWheel = wheel.clone()
    farWheel.position.z = -CITY_CELL * .39
    cart.add(farWheel)
  }
  addCityPart(cart, new THREE.CylinderGeometry(.035, .035, CITY_CELL * 1.05, 5), wood, "city-cart-wood", new THREE.Vector3(-CITY_CELL * .92, .51, 0)).rotation.z = -.12
  group.add(cart)

  for (const [x, z, height] of [[-1.8, .62, .48], [-1.28, .65, .42]]) {
    addCityPart(group, new THREE.CylinderGeometry(.2, .24, height, 10), wood, "city-barrel", new THREE.Vector3(x * CITY_CELL, height / 2 + .12, z * CITY_CELL))
    addCityPart(group, new THREE.TorusGeometry(.21, .025, 5, 10), iron, "city-barrel", new THREE.Vector3(x * CITY_CELL, .2, z * CITY_CELL))
  }
  return group
}

const createCityPlazaVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const paving = cityMaterial(0x6b604f, {roughness: 1})
  const stone = cityMaterial(0x817968, {roughness: 1})
  const darkStone = cityMaterial(0x555149, {roughness: 1})
  const tileEdge = cityMaterial(0x766b5c, {roughness: 1})
  const crack = cityMaterial(0x4e4338, {roughness: 1})
  const moss = cityMaterial(0x4a7047, {roughness: 1})
  const wood = cityMaterial(0x5b402b, {roughness: .98})
  const iron = cityMaterial(0x3f4038, {roughness: .92, metalness: .08})
  const cloth = cityMaterial(0x795d47, {roughness: 1})
  const fire = cityMaterial(0xc57b36, {roughness: .38, emissive: 0x6e2b0a, emissiveIntensity: .5})
  const surface = new THREE.Mesh(new THREE.CircleGeometry(CITY_CELL * 4.05, 10), paving)
  surface.rotation.x = -Math.PI / 2
  surface.position.y = .11
  surface.name = "city-plaza-surface"
  surface.receiveShadow = true
  group.add(setMapRenderLayer(surface, 30))
  for (let index = 0; index < 18; index += 1) {
    const angle = index * Math.PI * 2 / 18
    const radius = CITY_CELL * (2.2 + (index % 3) * .24)
    const tile = addCityPart(
      group,
      new THREE.DodecahedronGeometry(CITY_CELL * .31, 0),
      tileEdge,
      "city-plaza-tile",
      new THREE.Vector3(Math.cos(angle) * radius, .16, Math.sin(angle) * radius),
    )
    tile.scale.y = .2
    tile.rotation.y = angle + Math.PI / 2
  }
  for (const [x, z, size, rotation] of [[-1.7, -.9, .26, .12], [-.75, 1.25, .2, -.16], [.8, 1.72, .24, .22], [1.65, -.9, .28, -.12], [2.45, .72, .18, .2], [-2.55, .65, .22, -.18]]) {
    const tile = addCityPart(group, new THREE.DodecahedronGeometry(CITY_CELL * size, 0), darkStone, "city-plaza-tile", new THREE.Vector3(x * CITY_CELL, .17, z * CITY_CELL))
    tile.scale.y = .22
    tile.rotation.y = rotation
  }
  for (const [x, z, length, rotation] of [[-2.35, 1.6, 1.1, .2], [1.8, 1.9, .9, -.45], [2.25, -1.55, 1.25, .1], [-1.4, -2.05, .8, .55]]) {
    const fracture = addCityPart(group, new THREE.BoxGeometry(CITY_CELL * length, .04, .06), crack, "city-plaza-crack", new THREE.Vector3(x * CITY_CELL, .18, z * CITY_CELL))
    fracture.rotation.y = rotation
  }
  const well = addCityPart(group, new THREE.CylinderGeometry(CITY_CELL * 1.02, CITY_CELL * 1.2, .42, 10), stone, "city-plaza-well", new THREE.Vector3(0, .24, 0), "city-plaza-well")
  well.receiveShadow = true
  const wellTop = addCityPart(group, new THREE.TorusGeometry(CITY_CELL * .86, .13, 5, 10), tileEdge, "city-plaza-well", new THREE.Vector3(0, .48, 0))
  wellTop.rotation.x = Math.PI / 2
  addCityPart(group, new THREE.CylinderGeometry(CITY_CELL * .72, CITY_CELL * .78, .04, 14), darkStone, "city-plaza-well", new THREE.Vector3(0, .5, 0))
  addCityPart(group, new THREE.BoxGeometry(CITY_CELL * 1.72, .12, .12), wood, "city-plaza-well", new THREE.Vector3(0, 1.12, 0))
  addCityPart(group, new THREE.CylinderGeometry(.04, .04, 1.05, 5), wood, "city-plaza-well", new THREE.Vector3(-CITY_CELL * .68, .72, 0))
  addCityPart(group, new THREE.CylinderGeometry(.04, .04, 1.05, 5), wood, "city-plaza-well", new THREE.Vector3(CITY_CELL * .68, .72, 0))
  addCityPart(group, new THREE.CylinderGeometry(.025, .025, .74, 5), iron, "city-plaza-well", new THREE.Vector3(0, .8, 0))
  const createMarketStall = (stallX, stallZ, rotation = 0) => {
    const stall = new THREE.Group()
    stall.position.set(stallX, 0, stallZ)
    stall.rotation.y = rotation
    addCityPart(stall, new THREE.BoxGeometry(CITY_CELL * 1.45, .16, CITY_CELL * .34), wood, "city-plaza-stall-table", new THREE.Vector3(0, .38, 0))
    for (const x of [-CITY_CELL * .6, CITY_CELL * .6]) {
      addCityPart(stall, new THREE.CylinderGeometry(.045, .065, 1.8, 5), wood, "city-plaza-stall", new THREE.Vector3(x, .9, 0))
    }
    for (const [x, tilt] of [[-CITY_CELL * .27, -.28], [CITY_CELL * .27, .28]]) {
      const canopy = addCityPart(stall, new THREE.BoxGeometry(CITY_CELL * .78, .12, CITY_CELL * .92), cloth, "city-plaza-stall-roof", new THREE.Vector3(x, 1.42, 0))
      canopy.rotation.z = tilt
    }
    for (const [x, z, size, material] of [[-.47, -.12, .16, stone], [0, -.1, .14, wood], [.42, -.06, .12, cloth]]) {
      addCityPart(stall, new THREE.DodecahedronGeometry(CITY_CELL * size, 0), material, "city-plaza-goods", new THREE.Vector3(x * CITY_CELL, .62, z * CITY_CELL))
    }
    group.add(stall)
  }
  createMarketStall(-CITY_CELL * 2.15, CITY_CELL * 1.65, -.08)
  createMarketStall(CITY_CELL * 2.05, -CITY_CELL * 1.58, .12)
  addCityPart(group, new THREE.BoxGeometry(CITY_CELL * 1.65, .16, CITY_CELL * .32), wood, "city-plaza-bench", new THREE.Vector3(CITY_CELL * 2.15, .25, CITY_CELL * 1.5))
  addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .24, .2, CITY_CELL * .24), wood, "city-plaza-bench", new THREE.Vector3(CITY_CELL * 1.5, .14, CITY_CELL * 1.5))
  addCityPart(group, new THREE.BoxGeometry(CITY_CELL * .24, .2, CITY_CELL * .24), wood, "city-plaza-bench", new THREE.Vector3(CITY_CELL * 2.8, .14, CITY_CELL * 1.5))
  for (const [x, z, height] of [[-3.45, 2.15, .42], [3.25, -2.4, .34], [-2.8, -2.85, .28], [2.75, 2.65, .38]]) {
    const weed = addCityPart(group, new THREE.ConeGeometry(.11, height, 5), moss, "city-plaza-weed", new THREE.Vector3(x * CITY_CELL, height / 2 + .08, z * CITY_CELL))
    weed.rotation.z = ((x + z) % 3 - 1) * .12
  }
  for (const [x, z, lean] of [[-3.55, -.55, -.08], [3.55, .65, .1]]) {
    const torch = addCityPart(group, new THREE.CylinderGeometry(.055, .085, 1.42, 6), wood, "city-plaza-torch", new THREE.Vector3(x * CITY_CELL, .72, z * CITY_CELL))
    torch.rotation.z = lean
    addCityPart(group, new THREE.CylinderGeometry(.075, .075, .18, 6), iron, "city-plaza-torch", new THREE.Vector3((x + lean * .15) * CITY_CELL, 1.48, z * CITY_CELL))
    addCityPart(group, new THREE.ConeGeometry(.13, .34, 6), fire, "city-plaza-torch", new THREE.Vector3((x + lean * .3) * CITY_CELL, 1.72, z * CITY_CELL))
  }
  return group
}

const createTeamFeatureVisual = feature => {
  const group = new THREE.Group()
  const type = String(feature.type || "")
  const scale = Number(feature.scale) > 0 ? Number(feature.scale) : 1
  const authoredRotation = Number(feature.rotation)
  group.rotation.y = Number.isFinite(authoredRotation) ? authoredRotation : -Math.PI / 4
  if (type === "river") group.add(createRiverVisual(scale))
  if (type === "pond") group.add(createPondVisual(scale))
  if (type === "river_bridge") group.add(createRiverBridgeVisual(scale))
  if (type === "city_building") {
    const featureId = String(feature.id || "")
    const variant = featureId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)
    group.add(createCityBuildingVisual(scale, variant, cityBuildingArchetype(featureId)))
  }
  if (type === "city_tower") group.add(createCityTowerVisual(scale))
  if (type === "city_street") group.add(createCityStreetVisual(scale))
  if (type === "city_plaza") group.add(createCityPlazaVisual(scale))
  if (type === "base_well") group.add(createBaseWellVisual(scale))
  if (type === "base_workshop") group.add(createBaseWorkshopVisual(scale))
  if (type === "base_wagon") group.add(createBaseWagonVisual(scale))
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
  pedestal.renderOrder = -1
  pedestal.material.depthWrite = false
  pedestal.position.y = .14 * WORLD_SCALE

  const pedestalInset = new THREE.Mesh(
    new THREE.CylinderGeometry(4.55 * WORLD_SCALE, 4.8 * WORLD_SCALE, .12 * WORLD_SCALE, 12),
    new THREE.MeshStandardMaterial({color: 0x6e7d7e, roughness: .82, flatShading: true}),
  )
  pedestalInset.name = "beacon-pedestal-inset"
  pedestalInset.renderOrder = -1
  pedestalInset.material.depthWrite = false
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
    this.contactShadowBatch = null
    this.staticBatches = []
    this.stormRadius = 0
    this.stormTargetRadius = 0
    this.phaseAtmosphere = null
    this.beaconGroup = null
    this.islandTerrain = null
    this.mapState = null
    this.focus = null
    this.lastBushVisibilityFocus = null
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
    this.clearContactShadowBatch()
    this.clearStaticBatches()
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
    const nonBushWalls = walls.filter(wall => wall.type !== "bush" && wall.type !== "half" && wall.type !== "moon_mist" && wall.type !== "river" && wall.type !== "river_bridge" && wall.type !== "pond" && !COLLISION_ONLY_TYPES.has(wall.type))
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
    this.rebuildContactShadowBatch()
    this.rebuildStaticBatches()
  }

  clearContactShadowBatch() {
    if (!this.contactShadowBatch) return
    this.root.remove(this.contactShadowBatch)
    disposeObjectTree(this.contactShadowBatch)
    this.contactShadowBatch = null
  }

  clearStaticBatches() {
    this.objects.forEach(object => object.traverse(node => {
      if (!node.userData?.staticBatchHidden) return
      node.userData.staticBatchHidden = false
      node.visible = true
    }))
    this.staticBatches.forEach(batch => {
      this.root.remove(batch)
      disposeObjectTree(batch)
    })
    this.staticBatches = []
  }

  rebuildStaticBatches() {
    const groups = new Map()
    this.root.updateMatrixWorld(true)
    this.objects.forEach((object, key) => {
      // Destructible visuals leave the scene through the debris path. Keep
      // their source meshes intact so the break animation remains complete.
      if (object.userData?.visualType === "destructible" || object.userData?.visualType === "dead_tree") return
      // Bush opacity is updated around the local hero, so those meshes must
      // keep their individual material state instead of entering a static batch.
      if (this.bushVisuals.has(key)) return
      object.traverse(node => {
        if (node.userData?.role === "contact-shadow") return
        const role = node.userData?.role || (node.isMesh ? object.userData?.visualType : null)
        if (!role || !node.geometry || !node.material) return
        const material = Array.isArray(node.material) ? node.material[0] : node.material
        const materialKey = [
          material.type ?? "",
          material.color?.getHex?.() ?? "",
          material.roughness ?? "",
          material.metalness ?? "",
          material.emissive?.getHex?.() ?? "",
          material.emissiveIntensity ?? "",
          material.vertexColors ? 1 : 0,
          material.flatShading ? 1 : 0,
          material.polygonOffset ? 1 : 0,
          material.polygonOffsetFactor ?? "",
          material.polygonOffsetUnits ?? "",
          material.wireframe ? 1 : 0,
          material.opacity ?? 1,
          material.transparent ? 1 : 0,
          material.depthTest ? 1 : 0,
          material.depthWrite ? 1 : 0,
          material.side ?? "",
          material.blending ?? "",
          material.map?.uuid ?? "",
        ].join(":")
        const cellX = Math.floor((node.matrixWorld.elements[12] / WORLD_SCALE) / STATIC_BATCH_CELL_SIZE)
        const cellZ = Math.floor((node.matrixWorld.elements[14] / WORLD_SCALE) / STATIC_BATCH_CELL_SIZE)
        const key = `${role}:${materialKey}:${cellX}:${cellZ}`
        if (!groups.has(key)) groups.set(key, {role, material, entries: []})
        groups.get(key).entries.push(node)
      })
    })

    groups.forEach(({role, material, entries}) => {
      if (entries.length < 2) return
      const geometries = entries.map(node => {
        const geometry = node.geometry.clone()
        geometry.applyMatrix4(node.matrixWorld)
        return geometry
      })
      const merged = mergeGeometries(geometries, false)
      geometries.forEach(geometry => geometry.dispose())
      if (!merged) return
      merged.computeBoundingBox()
      merged.computeBoundingSphere()
      const batch = new THREE.Mesh(merged, material.clone())
      batch.name = `map-static-batch-${role}-${this.staticBatches.length}`
      batch.userData.role = `static-batch:${role}`
      batch.renderOrder = entries[0].renderOrder
      this.root.add(batch)
      this.staticBatches.push(batch)
      entries.forEach(node => {
        node.userData.staticBatchHidden = true
        node.visible = false
      })
    })
  }

  rebuildContactShadowBatch() {
    const shadows = []
    this.objects.forEach(object => {
      object.traverse(node => {
        if (node.userData?.role !== "contact-shadow") return
        shadows.push({
          object,
          node,
          radius: Number(node.geometry?.parameters?.radius) || 1,
        })
      })
    })
    if (!shadows.length) return

    this.root.updateMatrixWorld(true)
    const geometry = new THREE.CircleGeometry(1, CONTACT_SHADOW_SEGMENTS)
    const material = shadows[0].node.material.clone()
    const batch = new THREE.InstancedMesh(geometry, material, shadows.length)
    batch.name = "map-contact-shadow-batch"
    batch.userData.role = "contact-shadow-batch"
    batch.renderOrder = shadows[0].node.renderOrder

    const matrix = new THREE.Matrix4()
    const scale = new THREE.Vector3()
    shadows.forEach(({object, node, radius}, index) => {
      matrix.multiplyMatrices(object.matrixWorld, node.matrix)
      scale.set(radius, radius, radius)
      matrix.scale(scale)
      batch.setMatrixAt(index, matrix)
      // Keep the source node hidden so a later destructible-wall/map sync can
      // rebuild the batch without losing the original shadow geometry.
      node.visible = false
    })
    batch.instanceMatrix.needsUpdate = true
    batch.computeBoundingSphere()
    this.contactShadowBatch = batch
    this.root.add(batch)
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
    // Mutate the cached offset in place; allocating a temporary object on
    // every RAF fed avoidable GC work into the steady-state render loop.
    this.waterTexture.offset.x += delta * 0.035
    this.waterTexture.offset.y += delta * 0.018
    const focusChanged = this.focus && (!this.lastBushVisibilityFocus || Math.hypot(
      this.focus.x - this.lastBushVisibilityFocus.x,
      this.focus.y - this.lastBushVisibilityFocus.y,
    ) >= BUSH_VISIBILITY_FOCUS_EPSILON)
    if (focusChanged) {
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
      this.lastBushVisibilityFocus = {...this.focus}
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
    this.clearContactShadowBatch()
    this.clearStaticBatches()
    if (this.stormMesh) disposeObjectTree(this.stormMesh)
    if (this.phaseAtmosphere) disposeObjectTree(this.phaseAtmosphere)
    if (this.beaconGroup) disposeObjectTree(this.beaconGroup)
    this.featureObjects.forEach(object => disposeObjectTree(object))
    this.featureObjects.clear()
    if (this.islandTerrain) disposeObjectTree(this.islandTerrain)
    if (this.wildflowerField) disposeObjectTree(this.wildflowerField)
    this.objectiveObjects.forEach(object => disposeObjectTree(object))
    this.objectiveObjects.clear()
    this.objects.forEach(object => disposeObjectTree(object))
    this.objects.clear()
    this.debris.forEach(piece => disposeObjectTree(piece.object))
    this.debris = []
    this.bushVisuals.clear()
    this.waterTexture.dispose()
  }
}
