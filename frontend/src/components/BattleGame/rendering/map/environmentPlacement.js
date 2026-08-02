import * as THREE from "three"
import {WORLD_SCALE} from "../shared/coordinates.js"

export const getEnvironmentPlacements = (wall, asset, worldScale) => {
  if (asset.placement !== "repeat") return [{x: 0, z: 0}]
  const width = Math.max(0, wall.maxX - wall.minX)
  const depth = Math.max(0, wall.maxY - wall.minY)
  const columns = Math.max(1, Math.ceil(width / asset.footprint))
  const rows = Math.max(1, Math.ceil(depth / asset.footprint))
  const cellWidth = width / columns * worldScale
  const cellDepth = depth / rows * worldScale
  const placements = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      placements.push({
        x: (column - (columns - 1) / 2) * cellWidth,
        z: (row - (rows - 1) / 2) * cellDepth,
      })
    }
  }
  return placements
}

export const replaceFallbackWithEnvironment = async (
  container,
  fallback,
  wall,
  load,
  isCurrent = () => true,
  onReplace = () => {},
  onDiscard = () => {},
) => {
  const instance = await load(wall)
  if (!instance?.root) return false
  if (!isCurrent()) {
    onDiscard(instance.root)
    return false
  }
  const fallbackObjects = Array.isArray(fallback) ? fallback : [fallback]
  container.remove(...fallbackObjects)
  container.add(instance.root)
  fallbackObjects.forEach(onReplace)
  return true
}

const fitModelToCell = (model, width, depth) => {
  const bounds = new THREE.Box3().setFromObject(model, true)
  if (bounds.isEmpty()) return
  const size = bounds.getSize(new THREE.Vector3())
  if (size.x > .0001) model.scale.x *= width / size.x
  if (size.z > .0001) model.scale.z *= depth / size.z
}

export const createEnvironmentModel = (instance, wall) => {
  const placements = getEnvironmentPlacements(wall, instance.asset, WORLD_SCALE)
  const modelWidth = Math.max(0, wall.maxX - wall.minX)
  const modelDepth = Math.max(0, wall.maxY - wall.minY)
  const columns = Math.max(1, Math.ceil(modelWidth / instance.asset.footprint))
  const rows = Math.max(1, Math.ceil(modelDepth / instance.asset.footprint))
  const cellWidth = modelWidth / columns * WORLD_SCALE
  const cellDepth = modelDepth / rows * WORLD_SCALE
  const group = new THREE.Group()

  placements.forEach((position, index) => {
    const model = index === 0 ? instance.root : instance.root.clone(true)
    if (instance.asset.fitToCell) fitModelToCell(model, cellWidth, cellDepth)
    model.position.x += position.x
    model.position.z += position.z
    group.add(model)
  })
  return {root: group, asset: instance.asset}
}
