const clips = Object.freeze({
  idle: "Idle",
  run: "Run",
  attack: "Attack",
  super: "Super",
  hit: "Hit",
  death: "Death",
})

const hero = (id, scale = 0.92, rotationOffset = 0) => Object.freeze({
  id,
  url: `/assets/heroes/${id.toLowerCase()}.glb`,
  available: false,
  scale,
  rotationOffset,
  clips,
})

export const HERO_ASSETS = Object.freeze({
  Shelly: hero("Shelly"),
  Colt: hero("Colt"),
  Barley: hero("Barley"),
  Viper: hero("Viper", 1),
  Titan: hero("Titan", 0.9),
  Shadow: hero("Shadow", 0.94),
  Spark: hero("Spark", 0.94),
})

const environment = (id, placement, footprint = 40, scale = 1, rotationOffset = 0) => Object.freeze({
  id,
  url: `/assets/environment/${id}.glb`,
  available: false,
  placement,
  footprint,
  scale,
  rotationOffset,
})

export const ENVIRONMENT_ASSETS = Object.freeze({
  desert_wall_a: environment("desert_wall_a", "repeat"),
  crate_a: environment("crate_a", "repeat"),
  barrel_a: environment("barrel_a", "single"),
  cactus_a: environment("cactus_a", "single"),
  bush_a: environment("bush_a", "repeat"),
})

export const getHeroAsset = name => HERO_ASSETS[name] || HERO_ASSETS.Shelly

const visualsByType = Object.freeze({
  wall: "desert_wall_a",
  destructible: "desert_wall_a",
  crates: "crate_a",
  barrels: "barrel_a",
  cactus: "cactus_a",
  bush: "bush_a",
  half: "bush_a",
})

export const resolveEnvironmentVisual = object =>
  object.visual || visualsByType[object.type] || null
