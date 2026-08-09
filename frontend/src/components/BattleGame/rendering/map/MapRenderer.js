import * as THREE from "three"
import {createBushField} from "./BushRenderer.js"
import {GroundRenderer, createWaterTexture} from "./GroundRenderer.js"
import {createEnvironmentModel, createProp} from "./PropRenderer.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {WORLD_SCALE} from "../shared/coordinates.js"
import {assetRegistry} from "../assets/AssetRegistry.js"
import {resolveEnvironmentVisual} from "../assets/assetManifest.js"
import {replaceFallbackWithEnvironment} from "./environmentPlacement.js"
import {createMapSignature} from "./mapSignature.js"
import {flatMaterial} from "../shared/materials.js"
import {ISLAND_PHASE_ATMOSPHERES} from "../../phaseVisuals.js"

const ISLAND_TERRAIN_LAYER_HEIGHTS = [0.003, 0.006, 0.009]
const STORM_SEGMENTS = 96
const REPEATED_BUSH_BATCH_THRESHOLD = 64
const LOW_QUALITY_ENVIRONMENT_BUDGET = 64
const LOW_QUALITY_ENVIRONMENT_RADIUS = 520
const ENVIRONMENT_FOCUS_REBUILD_DISTANCE = 256
const LOW_QUALITY_PROP_COLORS = Object.freeze({
  fence: 0x8b5436,
  crates: 0xb86f31,
  barrels: 0xa6463c,
  cactus: 0x2f9b52,
  crystal: 0x7653dc,
  bones: 0xe7d9b7,
  destructible: 0xd6854d,
  tree: 0x4f352b,
  dead_tree: 0x77736a,
  shipwreck: 0x6f4b35,
  altar_three_moons: 0x5079b4,
  sacrificial_stone: 0x8e394c,
  menhir: 0x626879,
})

const lowQualityPropHeight = type =>
  type === "fence" ? .9 : type === "crates" ? 1.65 : type === "tree" ? 2.8 :
    type === "shipwreck" ? 1.9 : type === "menhir" ? 1.45 : 2.15

const createLowQualityPropBatch = (walls, type, waterTexture) => {
  const isWater = type === "water"
  const geometry = isWater ? new THREE.PlaneGeometry(1, 1) : new THREE.BoxGeometry(1, 1, 1)
  const material = isWater
    ? flatMaterial(0xffffff, {map: waterTexture, transparent: true, opacity: .88})
    : new THREE.MeshBasicMaterial({color: LOW_QUALITY_PROP_COLORS[type] || 0xd2764f})
  const mesh = new THREE.InstancedMesh(geometry, material, walls.length)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const identity = new THREE.Quaternion()
  if (isWater) rotation.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))

  walls.forEach((wall, index) => {
    const width = Math.max(2, wall.maxX - wall.minX) * WORLD_SCALE
    const depth = Math.max(2, wall.maxY - wall.minY) * WORLD_SCALE
    const height = lowQualityPropHeight(type)
    position.set(
      (wall.minX + wall.maxX) * .5 * WORLD_SCALE,
      isWater ? .015 : height * .5,
      (wall.minY + wall.maxY) * .5 * WORLD_SCALE,
    )
    scale.set(width, isWater ? depth : height, isWater ? 1 : depth)
    matrix.compose(position, isWater ? rotation : identity, scale)
    mesh.setMatrixAt(index, matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  return mesh
}

export const shouldBatchEnvironmentVisual = (visual, count) =>
  visual === "bush_a" && Number(count) >= REPEATED_BUSH_BATCH_THRESHOLD

export const selectEnvironmentUpgradeWalls = (
  walls,
  lowQuality,
  focus = null,
  budget = LOW_QUALITY_ENVIRONMENT_BUDGET,
  maxDistance = LOW_QUALITY_ENVIRONMENT_RADIUS,
) => {
  const candidates = Array.isArray(walls) ? walls : []
  if (!lowQuality) return candidates
  const limit = Math.max(0, Math.floor(Number(budget) || 0))
  if (!limit || !candidates.length) return []
  const focusX = Number.isFinite(Number(focus?.x)) ? Number(focus.x) : 0
  const focusY = Number.isFinite(Number(focus?.y)) ? Number(focus.y) : 0
  const maxDistanceSquared = Math.max(0, Number(maxDistance) || 0) ** 2
  const ranked = candidates.map((wall, index) => {
    const x = (Number(wall.minX) + Number(wall.maxX)) * .5
    const y = (Number(wall.minY) + Number(wall.maxY)) * .5
    return {wall, index, distanceSquared: (x - focusX) ** 2 + (y - focusY) ** 2}
  }).sort((a, b) => a.distanceSquared - b.distanceSquared || a.index - b.index)
  const nearby = ranked.filter(item => item.distanceSquared <= maxDistanceSquared)
  const selected = nearby.length ? nearby : ranked
  return selected.slice(0, limit).map(item => item.wall)
}

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
    if (previous && previous.type === wall.type && previous.visual === wall.visual && previous.minY === wall.minY &&
      previous.maxY === wall.maxY && Math.abs(previous.maxX - wall.minX) < 0.01) {
      previous.maxX = wall.maxX
    } else {
      merged.push({...wall})
    }
    return merged
  }, [])

export class MapRenderer {
  constructor(root, {waterTexture = null, lowQuality = false} = {}) {
    this.root = root
    this.lowQuality = lowQuality
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
  }

  syncIsland(game, width, height) {
    const isFirstTrial = game?.islandName === "Остров Первого Испытания"
    this.ground.setTheme(isFirstTrial ? "island" : "default")
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
        const group = new THREE.Group()
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(38 * WORLD_SCALE, 48 * WORLD_SCALE, 118 * WORLD_SCALE, 8), flatMaterial(0xe7edf0))
        tower.position.y = 59 * WORLD_SCALE
        const crown = new THREE.Mesh(new THREE.SphereGeometry(23 * WORLD_SCALE, 16, 10), new THREE.MeshBasicMaterial({color: 0xffd447}))
        crown.position.y = 130 * WORLD_SCALE
        const beam = new THREE.Mesh(new THREE.ConeGeometry(94 * WORLD_SCALE, 220 * WORLD_SCALE, 32, 1, true), new THREE.MeshBasicMaterial({color: 0xffdf67, transparent: true, opacity: .18, depthWrite: false, side: THREE.DoubleSide}))
        beam.position.y = 115 * WORLD_SCALE
        const halo = new THREE.Mesh(new THREE.TorusGeometry(54 * WORLD_SCALE, 2.2 * WORLD_SCALE, 8, 48), new THREE.MeshBasicMaterial({color: 0xfff2a2, transparent: true, opacity: .72}))
        halo.rotation.x = Math.PI / 2
        halo.position.y = 3 * WORLD_SCALE
        const glow = new THREE.Mesh(new THREE.CylinderGeometry(32 * WORLD_SCALE, 44 * WORLD_SCALE, 4 * WORLD_SCALE, 20), new THREE.MeshBasicMaterial({color: 0xffd447, transparent: true, opacity: .6}))
        glow.position.y = 2 * WORLD_SCALE
        group.add(tower, crown, beam, glow, halo)
        group.userData.beam = beam
        group.userData.crown = crown
        group.userData.open = false
        group.position.set(width * WORLD_SCALE * .5, 0, height * WORLD_SCALE * .5)
        this.beaconGroup = group
        this.root.add(group)
      }
      this.beaconGroup.visible = true
      const open = Boolean(game?.beaconOpen)
      this.beaconGroup.userData.open = open
      if (this.beaconGroup.userData.beam) this.beaconGroup.userData.beam.material.opacity = open ? .42 : .13
      if (this.beaconGroup.userData.crown) this.beaconGroup.userData.crown.scale.setScalar(open ? 1.22 : 1)
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
      const waterRing = new THREE.Mesh(new THREE.CircleGeometry(width * .5 * WORLD_SCALE * .9, 96), new THREE.MeshBasicMaterial({color: 0x4f9b50}))
      const forest = new THREE.Mesh(new THREE.CircleGeometry(width * .5 * WORLD_SCALE * .68, 96), new THREE.MeshBasicMaterial({color: 0x438e48}))
      const plaza = new THREE.Mesh(new THREE.CircleGeometry(205 * WORLD_SCALE, 64), new THREE.MeshBasicMaterial({color: 0x57616a}))
      ;[waterRing, forest, plaza].forEach((mesh, index) => {
        mesh.rotation.x = -Math.PI / 2
        mesh.position.y = ISLAND_TERRAIN_LAYER_HEIGHTS[index]
        group.add(mesh)
      })
      const bridgeMaterial = flatMaterial(0x6d5237)
      const bridgeNorth = new THREE.Mesh(new THREE.BoxGeometry(150 * WORLD_SCALE, 5 * WORLD_SCALE, 38 * WORLD_SCALE), bridgeMaterial)
      const bridgeSouth = bridgeNorth.clone()
      bridgeNorth.position.set(0, .08, -205 * WORLD_SCALE)
      bridgeSouth.position.set(0, .08, 205 * WORLD_SCALE)
      group.add(bridgeNorth, bridgeSouth)
      group.position.set(width * WORLD_SCALE * .5, 0, height * WORLD_SCALE * .5)
      this.islandTerrain = group
      this.root.add(group)
    }
    this.islandTerrain.visible = true
  }

  sync(map) {
    if (!map) return
    this.mapState = map
    const walls = map.walls || []
    const signature = createMapSignature(map)
    if (signature === this.signature) return
    this.signature = signature
    if (this.lowQuality) {
      this.objects.forEach(object => {
        this.root.remove(object)
        disposeObjectTree(object)
      })
      this.objects.clear()
    }
    this.ground.sync(map.width, map.height, this.ground.theme, walls.filter(wall => wall.type === "water"))

    const active = new Set()
    const bushWalls = walls.filter(wall => wall.type === "bush" || wall.type === "half" || wall.type === "moon_mist")
    const glbBushWalls = bushWalls.filter(wall => assetRegistry.hasEnvironment(resolveEnvironmentVisual(wall)))
    const fallbackBushWalls = bushWalls.filter(wall => !assetRegistry.hasEnvironment(resolveEnvironmentVisual(wall)))
    // Large repeated fields stay instanced, but low-quality rendering must not
    // disable authored environment assets for ordinary colliders.
    const batchBushes = shouldBatchEnvironmentVisual("bush_a", glbBushWalls.length)
    const batchedBushWalls = batchBushes ? [...fallbackBushWalls, ...glbBushWalls] : fallbackBushWalls
    const fallbackBushGroups = batchedBushWalls.reduce((groups, wall) => {
      const kind = wall.type === "moon_mist" ? "moon_mist" : "bush"
      groups[kind] = groups[kind] || []
       groups[kind].push(wall)
      return groups
    }, {})
    Object.entries(fallbackBushGroups).forEach(([kind, kindWalls]) => {
      const key = `${kind}:${kindWalls.map(wall =>
        `${wall.minX}:${wall.minY}:${wall.maxX}:${wall.maxY}:${wall.visual || ""}`).join("|")}`
      active.add(key)
      if (!this.objects.has(key)) this.add(key, createBushField(kindWalls, kind, {lowQuality: this.lowQuality}))
    })
    const mergedWalls = mergeWalls(walls.filter(wall => wall.type !== "bush" && wall.type !== "half" && wall.type !== "moon_mist"))
    const renderWalls = [...(batchBushes ? [] : glbBushWalls), ...mergedWalls]
    const environmentWalls = renderWalls.filter(wall => assetRegistry.hasEnvironment(resolveEnvironmentVisual(wall)))
    const upgradeWalls = this.lowQuality
      ? selectEnvironmentUpgradeWalls(
        environmentWalls,
        true,
        this.focus || {x: map.width * .5, y: map.height * .5},
      )
      : renderWalls
    const upgradeWallSet = new Set(upgradeWalls)
    if (this.lowQuality) {
      const fallbackWalls = renderWalls.filter(wall => !upgradeWallSet.has(wall))
      const batches = new Map()
      fallbackWalls.forEach(wall => {
        const type = wall.type || "wall"
        const group = batches.get(type) || []
        group.push(wall)
        batches.set(type, group)
      })
      batches.forEach((batch, type) => {
        const key = `low-quality:${type}`
        active.add(key)
        if (!this.objects.has(key)) this.add(key, createLowQualityPropBatch(batch, type, this.waterTexture))
      })
    }
    upgradeWalls.forEach((wall, index) => {
      const key = `${wall.minX}:${wall.minY}:${wall.maxX}:${wall.maxY}:${wall.type}:${wall.visual || ""}`
      active.add(key)
      if (!this.objects.has(key)) {
        const fallback = wall.type === "bush" || wall.type === "half" || wall.type === "moon_mist"
          ? this.createBushFallback(wall)
          : createProp(wall, index, this.waterTexture)
        this.add(key, fallback)
        this.upgradeToEnvironment(key, fallback, wall)
      }
    })
    this.objects.forEach((object, key) => {
      if (active.has(key)) return
      this.objects.delete(key)
      this.debris.push({object, age: 0, life: 0.28, baseY: object.position.y})
    })
  }

  setLowQuality() {
    if (this.lowQuality) return
    this.lowQuality = true
    this.objects.forEach(object => {
      this.root.remove(object)
      disposeObjectTree(object)
    })
    this.objects.clear()
    this.debris.forEach(piece => disposeObjectTree(piece.object))
    this.debris = []
    this.signature = ""
    if (this.mapState) this.sync(this.mapState)
  }

  add(key, object) {
    this.objects.set(key, object)
    this.root.add(object)
  }

  setFocus(x, y) {
    const next = {x: Number(x), y: Number(y)}
    if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) return
    if (this.focus && Math.hypot(next.x - this.focus.x, next.y - this.focus.y) < ENVIRONMENT_FOCUS_REBUILD_DISTANCE) return
    this.focus = next
    // The focus chooses the authored GLB window only when the map is first
    // built. Rebuilding while the player moves would remove a mounted GLB,
    // show its primitive fallback for at least one frame, and then replace it
    // again asynchronously. Keep the current scene stable until the map
    // itself changes; the next full sync uses the latest focus.
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
    return group
  }

  async upgradeToEnvironment(key, fallback, wall) {
    const visual = resolveEnvironmentVisual(wall)
    if (!visual || !assetRegistry.hasEnvironment(visual)) return
    try {
      await replaceFallbackWithEnvironment(
        fallback,
        [...fallback.children],
        wall,
        async () => {
          const instance = await assetRegistry.instantiateEnvironment(visual)
          return instance ? createEnvironmentModel(instance, wall) : null
        },
        () => this.objects.get(key) === fallback,
        object => disposeObjectTree(object),
        object => disposeObjectTree(object),
      )
    } catch (error) {
      if (typeof window !== "undefined") console.warn(`Could not load environment GLB: ${visual}`, error)
    }
  }

  update(delta) {
    this.waterTexture.offset.add({x: delta * 0.035, y: delta * 0.018})
    if (this.stormMesh) {
      this.stormRadius = smoothStormRadius(this.stormRadius, this.stormTargetRadius, delta)
      updateStormRingGeometry(this.stormMesh.geometry, this.stormRadius * WORLD_SCALE, this.stormMesh.geometry.userData.outerRadius)
    }
    if (this.beaconGroup) {
      this.beaconGroup.rotation.y += delta * 1.5
      this.beaconGroup.position.y = Math.sin(performance.now() / 300) * .015
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
    this.waterTexture.dispose()
  }
}
