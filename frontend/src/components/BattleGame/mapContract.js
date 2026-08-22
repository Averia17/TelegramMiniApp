// The server owns map geometry. This module is the single client boundary for
// compact snapshots and collision semantics shared by prediction and UI.
export const preserveAuthoritativeMapWalls = (map, previousMap) => {
  const previousWalls = previousMap?.walls
  const incomingWalls = map?.walls
  if (!Array.isArray(previousWalls) || previousWalls.length === 0) return map
  // `null` is the compact-snapshot marker emitted by the backend when the
  // unchanged wall list is omitted. An explicit [] is different: it is a
  // complete authoritative map with no remaining walls (for example after
  // abilities destroyed the last destructible cells).
  if (Array.isArray(incomingWalls)) return map
  if (map?.id && previousMap?.id && map.id !== previousMap.id) return map
  if (Number.isFinite(Number(map?.revision)) && Number.isFinite(Number(previousMap?.revision)) &&
    Number(map.revision) !== Number(previousMap.revision)) return map
  if (map?.width !== previousMap.width || map?.height !== previousMap.height) return map
  return {...map, walls: previousWalls}
}

export const isBlockingWall = wall => typeof wall?.blocking === "boolean"
  ? wall.blocking
  : wall?.type !== "half" && wall?.type !== "bush" && wall?.type !== "moon_mist" && wall?.type !== "river_bridge"

export const mapIdentity = map => ({
  id: map?.id || map?.name || "",
  revision: Number(map?.revision) || 0,
  width: Number(map?.width) || 0,
  height: Number(map?.height) || 0,
})
