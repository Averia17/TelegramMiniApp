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
