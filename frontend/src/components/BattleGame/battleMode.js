export const DEATHMATCH_MODE = "deathmatch"
export const TEAM_DEATHMATCH_MODE = "team deathmatch"

export const normalizeBattleMode = mode =>
  String(mode || "").trim().toLowerCase() === TEAM_DEATHMATCH_MODE
    ? TEAM_DEATHMATCH_MODE
    : DEATHMATCH_MODE

const isDefended = entity =>
  Number(entity?.invulnerable) > 0 ||
  Number(entity?.shield) > 0 ||
  Number(entity?.shieldHp) > 0 ||
  Number(entity?.shieldStacks) > 0 ||
  (Number(entity?.stealth) > 0 && Number(entity?.dodges) > 0)

export const createBattleMode = mode => {
  const id = normalizeBattleMode(mode)
  return Object.freeze({
    id,
    usesTeams: id === TEAM_DEATHMATCH_MODE,
    areAllies: (source, target) => Boolean(
      id === TEAM_DEATHMATCH_MODE && source?.team && target?.team && source.team === target.team,
    ),
    canDamage: (source, target) => Boolean(
      target && Number(target.lives) > 0 &&
      String(source?.playerId || "") !== String(target.playerId || "") &&
      !(id === TEAM_DEATHMATCH_MODE && source?.team && target?.team && source.team === target.team) &&
      !isDefended(target),
    ),
  })
}

export const createBattleContext = state => {
  const map = state?.map || {}
  return Object.freeze({
    mode: createBattleMode(state?.game?.mode),
    map: Object.freeze({
      id: map.id || map.name || "",
      revision: Number(map.revision) || 0,
      width: Number(map.width) || 0,
      height: Number(map.height) || 0,
    }),
  })
}
