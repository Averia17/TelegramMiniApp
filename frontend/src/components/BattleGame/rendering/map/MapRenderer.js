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

const ISLAND_TERRAIN_LAYER_HEIGHTS = [0.003, 0.006, 0.009]

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
  constructor(root, {waterTexture = null} = {}) {
    this.root = root
    this.ground = new GroundRenderer(root)
    this.waterTexture = waterTexture || createWaterTexture()
    this.objects = new Map()
    this.debris = []
    this.signature = ""
    this.stormMesh = null
    this.beaconGroup = null
    this.islandTerrain = null
  }

  syncIsland(game, width, height) {
    const isFirstTrial = game?.islandName === "Остров Первого Испытания"
    this.ground.setTheme(isFirstTrial ? "island" : "default")
    this.syncIslandTerrain(isFirstTrial, width, height)
    const stormRadius = Number(game?.stormRadius) || 0
    if (stormRadius > 0) {
      const outerRadius = Math.hypot(width, height) * 0.5 * WORLD_SCALE
      const radiusKey = Math.round(stormRadius)
      if (!this.stormMesh || this.stormMesh.userData.radiusKey !== radiusKey) {
        if (this.stormMesh) {
          this.root.remove(this.stormMesh)
          disposeObjectTree(this.stormMesh)
        }
        this.stormMesh = new THREE.Mesh(
          new THREE.RingGeometry(stormRadius * WORLD_SCALE, outerRadius, 96),
          new THREE.MeshBasicMaterial({color: 0x5a174f, transparent: true, opacity: .46, depthWrite: false, side: THREE.DoubleSide}),
        )
        this.stormMesh.rotation.x = -Math.PI / 2
        this.stormMesh.position.set(width * WORLD_SCALE * .5, .04, height * WORLD_SCALE * .5)
        this.stormMesh.userData.radiusKey = radiusKey
        this.root.add(this.stormMesh)
      }
    } else if (this.stormMesh) {
      this.root.remove(this.stormMesh)
      disposeObjectTree(this.stormMesh)
      this.stormMesh = null
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
    const walls = map.walls || []
    const signature = createMapSignature(map)
    if (signature === this.signature) return
    this.signature = signature
    this.ground.sync(map.width, map.height, this.ground.theme, walls.filter(wall => wall.type === "water"))

    const active = new Set()
    const bushWalls = walls.filter(wall => wall.type === "bush" || wall.type === "half" || wall.type === "moon_mist")
    const glbBushWalls = bushWalls.filter(wall => assetRegistry.hasEnvironment(resolveEnvironmentVisual(wall)))
    const fallbackBushWalls = bushWalls.filter(wall => !assetRegistry.hasEnvironment(resolveEnvironmentVisual(wall)))
    const fallbackBushGroups = fallbackBushWalls.reduce((groups, wall) => {
      const kind = wall.type === "moon_mist" ? "moon_mist" : "bush"
      groups[kind] = groups[kind] || []
      groups[kind].push(wall)
      return groups
    }, {})
    Object.entries(fallbackBushGroups).forEach(([kind, kindWalls]) => {
      const key = `${kind}:${kindWalls.map(wall =>
        `${wall.minX}:${wall.minY}:${wall.maxX}:${wall.maxY}:${wall.visual || ""}`).join("|")}`
      active.add(key)
      if (!this.objects.has(key)) this.add(key, createBushField(kindWalls, kind))
    })
    const mergedWalls = mergeWalls(walls.filter(wall => wall.type !== "bush" && wall.type !== "half" && wall.type !== "moon_mist"))
    const renderWalls = [...glbBushWalls, ...mergedWalls]
    renderWalls.forEach((wall, index) => {
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

  add(key, object) {
    this.objects.set(key, object)
    this.root.add(object)
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
    if (this.stormMesh) this.stormMesh.rotation.y += delta * .08
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
    if (this.beaconGroup) disposeObjectTree(this.beaconGroup)
    if (this.islandTerrain) disposeObjectTree(this.islandTerrain)
    this.waterTexture.dispose()
  }
}
