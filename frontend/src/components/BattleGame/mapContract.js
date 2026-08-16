// The server owns map geometry. This module is the single client boundary for
// compact snapshots and collision semantics shared by prediction and UI.
export const preserveAuthoritativeMapWalls = (map, previousMap) => {
  const previousWalls = previousMap?.walls
  const incomingWalls = map?.walls
  if (!Array.isArray(previousWalls) || previousWalls.length === 0) return map
  if (Array.isArray(incomingWalls) && incomingWalls.length > 0) return map
  if (map?.width !== previousMap.width || map?.height !== previousMap.height) return map
  return {...map, walls: previousWalls}
}

export const isBlockingWall = wall => typeof wall?.blocking === "boolean"
  ? wall.blocking
  : wall?.type !== "half" && wall?.type !== "bush" && wall?.type !== "moon_mist"

export const mapIdentity = map => ({
  id: map?.id || map?.name || "",
  revision: Number(map?.revision) || 0,
  width: Number(map?.width) || 0,
  height: Number(map?.height) || 0,
})
