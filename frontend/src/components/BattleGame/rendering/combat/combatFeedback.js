const asId = value => String(value ?? "")

export const isConfirmedHitEvent = event => Boolean(
  event &&
  event.kind === "hit" &&
  Number(event.damage) > 0 &&
  asId(event.id),
)

export const resolveCombatTargetPosition = (event, state) => {
  if (!event || !state) return null
  const targetType = String(event.targetType || "players").toLowerCase()
  const targetId = asId(event.targetId)
  if (targetType.startsWith("objective")) {
    const target = (Array.isArray(state.objectives) ? state.objectives : [])
      .find(objective => asId(objective?.id) === targetId)
    if (!target || !Number.isFinite(Number(target.x)) || !Number.isFinite(Number(target.y))) return null
    return {x: Number(target.x), y: Number(target.y), radius: Number(target.radius) || 42}
  }
  const collection = targetType.startsWith("monster") ? state.monsters : state.players
  const target = collection?.[targetId]
  if (!target || !Number.isFinite(Number(target.x)) || !Number.isFinite(Number(target.y))) return null
  return {x: Number(target.x), y: Number(target.y), radius: Number(target.radius) || 18}
}

export const collectNewCombatHits = (events, seenIds = new Set()) => {
  const nextSeenIds = new Set(seenIds)
  const hits = []
  for (const event of Array.isArray(events) ? events : []) {
    const id = asId(event?.id)
    if (!isConfirmedHitEvent(event) || nextSeenIds.has(id)) continue
    nextSeenIds.add(id)
    hits.push(event)
  }
  return {hits, seenIds: nextSeenIds}
}
