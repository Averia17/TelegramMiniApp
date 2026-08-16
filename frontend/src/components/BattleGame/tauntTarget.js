const distanceSquared = (a, b) => {
  const dx = (Number(a?.x) || 0) - (Number(b?.x) || 0)
  const dy = (Number(a?.y) || 0) - (Number(b?.y) || 0)
  return dx * dx + dy * dy
}

export const chooseTauntTarget = ({players = {}, localId, isVisible = () => true} = {}) => {
  const local = players?.[localId]
  const living = Object.entries(players)
    .filter(([id, player]) => String(id) !== String(localId) && Number(player?.lives) > 0)
  const visible = living.filter(([id]) => isVisible(id))
  const candidates = (visible.length ? visible : living)
    .sort(([leftId, left], [rightId, right]) => {
      if (!local) return String(leftId).localeCompare(String(rightId))
      return distanceSquared(left, local) - distanceSquared(right, local)
    })
  return candidates[0]?.[0] || null
}
