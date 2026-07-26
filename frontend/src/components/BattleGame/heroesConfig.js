export const ATTACK_ARCHETYPES = Object.freeze({
  PROJECTILE: "projectile",
  BURST: "burst",
  SHOTGUN: "shotgun",
  PIERCING_AREA: "piercing_area",
  THROWER: "thrower",
  DASH: "dash",
  RETURNING: "returning",
})

export const HERO_AIM_DEFAULTS = Object.freeze({
  projectile: {shape: "line", color: "#ffffff"},
  burst: {shape: "line", color: "#8ee8ff"},
  shotgun: {shape: "cone", color: "#ffd36a"},
  piercing_area: {shape: "cone", color: "#8cffbc"},
  thrower: {shape: "lob", color: "#79caff"},
  dash: {shape: "cone", color: "#c895ff"},
  returning: {shape: "line", color: "#8ffff1"},
})

export const normalizeHeroConfig = hero => {
  const attack = hero?.attack || {}
  const visual = HERO_AIM_DEFAULTS[attack.archetype] || HERO_AIM_DEFAULTS.projectile
  return {
    ...hero,
    stats: {
      maxHealth: hero?.maxLives || 1,
      moveSpeed: hero?.speed || 0,
      radius: hero?.radius || 14,
      ammo: hero?.maxAmmo || 3,
      reloadMs: hero?.reloadTime || 0,
      regenRate: hero?.regenRate || 0,
    },
    attack: {...attack, aimShape: attack.aimShape || visual.shape},
    aim: {shape: attack.aimShape || visual.shape, color: hero?.color || visual.color},
  }
}

export const indexHeroConfigs = heroes => Object.fromEntries(
  (heroes || []).map(hero => {
    const normalized = normalizeHeroConfig(hero)
    return [normalized.name, normalized]
  }),
)
