const asId = value => String(value ?? "")

export const isConfirmedHitEvent = event => Boolean(
  event &&
  event.kind === "hit" &&
  (!event.phase || event.phase === "impact") &&
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

export const resolveCombatSourcePosition = (event, state) => {
  if (!event || !state) return null
  const sourceId = asId(event.sourceId)
  const source = state.players?.[sourceId] || state.monsters?.[sourceId]
  if (!source || !Number.isFinite(Number(source.x)) || !Number.isFinite(Number(source.y))) return null
  return {x: Number(source.x), y: Number(source.y)}
}

export const getCombatHitProfile = event => {
  const defeat = String(event?.reaction || "") === "defeat"
  const hitStopMs = Number(event?.hitStopMs)
  return {
    reaction: defeat ? "defeat" : "hit",
    burstScale: defeat ? 1.18 : 1,
    hitStopSeconds: Number.isFinite(hitStopMs)
      ? Math.max(.02, Math.min(.16, hitStopMs / 1000))
      : defeat ? .11 : .055,
  }
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
