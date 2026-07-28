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
  }

  sync(map) {
    if (!map) return
    const walls = map.walls || []
    const signature = createMapSignature(map)
    if (signature === this.signature) return
    this.signature = signature
    this.ground.sync(map.width, map.height)

    const active = new Set()
    const bushWalls = walls.filter(wall => wall.type === "bush" || wall.type === "half")
    const glbBushWalls = bushWalls.filter(wall => assetRegistry.hasEnvironment(resolveEnvironmentVisual(wall)))
    const fallbackBushWalls = bushWalls.filter(wall => !assetRegistry.hasEnvironment(resolveEnvironmentVisual(wall)))
    if (fallbackBushWalls.length) {
      const key = `bush:${fallbackBushWalls.map(wall =>
        `${wall.minX}:${wall.minY}:${wall.maxX}:${wall.maxY}:${wall.visual || ""}`).join("|")}`
      active.add(key)
      if (!this.objects.has(key)) this.add(key, createBushField(fallbackBushWalls))
    }
    const mergedWalls = mergeWalls(walls.filter(wall => wall.type !== "bush" && wall.type !== "half"))
    const renderWalls = [...glbBushWalls, ...mergedWalls]
    renderWalls.forEach((wall, index) => {
      const key = `${wall.minX}:${wall.minY}:${wall.maxX}:${wall.maxY}:${wall.type}:${wall.visual || ""}`
      active.add(key)
      if (!this.objects.has(key)) {
        const fallback = wall.type === "bush" || wall.type === "half"
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
    group.add(createBushField([{minX: -width / 2, minY: -depth / 2, maxX: width / 2, maxY: depth / 2}]))
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
      console.warn(`Could not load environment GLB: ${visual}`, error)
    }
  }

  update(delta) {
    this.waterTexture.offset.add({x: delta * 0.035, y: delta * 0.018})
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
    this.waterTexture.dispose()
  }
}
