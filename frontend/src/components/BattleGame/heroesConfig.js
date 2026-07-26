export const ATTACK_ARCHETYPES = Object.freeze({
  PROJECTILE: "projectile",
  BURST: "burst",
  SHOTGUN: "shotgun",
  PIERCING_AREA: "piercing_area",
  THROWER: "thrower",
  DASH: "dash",
  RETURNING: "returning",
})

export const HEROES_CONFIG = Object.freeze([
  {name:"Mandy",color:"#F4C542",maxLives:7200,speed:250,attackDamage:1700,attackType:"mandy_staff",role:"Fighter",attack:{archetype:"melee_cone",aimShape:"cone",range:120}},
  {name:"Fairy Mina",color:"#FF8FE8",maxLives:6000,speed:270,attackDamage:720,attackType:"mina_star_fan",role:"Support",attack:{archetype:"shotgun",aimShape:"cone",range:510,projectileCount:3}},
  {name:"Brock Zeus",color:"#62C8FF",maxLives:6200,speed:245,attackDamage:1550,attackType:"zeus_lightning",role:"Sharpshooter",attack:{archetype:"projectile",aimShape:"line",range:760,splashRadius:72}},
  {name:"Kaze",color:"#B88CFF",maxLives:6500,speed:310,attackDamage:780,attackType:"kaze_cross_slash",role:"Assassin",attack:{archetype:"melee_cone",aimShape:"cone",range:105}},
  {name:"Wukong Mico",color:"#FFB33E",maxLives:9000,speed:255,attackDamage:1450,attackType:"mico_jump_slam",role:"Tank",attack:{archetype:"dash",aimShape:"lob",range:100}},
  {name:"Damian",color:"#8D52D9",maxLives:6400,speed:250,attackDamage:1200,attackType:"damian_dark_orb",role:"Summoner",attack:{archetype:"projectile",aimShape:"line",range:640}},
  {name:"Persephone Lumi",color:"#D954A8",maxLives:6800,speed:250,attackDamage:1050,attackType:"lumi_trail_orb",role:"Controller",attack:{archetype:"projectile",aimShape:"line",range:600}},
])

export const HERO_AIM_DEFAULTS = Object.freeze({
  projectile: {shape: "line", color: "#ffffff"},
  burst: {shape: "line", color: "#8ee8ff"},
  shotgun: {shape: "cone", color: "#ffd36a"},
  piercing_area: {shape: "cone", color: "#8cffbc"},
  thrower: {shape: "lob", color: "#79caff"},
  dash: {shape: "cone", color: "#c895ff"},
  returning: {shape: "line", color: "#8ffff1"},
  melee_cone: {shape: "cone", color: "#d9a6ff"},
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
