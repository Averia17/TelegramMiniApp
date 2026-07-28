const clips = Object.freeze({
  idle: "Idle",
  run: "Run",
  aim: "Aim",
  aimSuper: "AimSuper",
  attack: "Attack",
  super: "Super",
  spawn: "Spawn",
  victory: "Victory",
  defeat: "Defeat",
})

const eventAnimations = assetId => Object.freeze({
  idle: Object.freeze({
    url: `/assets/heroes/${assetId}/animations/idle.glb`,
    clip: "Idle",
  }),
  run: Object.freeze({
    url: `/assets/heroes/${assetId}/animations/run.glb`,
    clip: "Run",
  }),
  aim: Object.freeze({
    url: `/assets/heroes/${assetId}/animations/aim.glb`,
    clip: "Aim",
  }),
  aimSuper: Object.freeze({
    url: `/assets/heroes/${assetId}/animations/aim-super.glb`,
    clip: "AimSuper",
  }),
  attack: Object.freeze({
    url: `/assets/heroes/${assetId}/animations/attack.glb`,
    clip: "Attack",
  }),
  super: Object.freeze({
    url: `/assets/heroes/${assetId}/animations/super.glb`,
    clip: "Super",
  }),
  spawn: Object.freeze({
    url: `/assets/heroes/${assetId}/animations/spawn.glb`,
    clip: "Spawn",
  }),
  victory: Object.freeze({
    url: `/assets/heroes/${assetId}/animations/victory.glb`,
    clip: "Victory",
  }),
  defeat: Object.freeze({
    url: `/assets/heroes/${assetId}/animations/defeat.glb`,
    clip: "Defeat",
  }),
})

const hero = (id, scale = 0.92, rotationOffset = 0, assetId = id.toLowerCase()) => Object.freeze({
  id,
  url: `/assets/heroes/${assetId}/${assetId}.glb`,
  available: true,
  scale,
  targetHeight: 2.45,
  rotationOffset,
  clips,
  eventAnimations: eventAnimations(assetId),
})

export const HERO_ASSETS = Object.freeze({
  Shadow: hero("Shadow", 0.94, 0, "needle"),
  Mandy: hero("Mandy"),
  "Fairy Mina": hero("Fairy Mina", 0.92, 0, "fairy-mina"),
  "Brock Zeus": hero("Brock Zeus", 0.92, 0, "brock-zeus"),
  Kaze: hero("Kaze"),
  "Wukong Mico": hero("Wukong Mico", 0.92, 0, "wukong-mico"),
  Damian: Object.freeze({...hero("Damian"), groundOffset: 0.25}),
  "Persephone Lumi": hero("Persephone Lumi", 0.92, 0, "persephone-lumi"),
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

export const getHeroAsset = name => HERO_ASSETS[name] || null

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
