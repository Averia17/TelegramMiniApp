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
  stunned: "Stunned",
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
    url: "/assets/heroes/output_heroes/brock-zeus_base.glb",
    companionUrl: "/assets/heroes/output_heroes/brock-zeus_cloud.glb",
    cacheBust: "20260826-wrist-pivot-v1-v17",
    previewOffsetX: 0,
    previewCompanionScale: 1.35,
    previewCompanionOffsetX: -.75,
    previewCompanionOffsetY: -3.6,
  }),
  Kaze: hero("Kaze", 0.92, 0, "kaze", kazeClips),
  "Wukong Mico": hero("Wukong Mico", 0.92, 0, "wukong-mico"),
  "Persephone Lumi": hero("Persephone Lumi", 0.92, 0, "persephone-lumi"),
  Katty: Object.freeze({
    // The regenerated GLB is authored camera-facing, so no legacy 180°
    // correction is needed in battle or in the lobby preview.
    ...hero("Katty", .92, 0, "katty"),
    clips,
    sourceUrl: "https://sketchfab.com/3d-models/tricky-janet-86283dbe8ca54428a26b6b9033d624a1",
  }),
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
  katty: "Katty",
})

export const resolveHeroName = name => {
  if (HERO_ASSETS[name]) return name
  return HERO_QUERY_ALIASES[String(name || "").trim().toLowerCase()] || "Mandy"
}
