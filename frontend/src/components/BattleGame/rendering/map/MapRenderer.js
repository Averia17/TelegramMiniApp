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
import {createProp, createVineField} from "./PropRenderer.js"
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
const COLLISION_ONLY_TYPES = new Set(["objective", "beacon", "city_object"])
const DEFAULT_MAP_TILE_SIZE = 40
const BEACON_VISUAL_SCALE = 24
const OBJECTIVE_HEALTH_FONT_SIZE = getBattleHealthFontSize({canvasHeight: 80, spriteHeight: .62, parentScale: 1.75})
// Northern Ash keeps a restrained cold grade. It is dark enough to sell the
// castle-at-dusk mood without returning to the opaque .14 veil that crushed
// every roof and route color.
const TEAM_BATTLE_ATMOSPHERE = Object.freeze({color: 0x27352f, opacity: .085})
const TEAM_BATTLE_CLASSIC_MAP_ID = "team-battle@20260816"
const TEAM_BATTLE_CLASSIC_MAP_NAME = "team-battle"
const TEAM_BATTLE_NORTHERN_MAP_NAME = "team-battle-northern"

const isClassicTeamBattleMap = map => String(map?.name || "") === TEAM_BATTLE_CLASSIC_MAP_NAME ||
  String(map?.id || "") === TEAM_BATTLE_CLASSIC_MAP_ID

const isNorthernTeamBattleMap = map => String(map?.name || "") === TEAM_BATTLE_NORTHERN_MAP_NAME

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
    new THREE.IcosahedronGeometry(3.75, 1),
    new THREE.MeshBasicMaterial({color: 0x8fe7ff, transparent: true, opacity: .008, wireframe: true, depthTest: false, depthWrite: false}),
  )
  shield.name = "town-hall-protected-shield"
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, .065, 8, 40),
    new THREE.MeshBasicMaterial({color: 0xd8f7ff, transparent: true, opacity: .36, depthTest: false, depthWrite: false}),
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = .15
  ring.name = "town-hall-protected-ring"
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(.52, 0),
    new THREE.MeshBasicMaterial({color, transparent: true, opacity: .95, depthTest: false, depthWrite: false}),
  )
  core.position.y = 5.35
  core.name = "town-hall-protected-lock"
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }))
  label.renderOrder = 4
  label.position.y = 5.05
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
  const plaster = new THREE.MeshStandardMaterial({color: 0xc1ad91, roughness: .96, flatShading: true})
  const timber = new THREE.MeshStandardMaterial({color: blue ? 0x4b4035 : 0x54362f, roughness: .98, flatShading: true})
  const roofMaterial = new THREE.MeshStandardMaterial({color: blue ? 0x5c6867 : 0x6b443c, roughness: .98, flatShading: true})
  const stone = new THREE.MeshStandardMaterial({color: blue ? 0x625e56 : 0x604947, roughness: .98, flatShading: true})
  const stoneLight = new THREE.MeshStandardMaterial({color: blue ? 0x9d9079 : 0x96746a, roughness: .98, flatShading: true})
  const windowMaterial = new THREE.MeshStandardMaterial({color: blue ? 0x183d43 : 0x351d24, roughness: .62, metalness: .08, flatShading: true})
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
  health.group.position.y = hall ? 6.05 : 4.82
  const protection = hall ? createProtectionBadge(color) : null
  if (protection) group.add(protection)
  group.add(health.group)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(hall ? 2.95 : 1.85, hall ? 3.3 : 2.25, hall ? .72 : .55, hall ? 10 : 8), stone)
  base.position.y = hall ? .36 : .28
  base.name = hall ? "team-town-hall-foundation" : "team-tower-foundation"
  if (hall) {
    const house = new THREE.Group()
    house.name = "team-town-hall-house"
    house.position.y = 1.32
    const keep = new THREE.Group()
    keep.name = "team-town-hall-keep"
    addPart(keep, new THREE.BoxGeometry(4.15, 2.55, 3.05), plaster, "team-town-hall-keep", new THREE.Vector3(0, 0, .1))
    addPart(keep, new THREE.BoxGeometry(3.72, .28, 2.7), stoneLight, "team-town-hall-keep", new THREE.Vector3(0, -1.38, .1))
    addPart(keep, new THREE.BoxGeometry(.22, 2.48, 3.18), timber, "team-town-hall-timber", new THREE.Vector3(-2.02, 0, .1))
    addPart(keep, new THREE.BoxGeometry(.22, 2.48, 3.18), timber, "team-town-hall-timber", new THREE.Vector3(2.02, 0, .1))
    addPart(keep, new THREE.BoxGeometry(4.3, .18, .2), timber, "team-town-hall-timber", new THREE.Vector3(0, .86, -1.47))
    addPart(keep, new THREE.BoxGeometry(4.3, .18, .2), timber, "team-town-hall-timber", new THREE.Vector3(0, -.82, -1.47))
    addPart(keep, new THREE.BoxGeometry(.18, .18, 3.16), timber, "team-town-hall-timber", new THREE.Vector3(0, 0, .1), new THREE.Euler(0, 0, -.3))
    for (const y of [-.35, .38]) {
      addPart(keep, new THREE.BoxGeometry(3.74, .1, .12), stoneLight, "team-town-hall-masonry-band", new THREE.Vector3(0, y, -1.53))
    }
    for (const x of [-1.72, 1.72]) {
      for (const y of [-.88, -.18, .52]) {
        addPart(keep, new THREE.BoxGeometry(.34, .38, .16), stoneLight, "team-town-hall-corner-stone", new THREE.Vector3(x, y, -1.55))
      }
    }

    const gate = new THREE.Group()
    gate.name = "team-town-hall-gate"
    addPart(gate, new THREE.BoxGeometry(1.08, 1.18, .14), windowMaterial, "team-town-hall-door", new THREE.Vector3(0, -.55, -1.58))
    addPart(gate, new THREE.BoxGeometry(.18, 1.32, .22), stoneLight, "team-town-hall-gate", new THREE.Vector3(-.67, -.48, -1.6))
    addPart(gate, new THREE.BoxGeometry(.18, 1.32, .22), stoneLight, "team-town-hall-gate", new THREE.Vector3(.67, -.48, -1.6))
    addPart(gate, new THREE.BoxGeometry(1.52, .2, .22), stoneLight, "team-town-hall-gate", new THREE.Vector3(0, .16, -1.6))
    addPart(gate, new THREE.ConeGeometry(1.02, .5, 4), roofMaterial, "team-town-hall-gate-roof", new THREE.Vector3(0, .48, -1.68), new THREE.Euler(0, Math.PI / 4, 0))
    addPart(gate, new THREE.CylinderGeometry(.045, .06, 1.08, 6), timber, "team-town-hall-gate-post", new THREE.Vector3(-.9, -.55, -1.72))
    addPart(gate, new THREE.CylinderGeometry(.045, .06, 1.08, 6), timber, "team-town-hall-gate-post", new THREE.Vector3(.9, -.55, -1.72))
    addPart(gate, new THREE.BoxGeometry(.76, .08, .08), timber, "team-town-hall-door", new THREE.Vector3(0, -.9, -1.7))
    addPart(gate, new THREE.CylinderGeometry(.08, .08, .16, 8), accent, "team-town-hall-door", new THREE.Vector3(0, -.56, -1.7), new THREE.Euler(Math.PI / 2, 0, 0))
    for (const [y, z, width] of [[-1.42, -1.82, 1.42], [-1.29, -1.94, 1.16]]) {
      addPart(gate, new THREE.BoxGeometry(width, .14, .5), stoneLight, "team-town-hall-entrance-step", new THREE.Vector3(0, y, z))
    }

    for (const x of [-1.28, 1.28]) {
      addPart(keep, new THREE.BoxGeometry(.52, 1.35, .5), stoneLight, "team-town-hall-buttress", new THREE.Vector3(x, -.58, -1.18))
      addPart(keep, new THREE.BoxGeometry(.42, 1.1, .42), stone, "team-town-hall-buttress", new THREE.Vector3(x, .7, .92))
    }
    addPart(keep, new THREE.BoxGeometry(.62, .8, .08), windowMaterial, "team-town-hall-window", new THREE.Vector3(-1.35, .22, -1.57))
    addPart(keep, new THREE.BoxGeometry(.62, .8, .08), windowMaterial, "team-town-hall-window", new THREE.Vector3(1.35, .22, -1.57))
    addPart(keep, new THREE.BoxGeometry(.08, .88, .1), stoneLight, "team-town-hall-window", new THREE.Vector3(-1.35, .22, -1.63))
    addPart(keep, new THREE.BoxGeometry(.08, .88, .1), stoneLight, "team-town-hall-window", new THREE.Vector3(1.35, .22, -1.63))
    addPart(keep, new THREE.BoxGeometry(.7, .08, .1), stoneLight, "team-town-hall-window", new THREE.Vector3(-1.35, .22, -1.64))
    addPart(keep, new THREE.BoxGeometry(.7, .08, .1), stoneLight, "team-town-hall-window", new THREE.Vector3(1.35, .22, -1.64))
    addPart(keep, new THREE.CylinderGeometry(.3, .3, .08, 8), timber, "team-town-hall-crest", new THREE.Vector3(0, .68, -1.65), new THREE.Euler(Math.PI / 2, 0, 0))
    addPart(keep, new THREE.TorusGeometry(.3, .045, 6, 12), accent, "team-town-hall-crest", new THREE.Vector3(0, .68, -1.71), new THREE.Euler(Math.PI / 2, 0, 0))

    const bellTower = new THREE.Group()
    bellTower.name = "team-town-hall-bell-tower"
    addPart(bellTower, new THREE.BoxGeometry(1.2, 1.95, 1.2), stoneLight, "team-town-hall-bell-tower", new THREE.Vector3(0, 1.58, .84))
    addPart(bellTower, new THREE.BoxGeometry(1.32, .16, 1.32), timber, "team-town-hall-timber", new THREE.Vector3(0, 2.55, .84))
    addPart(bellTower, new THREE.BoxGeometry(.16, .86, .08), windowMaterial, "team-town-hall-bell-tower", new THREE.Vector3(0, 1.78, .2))
    addPart(bellTower, new THREE.BoxGeometry(.16, .86, .08), windowMaterial, "team-town-hall-bell-tower", new THREE.Vector3(-.36, 1.78, .24))
    addPart(bellTower, new THREE.ConeGeometry(.82, 1.14, 4), roofMaterial, "team-town-hall-bell-tower", new THREE.Vector3(0, 3.2, .84), new THREE.Euler(0, Math.PI / 4, 0))
    addPart(bellTower, new THREE.SphereGeometry(.22, 8, 6), accent, "team-town-hall-bell", new THREE.Vector3(0, 1.58, .25))
    addPart(bellTower, new THREE.CylinderGeometry(.035, .035, 1.1, 6), timber, "team-town-hall-banner", new THREE.Vector3(0, 4.04, .84))
    addPart(bellTower, new THREE.BoxGeometry(.58, .42, .06), accent, "team-town-hall-banner", new THREE.Vector3(.18, 3.78, .84), new THREE.Euler(0, 0, -.08))
    addPart(bellTower, new THREE.ConeGeometry(.14, .28, 6), accent, "team-town-hall-roof-finial", new THREE.Vector3(0, 4.64, .84))

    for (const x of [-1.75, 1.75]) {
      addPart(house, new THREE.CylinderGeometry(.52, .68, 1.65, 8), stoneLight, "team-town-hall-turret", new THREE.Vector3(x, .72, .42))
      addPart(house, new THREE.CylinderGeometry(.6, .6, .12, 8), timber, "team-town-hall-turret", new THREE.Vector3(x, 1.52, .42))
      addPart(house, new THREE.ConeGeometry(.7, .82, 6), roofMaterial, "team-town-hall-turret", new THREE.Vector3(x, 2.02, .42))
      addPart(house, new THREE.BoxGeometry(.16, .38, .08), windowMaterial, "team-town-hall-turret", new THREE.Vector3(x, .8, -.18))
    }
    addPart(bellTower, new THREE.CylinderGeometry(.035, .035, 1.05, 6), timber, "team-town-hall-banner", new THREE.Vector3(0, 3.9, .72))
    addPart(bellTower, new THREE.BoxGeometry(.56, .42, .06), accent, "team-town-hall-banner", new THREE.Vector3(.2, 3.65, .72), new THREE.Euler(0, 0, -.08))

    house.add(keep)
    house.add(gate, bellTower)
    addPart(house, new THREE.BoxGeometry(.72, .3, .72), stoneLight, "team-town-hall-chimney", new THREE.Vector3(1.42, .86, .72))
    addPart(house, new THREE.BoxGeometry(.5, .72, .5), stone, "team-town-hall-chimney", new THREE.Vector3(1.42, 1.34, .72))
    addPart(house, new THREE.BoxGeometry(.62, .06, .08), accent, "team-town-hall-banner", new THREE.Vector3(-1.82, 1.18, -1.62))
    addPart(house, new THREE.CylinderGeometry(.035, .045, 1.42, 6), timber, "team-town-hall-banner", new THREE.Vector3(-1.82, 1.7, -1.62))
    addPart(house, new THREE.BoxGeometry(.48, .5, .06), accent, "team-town-hall-banner", new THREE.Vector3(-1.64, 1.46, -1.63), new THREE.Euler(0, 0, -.08))
    addPart(house, new THREE.BoxGeometry(.62, .06, .08), accent, "team-town-hall-banner", new THREE.Vector3(1.82, 1.18, -1.62))
    addPart(house, new THREE.CylinderGeometry(.035, .045, 1.42, 6), timber, "team-town-hall-banner", new THREE.Vector3(1.82, 1.7, -1.62))
    addPart(house, new THREE.BoxGeometry(.48, .5, .06), accent, "team-town-hall-banner", new THREE.Vector3(1.64, 1.46, -1.63), new THREE.Euler(0, 0, .08))

    const roof = new THREE.Group()
    roof.name = "team-town-hall-roof"
    roof.position.y = 3.02
    roof.scale.setScalar(1.12)
    addPart(roof, new THREE.ConeGeometry(2.35, 1.16, 4), roofMaterial, "team-town-hall-roof-slope", new THREE.Vector3(0, .38, .1), new THREE.Euler(0, Math.PI / 4, 0))
    addPart(roof, new THREE.BoxGeometry(4.4, .16, .18), timber, "team-town-hall-roof-ridge", new THREE.Vector3(0, 1.12, .1))
    addPart(roof, new THREE.BoxGeometry(.14, .12, 3.9), timber, "team-town-hall-roof-beam", new THREE.Vector3(0, 1.18, .1))
    addPart(roof, new THREE.BoxGeometry(3.9, .12, .14), timber, "team-town-hall-roof-beam", new THREE.Vector3(0, 1.18, .1))
    addPart(roof, new THREE.BoxGeometry(1.05, .14, 1.9), roofMaterial, "team-town-hall-roof-slope", new THREE.Vector3(-1.58, .18, .18), new THREE.Euler(0, 0, -.16))
    addPart(roof, new THREE.BoxGeometry(1.05, .14, 1.9), roofMaterial, "team-town-hall-roof-slope", new THREE.Vector3(1.58, .18, .18), new THREE.Euler(0, 0, .16))
    addPart(roof, new THREE.BoxGeometry(.52, .12, 1.2), stoneLight, "team-town-hall-roof-debris", new THREE.Vector3(-1.45, .64, -.62), new THREE.Euler(0, 0, .18))
    house.name = "team-town-hall-house"
    const rubble = new THREE.Group()
    rubble.name = "team-town-hall-rubble"
    for (const [x, z, size] of [[-2.75, -1.8, .25], [2.7, -1.72, .22], [-2.5, 1.72, .2], [2.58, 1.62, .24]]) {
      addPart(rubble, new THREE.DodecahedronGeometry(size, 0), stoneLight, "team-town-hall-rubble", new THREE.Vector3(x, .28, z))
    }
    for (const x of [-1.82, 1.82]) {
      addPart(rubble, new THREE.CylinderGeometry(.16, .2, .48, 8), timber, "team-town-hall-courtyard", new THREE.Vector3(x, .38, 1.08))
      addPart(rubble, new THREE.BoxGeometry(.28, .22, .22), stoneLight, "team-town-hall-courtyard", new THREE.Vector3(x, .68, 1.08))
    }
    house.add(rubble)
    house.scale.setScalar(1.14)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, .12, 8, 24), new THREE.MeshBasicMaterial({color, transparent: true, opacity: .7, depthWrite: false}))
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
  [-100, 3.65], [-88, 3.25], [-74, 2.9], [-60, 2.6], [-48, 2.3], [-36, 2.45],
  [-24, 2.2], [-12, 2.4], [0, 2.2], [12, 2.4], [24, 2.2], [36, 2.45], [48, 2.3],
  [60, 2.6], [74, 2.9], [88, 3.25], [100, 3.65],
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
  const water = new THREE.MeshStandardMaterial({color: 0x367f87, roughness: .6, metalness: .04, flatShading: true})
  createBaseFeaturePart(group, new THREE.CylinderGeometry(1.05, 1.18, .28, 10), stone, "base-well-stone", new THREE.Vector3(0, .14, 0))
  createBaseFeaturePart(group, new THREE.TorusGeometry(.88, .16, 5, 10), stoneLight, "base-well-stone", new THREE.Vector3(0, .34, 0), new THREE.Euler(Math.PI / 2, 0, 0))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.72, .72, .035, 12), water, "base-well-water", new THREE.Vector3(0, .38, 0))
  for (const x of [-.78, .78]) createBaseFeaturePart(group, new THREE.CylinderGeometry(.09, .12, 1.8, 6), wood, "base-well-crank", new THREE.Vector3(x, 1.05, 0))
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.85, .1, .12), wood, "base-well-crank", new THREE.Vector3(0, 1.92, 0))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.055, .055, 1.05, 6), iron, "base-well-crank", new THREE.Vector3(0, 1.2, 0))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.025, .025, .55, 5), wood, "base-well-rope", new THREE.Vector3(0, .9, -.38))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.22, .28, .42, 8), wood, "base-well-bucket", new THREE.Vector3(0, .72, -.38))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.3, .3, .05, 8), iron, "base-well-bucket", new THREE.Vector3(0, .94, -.38))
  for (const [x, z] of [[-.98, -.18], [.92, .2]]) {
    const stoneBlock = createBaseFeaturePart(group, new THREE.DodecahedronGeometry(.2, 0), stoneLight, "base-well-stone-detail", new THREE.Vector3(x, .28, z))
    stoneBlock.scale.y = .65
  }
  return group
}

const createBaseWorkshopVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const wood = new THREE.MeshStandardMaterial({color: 0x5c402e, roughness: 1, flatShading: true})
  const roof = new THREE.MeshStandardMaterial({color: 0x6b5541, roughness: 1, flatShading: true})
  const stone = new THREE.MeshStandardMaterial({color: 0x6c746c, roughness: .98, flatShading: true})
  const iron = new THREE.MeshStandardMaterial({color: 0x343a39, roughness: .56, metalness: .3, flatShading: true})
  const fire = new THREE.MeshStandardMaterial({color: 0xd17a32, roughness: .4, emissive: 0x632209, emissiveIntensity: .52, flatShading: true})
  createBaseFeaturePart(group, new THREE.BoxGeometry(3.25, 1.35, 1.55), wood, "base-workshop-frame", new THREE.Vector3(0, .72, 0))
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.9, .18, 1.95), roof, "base-workshop-roof", new THREE.Vector3(-.87, 1.7, 0), new THREE.Euler(0, 0, .2))
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.9, .18, 1.95), roof, "base-workshop-roof", new THREE.Vector3(.87, 1.7, 0), new THREE.Euler(0, 0, -.2))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.14, .16, 2.05), wood, "base-workshop-roof-ridge", new THREE.Vector3(0, 1.94, 0))
  for (const x of [-1.45, -.72, .72, 1.45]) createBaseFeaturePart(group, new THREE.BoxGeometry(.055, .045, 1.88), wood, "base-workshop-roof-slats", new THREE.Vector3(x, 1.82, 0))
  for (const x of [-1.35, 1.35]) createBaseFeaturePart(group, new THREE.CylinderGeometry(.09, .11, 1.8, 6), wood, "base-workshop-frame", new THREE.Vector3(x, .9, -.7))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.7, .34, .38), iron, "base-workshop-anvil", new THREE.Vector3(.58, .94, -1.02))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.12, .16, .7, 6), iron, "base-workshop-anvil", new THREE.Vector3(.58, .55, -1.02))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.42, .48, .7, 10), stone, "base-workshop-barrel", new THREE.Vector3(-.92, .42, -1.0))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.5, .5, .35), roof, "base-workshop-crate", new THREE.Vector3(1.15, .28, .72), new THREE.Euler(0, .18, .05))
  createBaseFeaturePart(group, new THREE.ConeGeometry(.16, .48, 6), iron, "base-workshop-chimney", new THREE.Vector3(-1.05, 1.78, .2))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.28, .34, .16, 8), stone, "base-workshop-fire", new THREE.Vector3(-1.02, .18, -1.12))
  createBaseFeaturePart(group, new THREE.SphereGeometry(.14, 7, 5), fire, "base-workshop-fire", new THREE.Vector3(-1.02, .42, -1.12))
  const hammerHandle = createBaseFeaturePart(group, new THREE.CylinderGeometry(.035, .045, .72, 5), wood, "base-workshop-hammer", new THREE.Vector3(.95, 1.08, -1.08), new THREE.Euler(0, 0, -.52))
  hammerHandle.rotation.y = -.14
  createBaseFeaturePart(group, new THREE.BoxGeometry(.25, .13, .14), iron, "base-workshop-hammer", new THREE.Vector3(1.22, 1.38, -.98), new THREE.Euler(0, 0, -.52))
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.02, .12, .08), wood, "base-workshop-shelf", new THREE.Vector3(-.28, 1.27, -1.02))
  for (const x of [-.68, .1]) createBaseFeaturePart(group, new THREE.CylinderGeometry(.07, .08, .2, 6), iron, "base-workshop-shelf", new THREE.Vector3(x, 1.44, -1.02))
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
  for (const x of [-.68, .46]) createBaseFeaturePart(group, new THREE.BoxGeometry(.1, .28, 1.12), darkWood, "base-wagon-strap", new THREE.Vector3(x, 1.16, 0), new THREE.Euler(0, -.08, .04))
  const crate = createBaseFeaturePart(group, new THREE.BoxGeometry(.58, .5, .52), wood, "base-wagon-crate", new THREE.Vector3(-1.03, .98, .28), new THREE.Euler(0, -.12, .02))
  crate.userData.detail = "slatted-crate"
  for (const z of [-.02, .18]) createBaseFeaturePart(group, new THREE.BoxGeometry(.62, .045, .05), darkWood, "base-wagon-crate", new THREE.Vector3(-1.03, .98 + z, .55), new THREE.Euler(0, -.12, 0))
  createBaseFeaturePart(group, new THREE.DodecahedronGeometry(.22, 0), cloth, "base-wagon-hay", new THREE.Vector3(.3, 1.23, -.2))
  return group
}

const createBaseBarracksVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const timber = new THREE.MeshStandardMaterial({color: 0x5a3828, roughness: 1, flatShading: true})
  const plaster = new THREE.MeshStandardMaterial({color: 0x9a8065, roughness: 1, flatShading: true})
  const roof = new THREE.MeshStandardMaterial({color: 0x563c31, roughness: 1, flatShading: true})
  const dark = new THREE.MeshStandardMaterial({color: 0x292f32, roughness: .9, flatShading: true})
  const iron = new THREE.MeshStandardMaterial({color: 0x394146, roughness: .62, metalness: .25, flatShading: true})
  const banner = new THREE.MeshStandardMaterial({color: 0x3977a8, roughness: .9, flatShading: true})
  createBaseFeaturePart(group, new THREE.BoxGeometry(4.05, .24, 2.42), stoneLightMaterial(), "base-barracks-foundation", new THREE.Vector3(0, .12, 0))
  createBaseFeaturePart(group, new THREE.BoxGeometry(3.72, 1.52, 2.18), plaster, "base-barracks-wall", new THREE.Vector3(0, .92, .06))
  for (const x of [-1.75, 1.75]) createBaseFeaturePart(group, new THREE.BoxGeometry(.2, 1.7, 2.3), timber, "base-barracks-timber", new THREE.Vector3(x, .92, .06))
  for (const x of [-1.12, 0, 1.12]) createBaseFeaturePart(group, new THREE.BoxGeometry(.14, 1.5, 2.25), timber, "base-barracks-timber", new THREE.Vector3(x, .92, -.03))
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.95, .18, 2.72), roof, "base-barracks-roof", new THREE.Vector3(-1.02, 1.92, .02), new THREE.Euler(0, 0, .24))
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.95, .18, 2.72), roof, "base-barracks-roof", new THREE.Vector3(1.02, 1.92, .02), new THREE.Euler(0, 0, -.24))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.16, .16, 2.78), timber, "base-barracks-roof-ridge", new THREE.Vector3(0, 2.2, .02))
  for (const x of [-1.45, -.72, .72, 1.45]) createBaseFeaturePart(group, new THREE.BoxGeometry(.06, .045, 2.42), timber, "base-barracks-roof-slats", new THREE.Vector3(x, 2.1, .02))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.72, 1.02, .12), dark, "base-barracks-door", new THREE.Vector3(0, .67, -1.08))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.9, .12, .16), timber, "base-barracks-door", new THREE.Vector3(0, 1.2, -1.12))
  for (const x of [-1.25, 1.25]) {
    createBaseFeaturePart(group, new THREE.BoxGeometry(.54, .48, .08), dark, "base-barracks-window", new THREE.Vector3(x, 1.12, -1.1))
    createBaseFeaturePart(group, new THREE.BoxGeometry(.06, .56, .1), timber, "base-barracks-window", new THREE.Vector3(x, 1.12, -1.16))
  }
  for (const x of [-1.25, 1.25]) {
    createBaseFeaturePart(group, new THREE.CylinderGeometry(.36, .36, .1, 8), iron, "base-barracks-shield", new THREE.Vector3(x, .92, -1.24), new THREE.Euler(Math.PI / 2, 0, 0))
    createBaseFeaturePart(group, new THREE.BoxGeometry(.08, .5, .08), banner, "base-barracks-shield", new THREE.Vector3(x, .92, -1.31))
    createBaseFeaturePart(group, new THREE.BoxGeometry(.5, .08, .08), banner, "base-barracks-shield", new THREE.Vector3(x, .92, -1.31))
  }
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.045, .06, 2.2, 5), iron, "base-barracks-banner", new THREE.Vector3(1.46, 2.58, -.1))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.68, .56, .06), banner, "base-barracks-banner", new THREE.Vector3(1.72, 2.35, -.1), new THREE.Euler(0, 0, -.12))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.16, .2, .44, 8), iron, "base-barracks-lantern", new THREE.Vector3(-1.8, 1.76, -1.12))
  createBaseFeaturePart(group, new THREE.SphereGeometry(.11, 7, 5), fireMaterial(), "base-barracks-lantern", new THREE.Vector3(-1.8, 1.86, -1.12))
  return group
}

const createBaseStorehouseVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const timber = new THREE.MeshStandardMaterial({color: 0x68432b, roughness: 1, flatShading: true})
  const plank = new THREE.MeshStandardMaterial({color: 0x876044, roughness: 1, flatShading: true})
  const roof = new THREE.MeshStandardMaterial({color: 0x75604a, roughness: 1, flatShading: true})
  const dark = new THREE.MeshStandardMaterial({color: 0x303538, roughness: .9, flatShading: true})
  const iron = new THREE.MeshStandardMaterial({color: 0x3b403e, roughness: .7, metalness: .18, flatShading: true})
  const cloth = new THREE.MeshStandardMaterial({color: 0xb0804a, roughness: .94, flatShading: true})
  createBaseFeaturePart(group, new THREE.BoxGeometry(4.0, .22, 2.28), stoneLightMaterial(), "base-storehouse-foundation", new THREE.Vector3(0, .11, .04))
  createBaseFeaturePart(group, new THREE.BoxGeometry(3.68, 1.46, 2.02), plank, "base-storehouse-wall", new THREE.Vector3(0, .86, .08))
  for (const x of [-1.7, 1.7]) createBaseFeaturePart(group, new THREE.BoxGeometry(.2, 1.65, 2.15), timber, "base-storehouse-timber", new THREE.Vector3(x, .88, .06))
  for (const x of [-.9, .9]) createBaseFeaturePart(group, new THREE.BoxGeometry(.12, 1.5, 2.1), timber, "base-storehouse-timber", new THREE.Vector3(x, .88, -.02))
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.96, .18, 2.6), roof, "base-storehouse-roof", new THREE.Vector3(-1.02, 1.8, .03), new THREE.Euler(0, 0, .22))
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.96, .18, 2.6), roof, "base-storehouse-roof", new THREE.Vector3(1.02, 1.8, .03), new THREE.Euler(0, 0, -.22))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.15, .16, 2.68), timber, "base-storehouse-roof-ridge", new THREE.Vector3(0, 2.06, .03))
  for (const x of [-1.45, -.72, .72, 1.45]) createBaseFeaturePart(group, new THREE.BoxGeometry(.06, .045, 2.34), timber, "base-storehouse-roof-slats", new THREE.Vector3(x, 1.96, .03))
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.1, 1.03, .12), dark, "base-storehouse-door", new THREE.Vector3(0, .67, -1.02))
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.34, .12, .16), timber, "base-storehouse-door", new THREE.Vector3(0, 1.2, -1.06))
  createBaseFeaturePart(group, new THREE.BoxGeometry(3.18, .14, .72), cloth, "base-storehouse-awning", new THREE.Vector3(0, 1.62, -1.34), new THREE.Euler(.18, 0, 0))
  for (const x of [-1.35, 1.35]) createBaseFeaturePart(group, new THREE.CylinderGeometry(.07, .1, 1.4, 6), timber, "base-storehouse-awning", new THREE.Vector3(x, .9, -1.48))
  for (const [x, z, y] of [[-1.24, -.84, .42], [1.24, -.8, .42], [1.02, .62, .34]]) {
    createBaseFeaturePart(group, new THREE.BoxGeometry(.62, .55, .58), plank, "base-storehouse-crate", new THREE.Vector3(x, y, z), new THREE.Euler(0, x * .08, 0))
    createBaseFeaturePart(group, new THREE.BoxGeometry(.66, .045, .06), timber, "base-storehouse-crate", new THREE.Vector3(x, y + .16, z - .3), new THREE.Euler(0, x * .08, 0))
  }
  for (const x of [-.82, .82]) {
    createBaseFeaturePart(group, new THREE.CylinderGeometry(.4, .44, .64, 10), timber, "base-storehouse-barrel", new THREE.Vector3(x, .4, -.95))
    createBaseFeaturePart(group, new THREE.TorusGeometry(.35, .045, 5, 10), iron, "base-storehouse-barrel", new THREE.Vector3(x, .55, -.95), new THREE.Euler(Math.PI / 2, 0, 0))
  }
  return group
}

const createBaseStableVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const timber = new THREE.MeshStandardMaterial({color: 0x69452d, roughness: 1, flatShading: true})
  const darkWood = new THREE.MeshStandardMaterial({color: 0x463024, roughness: 1, flatShading: true})
  const roof = new THREE.MeshStandardMaterial({color: 0x806346, roughness: 1, flatShading: true})
  const plaster = new THREE.MeshStandardMaterial({color: 0x9d8568, roughness: 1, flatShading: true})
  const hay = new THREE.MeshStandardMaterial({color: 0xc18b3f, roughness: 1, flatShading: true})
  const iron = new THREE.MeshStandardMaterial({color: 0x38403c, roughness: .7, metalness: .16, flatShading: true})
  createBaseFeaturePart(group, new THREE.BoxGeometry(4.08, .2, 2.5), stoneLightMaterial(), "base-stable-foundation", new THREE.Vector3(0, .1, .08))
  createBaseFeaturePart(group, new THREE.BoxGeometry(3.7, 1.42, .26), plaster, "base-stable-frame", new THREE.Vector3(0, .85, .88))
  for (const x of [-1.82, 1.82]) createBaseFeaturePart(group, new THREE.CylinderGeometry(.1, .14, 2.0, 6), timber, "base-stable-frame", new THREE.Vector3(x, 1.0, -.1))
  for (const x of [-.92, .92]) createBaseFeaturePart(group, new THREE.CylinderGeometry(.08, .12, 1.86, 6), timber, "base-stable-stall", new THREE.Vector3(x, .94, -.22))
  createBaseFeaturePart(group, new THREE.BoxGeometry(3.72, .18, 2.74), roof, "base-stable-roof", new THREE.Vector3(0, 1.92, .05))
  createBaseFeaturePart(group, new THREE.BoxGeometry(3.34, .12, .16), darkWood, "base-stable-roof", new THREE.Vector3(0, 2.06, -.05))
  for (const x of [-1.35, -.45, .45, 1.35]) createBaseFeaturePart(group, new THREE.BoxGeometry(.06, .045, 2.48), darkWood, "base-stable-roof-slats", new THREE.Vector3(x, 2.0, .05))
  createBaseFeaturePart(group, new THREE.BoxGeometry(3.2, .28, .34), timber, "base-stable-trough", new THREE.Vector3(0, .42, -1.02))
  for (const x of [-1.28, 1.28]) createBaseFeaturePart(group, new THREE.CylinderGeometry(.08, .1, .62, 6), timber, "base-stable-trough", new THREE.Vector3(x, .7, -1.02))
  for (const x of [-1.28, .05, 1.28]) {
    createBaseFeaturePart(group, new THREE.DodecahedronGeometry(.46, 0), hay, "base-stable-hay", new THREE.Vector3(x, .62, .42))
    createBaseFeaturePart(group, new THREE.DodecahedronGeometry(.3, 0), hay, "base-stable-hay", new THREE.Vector3(x + .16, 1.02, .32))
  }
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.18, .08, .08), iron, "base-stable-harness", new THREE.Vector3(-1.02, 1.26, .78))
  for (const x of [-1.45, -.62]) createBaseFeaturePart(group, new THREE.BoxGeometry(.08, .36, .08), iron, "base-stable-harness", new THREE.Vector3(x, 1.04, .78))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.62, .42, .08), roof, "base-stable-sign", new THREE.Vector3(0, 1.46, -1.19))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.1, .52, .1), timber, "base-stable-sign", new THREE.Vector3(0, 1.68, -1.19))
  return group
}

const createBaseChapelVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const stone = new THREE.MeshStandardMaterial({color: 0x747a76, roughness: .98, flatShading: true})
  const stoneLight = new THREE.MeshStandardMaterial({color: 0xa19783, roughness: .98, flatShading: true})
  const roof = new THREE.MeshStandardMaterial({color: 0x4a5660, roughness: .98, flatShading: true})
  const timber = new THREE.MeshStandardMaterial({color: 0x543528, roughness: 1, flatShading: true})
  const dark = new THREE.MeshStandardMaterial({color: 0x252d31, roughness: .92, flatShading: true})
  const glass = new THREE.MeshStandardMaterial({color: 0x4c9bb1, roughness: .48, metalness: .08, flatShading: true})
  const iron = new THREE.MeshStandardMaterial({color: 0x3b403e, roughness: .7, metalness: .18, flatShading: true})
  const ivy = new THREE.MeshStandardMaterial({color: 0x3e743f, roughness: 1, flatShading: true})
  createBaseFeaturePart(group, new THREE.BoxGeometry(3.62, .22, 2.34), stoneLight, "base-chapel-foundation", new THREE.Vector3(0, .11, .08))
  createBaseFeaturePart(group, new THREE.BoxGeometry(3.35, 1.62, 2.12), stone, "base-chapel-wall", new THREE.Vector3(0, .94, .12))
  for (const x of [-1.55, 1.55]) createBaseFeaturePart(group, new THREE.BoxGeometry(.3, 1.85, 2.28), stoneLight, "base-chapel-buttress", new THREE.Vector3(x, 1.0, .1))
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.86, .18, 2.58), roof, "base-chapel-roof", new THREE.Vector3(-.93, 1.96, .1), new THREE.Euler(0, 0, .2))
  createBaseFeaturePart(group, new THREE.BoxGeometry(1.86, .18, 2.58), roof, "base-chapel-roof", new THREE.Vector3(.93, 1.96, .1), new THREE.Euler(0, 0, -.2))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.15, .16, 2.64), timber, "base-chapel-roof-ridge", new THREE.Vector3(0, 2.2, .1))
  for (const x of [-1.35, -.68, .68, 1.35]) createBaseFeaturePart(group, new THREE.BoxGeometry(.055, .045, 2.3), timber, "base-chapel-roof-slats", new THREE.Vector3(x, 2.1, .1))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.78, 1.05, .12), dark, "base-chapel-door", new THREE.Vector3(0, .68, -1.0))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.96, .12, .14), timber, "base-chapel-door", new THREE.Vector3(0, 1.22, -1.05))
  createBaseFeaturePart(group, new THREE.CylinderGeometry(.33, .33, .1, 8), glass, "base-chapel-window", new THREE.Vector3(0, 1.45, -1.1), new THREE.Euler(Math.PI / 2, 0, 0))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.06, .6, .08), timber, "base-chapel-window", new THREE.Vector3(0, 1.45, -1.18))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.6, .06, .08), timber, "base-chapel-window", new THREE.Vector3(0, 1.45, -1.18))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.08, 1.05, .08), timber, "base-chapel-cross", new THREE.Vector3(0, 2.72, -.02))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.48, .08, .08), timber, "base-chapel-cross", new THREE.Vector3(0, 2.88, -.02))
  createBaseFeaturePart(group, new THREE.BoxGeometry(.65, 1.22, .7), stone, "base-chapel-bell-tower", new THREE.Vector3(1.15, 2.35, .36))
  createBaseFeaturePart(group, new THREE.ConeGeometry(.58, .72, 4), roof, "base-chapel-bell-tower", new THREE.Vector3(1.15, 3.32, .36), new THREE.Euler(0, Math.PI / 4, 0))
  createBaseFeaturePart(group, new THREE.TorusGeometry(.2, .055, 5, 8), timber, "base-chapel-bell", new THREE.Vector3(1.15, 2.48, -.02), new THREE.Euler(Math.PI / 2, 0, 0))
  createBaseFeaturePart(group, new THREE.SphereGeometry(.14, 7, 5), iron, "base-chapel-bell", new THREE.Vector3(1.15, 2.48, -.02))
  for (const [x, y, z] of [[-1.3, .8, -.98], [1.28, 1.1, -.98], [-1.45, 1.38, .92]]) {
    const leaf = createBaseFeaturePart(group, new THREE.DodecahedronGeometry(.24, 0), ivy, "base-chapel-ivy", new THREE.Vector3(x, y, z))
    leaf.scale.set(1.2, .7, .55)
  }
  return group
}

const createBaseCourtyardVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const paving = new THREE.MeshStandardMaterial({color: 0x837b68, roughness: 1, flatShading: true})
  const edge = new THREE.MeshStandardMaterial({color: 0x5e6259, roughness: .98, flatShading: true})
  const timber = new THREE.MeshStandardMaterial({color: 0x5a3828, roughness: 1, flatShading: true})
  const cloth = new THREE.MeshStandardMaterial({color: 0x3977a8, roughness: .92, flatShading: true})
  createBaseFeaturePart(group, new THREE.RingGeometry(2.15, 4.65, 14), paving, "base-courtyard-surface", new THREE.Vector3(0, .035, 0), new THREE.Euler(-Math.PI / 2, 0, 0))
  createBaseFeaturePart(group, new THREE.TorusGeometry(4.58, .13, 5, 14), edge, "base-courtyard-ring", new THREE.Vector3(0, .08, 0), new THREE.Euler(Math.PI / 2, 0, 0))
  for (const [x, z, rotation] of [[0, -3.25, 0], [3.25, 0, Math.PI / 2], [0, 3.25, 0], [-3.25, 0, Math.PI / 2]]) {
    const cobble = createBaseFeaturePart(group, new THREE.BoxGeometry(1.1, .12, .58), edge, "base-courtyard-cobble", new THREE.Vector3(x, .12, z), new THREE.Euler(0, rotation, 0))
    cobble.rotation.x = -.08
  }
  for (const x of [-3.7, 3.7]) {
    createBaseFeaturePart(group, new THREE.CylinderGeometry(.07, .1, 1.75, 6), timber, "base-courtyard-banner", new THREE.Vector3(x, .86, -.24))
    createBaseFeaturePart(group, new THREE.BoxGeometry(.64, .5, .06), cloth, "base-courtyard-banner", new THREE.Vector3(x + (x < 0 ? .24 : -.24), 1.42, -.24), new THREE.Euler(0, 0, x < 0 ? -.12 : .12))
  }
  return group
}

const stoneLightMaterial = () => new THREE.MeshStandardMaterial({color: 0x8a8b77, roughness: .98, flatShading: true})
const fireMaterial = () => new THREE.MeshStandardMaterial({color: 0xd17a32, roughness: .4, emissive: 0x632209, emissiveIntensity: .52, flatShading: true})

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

const cityBuildingArchetype = id => {
  const normalized = String(id || "").replace(/-mirror$/, "")
  if (normalized.includes("market")) return "market"
  if (normalized.includes("apartments")) return "apartments"
  if (normalized.includes("north-gate")) return "north_gate"
  if (normalized.includes("south-ward")) return "south_ward"
  if (normalized.includes("inn")) return "inn"
  return "depot"
}

// City landmarks are intentionally authored as small readable compositions.
// Each one has a distinct gameplay noun (dock, stalls, gate, homes, forge),
// instead of sharing one oversized house and changing its rotation.
const createReadableCityBuildingVisual = (scale, variant = 0, archetype = "depot", visualTheme = "northern") => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const U = CITY_CELL
  const classic = visualTheme === "classic"
  const timber = cityMaterial(classic ? (variant % 2 ? 0x67462f : 0x51372a) : (variant % 2 ? 0x4b3428 : 0x382820), {roughness: .98})
  const timberLight = cityMaterial(classic ? (variant % 2 ? 0x8a5c38 : 0x70482e) : (variant % 2 ? 0x765039 : 0x60412f), {roughness: .98})
  const plaster = cityMaterial(classic ? (variant % 2 ? 0x9a846d : 0x806d5b) : (variant % 2 ? 0x8d826d : 0x746956), {roughness: 1})
  const stone = cityMaterial(classic ? (variant % 2 ? 0x77766a : 0x65655d) : (variant % 2 ? 0x62645e : 0x505650), {roughness: 1})
  const stoneLight = cityMaterial(classic ? (variant % 2 ? 0xaaa18b : 0x8c8879) : (variant % 2 ? 0x99947f : 0x817d6b), {roughness: 1})
  const iron = cityMaterial(classic ? (variant % 2 ? 0x3f4038 : 0x51483e) : (variant % 2 ? 0x313633 : 0x242b29), {roughness: .92, metalness: .08})
  const thatch = cityMaterial(classic ? (variant % 2 ? 0x876c4f : 0x6f5a43) : (variant % 2 ? 0x66533d : 0x514331), {roughness: 1})
  const redCloth = cityMaterial(classic ? (variant % 2 ? 0x8a5140 : 0x6c4037) : (variant % 2 ? 0x713c34 : 0x5a302b), {roughness: 1})
  const greenCloth = cityMaterial(classic ? (variant % 2 ? 0x61764c : 0x4d6543) : (variant % 2 ? 0x526247 : 0x3d4f3c), {roughness: 1})
  const moss = cityMaterial(variant % 2 ? 0x496047 : 0x384e3d, {roughness: 1})
  const dark = cityMaterial(classic ? 0x202d31 : 0x182321, {roughness: .58})
  const fire = cityMaterial(classic ? 0xc87a35 : 0xd37a32, {roughness: .4, emissive: classic ? 0x5e2108 : 0x7d2d0b, emissiveIntensity: classic ? .42 : .7})

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
    // Keep the well just off the central entry cell: it remains a useful
    // landmark and obstacle without turning the court's main approach into a
    // hidden collision trap.
    const wellX = 1.4 * U
    const wellZ = .42 * U
    part(new THREE.CylinderGeometry(.65 * U, .72 * U, .42, 8), stoneLight, "city-courtyard-well", wellX, .35, wellZ)
    part(new THREE.TorusGeometry(.56 * U, .06 * U, 6, 10), timber, "city-courtyard-well", wellX, .58, wellZ, new THREE.Euler(Math.PI / 2, 0, 0))
    const stalls = [[-1.35, -.45, redCloth, -.08], [1.7, -.35, greenCloth, .1], [.8, 1.6, thatch, 0]]
    stalls.forEach(([x, z, cloth, tilt]) => {
      beam(1.45 * U, .18, .62 * U, timberLight, "city-market-stall", x, .58, z)
      for (const postX of [-.58, .58]) part(new THREE.CylinderGeometry(.045 * U, .06 * U, 1.55, 5), timber, "city-market-stall", (x + postX) * U, 1.28, z)
      roof(1.7 * U, .82 * U, x * U, 2.08, z * U, cloth, tilt, "city-market-canopy")
      beam(1.28 * U, .055, .06 * U, timber, "city-market-roof-beam", x * U, 2.2, (z - .02) * U, new THREE.Euler(0, 0, tilt))
      beam(.46 * U, .28, .06 * U, cloth, "city-market-hanging-sign", (x + .18) * U, 1.2, (z - .52) * U, new THREE.Euler(0, 0, tilt * .4))
      part(new THREE.CylinderGeometry(.022 * U, .026 * U, .45, 5), timber, "city-market-hanging-sign", (x + .18) * U, 1.43, (z - .5) * U)
      part(new THREE.DodecahedronGeometry(.16 * U, 0), variant % 2 ? stoneLight : redCloth, "city-market-goods", (x - .18) * U, .8, (z - .06) * U)
      part(new THREE.DodecahedronGeometry(.12 * U, 0), greenCloth, "city-market-goods", (x + .22) * U, .76, (z + .04) * U)
    })
    beam(.5 * U, .52, .08, redCloth, "city-market-banner", 0, 2.48, -1.58 * U, new THREE.Euler(0, 0, -.08))
    for (const [x, z, size] of [[-1.95, -.62, .18], [2.18, -.48, .15]]) {
      part(new THREE.CylinderGeometry(size * U, size * 1.12 * U, .24, 8), timberLight, "city-market-produce", x * U, .78, z * U)
      part(new THREE.DodecahedronGeometry(size * .72 * U, 0), x < 0 ? redCloth : greenCloth, "city-market-produce", (x + .04) * U, .99, (z - .02) * U)
    }
    part(new THREE.BoxGeometry(.2 * U, .28, .2 * U), iron, "city-market-lantern", -.18 * U, 1.55, -1.24 * U)
    part(new THREE.SphereGeometry(.085 * U, 6, 4), fire, "city-market-lantern", -.18 * U, 1.55, -1.24 * U)
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
    beam(1.18 * U, .045, .045 * U, timber, "city-gate-rope", 0, 1.55, -.5 * U, new THREE.Euler(0, 0, -.08))
    beam(1.18 * U, .045, .045 * U, timber, "city-gate-rope", 0, 1.55, .5 * U, new THREE.Euler(0, 0, .08))
    for (const x of [-.72, -.36, 0, .36, .72]) beam(.08 * U, 1.05, .08, iron, "city-gate-portcullis", x * U, 1.0, -.34 * U)
    beam(1.7 * U, .08, .08, iron, "city-gate-portcullis", 0, 1.48, -.34 * U)
    for (const x of [-1.82, 1.82]) {
      part(new THREE.CylinderGeometry(.045 * U, .07 * U, 1.15, 6), timber, "city-gate-torch", x * U, .72, -.48 * U)
      part(new THREE.ConeGeometry(.13 * U, .25, 6), redCloth, "city-gate-torch", x * U, 1.42, -.48 * U)
    }
    for (const x of [-.52, 0, .52]) {
      const chainLink = part(new THREE.TorusGeometry(.14 * U, .025 * U, 5, 9), iron, "city-gate-chain", x * U, .72, -.62 * U, new THREE.Euler(Math.PI / 2, 0, x === 0 ? .25 : -.18))
      chainLink.rotation.y = x * .18
    }
    beam(.78 * U, .42, .08, redCloth, "city-gate-sign", 0, 3.0, -.25 * U)
    rubble(-2.0, .8, .18); rubble(2.05, -.75, .2)
    return group
  }

  if (archetype === "apartments") {
    // Two offset timber homes read as a small lived-in row, not a single box.
    part(new THREE.CylinderGeometry(1.55 * U, 1.68 * U, .1, 8), stone, "city-apartment-floor", -.15 * U, .05, .18 * U)
    beam(1.65 * U, .18, .2 * U, plaster, "city-house-body", -.48 * U, .9, .78 * U)
    beam(.2 * U, 1.72, 1.36 * U, plaster, "city-house-body", -1.22 * U, .9, .05 * U)
    beam(.9 * U, 1.55, 1.2 * U, timber, "city-house-body", 1.35 * U, .8, .75 * U)
    roof(.96 * U, .74 * U, -.86 * U, 2.18, .9 * U, thatch, -.24)
    roof(.68 * U, .62 * U, 1.0 * U, 1.62, .52 * U, redCloth, .18, "city-roof")
    for (const x of [-.78, -.18]) beam(.14 * U, .62, .08 * U, timber, "city-apartment-shutter", x * U, 1.18, -.84 * U)
    beam(1.02 * U, .06, .06 * U, timberLight, "city-apartment-roof-beam", -.86 * U, 2.3, .9 * U, new THREE.Euler(0, 0, -.24))
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
    part(new THREE.BoxGeometry(.5 * U, .78, .08), dark, "city-apartment-door", .72 * U, .52, -.78 * U)
    beam(.58 * U, .08, .08, timber, "city-apartment-door", .72 * U, .96, -.82 * U)
    part(new THREE.SphereGeometry(.055 * U, 6, 4), stoneLight, "city-apartment-door", .92 * U, .54, -.84 * U)
    for (const [x, y] of [[1.08, 1.03], [1.35, .92], [1.54, 1.1]]) part(new THREE.DodecahedronGeometry(.1 * U, 0), greenCloth, "city-apartment-herbs", x * U, y, -1.04 * U)
    rubble(-1.8, 1.2, .2); rubble(1.85, -1.3, .18)
    return group
  }

  if (archetype === "south_ward") {
    // The forge is a low lean-to with an unmistakable hearth and work area.
    part(new THREE.CylinderGeometry(1.45 * U, 1.58 * U, .16, 8), stone, "city-forge-yard", 0, .08, .1 * U)
    beam(1.55 * U, 1.55, .2 * U, plaster, "city-house-body", -.48 * U, .98, .52 * U)
    roof(.92 * U, .68 * U, -.62 * U, 1.72, .52 * U, thatch, -.34)
    beam(.72 * U, .06, .06 * U, timberLight, "city-forge-roof-beam", -.62 * U, 1.84, .52 * U, new THREE.Euler(0, 0, -.34))
    beam(1.35 * U, .16, 1.1 * U, timber, "city-forge-canopy", 1.0 * U, 1.56, -.35 * U, new THREE.Euler(0, 0, .12))
    beam(.46 * U, .72, .46 * U, stoneLight, "city-forge-hearth", -.62 * U, .72, -.58 * U)
    beam(.52 * U, .28, .28 * U, iron, "city-forge-anvil", .15 * U, .65, -.72 * U)
    part(new THREE.CylinderGeometry(.09 * U, .13 * U, .62, 6), iron, "city-forge-anvil", .15 * U, .94, -.72 * U)
    for (const [x, z] of [[-.56, -.58], [-.38, -.64], [-.72, -.62]]) {
      part(new THREE.SphereGeometry(.11 * U, 7, 5), fire, "city-forge-ember", x * U, .96, z * U)
    }
    beam(.34 * U, .9, .34 * U, iron, "city-chimney", -.58 * U, 2.0, .55 * U)
    for (const x of [1.5, 1.65, 1.8]) beam(.55 * U, .3, .24 * U, timberLight, "city-forge-woodpile", x * U, .48, .72 * U, new THREE.Euler(0, 0, x % .2 ? .08 : -.08))
    beam(.9 * U, .08, .08, iron, "city-forge-tool", .72 * U, .9, -.92 * U, new THREE.Euler(0, 0, -.55))
    beam(.62 * U, .15, .36 * U, timber, "city-forge-bellows", .88 * U, 1.02, -1.0 * U, new THREE.Euler(0, 0, -.12))
    beam(.1 * U, .55, .1 * U, timber, "city-forge-bellows", .58 * U, 1.15, -.96 * U, new THREE.Euler(0, 0, .24))
    part(new THREE.CylinderGeometry(.045 * U, .065 * U, .34, 6), iron, "city-forge-bellows", 1.2 * U, 1.04, -.99 * U, new THREE.Euler(0, 0, -.2))
    rubble(-1.8, -1.25, .18); rubble(1.9, 1.3, .2)
    return group
  }

  if (archetype === "inn") {
    // The inn is the town's warm landmark: a tall gabled shell with an open
    // front veranda, so the silhouette is strong without sealing the lane.
    part(new THREE.CylinderGeometry(1.62 * U, 1.76 * U, .14, 8), stone, "city-inn-yard", 0, .07, .08 * U)
    beam(2.25 * U, 1.52, .2 * U, plaster, "city-inn-body", 0, .94, .62 * U)
    for (const [x, tilt, material] of [[-.54, -.42, thatch], [.54, .42, thatch]]) {
      roof(1.22 * U, .92 * U, x * U, 1.92, .66 * U, material, tilt, "city-inn-gable-roof")
      beam(.08 * U, 1.22, .06 * U, timber, "city-inn-roof-beam", x * U, 1.48, -.05 * U, new THREE.Euler(0, 0, tilt))
    }
    beam(.1 * U, .1, 1.05 * U, timberLight, "city-inn-ridge", 0, 2.42, .66 * U)
    beam(1.6 * U, .16, .62 * U, timberLight, "city-inn-veranda", 0, .48, -1.04 * U)
    for (const x of [-.68, .68]) part(new THREE.CylinderGeometry(.05 * U, .07 * U, 1.38, 6), timber, "city-inn-veranda", x * U, 1.1, -1.12 * U)
    roof(1.86 * U, .66 * U, 0, 1.82, -1.1 * U, redCloth, 0, "city-inn-veranda-roof")
    part(new THREE.BoxGeometry(.58 * U, .72, .08), dark, "city-inn-door", 0, .72, -.77 * U)
    beam(.72 * U, .08, .08, timber, "city-inn-door", 0, 1.1, -.81 * U)
    part(new THREE.SphereGeometry(.055 * U, 6, 4), stoneLight, "city-inn-door", .2 * U, .74, -.85 * U)
    part(new THREE.BoxGeometry(.58 * U, .3, .08), redCloth, "city-inn-sign", .86 * U, 1.76, -.86 * U, new THREE.Euler(0, 0, -.08))
    part(new THREE.CylinderGeometry(.035 * U, .05 * U, .62, 5), iron, "city-inn-sign", .7 * U, 1.98, -.86 * U)
    part(new THREE.CylinderGeometry(.15 * U, .18 * U, .56, 7), stoneLight, "city-inn-chimney", -.86 * U, 2.32, .76 * U)
    part(new THREE.BoxGeometry(.2 * U, .28, .2 * U), iron, "city-inn-lantern", -.82 * U, 1.44, -1.25 * U)
    part(new THREE.SphereGeometry(.085 * U, 6, 4), fire, "city-inn-lantern", -.82 * U, 1.44, -1.25 * U)
    for (const [x, z] of [[-1.45, -.78], [1.42, -.72]]) {
      part(new THREE.CylinderGeometry(.25 * U, .3 * U, .52, 9), iron, "city-inn-barrel", x * U, .35, z * U)
      beam(.34 * U, .06, .06, timber, "city-inn-barrel", x * U, .67, z * U)
    }
    for (const [x, z, size] of [[-1.72, 1.1, .18], [1.7, 1.12, .16]]) rubble(x, z, size)
    return group
  }

  // Depot: a compact warehouse with an open yard, not a roof covering the
  // whole landmark. The doors, dock and barrels provide the readable noun.
  part(new THREE.CylinderGeometry(1.5 * U, 1.62 * U, .14, 8), stone, "city-depot-yard", 0, .07, .1 * U)
  beam(2.35 * U, 1.5, .18 * U, plaster, "city-house-body", 0, .95, .52 * U)
  // Keep the roof on the rear half of the warehouse so the dock and doors
  // remain visible in the top-down battle camera.
  roof(.82 * U, .46 * U, -.78 * U, 1.62, .95 * U, thatch, -.25)
  for (const z of [.84, 1.02]) beam(.66 * U, .055, .055 * U, timber, "city-depot-roof-beam", -.78 * U, 1.76, z * U, new THREE.Euler(0, 0, -.25))
  beam(1.55 * U, .18, .52 * U, timberLight, "city-depot-loading-dock", 0, .42, -1.04 * U)
  for (const x of [-.68, .68]) beam(.12 * U, .62, .12 * U, timber, "city-depot-loading-dock", x * U, .72, -1.29 * U)
  beam(.08 * U, 1.18, .06, timber, "city-depot-brace", -.78 * U, 1.03, -.71 * U, new THREE.Euler(0, 0, -.42))
  beam(.08 * U, 1.18, .06, timber, "city-depot-brace", .78 * U, 1.03, -.71 * U, new THREE.Euler(0, 0, .42))
  for (const x of [-.2, .2]) {
    beam(.36 * U, 1.16, .1, timber, "city-depot-double-door", x * U, .78, -.61 * U, new THREE.Euler(0, 0, x < 0 ? -.04 : .04))
    part(new THREE.SphereGeometry(.06 * U, 6, 4), iron, "city-depot-double-door", (x + (x < 0 ? .12 : -.12)) * U, .78, -.69 * U)
  }
  beam(.72 * U, .3, .08, timber, "city-depot-signboard", .82 * U, 1.88, -.7 * U, new THREE.Euler(0, 0, -.08))
  if (!classic) beam(.34 * U, .08, .06 * U, moss, "city-depot-moss", -.98 * U, 1.5, .42 * U, new THREE.Euler(0, 0, -.18))
  for (const [x, z] of [[-1.35, -.2], [1.55, -.2]]) {
    part(new THREE.CylinderGeometry(.28 * U, .32 * U, .58, 10), iron, "city-depot-barrel", x * U, .42, z * U)
    beam(.38 * U, .06, .06, timber, "city-depot-barrel", x * U, .72, z * U)
  }
  for (const [x, z, size] of [[-.82, -.2, .22], [.52, -.2, .18]]) part(new THREE.DodecahedronGeometry(size * U, 0), thatch, "city-depot-sack", x * U, size * U + .16, z * U)
  part(new THREE.TorusGeometry(.38 * U, .07 * U, 6, 12), timber, "city-depot-wheel", 1.5 * U, .5, -.2 * U, new THREE.Euler(Math.PI / 2, 0, .16))
  rubble(-1.85, 1.15, .18); rubble(1.9, 1.2, .2)
  return group
}

const createCityBuildingVisual = (scale, variant = 0, archetype = "depot", visualTheme = "northern") => {
  return createReadableCityBuildingVisual(scale, variant, archetype, visualTheme)
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

const createCastleKeepVisual = (scale, variant = 0) => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const U = CITY_CELL
  const stone = cityMaterial(variant % 2 ? 0x5d6661 : 0x505a56, {roughness: 1})
  const stoneLight = cityMaterial(variant % 2 ? 0x969584 : 0x818377, {roughness: 1})
  const stoneDark = cityMaterial(0x293534, {roughness: 1})
  const roof = cityMaterial(variant % 2 ? 0x51483d : 0x463f37, {roughness: 1})
  const timber = cityMaterial(variant % 2 ? 0x3e2b25 : 0x2f2420, {roughness: .98})
  const iron = cityMaterial(0x1c2423, {roughness: .76, metalness: .16})
  const moss = cityMaterial(variant % 2 ? 0x46604a : 0x354d40, {roughness: 1})
  const cloth = cityMaterial(variant % 2 ? 0x6b302d : 0x51282a, {roughness: 1})
  const fire = cityMaterial(0xd37a32, {roughness: .38, emissive: 0x7d2d0b, emissiveIntensity: .82})
  const part = (geometry, material, role, x, y, z, rotation = null) => addCityPart(
    group, geometry, material, role, new THREE.Vector3(x, y, z), rotation,
  )
  const battlement = (x, z, role = "castle-keep-battlement") => part(
    new THREE.BoxGeometry(.34 * U, .32, .36 * U), stoneLight, role, x * U, 2.74, z * U,
  )

  part(new THREE.CylinderGeometry(2.65 * U, 2.82 * U, .16, 10), stoneDark, "castle-keep-foundation", 0, .08, -.55 * U)
  part(new THREE.BoxGeometry(3.7 * U, 2.24, 2.08 * U), stone, "castle-keep-body", 0, 1.28, -1.15 * U)
  part(new THREE.BoxGeometry(3.35 * U, .18, 1.82 * U), stoneLight, "castle-keep-masonry-band", 0, .38, -1.15 * U)
  for (const x of [-1.72, 1.72]) {
    part(new THREE.BoxGeometry(.34 * U, 2.5, .48 * U), stoneLight, "castle-keep-buttress", x * U, 1.36, -.35 * U)
    part(new THREE.BoxGeometry(.34 * U, 2.15, .48 * U), stoneLight, "castle-keep-buttress", x * U, 1.18, -2.0 * U)
  }
  // The steep roof is deliberately offset behind the courtyard-facing wall,
  // leaving the gate, windows, and the keep silhouette readable from above.
  part(new THREE.ConeGeometry(2.08 * U, .72, 4), roof, "castle-keep-roof", 0, 2.72, -1.15 * U, new THREE.Euler(0, Math.PI / 4, 0))
  part(new THREE.BoxGeometry(3.45 * U, .12, .14 * U), timber, "castle-keep-roof-ridge", 0, 3.08, -1.15 * U)
  for (const x of [-1.3, -.44, .44, 1.3]) {
    part(new THREE.BoxGeometry(.11 * U, 1.85, .08 * U), timber, "castle-keep-timber", x * U, 1.42, -.1 * U)
  }
  for (const x of [-1.25, -.42, .42, 1.25]) {
    part(new THREE.BoxGeometry(.11 * U, 1.7, .08 * U), timber, "castle-keep-timber", x * U, 1.32, -2.18 * U)
  }
  for (const x of [-1.28, 1.28]) {
    part(new THREE.BoxGeometry(.52 * U, .72, .08), stoneDark, "castle-keep-window", x * U, 1.62, -2.22 * U)
    part(new THREE.BoxGeometry(.06 * U, .78, .1), stoneLight, "castle-keep-window", x * U, 1.62, -2.27 * U)
    part(new THREE.BoxGeometry(.52 * U, .06, .1), stoneLight, "castle-keep-window", x * U, 1.62, -2.28 * U)
  }
  part(new THREE.BoxGeometry(.76 * U, 1.05, .1), iron, "castle-keep-door", 0, .7, -.1 * U)
  part(new THREE.BoxGeometry(.92 * U, .08, .08), timber, "castle-keep-door", 0, 1.25, -.16 * U)
  part(new THREE.CylinderGeometry(.055 * U, .055 * U, .78, 6), iron, "castle-keep-door", .22 * U, .72, -.2 * U, new THREE.Euler(0, 0, Math.PI / 2))
  for (const x of [-1.88, 1.88]) {
    part(new THREE.CylinderGeometry(.62 * U, .7 * U, 2.58, 8), stone, "castle-keep-corner-tower", x * U, 1.32, -.48 * U)
    part(new THREE.CylinderGeometry(.72 * U, .72 * U, .16, 8), stoneLight, "castle-keep-corner-tower", x * U, 2.66, -.48 * U)
    part(new THREE.ConeGeometry(.78 * U, .58, 6), roof, "castle-keep-corner-roof", x * U, 2.98, -.48 * U)
    for (const z of [-.88, -.1]) battlement(x, z, "castle-keep-corner-battlement")
    part(new THREE.BoxGeometry(.18 * U, .56, .08), stoneDark, "castle-keep-corner-window", x * U, 1.72, -.98 * U)
  }
  for (const x of [-1.45, -.48, .48, 1.45]) {
    battlement(x, -.05)
    battlement(x, -2.28)
  }
  for (const z of [-.72, -1.55]) {
    battlement(-1.9, z)
    battlement(1.9, z)
  }
  for (const x of [-1.9, 1.9]) {
    part(new THREE.CylinderGeometry(.045 * U, .07 * U, 1.55, 6), timber, "castle-keep-banner", x * U, 3.86, -.48 * U)
    part(new THREE.BoxGeometry(.62 * U, .46, .05), cloth, "castle-keep-banner", (x + (x < 0 ? .16 : -.16)) * U, 3.62, -.5 * U, new THREE.Euler(0, 0, x < 0 ? -.08 : .08))
  }
  for (const x of [-1.1, 1.1]) {
    part(new THREE.CylinderGeometry(.16 * U, .2 * U, .1, 8), iron, "castle-keep-brazier", x * U, .3, .72 * U)
    part(new THREE.SphereGeometry(.14 * U, 7, 5), fire, "castle-keep-brazier", x * U, .52, .72 * U)
  }
  part(new THREE.BoxGeometry(1.2 * U, .07, .07), moss, "castle-keep-moss", 0, .2, -2.42 * U)
  return group
}

const createCastleGateVisual = (scale, variant = 0) => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const U = CITY_CELL
  const stone = cityMaterial(variant % 2 ? 0x59615d : 0x485452, {roughness: 1})
  const stoneLight = cityMaterial(variant % 2 ? 0x929184 : 0x777d70, {roughness: 1})
  const timber = cityMaterial(0x33251f, {roughness: .98})
  const iron = cityMaterial(0x1b2524, {roughness: .76, metalness: .16})
  const cloth = cityMaterial(variant % 2 ? 0x71352f : 0x5a2b2a, {roughness: 1})
  const fire = cityMaterial(0xd37a32, {roughness: .4, emissive: 0x7d2d0b, emissiveIntensity: .78})
  const part = (geometry, material, role, x, y, z, rotation = null) => addCityPart(
    group, geometry, material, role, new THREE.Vector3(x, y, z), rotation,
  )
  part(new THREE.CylinderGeometry(2.55 * U, 2.7 * U, .1, 10), cityMaterial(0x343f3e), "castle-gate-yard", 0, .05, 0)
  for (const x of [-1.55, 1.55]) {
    part(new THREE.BoxGeometry(1.02 * U, 2.7, 1.08 * U), stone, "castle-gate-tower", x * U, 1.36, 0)
    for (const z of [-.38, .38]) part(new THREE.BoxGeometry(.3 * U, .34, .3 * U), stoneLight, "castle-gate-merlon", x * U, 2.88, z * U)
    part(new THREE.ConeGeometry(.74 * U, .72, 4), cityMaterial(0x303836), "castle-gate-roof", x * U, 3.28, 0, new THREE.Euler(0, Math.PI / 4, 0))
    part(new THREE.BoxGeometry(.18 * U, .58, .08), iron, "castle-gate-window", x * U, 1.72, -.58 * U)
  }
  part(new THREE.BoxGeometry(2.5 * U, .5, .48 * U), stoneLight, "castle-gate-arch", 0, 2.35, 0)
  part(new THREE.BoxGeometry(1.45 * U, 1.58, .14), timber, "castle-gate-portcullis", 0, 1.0, -.48 * U)
  for (const x of [-.56, -.28, 0, .28, .56]) part(new THREE.BoxGeometry(.07 * U, 1.42, .08), iron, "castle-gate-portcullis", x * U, 1.05, -.57 * U)
  part(new THREE.BoxGeometry(1.65 * U, .08, .08), iron, "castle-gate-portcullis", 0, 1.7, -.58 * U)
  for (const x of [-1.95, 1.95]) {
    part(new THREE.CylinderGeometry(.05 * U, .07 * U, 1.45, 6), timber, "castle-gate-torch", x * U, .78, -.55 * U)
    part(new THREE.ConeGeometry(.14 * U, .3, 6), fire, "castle-gate-torch", x * U, 1.58, -.55 * U)
  }
  part(new THREE.CylinderGeometry(.04 * U, .05 * U, 1.35, 6), timber, "castle-gate-banner", 0, 3.72, 0)
  part(new THREE.BoxGeometry(.68 * U, .48, .06), cloth, "castle-gate-banner", .2 * U, 3.45, 0, new THREE.Euler(0, 0, -.08))
  return group
}

const createCastleCourtyardVisual = (scale, variant = 0) => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const U = CITY_CELL
  const paving = cityMaterial(variant % 2 ? 0x605e54 : 0x514f49, {roughness: 1})
  const stone = cityMaterial(variant % 2 ? 0x7f8177 : 0x686c65, {roughness: 1})
  const darkStone = cityMaterial(0x343e3c, {roughness: 1})
  const timber = cityMaterial(0x3d2b23, {roughness: .98})
  const iron = cityMaterial(0x202a28, {roughness: .78, metalness: .12})
  const fire = cityMaterial(0xd37a32, {roughness: .38, emissive: 0x7d2d0b, emissiveIntensity: .85})
  const moss = cityMaterial(variant % 2 ? 0x4c654d : 0x3a5343, {roughness: 1})
  const part = (geometry, material, role, x, y, z, rotation = null) => addCityPart(
    group, geometry, material, role, new THREE.Vector3(x, y, z), rotation,
  )
  part(new THREE.BoxGeometry(4.7 * U, .12, 3.2 * U), paving, "castle-courtyard-floor", 0, .08, 0)
  for (const x of [-1.8, -.9, 0, .9, 1.8]) {
    part(new THREE.BoxGeometry(.05 * U, .035, 2.8 * U), darkStone, "castle-courtyard-joint", x * U, .16, 0)
  }
  for (const z of [-1.1, 0, 1.1]) part(new THREE.BoxGeometry(4.2 * U, .035, .05 * U), darkStone, "castle-courtyard-joint", 0, .16, z * U)
  part(new THREE.CylinderGeometry(.62 * U, .76 * U, .36, 10), stone, "castle-courtyard-well", 0, .28, .1 * U)
  part(new THREE.TorusGeometry(.52 * U, .06 * U, 6, 10), stone, "castle-courtyard-well", 0, .5, .1 * U, new THREE.Euler(Math.PI / 2, 0, 0))
  part(new THREE.BoxGeometry(1.24 * U, .08, .08), timber, "castle-courtyard-well", 0, 1.22, .1 * U)
  for (const x of [-.52, .52]) part(new THREE.CylinderGeometry(.035, .035, 1.15, 5), timber, "castle-courtyard-well", x * U, .82, .1 * U)
  for (const x of [-1.8, 1.8]) {
    part(new THREE.BoxGeometry(.88 * U, .12, .32 * U), timber, "castle-courtyard-bench", x * U, .32, 1.03 * U)
    part(new THREE.BoxGeometry(.1 * U, .34, .1 * U), timber, "castle-courtyard-bench", (x - .3) * U, .18, 1.03 * U)
    part(new THREE.BoxGeometry(.1 * U, .34, .1 * U), timber, "castle-courtyard-bench", (x + .3) * U, .18, 1.03 * U)
  }
  for (const x of [-1.82, 1.82]) {
    part(new THREE.CylinderGeometry(.16 * U, .2 * U, .1, 8), iron, "castle-courtyard-brazier", x * U, .27, -.95 * U)
    part(new THREE.SphereGeometry(.14 * U, 7, 5), fire, "castle-courtyard-brazier", x * U, .49, -.95 * U)
  }
  for (const [x, z] of [[-2.1, 1.25], [2.15, 1.2], [-2.25, -.95], [2.2, -.98]]) {
    part(new THREE.DodecahedronGeometry(.18 * U, 0), moss, "castle-courtyard-rubble", x * U, .26, z * U)
  }
  return group
}

const createCastleDetailVisual = (scale, variant = 0, kind = "armory") => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const U = CITY_CELL
  const stone = cityMaterial(variant % 2 ? 0x676d66 : 0x545e5a, {roughness: 1})
  const stoneLight = cityMaterial(variant % 2 ? 0x949486 : 0x777c70, {roughness: 1})
  const timber = cityMaterial(0x3d2b23, {roughness: .98})
  const iron = cityMaterial(0x202825, {roughness: .78, metalness: .14})
  const cloth = cityMaterial(kind === "chapel" ? 0x56634c : 0x6c3430, {roughness: 1})
  const fire = cityMaterial(0xd37a32, {roughness: .38, emissive: 0x7d2d0b, emissiveIntensity: .72})
  const part = (geometry, material, role, x, y, z, rotation = null) => addCityPart(
    group, geometry, material, role, new THREE.Vector3(x, y, z), rotation,
  )
  part(new THREE.CylinderGeometry(1.22 * U, 1.35 * U, .1, 8), stone, "castle-detail-yard", 0, .05, 0)
  if (kind === "chapel") {
    part(new THREE.BoxGeometry(1.12 * U, 1.3, .2 * U), stoneLight, "castle-chapel-wall", 0, .72, .25 * U)
    part(new THREE.ConeGeometry(.78 * U, .65, 4), cloth, "castle-chapel-roof", 0, 1.7, .25 * U, new THREE.Euler(0, Math.PI / 4, 0))
    part(new THREE.BoxGeometry(.54 * U, .66, .06), iron, "castle-chapel-window", 0, .9, .1 * U)
    part(new THREE.BoxGeometry(.12 * U, .74, .08), stoneLight, "castle-chapel-cross", 0, 1.12, -.03 * U)
    part(new THREE.BoxGeometry(.55 * U, .1, .08), stoneLight, "castle-chapel-cross", 0, 1.12, -.05 * U)
  } else {
    part(new THREE.BoxGeometry(1.55 * U, .72, .7 * U), timber, "castle-armory-rack", 0, .68, .28 * U)
    for (const x of [-.52, -.18, .18, .52]) part(new THREE.CylinderGeometry(.035 * U, .05 * U, 1.1, 5), iron, "castle-armory-weapon", x * U, 1.24, -.1 * U, new THREE.Euler(0, 0, x * .12))
    part(new THREE.BoxGeometry(1.8 * U, .1, .08), stoneLight, "castle-armory-lintel", 0, 1.46, -.18 * U)
    for (const x of [-.8, .8]) part(new THREE.CylinderGeometry(.14 * U, .18 * U, .08, 8), iron, "castle-armory-brazier", x * U, .3, -.8 * U)
    for (const x of [-.8, .8]) part(new THREE.SphereGeometry(.12 * U, 7, 5), fire, "castle-armory-brazier", x * U, .48, -.8 * U)
  }
  for (const [x, z, size] of [[-1.35, 1.0, .16], [1.3, 1.12, .18], [1.45, -.9, .14]]) part(new THREE.DodecahedronGeometry(size * U, 0), stoneLight, "castle-detail-rubble", x * U, .16, z * U)
  return group
}

const createCastleHouseVisual = (scale, variant = 0) => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const U = CITY_CELL
  const stone = cityMaterial(variant % 2 ? 0x77786f : 0x62665f, {roughness: 1})
  const stoneLight = cityMaterial(variant % 2 ? 0xa09a84 : 0x858475, {roughness: 1})
  const timber = cityMaterial(variant % 2 ? 0x4c3025 : 0x38261f, {roughness: .98})
  const timberLight = cityMaterial(variant % 2 ? 0x76503a : 0x60402f, {roughness: .98})
  const roof = cityMaterial(variant % 2 ? 0x4b443b : 0x3d3d37, {roughness: 1})
  const window = cityMaterial(0x192423, {roughness: .56, metalness: .04})
  const iron = cityMaterial(0x222c2b, {roughness: .82, metalness: .12})
  const moss = cityMaterial(variant % 2 ? 0x4d684c : 0x3a5542, {roughness: 1})
  const cloth = cityMaterial(variant % 2 ? 0x754037 : 0x5a302d, {roughness: 1})
  const part = (geometry, material, role, x, y, z) => addCityPart(group, geometry, material, role, new THREE.Vector3(x, y, z))
  const body = part(new THREE.BoxGeometry(2.65 * U, 1.42, 1.85 * U), stone, "castle-house-body", 0, .72, .18 * U)
  body.rotation.y = variant % 2 ? -.04 : .05
  part(new THREE.BoxGeometry(2.78 * U, .16, 1.96 * U), timber, "castle-house-foundation", 0, .12, .18 * U)
  part(new THREE.BoxGeometry(2.78 * U, .11, .12 * U), timberLight, "castle-house-beam", 0, 1.14, -.78 * U)
  part(new THREE.BoxGeometry(.1 * U, 1.2, .12 * U), timberLight, "castle-house-beam", -.86 * U, .78, -.78 * U)
  part(new THREE.BoxGeometry(.1 * U, 1.2, .12 * U), timberLight, "castle-house-beam", .86 * U, .78, -.78 * U)
  for (const x of [-.72, .72]) {
    part(new THREE.BoxGeometry(.38 * U, .52, .06), window, "castle-house-window", x * U, 1.12, -.96 * U)
    part(new THREE.BoxGeometry(.06, .58, .08), timberLight, "castle-house-window-frame", x * U, 1.12, -1.0 * U)
    part(new THREE.BoxGeometry(.44 * U, .06, .08), timberLight, "castle-house-window-frame", x * U, 1.12, -1.0 * U)
  }
  part(new THREE.BoxGeometry(.48 * U, .82, .08), window, "castle-house-door", 0, .48, -.97 * U)
  part(new THREE.BoxGeometry(.64 * U, .08, .1), timberLight, "castle-house-door-frame", 0, .94, -1.0 * U)
  const roofMesh = part(new THREE.ConeGeometry(1.72 * U, 1.12, 4), roof, "castle-house-roof", 0, 1.82, .18 * U)
  roofMesh.rotation.y = Math.PI / 4
  part(new THREE.BoxGeometry(.08 * U, .62, .08 * U), timber, "castle-house-chimney", .86 * U, 2.02, .42 * U)
  part(new THREE.BoxGeometry(.26 * U, .08, .26 * U), stoneLight, "castle-house-chimney-cap", .86 * U, 2.36, .42 * U)
  part(new THREE.BoxGeometry(1.35 * U, .1, .36 * U), timber, "castle-house-balcony", -.92 * U, 1.62, -.98 * U)
  for (const x of [-1.42, -.42]) part(new THREE.CylinderGeometry(.035, .05, .55, 5), timberLight, "castle-house-balcony", x * U, 1.38, -1.0 * U)
  part(new THREE.BoxGeometry(.52 * U, .34, .05), cloth, "castle-house-banner", 1.15 * U, 2.04, -.96 * U)
  part(new THREE.CylinderGeometry(.025, .03, .7, 5), iron, "castle-house-lantern", 1.34 * U, 1.38, -1.04 * U)
  part(new THREE.SphereGeometry(.09, 6, 4), cityMaterial(0xc97a36, {emissive: 0x6d250b, emissiveIntensity: .55}), "castle-house-lantern", 1.34 * U, 1.7, -1.04 * U)
  part(new THREE.BoxGeometry(.12 * U, .7, .1), moss, "castle-house-ivy", -1.34 * U, .9, .82 * U)
  return group
}

const createCastleMarketVisual = (scale, variant = 0) => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const U = CITY_CELL
  const paving = cityMaterial(variant % 2 ? 0x68665c : 0x555850, {roughness: 1})
  const stone = cityMaterial(variant % 2 ? 0x9a9784 : 0x7c7d70, {roughness: 1})
  const wood = cityMaterial(variant % 2 ? 0x65432e : 0x493326, {roughness: .98})
  const cloth = cityMaterial(variant % 2 ? 0x86463d : 0x643532, {roughness: 1})
  const green = cityMaterial(0x4d664a, {roughness: 1})
  const fire = cityMaterial(0xd27b36, {roughness: .38, emissive: 0x76260b, emissiveIntensity: .65})
  const part = (geometry, material, role, x, y, z) => addCityPart(group, geometry, material, role, new THREE.Vector3(x, y, z))
  const floor = part(new THREE.CylinderGeometry(3.15 * U, 3.28 * U, .1, 10), paving, "castle-market-floor", 0, .06, 0)
  floor.scale.z = .72
  part(new THREE.CylinderGeometry(.72 * U, .86 * U, .34, 10), stone, "castle-market-fountain", 0, .28, .12 * U)
  part(new THREE.TorusGeometry(.58 * U, .07 * U, 6, 10), stone, "castle-market-fountain", 0, .48, .12 * U).rotation.x = Math.PI / 2
  for (const [x, z, material] of [[-1.85, .28, cloth], [0, .36, green], [1.85, .28, cloth]]) {
    part(new THREE.BoxGeometry(1.22 * U, .16, .5 * U), wood, "castle-market-stall", x * U, .48, z * U)
    for (const postX of [-.48, .48]) part(new THREE.CylinderGeometry(.04, .055, 1.48, 5), wood, "castle-market-stall", (x + postX) * U, 1.2, z * U)
    part(new THREE.BoxGeometry(1.44 * U, .12, .7 * U), material, "castle-market-canopy", x * U, 1.96, z * U)
    part(new THREE.DodecahedronGeometry(.18 * U, 0), material, "castle-market-goods", (x - .28) * U, .76, (z - .1) * U)
  }
  for (const x of [-2.7, 2.7]) {
    part(new THREE.CylinderGeometry(.045, .07, 1.75, 6), wood, "castle-market-lantern", x * U, .88, -.72 * U)
    part(new THREE.SphereGeometry(.1, 6, 4), fire, "castle-market-lantern", x * U, 1.7, -.72 * U)
  }
  part(new THREE.BoxGeometry(.78 * U, .42, .06), cloth, "castle-market-banner", 0, 2.24, -.95 * U)
  return group
}

const createCastleStreetVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const cobble = cityMaterial(0x5b605b, {roughness: 1})
  const edge = cityMaterial(0x3d4541, {roughness: 1})
  const wood = cityMaterial(0x4b3428, {roughness: .98})
  const iron = cityMaterial(0x222b2a, {roughness: .82, metalness: .1})
  const fire = cityMaterial(0xc87532, {roughness: .38, emissive: 0x6d250b, emissiveIntensity: .6})
  const surface = new THREE.Mesh(new THREE.BoxGeometry(CITY_CELL * 3.2, .09, CITY_CELL * 7.2), cobble)
  surface.position.y = .1
  surface.receiveShadow = true
  group.add(setMapRenderLayer(surface, 30))
  for (const z of [-2.6, -1.3, 0, 1.3, 2.6]) {
    const stone = addCityPart(group, new THREE.DodecahedronGeometry(.22 * CITY_CELL, 0), edge, "castle-street-cobble", new THREE.Vector3((z % 2 ? -.5 : .35) * CITY_CELL, .18, z * CITY_CELL))
    stone.scale.y = .28
  }
  for (const z of [-2.45, 2.45]) {
    addCityPart(group, new THREE.CylinderGeometry(.055, .08, 1.75, 6), wood, "castle-street-lantern", new THREE.Vector3(-1.22 * CITY_CELL, .88, z * CITY_CELL))
    addCityPart(group, new THREE.BoxGeometry(.2, .25, .2), iron, "castle-street-lantern", new THREE.Vector3(-1.02 * CITY_CELL, 1.54, z * CITY_CELL))
    addCityPart(group, new THREE.SphereGeometry(.09, 6, 4), fire, "castle-street-lantern", new THREE.Vector3(-1.02 * CITY_CELL, 1.54, z * CITY_CELL))
  }
  return group
}

const createCastleBastionVisual = (scale, variant = 0) => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const U = CITY_CELL
  const stone = cityMaterial(variant % 2 ? 0x666d68 : 0x545e5a, {roughness: 1})
  const cap = cityMaterial(variant % 2 ? 0x969483 : 0x7a7d70, {roughness: 1})
  const roof = cityMaterial(0x3b403d, {roughness: 1})
  const dark = cityMaterial(0x1b2625, {roughness: .6})
  const part = (geometry, material, role, x, y, z) => addCityPart(group, geometry, material, role, new THREE.Vector3(x, y, z))
  part(new THREE.CylinderGeometry(1.34 * U, 1.52 * U, 2.72, 10), stone, "castle-bastion-body", 0, 1.36, 0)
  part(new THREE.CylinderGeometry(1.42 * U, 1.42 * U, .16, 10), cap, "castle-bastion-cap", 0, 2.78, 0)
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const merlon = part(new THREE.BoxGeometry(.4 * U, .3, .42 * U), cap, "castle-bastion-merlon", Math.cos(angle) * .92 * U, 3.0, Math.sin(angle) * .92 * U)
    merlon.rotation.y = angle
  }
  part(new THREE.ConeGeometry(1.08 * U, .7, 8), roof, "castle-bastion-roof", 0, 3.4, 0)
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    part(new THREE.BoxGeometry(.18 * U, .48, .08), dark, "castle-bastion-arrow slit", Math.cos(angle) * 1.35 * U, 1.62, Math.sin(angle) * 1.35 * U)
  }
  return group
}

const createCityTowerVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const stone = cityMaterial(0x5b605a, {roughness: 1})
  const stoneLight = cityMaterial(0x817c6b, {roughness: 1})
  const timber = cityMaterial(0x3a2922, {roughness: .98})
  const roof = cityMaterial(0x4d3d30, {roughness: 1})
  const iron = cityMaterial(0x252c29, {roughness: .88, metalness: .08})
  const dark = cityMaterial(0x17201f, {roughness: .7})
  const banner = cityMaterial(0x6a3530, {roughness: 1})
  const fire = cityMaterial(0xd07a32, {roughness: .4, emissive: 0x68220a, emissiveIntensity: .72})
  addCityPart(group, new THREE.CylinderGeometry(1.52, 1.76, 2.75, 8), stone, "city-tower-base", new THREE.Vector3(0, 1.38, 0))
  addCityPart(group, new THREE.CylinderGeometry(1.28, 1.42, .2, 8), stoneLight, "city-tower-base", new THREE.Vector3(0, 2.82, 0))
  for (const [x, z] of [[-.82, -.82], [.82, -.82], [-.82, .82], [.82, .82]]) {
    const merlon = addCityPart(group, new THREE.BoxGeometry(.42, .32, .42), stoneLight, "city-tower-battlement", new THREE.Vector3(x, 3.06, z))
    merlon.rotation.y = (x * z > 0 ? .12 : -.12)
  }
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
  const signalBrazier = addCityPart(group, new THREE.CylinderGeometry(.2, .25, .12, 8), iron, "city-tower-signal-brazier", new THREE.Vector3(1.02, 3.18, .62))
  signalBrazier.rotation.x = .08
  addCityPart(group, new THREE.SphereGeometry(.14, 7, 5), fire, "city-tower-signal-brazier", new THREE.Vector3(1.02, 3.38, .62))
  addCityPart(group, new THREE.BoxGeometry(.52, .34, .045), banner, "city-tower-banner", new THREE.Vector3(-.24, 4.34, .02), new THREE.Euler(0, 0, -.16))
  return group
}

const createCityStreetVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const dirt = cityMaterial(0x574b3d, {roughness: 1})
  const cobble = cityMaterial(0x5e6058, {roughness: 1})
  const puddle = cityMaterial(0x3b5650, {roughness: .72, transparent: true, opacity: .7})
  const wood = cityMaterial(0x5b402b, {roughness: .98})
  const darkWood = cityMaterial(0x3f3027, {roughness: 1})
  const iron = cityMaterial(0x3f4038, {roughness: .92, metalness: .08})
  const lanternGlass = cityMaterial(0xb17b43, {roughness: .38, emissive: 0x6e2b0a, emissiveIntensity: .45})
  const cloth = cityMaterial(0x634737, {roughness: 1})
  const surface = new THREE.Mesh(new THREE.CircleGeometry(CITY_CELL * 1.35, 10), dirt)
  surface.rotation.x = -Math.PI / 2
  surface.position.y = .11
  surface.name = "city-dirt-path"
  surface.receiveShadow = true
  group.add(setMapRenderLayer(surface, 30))

  const cobbleClusters = [
    [-1.82, -.28, .92, .14], [.05, .16, 1.08, -.16], [1.86, -.2, .88, .12],
  ]
  cobbleClusters.forEach(([x, z, size, rotation]) => {
    const bed = addCityPart(group, new THREE.CylinderGeometry(CITY_CELL * size * .38, CITY_CELL * size * .46, .1, 8), cobble, "city-street-cobble-cluster", new THREE.Vector3(x * CITY_CELL, .15, z * CITY_CELL))
    bed.scale.y = .26
    bed.rotation.y = rotation
    for (const [offsetX, offsetZ, offsetSize] of [[-.22, -.04, .23], [.16, .08, .2], [.02, -.14, .16]]) {
      const stone = addCityPart(group, new THREE.DodecahedronGeometry(CITY_CELL * size * offsetSize, 0), cobble, "city-street-cobble-cluster", new THREE.Vector3((x + offsetX) * CITY_CELL, .21, (z + offsetZ) * CITY_CELL))
      stone.scale.y = .3
      stone.rotation.y = rotation + offsetX
    }
  })
  for (const [x, z, rx, rz] of [[-1.72, -.4, .48, .17], [1.55, .36, .35, .14]]) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(CITY_CELL * rx, 12), puddle)
    water.scale.y = rz / rx
    water.rotation.x = -Math.PI / 2
    water.position.set(x * CITY_CELL, .16, z * CITY_CELL)
    water.name = "city-path-puddle"
    group.add(setMapRenderLayer(water, 32))
  }
  const lanternX = -CITY_CELL * 2.55
  addCityPart(group, new THREE.CylinderGeometry(.055, .09, 1.72, 6), wood, "city-lantern", new THREE.Vector3(lanternX, .86, CITY_CELL * .43))
  const lanternArm = addCityPart(group, new THREE.BoxGeometry(.46, .07, .07), wood, "city-lantern", new THREE.Vector3(lanternX + .18, 1.68, CITY_CELL * .43))
  lanternArm.rotation.z = -.16
  addCityPart(group, new THREE.BoxGeometry(.2, .3, .2), iron, "city-lantern", new THREE.Vector3(lanternX + .38, 1.5, CITY_CELL * .43))
  addCityPart(group, new THREE.SphereGeometry(.09, 6, 4), lanternGlass, "city-lantern-glow", new THREE.Vector3(lanternX + .38, 1.5, CITY_CELL * .43))
  addCityPart(group, new THREE.ConeGeometry(.17, .12, 5), wood, "city-lantern", new THREE.Vector3(lanternX + .38, 1.72, CITY_CELL * .43))

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
  addCityPart(cart, new THREE.CylinderGeometry(.035, .035, CITY_CELL * 1.1, 5), wood, "city-cart-handle", new THREE.Vector3(-CITY_CELL * .82, .51, 0)).rotation.z = -.12
  addCityPart(cart, new THREE.DodecahedronGeometry(.22, 0), cloth, "city-cart-sack", new THREE.Vector3(-CITY_CELL * .3, .82, CITY_CELL * .1))
  addCityPart(cart, new THREE.BoxGeometry(CITY_CELL * .48, .38, CITY_CELL * .46), wood, "city-street-crate", new THREE.Vector3(CITY_CELL * .34, .84, -CITY_CELL * .12), new THREE.Euler(0, -.1, .02))
  for (const z of [-.3, .3]) addCityPart(cart, new THREE.BoxGeometry(CITY_CELL * .52, .045, .05), darkWood, "city-street-crate", new THREE.Vector3(CITY_CELL * .34, .84, z * CITY_CELL), new THREE.Euler(0, -.1, 0))
  group.add(cart)

  for (const [x, z, height] of [[-1.8, .62, .48], [-1.28, .65, .42]]) {
    addCityPart(group, new THREE.CylinderGeometry(.2, .24, height, 10), wood, "city-barrel", new THREE.Vector3(x * CITY_CELL, height / 2 + .12, z * CITY_CELL))
    for (const y of [.16, .34, .52]) {
      const hoop = addCityPart(group, new THREE.TorusGeometry(.21, .025, 5, 10), iron, "city-barrel", new THREE.Vector3(x * CITY_CELL, y, z * CITY_CELL))
      hoop.rotation.x = Math.PI / 2
    }
  }
  return group
}

const createCityPlazaVisual = scale => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const paving = cityMaterial(0x5b5143, {roughness: 1})
  const stone = cityMaterial(0x716d61, {roughness: 1})
  const darkStone = cityMaterial(0x474b45, {roughness: 1})
  const tileEdge = cityMaterial(0x646257, {roughness: 1})
  const crack = cityMaterial(0x3c342d, {roughness: 1})
  const moss = cityMaterial(0x3f6042, {roughness: 1})
  const wood = cityMaterial(0x5b402b, {roughness: .98})
  const iron = cityMaterial(0x3f4038, {roughness: .92, metalness: .08})
  const cloth = cityMaterial(0x633d34, {roughness: 1})
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
  // A notice board, a basket and a broken wheel give the square a human
  // scale and a history without adding opaque cover or collision volumes.
  const noticeX = -CITY_CELL * 2.78
  const noticeZ = -CITY_CELL * 2.7
  addCityPart(group, new THREE.BoxGeometry(CITY_CELL * 1.05, .82, .12), wood, "city-plaza-noticeboard", new THREE.Vector3(noticeX, .86, noticeZ))
  for (const x of [-.38, .38]) addCityPart(group, new THREE.CylinderGeometry(.06, .08, 1.25, 6), wood, "city-plaza-noticeboard", new THREE.Vector3(noticeX + x * CITY_CELL, .45, noticeZ))
  for (const [x, y, width, height] of [[-.26, .9, .28, .2], [.14, .72, .22, .26], [.3, 1.02, .18, .14]]) {
    const notice = addCityPart(group, new THREE.BoxGeometry(CITY_CELL * width, height, .025), tileEdge, "city-plaza-notice", new THREE.Vector3(noticeX + x * CITY_CELL, y, noticeZ - .07))
    notice.rotation.z = x * .3
  }
  const lanternX = CITY_CELL * 2.86
  const lanternZ = CITY_CELL * 2.54
  addCityPart(group, new THREE.CylinderGeometry(.055, .08, 1.5, 6), wood, "city-plaza-lantern", new THREE.Vector3(lanternX, .8, lanternZ))
  addCityPart(group, new THREE.BoxGeometry(.48, .06, .06), wood, "city-plaza-lantern", new THREE.Vector3(lanternX + .2, 1.48, lanternZ), new THREE.Euler(0, 0, -.16))
  addCityPart(group, new THREE.BoxGeometry(.2, .28, .2), iron, "city-plaza-lantern", new THREE.Vector3(lanternX + .4, 1.34, lanternZ))
  addCityPart(group, new THREE.SphereGeometry(.085, 6, 4), fire, "city-plaza-lantern", new THREE.Vector3(lanternX + .4, 1.34, lanternZ))
  const basketX = CITY_CELL * 1.62
  const basketZ = -CITY_CELL * 2.72
  addCityPart(group, new THREE.CylinderGeometry(.25 * CITY_CELL, .31 * CITY_CELL, .26, 8), wood, "city-plaza-basket", new THREE.Vector3(basketX, .31, basketZ))
  const basketHandle = addCityPart(group, new THREE.TorusGeometry(.2 * CITY_CELL, .035 * CITY_CELL, 5, 10, Math.PI), wood, "city-plaza-basket", new THREE.Vector3(basketX, .5, basketZ))
  basketHandle.rotation.x = Math.PI / 2
  const wheel = addCityPart(group, new THREE.TorusGeometry(.55 * CITY_CELL, .1 * CITY_CELL, 6, 12), wood, "city-plaza-cart-wheel", new THREE.Vector3(-CITY_CELL * 1.78, .62, CITY_CELL * 2.52))
  wheel.rotation.x = Math.PI / 2
  wheel.rotation.z = -.18
  addCityPart(group, new THREE.CylinderGeometry(.035, .035, CITY_CELL * .92, 5), wood, "city-plaza-cart-wheel", new THREE.Vector3(-CITY_CELL * 1.78, .48, CITY_CELL * 2.52), new THREE.Euler(0, 0, .18))
  return group
}

const createRoadsideShrineVisual = (scale, variant = 0) => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const stone = cityMaterial(variant % 2 ? 0x6f7167 : 0x565c55, {roughness: 1})
  const stoneLight = cityMaterial(variant % 2 ? 0x98927d : 0x7d7968, {roughness: 1})
  const wood = cityMaterial(variant % 2 ? 0x4b3428 : 0x382820, {roughness: .98})
  const iron = cityMaterial(0x252c29, {roughness: .9, metalness: .08})
  const moss = cityMaterial(variant % 2 ? 0x496047 : 0x384e3d, {roughness: 1})
  const dark = cityMaterial(0x182321, {roughness: .58})
  const fire = cityMaterial(0xd37a32, {roughness: .4, emissive: 0x7d2d0b, emissiveIntensity: .72})
  const part = (geometry, material, role, x, y, z, rotation = null) => addCityPart(
    group, geometry, material, role, new THREE.Vector3(x, y, z), rotation,
  )
  const U = CITY_CELL
  part(new THREE.CylinderGeometry(1.05 * U, 1.18 * U, .12, 8), stone, "city-shrine-footing", 0, .06, 0)
  part(new THREE.BoxGeometry(.72 * U, .34, .62 * U), stoneLight, "city-shrine-pedestal", 0, .28, .08 * U)
  for (const x of [-.42, .42]) part(new THREE.CylinderGeometry(.055 * U, .075 * U, 1.55, 6), wood, "city-shrine-post", x * U, 1.02, 0)
  part(new THREE.BoxGeometry(1.08 * U, .12, .12 * U), wood, "city-shrine-crossbeam", 0, 1.72, 0)
  part(new THREE.ConeGeometry(.72 * U, .62, 4), stone, "city-shrine-gable", 0, 2.08, 0, new THREE.Euler(0, Math.PI / 4, 0))
  part(new THREE.BoxGeometry(.42 * U, .48, .06), dark, "city-shrine-icon", 0, 1.04, -.34 * U)
  part(new THREE.BoxGeometry(.6 * U, .08, .06), moss, "city-shrine-moss", 0, .62, -.36 * U)
  for (const x of [-.64, .64]) {
    part(new THREE.CylinderGeometry(.04 * U, .06 * U, .48, 5), iron, "city-shrine-lantern", x * U, 1.16, -.14 * U)
    part(new THREE.SphereGeometry(.09 * U, 6, 4), fire, "city-shrine-lantern", x * U, 1.2, -.16 * U)
  }
  for (const [x, z, size] of [[-.95, .62, .16], [.88, .48, .13], [1.02, -.72, .15]]) {
    part(new THREE.DodecahedronGeometry(size * U, 0), variant % 2 ? moss : stoneLight, "city-shrine-rubble", x * U, size * U + .1, z * U)
  }
  return group
}

const createCityDetailVisual = (scale, variant = 0, kind = "palisade") => {
  const group = new THREE.Group()
  group.scale.setScalar(scale)
  const U = CITY_CELL
  const wood = cityMaterial(variant % 2 ? 0x4b3428 : 0x382820, {roughness: .98})
  const woodLight = cityMaterial(variant % 2 ? 0x765039 : 0x60412f, {roughness: .98})
  const stone = cityMaterial(variant % 2 ? 0x6f7167 : 0x565c55, {roughness: 1})
  const stoneLight = cityMaterial(variant % 2 ? 0x98927d : 0x7d7968, {roughness: 1})
  const thatch = cityMaterial(variant % 2 ? 0x66533d : 0x514331, {roughness: 1})
  const redCloth = cityMaterial(variant % 2 ? 0x713c34 : 0x5a302b, {roughness: 1})
  const moss = cityMaterial(variant % 2 ? 0x496047 : 0x384e3d, {roughness: 1})
  const iron = cityMaterial(0x252c29, {roughness: .9, metalness: .08})
  const fire = cityMaterial(0xd37a32, {roughness: .4, emissive: 0x7d2d0b, emissiveIntensity: .62})
  const part = (geometry, material, role, x, y, z, rotation = null) => addCityPart(
    group, geometry, material, role, new THREE.Vector3(x, y, z), rotation,
  )
  const rubble = (x, z, size = .16) => part(new THREE.DodecahedronGeometry(size * U, 0), stoneLight, "city-detail-rubble", x * U, size * U + .08, z * U)

  if (kind === "wagon-yard") {
    part(new THREE.CylinderGeometry(1.25 * U, 1.38 * U, .1, 8), stone, "city-wagon-yard", 0, .05, 0)
    part(new THREE.TorusGeometry(.68 * U, .09 * U, 6, 12), wood, "city-wagon-wheel", -.62 * U, .68, -.58 * U, new THREE.Euler(Math.PI / 2, 0, .08))
    part(new THREE.TorusGeometry(.68 * U, .09 * U, 6, 12), wood, "city-wagon-wheel", .62 * U, .68, -.58 * U, new THREE.Euler(Math.PI / 2, 0, -.08))
    part(new THREE.BoxGeometry(1.5 * U, .18, .85 * U), woodLight, "city-wagon-bed", 0, .72, -.48 * U, new THREE.Euler(0, 0, -.08))
    part(new THREE.BoxGeometry(.1 * U, 1.05, .1 * U), wood, "city-wagon-pole", 0, .65, .5 * U, new THREE.Euler(0, 0, .12))
    part(new THREE.CylinderGeometry(.24 * U, .28 * U, .5, 8), iron, "city-yard-barrel", -1.28 * U, .35, .48 * U)
    part(new THREE.DodecahedronGeometry(.28 * U, 0), thatch, "city-yard-hay", 1.1 * U, .34, .5 * U)
    part(new THREE.BoxGeometry(1.12 * U, .12, .1 * U), moss, "city-yard-moss", 0, .24, 1.16 * U)
    rubble(-1.45, -1.0); rubble(1.45, -1.1)
    return group
  }

  if (kind === "ruined-cottage") {
    part(new THREE.CylinderGeometry(1.4 * U, 1.55 * U, .1, 8), stone, "city-cottage-yard", 0, .05, .1 * U)
    part(new THREE.BoxGeometry(1.6 * U, 1.18, .16 * U), wood, "city-cottage-wall", -.5 * U, .68, .5 * U)
    part(new THREE.BoxGeometry(.16 * U, 1.12, 1.3 * U), stone, "city-cottage-wall", .72 * U, .66, .1 * U)
    part(new THREE.BoxGeometry(1.45 * U, .16, .72 * U), thatch, "city-cottage-roof", -.52 * U, 1.42, .48 * U, new THREE.Euler(0, 0, -.28))
    part(new THREE.BoxGeometry(.62 * U, .12, .5 * U), woodLight, "city-cottage-roof-debris", .82 * U, 1.22, .56 * U, new THREE.Euler(0, 0, .2))
    part(new THREE.BoxGeometry(.48 * U, .7, .06), iron, "city-cottage-window", -.5 * U, .92, .39 * U)
    part(new THREE.CylinderGeometry(.14 * U, .18 * U, .58, 7), stoneLight, "city-cottage-chimney", -.95 * U, 1.65, .72 * U)
    part(new THREE.BoxGeometry(.5 * U, .06, .08), moss, "city-cottage-moss", .64 * U, .82, -.76 * U)
    rubble(-1.72, 1.1); rubble(1.65, 1.24); rubble(1.72, -.9)
    return group
  }

  // Low, irregular palisade: it frames a yard without becoming a hidden wall.
  part(new THREE.CylinderGeometry(1.3 * U, 1.42 * U, .08, 8), stone, "city-palisade-yard", 0, .04, 0)
  for (const [x, height, tilt] of [[-1.22, 1.25, -.08], [-.62, 1.55, .04], [0, 1.35, -.06], [.62, 1.62, .06], [1.22, 1.18, -.1]]) {
    part(new THREE.CylinderGeometry(.065 * U, .085 * U, height, 5), wood, "city-palisade-post", x * U, height / 2, .18 * U, new THREE.Euler(0, 0, tilt))
  }
  part(new THREE.BoxGeometry(2.62 * U, .1, .1 * U), woodLight, "city-palisade-rail", 0, .56, .18 * U, new THREE.Euler(0, 0, -.04))
  part(new THREE.BoxGeometry(2.42 * U, .1, .1 * U), wood, "city-palisade-rail", 0, 1.04, .18 * U, new THREE.Euler(0, 0, .05))
  part(new THREE.BoxGeometry(.32 * U, .48, .05), redCloth, "city-palisade-cloth", -.72 * U, 1.3, .12 * U, new THREE.Euler(0, 0, -.12))
  part(new THREE.SphereGeometry(.12 * U, 6, 4), fire, "city-palisade-lantern", 1.25 * U, 1.28, -.02 * U)
  rubble(-1.55, -.74); rubble(1.52, -.82)
  return group
}

const createTeamFeatureVisual = (feature, visualTheme = "northern") => {
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
    group.add(createCityBuildingVisual(scale, variant, cityBuildingArchetype(featureId), visualTheme))
  }
  if (type === "castle_keep" || type === "castle_gate" || type === "castle_courtyard" || type === "castle_detail") {
    const featureId = String(feature.id || "")
    const variant = featureId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)
    if (type === "castle_keep") group.add(createCastleKeepVisual(scale, variant))
    if (type === "castle_gate") group.add(createCastleGateVisual(scale, variant))
    if (type === "castle_courtyard") group.add(createCastleCourtyardVisual(scale, variant))
    if (type === "castle_detail") group.add(createCastleDetailVisual(scale, variant, featureId.includes("chapel") ? "chapel" : "armory"))
  }
  if (type === "castle_house") {
    const featureId = String(feature.id || "")
    const variant = featureId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)
    group.add(createCastleHouseVisual(scale, variant))
  }
  if (type === "castle_market") {
    const featureId = String(feature.id || "")
    const variant = featureId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)
    group.add(createCastleMarketVisual(scale, variant))
  }
  if (type === "castle_street") group.add(createCastleStreetVisual(scale))
  if (type === "castle_bastion") {
    const featureId = String(feature.id || "")
    const variant = featureId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)
    group.add(createCastleBastionVisual(scale, variant))
  }
  if (type === "city_tower") group.add(createCityTowerVisual(scale))
  if (type === "city_shrine") {
    const featureId = String(feature.id || "")
    const variant = featureId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)
    group.add(createRoadsideShrineVisual(scale, variant))
  }
  if (type === "city_detail") {
    const featureId = String(feature.id || "")
    const variant = featureId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)
    const kind = featureId.includes("wagon") ? "wagon-yard" : featureId.includes("cottage") ? "ruined-cottage" : "palisade"
    group.add(createCityDetailVisual(scale, variant, kind))
  }
  if (type === "city_street") group.add(createCityStreetVisual(scale))
  if (type === "city_plaza") group.add(createCityPlazaVisual(scale))
  if (type === "base_well") group.add(createBaseWellVisual(scale))
  if (type === "base_workshop") group.add(createBaseWorkshopVisual(scale))
  if (type === "base_wagon") group.add(createBaseWagonVisual(scale))
  if (type === "base_barracks") group.add(createBaseBarracksVisual(scale))
  if (type === "base_storehouse") group.add(createBaseStorehouseVisual(scale))
  if (type === "base_stable") group.add(createBaseStableVisual(scale))
  if (type === "base_chapel") group.add(createBaseChapelVisual(scale))
  if (type === "base_courtyard") group.add(createBaseCourtyardVisual(scale))
  group.position.set(Number(feature.x) * WORLD_SCALE, 0, Number(feature.y) * WORLD_SCALE)
  group.userData.featureId = feature.id
  group.userData.visualTheme = visualTheme
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
    const northernTeamBattle = teamBattle && isNorthernTeamBattleMap(this.mapState)
    // The classic map must retain the previous commit's bright ground and
    // vegetation. Only Northern Ash opts into the darker team presentation.
    const theme = northernTeamBattle ? "team" : isFirstTrial ? "island" : "default"
    const themeChanged = this.ground.theme !== theme
    this.ground.setTheme(theme)
    if (themeChanged && this.mapState) {
      this.syncWildflowers()
      // sync() normally precedes syncIsland() in the battle renderer. When a
      // running scene changes mode, rebuild mounted fields now so the new
      // atmosphere reaches existing bush/vine objects too.
      this.sync(this.mapState)
    }
    this.syncIslandTerrain(isFirstTrial, width, height)
    this.syncPhaseAtmosphere(teamBattle ? "" : game?.phase, width, height)
    if (northernTeamBattle) this.syncPhaseAtmosphere("team", width, height)
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
    const atmosphere = phase === "team" ? TEAM_BATTLE_ATMOSPHERE : ISLAND_PHASE_ATMOSPHERES[phase]
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
    const visualTheme = isClassicTeamBattleMap(map) ? "classic" : "northern"
    this.syncFeatures(map.features, visualTheme)
    const walls = map.walls || []
    // The same collision map can switch between solo and team atmosphere.
    // Include the ground theme so procedural vegetation is rebuilt with the
    // matching northern-bog palette instead of retaining the bright solo one.
    const signature = `${createMapSignature(map)}:${this.ground.theme}`
    if (signature === this.signature) return
    this.signature = signature
    this.clearContactShadowBatch()
    this.clearStaticBatches()
    this.ground.sync(map.width, map.height, this.ground.theme, walls.filter(wall => wall.type === "water"))
    this.syncWildflowers()

    const active = new Set()
    const vegetationTheme = this.ground.theme === "team" ? "team" : "default"
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
        const key = `${kind}:${vegetationTheme}:${component.map(wall =>
          `${wall.minX}:${wall.minY}:${wall.maxX}:${wall.maxY}:${wall.visual || ""}`).join("|")}`
        active.add(key)
        if (!this.objects.has(key)) {
          this.add(key, createBushField(component, kind, vegetationTheme), component)
        }
      })
    })
    const vineWalls = walls.filter(wall => wall.type === "vine")
    splitBushWallComponents(vineWalls).forEach(component => {
      if (!component.length) return
      const key = `vine:${vegetationTheme}:${component.map(mapWallKey).sort().join("|")}`
      active.add(key)
      if (!this.objects.has(key)) {
        this.add(key, createVineField(component, vegetationTheme), component)
      }
    })
    const nonBushWalls = walls.filter(wall => wall.type !== "bush" && wall.type !== "half" && wall.type !== "moon_mist" && wall.type !== "vine" && wall.type !== "river" && wall.type !== "river_bridge" && wall.type !== "pond" && !COLLISION_ONLY_TYPES.has(wall.type))
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
      if (object.userData.objectiveRangeRing) {
        const rangeVisible = lives > 0
        object.userData.objectiveRangeRing.visible = rangeVisible
        object.userData.objectiveRangeRing.scale.setScalar(1 / visualScale)
        if (object.userData.objectiveRangeRing.material) object.userData.objectiveRangeRing.material.opacity = rangeVisible ? .12 : 0
      }
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

  syncFeatures(features, visualTheme = "northern") {
    const incoming = Array.isArray(features) ? features : []
    const active = new Set()
    incoming.forEach(feature => {
      if (!feature?.id || !feature?.type) return
      const id = String(feature.id)
      active.add(id)
      const existing = this.featureObjects.get(id)
      if (!existing || existing.userData.visualTheme !== visualTheme) {
        if (existing) {
          this.root.remove(existing)
          disposeObjectTree(existing)
        }
        const object = createTeamFeatureVisual(feature, visualTheme)
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
    group.add(createBushField(
      [{minX: -width / 2, minY: -depth / 2, maxX: width / 2, maxY: depth / 2}],
      wall.type,
      this.ground.theme === "team" ? "team" : "default",
    ))
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
