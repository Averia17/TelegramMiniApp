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

const detachedWeapons = new Set(["damian", "kaze", "mandy", "persephone-lumi", "wukong-mico"])
const weaponAttachments = Object.freeze({
  damian: Object.freeze([
    Object.freeze({name: "HeroAttachment_Microphone", target: "GripPrimaryHeroAttachment_Microphone", role: "held-weapon"}),
    Object.freeze({name: "HeroAttachment_Speaker", target: "GripPrimaryHeroAttachment_Speaker", role: "throwable-weapon"}),
  ]),
  kaze: Object.freeze([
    Object.freeze({name: "HeroAttachment_FanLeft", target: "GripPrimaryHeroAttachment_FanLeft", role: "held-weapon"}),
    Object.freeze({name: "HeroAttachment_FanRight", target: "GripPrimaryHeroAttachment_FanRight", role: "held-weapon"}),
  ]),
  mandy: Object.freeze([
    Object.freeze({
      name: "MandyStaff_Attachment",
      target: "GripPrimaryMandyStaff_Attachment",
      role: "held-weapon",
      // The detached source is authored at the left-palm grip origin. Do not
      // add a runtime offset: the marker and the weapon root must coincide.
      // The standalone GLB keeps the source pivot orientation from
      // mandy.blend, so the runtime attachment needs no extra rotation.
      localRotation: [0, 0, 0],
      localPosition: [0, 0, 0],
    }),
  ]),
  "persephone-lumi": Object.freeze([
    Object.freeze({name: "HeroAttachment_WeaponHeld", target: "GripPrimaryHeroAttachment_WeaponHeld", role: "held-weapon"}),
  ]),
  "wukong-mico": Object.freeze([
    Object.freeze({name: "HeroAttachment_Staff", target: "GripPrimaryHeroAttachment_Staff", role: "held-weapon"}),
  ]),
})

const hero = (id, scale = 0.92, rotationOffset = 0, assetId = id.toLowerCase(), clipSet = clips) => Object.freeze({
  id,
  url: `/assets/heroes/output_heroes/${assetId}_base.glb`,
  weaponUrl: detachedWeapons.has(assetId)
    ? `/assets/heroes/output_weapons/${assetId}_weapon.glb`
    : null,
  weaponAttachments: weaponAttachments[assetId] || Object.freeze([]),
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

const HERO_QUERY_ALIASES = Object.freeze({
  shadow: "Needle",
  needle: "Needle",
  mandy: "Mandy",
  "fairy-mina": "Fairy Mina",
  "brock-zeus": "Brock Zeus",
  kaze: "Kaze",
  "wukong-mico": "Wukong Mico",
  damian: "Damian",
  "persephone-lumi": "Persephone Lumi",
})

export const resolveHeroName = name => {
  if (HERO_ASSETS[name]) return name
  return HERO_QUERY_ALIASES[String(name || "").trim().toLowerCase()] || "Mandy"
}

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
