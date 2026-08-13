const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const getAttackCooldownVisual = (player = {}) => {
  const remaining = Math.max(0, Number(player.attackCooldown) || 0)
  const duration = Math.max(.001, (Number(player.attackRateMs) || 0) / 1000)
  const progress = remaining > 0 ? clamp(remaining / duration, 0, 1) : 0

  return {
    state: remaining > 0 ? "cooldown" : player.attackReady === false ? "blocked" : "ready",
    remaining,
    progress,
  }
}
