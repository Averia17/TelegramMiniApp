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

const ISLAND_TERRAIN_LAYER_HEIGHTS = [0.003, 0.006, 0.009]
const STORM_SEGMENTS = 96
// Rebuilds dispose and recreate instanced environment batches. Keep this
// coarse so ordinary movement never turns into a stream of scene rebuilds.
const ENVIRONMENT_FOCUS_REBUILD_DISTANCE = 256
const STONE_PROP_TYPES = new Set(["wall", "destructible", "sacrificial_stone", "menhir"])
const DEFAULT_MAP_TILE_SIZE = 40
const BEACON_VISUAL_SCALE = 24

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
  }

  syncIsland(game, width, height) {
    const isFirstTrial = game?.islandName === "Остров Первого Испытания"
    const themeChanged = (this.ground.theme === "island") !== isFirstTrial
    this.ground.setTheme(isFirstTrial ? "island" : "default")
    if (themeChanged && this.mapState) this.syncWildflowers()
    this.syncIslandTerrain(isFirstTrial, width, height)
    this.syncPhaseAtmosphere(game?.phase, width, height)
    const stormRadius = Number(game?.stormRadius) || 0
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
    const nonBushWalls = walls.filter(wall => wall.type !== "bush" && wall.type !== "half" && wall.type !== "moon_mist")
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
    if (this.islandTerrain) disposeObjectTree(this.islandTerrain)
    if (this.wildflowerField) disposeObjectTree(this.wildflowerField)
    this.bushVisuals.clear()
    this.waterTexture.dispose()
  }
}
