const clips = Object.freeze({
  idle: "idle",
  run: "run",
  hit: "hit",
  aim: "Aim",
  aimSuper: "AimSuper",
  attack: "Attack",
  super: "super",
  gadget: "Gadget",
  spawn: "Spawn",
  victory: "Victory",
  defeat: "death",
})
const needleClips = Object.freeze({...clips, aimGadget: "AimGadget"})
const fairyMinaClips = Object.freeze({...clips, aimGadget: "AimGadget"})
const kazeClips = Object.freeze({...clips, aimGadget: "AimGadget"})
const mandyClips = Object.freeze({...clips, aimGadget: "AimGadget"})
const brockZeusClips = Object.freeze({...clips, aimGadget: "AimGadget"})

const hero = (id, scale = 0.92, rotationOffset = 0, assetId = id.toLowerCase(), clipSet = clips) => Object.freeze({
  id,
  url: `/assets/heroes/output_heroes/${assetId}_base.glb`,
  available: true,
  scale,
  targetHeight: 2.45,
  rotationOffset,
  clips: clipSet,
})

export const HERO_ASSETS = Object.freeze({
  Needle: hero("Needle", 0.94, 0, "needle", needleClips),
  Mandy: hero("Mandy", 0.92, 0, "mandy", mandyClips),
  "Fairy Mina": hero("Fairy Mina", 0.92, 0, "fairy-mina", fairyMinaClips),
  "Brock Zeus": Object.freeze({
    ...hero("Brock Zeus", 0.92, 0, "brock-zeus", brockZeusClips),
    companionUrl: "/assets/heroes/output_heroes/brock-zeus_cloud.glb",
    previewOffsetX: .68,
  }),
  Kaze: hero("Kaze", 0.92, 0, "kaze", kazeClips),
  "Wukong Mico": hero("Wukong Mico", 0.92, 0, "wukong-mico"),
  "Persephone Lumi": hero("Persephone Lumi", 0.92, 0, "persephone-lumi"),
})

const environment = (id, placement, footprint = 40, scale = 1, rotationOffset = 0, targetHeight = null, available = false, extras = {}) => Object.freeze({
  id,
  url: `/assets/environment/${id}.glb`,
  available,
  placement,
  footprint,
  scale,
  rotationOffset,
  targetHeight,
  ...extras,
})

export const ENVIRONMENT_ASSETS = Object.freeze({
  desert_wall_a: environment("stylized_low_poly_stone_block", "repeat", 40, 1, 0, 1.55, true, {fitToCell: true}),
  bush_a: environment("stylized_bush", "repeat", 40, 1, 0, 1.35, true, {fitToCell: true, unlit: true}),
  barrel_a: environment("barrel_a", "single"),
  cactus_a: environment("cactus_a", "single"),
  altar_three_moons: environment("elf_lord_temple", "single", 40, 1, 0, 2.6, true, {includeNodes: ["StatueDeity2", "Circularbase", "Cubicplatform"]}),
  sacrificial_stone: environment("stylized_stones_props", "single", 40, 1, 0, 1.45, true),
  menhir: environment("stylized_stones_props", "single", 40, 1, 0, 1.55, true),
})

export const getHeroAsset = name => HERO_ASSETS[name] || null

const HERO_QUERY_ALIASES = Object.freeze({
  shadow: "Needle",
  needle: "Needle",
  mandy: "Mandy",
  "fairy-mina": "Fairy Mina",
  "brock-zeus": "Brock Zeus",
  kaze: "Kaze",
  "wukong-mico": "Wukong Mico",
  "persephone-lumi": "Persephone Lumi",
})

export const resolveHeroName = name => {
  if (HERO_ASSETS[name]) return name
  return HERO_QUERY_ALIASES[String(name || "").trim().toLowerCase()] || "Mandy"
}

const visualsByType = Object.freeze({
  wall: "desert_wall_a",
  destructible: "desert_wall_a",
  tree: "desert_wall_a",
  dead_tree: "desert_wall_a",
  shipwreck: "desert_wall_a",
  crates: "desert_wall_a",
  barrels: "desert_wall_a",
  bush: "bush_a",
  half: "bush_a",
  altar_three_moons: "altar_three_moons",
  sacrificial_stone: "sacrificial_stone",
  menhir: "menhir",
  cactus: "cactus_a",
})

export const resolveEnvironmentVisual = object => {
  // Old map payloads may still carry the retired chest visual. Keep the
  // gameplay type intact, but normalize that stale visual to the stone block.
  if (object.visual === "crate_a") return visualsByType[object.type] || null
  return object.visual || visualsByType[object.type] || null
}
