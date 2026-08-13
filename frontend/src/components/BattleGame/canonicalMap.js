const CANONICAL_MAP_URL = "/api/battle/map-preview"

export const loadCanonicalBattleMap = async (fetchImpl = fetch) => {
  const response = await fetchImpl(CANONICAL_MAP_URL, {cache: "no-store"})
  if (!response.ok) throw new Error(`Map API returned ${response.status}`)
  const payload = await response.json()
  if (!payload?.map || !Array.isArray(payload.map.walls)) {
    throw new Error("Map API returned an invalid canonical map")
  }
  // Keep the server-owned map object intact. Spawners are preview-only metadata
  // and do not create a second map representation.
  payload.map.spawners = Array.isArray(payload.spawners) ? payload.spawners : []
  return payload.map
}
