export const SPAWN_PROTECTION_MIN_VISIBLE_SECONDS = 0.05

export const getSpawnProtectionVisualState = (player = {}, teamBattle = false) => {
  const remaining = Math.max(0, Number(player.invulnerable) || 0)
  return {
    active: Boolean(teamBattle && Number(player.lives) > 0 && remaining >= SPAWN_PROTECTION_MIN_VISIBLE_SECONDS),
    remaining,
  }
}
