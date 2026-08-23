import * as THREE from "three"
import {CAMERA_GROUND_PROJECTION} from "../CameraRig.js"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {flatMaterial} from "../shared/materials.js"
import {endBattlePerformance, startBattlePerformance} from "../shared/performance.js"
import {getCombatEffectPhase} from "./combatEffectPhase.js"

const clamp = value => Math.max(0, Math.min(1, value))
const GROUND_Y_AXIS = new THREE.Vector3(0, 1, 0)
const GROUND_PITCH = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2,
)

const setGroundYaw = (object, angle) => {
  object.quaternion.setFromAxisAngle(GROUND_Y_AXIS, -angle)
  object.quaternion.multiply(GROUND_PITCH)
}

const hasDirectedPath = effect => {
  const startX = Number(effect?.x)
  const startY = Number(effect?.y)
  const endX = Number(effect?.toX)
  const endY = Number(effect?.toY)
  return Number(effect?.range) > 1 && [startX, startY, endX, endY].every(Number.isFinite) && Math.hypot(endX - startX, endY - startY) > 1
}

const MELEE_SWING_KINDS = new Set([
  "mandy_staff_swing", "mico_staff_swing", "lumi_scythe_swing",
  "slash", "scythe", "slam",
])
const ORBITAL_KINDS = new Set([
  "mina_healing_aura", "zeus_storm_target", "kaze_veil_step",
  "mico_staff_spin", "mico_ruyi_bind",
  "lumi_roots", "zeus_thunderbrand",
  "needle_root_cast", "needle_moisture_reserve", "mico_suppressed_rage", "mandy_stance",
  "kaze_followup_ready", "katty_paint_puddle", "katty_paint_cloud", "katty_paint_trail", "lumi_flower",
  "vortex", "vine", "spin", "zeus_fire_ground",
])
const PAINT_SPRAY_KINDS = new Set(["katty_paint_spray"])
const TRAIL_KINDS = new Set([
  "kaze_dash", "mico_leap", "zeus_beam_hole", "needle_spore_dash",
  "thruster", "spore-jump",
])
const TELEGRAPH_KINDS = new Set(["zeus_strike_warning", "needle_root_telegraph"])
const TOWER_TELEGRAPH_KINDS = new Set(["tower_telegraph"])
const TOWER_BEAM_KINDS = new Set(["tower_beam"])
const IMPACT_KINDS = new Set([
  "mina_mark_burst", "mina_mark_break", "needle_root_burst", "needle_root_pull", "needle_anti_heal", "needle_spore_stun",
  "katty_paint_impact", "katty_paint_stick", "lumi_root_impact", "lumi_seedburst",
  "lightning", "zeus_lightning_strike", "zeus_lightning_blast", "mico_skyfall", "mico_armor_burst",
  "burst", "evade", "damage", "crate_hit", "crate_break", "rock",
  "wall_break", "objective_hit", "tower_shot_blocked",
])
const CONTACT_KINDS = new Set(["last_contact"])
const NEEDLE_FIELD_KINDS = new Set(["needle_root_telegraph", "needle_root_active", "needle_spore_cloud", "needle_spores"])
const WAVE_KINDS = new Set(["mina_air_wave"])
const BEAM_KINDS = new Set(["lightning"])
const CUSTOM_COMPOSITION_KINDS = new Set([
  "mandy_super_charge", "mandy_stance",
  "kaze_veil_step", "kaze_followup_ready",
  "mico_ruyi_bind", "mico_suppressed_rage", "mico_armor_burst",
  "lumi_flower", "needle_root_cast", "needle_moisture_reserve",
  "mina_mark_burst", "mina_mark_break", "needle_root_burst", "needle_root_pull",
  "needle_anti_heal", "needle_spore_stun", "katty_paint_impact", "katty_paint_stick",
  "lumi_seedburst", "lumi_root_impact", "zeus_fire_ground",
])

// These are deliberately exported for the visual audit and contract tests. A
// backend effect must never silently fall through to the generic ring when it
// has a readable gameplay verb of its own.
export const HERO_EFFECT_VISUAL_KINDS = new Set([
  ...MELEE_SWING_KINDS,
  ...ORBITAL_KINDS,
  ...TRAIL_KINDS,
  ...TELEGRAPH_KINDS,
  ...IMPACT_KINDS,
  ...NEEDLE_FIELD_KINDS,
  ...WAVE_KINDS,
  ...BEAM_KINDS,
  "mandy_super_charge", "mandy_super_wave", "kaze_cross_slash",
])

const SHARED_VFX_KINDS = new Set([
  ...HERO_EFFECT_VISUAL_KINDS,
  "mandy_super_charge", "mandy_staff_swing", "mico_staff_swing", "mandy_super_wave", "kaze_cross_slash", "katty_paint_spray",
  "zeus_storm_target", "zeus_lightning_strike", "zeus_lightning_blast",
  "mico_skyfall", "lumi_seedburst", "lumi_root_impact", "needle_root_pull",
  "needle_root_burst", "needle_spore_stun", "mina_mark_burst", "mina_mark_break",
  "katty_paint_impact", "katty_paint_stick", "mandy_stance", "kaze_followup_ready",
  "mico_ruyi_bind", "mico_suppressed_rage", "mico_armor_burst",
])

const VFX_STYLE_TOKENS = [
  {match: "needle", accent: 0xdfff74, hot: 0xf3ffd0, shadow: 0x356d53},
  {match: "mandy", accent: 0xfff0a1, hot: 0xffffff, shadow: 0x8f5b24},
  {match: "mina", accent: 0xffd3fb, hot: 0xffffff, shadow: 0x8e3f86},
  {match: "zeus", accent: 0x9ff5ff, hot: 0xf4fcff, shadow: 0x226b9b},
  {match: "kaze", accent: 0xf0c4ff, hot: 0xffffff, shadow: 0x543f9c},
  {match: "mico", accent: 0xffdc78, hot: 0xfff4c2, shadow: 0x9d4725},
  {match: "lumi", accent: 0xf2d2ff, hot: 0xffffff, shadow: 0x854eaa},
  {match: "katty", accent: 0xffb3d4, hot: 0xffffff, shadow: 0x8e356f},
]

const resolveVfxStyle = (kind, color) => {
  const primary = new THREE.Color(color || 0xffffff)
  const token = VFX_STYLE_TOKENS.find(item => String(kind || "").includes(item.match))
  const accent = token ? new THREE.Color(token.accent) : primary.clone().offsetHSL(.05, .12, .08)
  const hot = token ? new THREE.Color(token.hot) : primary.clone().lerp(new THREE.Color(0xffffff), .78)
  const shadow = token ? new THREE.Color(token.shadow) : primary.clone().offsetHSL(-.04, .08, -.30)
  return {primary, accent, hot, shadow}
}

const additiveMaterial = (color, opacity = .5) => flatMaterial(color, {
  transparent: true,
  opacity,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: false,
})

const addSharedVfxTreatment = (group, radius, style, phase, kind) => {
  if (!group?.isGroup || group.userData.sharedVfxDecorated) return group
  // Directional swings already carry their gameplay silhouette. A shared
  // circular ring would falsely imply radial damage; routine damage stays a
  // small contact cue instead of a skill-sized burst.
  if (MELEE_SWING_KINDS.has(kind) || CUSTOM_COMPOSITION_KINDS.has(kind) || ["kaze_cross_slash", "mandy_super_wave", "damage"].includes(kind)) return group
  const safeRadius = Math.max(.12, radius)
  const directional = TRAIL_KINDS.has(kind) || BEAM_KINDS.has(kind)
  group.userData.sharedVfxDecorated = true
  group.userData.sharedVfxDirectional = directional

  const outline = new THREE.Mesh(
    directional
      ? new THREE.PlaneGeometry(1.06, .36)
      : new THREE.RingGeometry(safeRadius * .73, safeRadius * .93, 48),
    flatMaterial(style.shadow, {
      transparent: true,
      opacity: phase === "impact" ? .34 : .22,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: false,
    }),
  )
  outline.rotation.x = -Math.PI / 2
  outline.userData.role = "vfx-outline"
  outline.userData.opacityMultiplier = phase === "impact" ? .74 : .52
  group.add(outline)

  const glow = new THREE.Mesh(
    directional
      ? new THREE.PlaneGeometry(1, .28)
      : new THREE.RingGeometry(safeRadius * .78, safeRadius * .88, 48),
    additiveMaterial(style.accent, phase === "impact" ? .34 : .18),
  )
  glow.rotation.x = -Math.PI / 2
  glow.userData.role = "vfx-glow"
  glow.userData.opacityMultiplier = phase === "impact" ? .74 : .48
  group.add(glow)

  const core = new THREE.Mesh(
    directional
      ? new THREE.PlaneGeometry(.16, .16)
      : new THREE.CircleGeometry(safeRadius * (phase === "impact" ? .10 : .045), 20),
    additiveMaterial(style.hot, phase === "impact" ? .66 : .36),
  )
  core.rotation.x = -Math.PI / 2
  core.position.y = .045
  core.userData.role = "vfx-core"
  core.userData.opacityMultiplier = phase === "impact" ? .88 : .62
  group.add(core)

  const spark = new THREE.Mesh(
    new THREE.OctahedronGeometry(directional ? .08 : safeRadius * (phase === "impact" ? .065 : .035), 0),
    additiveMaterial(style.accent, phase === "impact" ? .58 : .38),
  )
  spark.position.y = safeRadius * .18
  spark.userData.role = "vfx-spark"
  spark.userData.phase = .8
  spark.userData.opacityMultiplier = phase === "impact" ? .78 : .58
  group.add(spark)

  for (let index = 0; index < 4; index++) {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(directional ? .035 : Math.max(.025, safeRadius * .025), 6, 5),
      additiveMaterial(style.hot, .55),
    )
    const angle = index / 4 * Math.PI * 2 + .35
    const orbitRadius = directional ? .35 : safeRadius * .56
    mote.position.set(Math.cos(angle) * orbitRadius, directional ? .08 : safeRadius * (.12 + index % 2 * .06), Math.sin(angle) * orbitRadius)
    mote.userData.role = "vfx-particle"
    mote.userData.phase = angle
    mote.userData.orbitRadius = orbitRadius
    mote.userData.baseY = mote.position.y
    mote.userData.opacityMultiplier = .62
    group.add(mote)
  }
  return group
}

const animateSharedVfx = (group, progress) => {
  group.traverse(child => {
    const role = child.userData?.role
    if (role === "vfx-glow") {
      child.rotation.z += .018
      child.scale.setScalar(.94 + Math.sin(progress * Math.PI * 6) * .08)
    }
    if (role === "vfx-core") {
      child.scale.setScalar(.82 + Math.sin(progress * Math.PI * 8) * .16 + progress * .12)
    }
    if (role === "vfx-spark") {
      child.rotation.x += .055
      child.rotation.y += .075
      child.scale.setScalar(.84 + Math.sin(progress * Math.PI * 7 + .8) * .18)
    }
    if (role === "vfx-particle") {
      const angle = (child.userData.phase || 0) + progress * Math.PI * 1.8
      const orbitRadius = child.userData.orbitRadius || .4
      child.position.x = Math.cos(angle) * orbitRadius
      child.position.z = Math.sin(angle) * orbitRadius
      child.position.y = child.userData.baseY + Math.sin(progress * Math.PI * 8 + angle) * .035
      child.scale.setScalar(.82 + Math.sin(progress * Math.PI * 6 + angle) * .16)
    }
    if ([
      "focus-seal", "stance-shield", "veil-shroud", "combo-ring", "bind-loop", "rage-seal",
      "flower-bloom", "root-cast-seal", "moisture-ring",
    ].includes(role)) {
      child.rotation.z += role === "veil-shroud" ? -.028 : .024
      child.scale.setScalar(.92 + Math.sin(progress * Math.PI * 5 + (child.userData.phase || 0)) * .08)
    }
    if ([
      "focus-mote", "stance-chevron", "veil-shard", "combo-diamond", "bind-link", "rage-flame",
      "flower-petal", "seed-petal", "root-impact-spike", "paint-splash", "paint-mark",
      "root-cast-tooth", "moisture-mote", "warning-bolt",
    ].includes(role)) {
      child.rotation.y += .045
      child.rotation.x += .018
      child.scale.setScalar(.86 + Math.sin(progress * Math.PI * 7 + (child.userData.phase || 0)) * .16)
    }
  })
}

const createSwingArc = (radius, arc, material, innerRadius = .62) => {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius * innerRadius, radius, 36, 1, -arc, arc * 2),
    material,
  )
  mesh.userData.role = "melee-reach"
  return mesh
}

const createProjectedSwingArc = (radius, arc, material, innerRadius = .62) => {
  const group = new THREE.Group()
  group.scale.z = 1 / CAMERA_GROUND_PROJECTION
  group.add(createSwingArc(radius, arc, material, innerRadius))
  return group
}

const roundedBarGeometry = (length, width) => {
  const shape = new THREE.Shape()
  const halfLength = length / 2
  const halfWidth = width / 2
  const corner = halfWidth
  shape.moveTo(-halfLength + corner, -halfWidth)
  shape.lineTo(halfLength - corner, -halfWidth)
  shape.absarc(halfLength - corner, 0, corner, -Math.PI / 2, Math.PI / 2, false)
  shape.lineTo(-halfLength + corner, halfWidth)
  shape.absarc(-halfLength + corner, 0, corner, Math.PI / 2, Math.PI * 1.5, false)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width * .9,
    bevelEnabled: true,
    bevelThickness: width * .16,
    bevelSize: width * .16,
    bevelSegments: 2,
  })
  geometry.center()
  return geometry
}

const taperedRibbonGeometry = () => {
  const shape = new THREE.Shape()
  shape.moveTo(-.5, -.28)
  shape.lineTo(.22, -.28)
  shape.lineTo(.5, 0)
  shape.lineTo(.22, .28)
  shape.lineTo(-.5, .28)
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
}

export const createHealEffect = (radius, color = 0x65ff9c) => {
  const group = new THREE.Group()
  group.userData.kind = "heal"
  group.userData.effectRadius = radius
  const healColor = new THREE.Color(color)

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * .50, 32),
    flatMaterial(healColor.clone().multiplyScalar(.84), {
      transparent: true,
      opacity: .22,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: false,
    }),
  )
  glow.rotation.x = -Math.PI / 2
  glow.scale.y = .62
  glow.userData.role = "heal-glow"
  glow.userData.opacityMultiplier = .30
  group.add(glow)

  const pulseRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius * .72, Math.max(.035, radius * .045), 8, 40),
    flatMaterial(color, {transparent: true, depthWrite: false, depthTest: false}),
  )
  pulseRing.rotation.x = Math.PI / 2
  pulseRing.userData.role = "heal-pulse-ring"
  pulseRing.userData.phase = .4
  pulseRing.userData.opacityMultiplier = .72
  group.add(pulseRing)

  const barLength = radius * .29
  const barWidth = radius * .09
  const outlineMaterial = flatMaterial(0xf4fff6, {
    transparent: true,
    opacity: .62,
    depthWrite: false,
    depthTest: false,
  })
  const greenMaterial = flatMaterial(healColor.clone().lerp(new THREE.Color(0xffffff), .18), {
    transparent: true,
    depthWrite: false,
    depthTest: false,
  })
  const crossY = radius * .34
  const bars = [
    [barLength + radius * .08, barWidth + radius * .08, outlineMaterial, 0],
    [barLength + radius * .08, barWidth + radius * .08, outlineMaterial.clone(), Math.PI / 2],
    [barLength, barWidth, greenMaterial, 0],
    [barLength, barWidth, greenMaterial.clone(), Math.PI / 2],
  ]
  bars.forEach(([length, width, barMaterial, rotationZ]) => {
    const bar = new THREE.Mesh(roundedBarGeometry(length, width), barMaterial)
    bar.position.y = crossY
    bar.rotation.x = -.35
    bar.rotation.z = rotationZ
    bar.userData.role = "healing-cross"
    bar.userData.basePosition = bar.position.clone()
    bar.userData.opacityMultiplier = barMaterial.color.getHex() === 0xf4fff6 ? .68 : .88
    group.add(bar)
  })

  for (let index = 0; index < 6; index++) {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(radius * (.035 + index % 2 * .012), 8, 6),
      flatMaterial(healColor.clone().lerp(new THREE.Color(0xffffff), .14), {
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    )
    const angle = index / 6 * Math.PI * 2
    mote.position.set(
      Math.cos(angle) * radius * (.58 + index % 2 * .08),
      radius * (.35 + index % 3 * .12),
      Math.sin(angle) * radius * (.58 + index % 2 * .08),
    )
    mote.userData.role = "healing-mote"
    mote.userData.phase = index * .9
    mote.userData.basePosition = mote.position.clone()
    mote.userData.opacityMultiplier = .7
    group.add(mote)
  }
  return group
}

const createOrbitalEffect = (radius, material, kind) => {
  const group = new THREE.Group()
  group.userData.kind = kind
  const addSignatureRing = (inner, outer, role, opacity = .82) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * inner, radius * outer, 40), material.clone())
    ring.rotation.x = -Math.PI / 2
    ring.userData.role = role
    ring.userData.opacityMultiplier = opacity
    group.add(ring)
    return ring
  }
  const addSignatureCore = (role, scale = .12) => {
    const core = new THREE.Mesh(new THREE.SphereGeometry(Math.max(.08, radius * scale), 12, 8), material.clone())
    core.position.y = radius * .16
    core.scale.y = .58
    core.userData.role = role
    core.userData.opacityMultiplier = .88
    group.add(core)
    return core
  }
  const addSignaturePetals = (role, count = 6, distance = .18, scale = .08) => {
    for (let index = 0; index < count; index++) {
      const angle = index / count * Math.PI * 2
      const petal = new THREE.Mesh(new THREE.SphereGeometry(Math.max(.045, radius * scale), 10, 6), material.clone())
      petal.position.set(Math.cos(angle) * radius * distance, radius * .15, Math.sin(angle) * radius * distance)
      petal.scale.set(.78, .32, 1.22)
      petal.rotation.y = angle
      petal.userData.role = role
      petal.userData.phase = angle
      petal.userData.opacityMultiplier = .82
      group.add(petal)
    }
  }
  if (kind === "mandy_stance") {
    addSignatureRing(.66, .74, "stance-shield")
    addSignatureRing(.82, .86, "stance-shield")
    addSignatureCore("focus-core", .12)
    addSignaturePetals("stance-chevron", 4, .66, .075)
    return group
  }
  if (kind === "kaze_veil_step") {
    addSignatureRing(.45, .51, "veil-shroud")
    addSignatureRing(.68, .72, "veil-shroud")
    addSignatureRing(.88, .91, "veil-shroud")
    addSignatureCore("veil-core", .10)
    addSignaturePetals("veil-shard", 5, .57, .045)
    return group
  }
  if (kind === "kaze_followup_ready") {
    addSignatureRing(.54, .59, "combo-ring")
    addSignatureRing(.76, .80, "combo-ring")
    addSignaturePetals("combo-diamond", 3, .46, .075)
    addSignatureCore("combo-core", .08)
    return group
  }
  if (kind === "mico_ruyi_bind") {
    addSignatureRing(.58, .64, "bind-loop")
    const second = addSignatureRing(.74, .79, "bind-loop")
    second.rotation.z = Math.PI / 3
    addSignaturePetals("bind-link", 6, .68, .045)
    addSignatureCore("bind-core", .11)
    return group
  }
  if (kind === "mico_suppressed_rage") {
    addSignatureRing(.62, .70, "rage-seal")
    addSignatureRing(.84, .88, "rage-seal")
    addSignatureCore("rage-core", .14)
    addSignaturePetals("rage-flame", 5, .52, .065)
    return group
  }
  if (kind === "lumi_flower") {
    addSignatureRing(.70, .78, "flower-bloom")
    addSignatureCore("flower-bloom", .13)
    addSignaturePetals("flower-petal", 8, .27, .08)
    return group
  }
  if (kind === "needle_root_cast") {
    addSignatureRing(.64, .72, "root-cast-seal")
    addSignatureCore("root-cast-core", .10)
    addSignaturePetals("root-cast-tooth", 6, .58, .05)
    return group
  }
  if (kind === "needle_moisture_reserve") {
    addSignatureRing(.58, .64, "moisture-ring")
    addSignatureCore("moisture-drop", .12)
    addSignaturePetals("moisture-mote", 6, .46, .042)
    return group
  }
  if (kind === "katty_paint_cloud") {
    const haze = new THREE.Mesh(new THREE.CircleGeometry(radius * .68, 36), material.clone())
    haze.material.opacity = .18
    haze.rotation.x = -Math.PI / 2
    haze.userData.role = "cloud-haze"
    group.add(haze)
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * .72, radius, 40), material)
    ring.rotation.x = -Math.PI / 2
    ring.userData.role = "skill-ring"
    group.add(ring)
    for (let index = 0; index < 12; index++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(.04, radius * (.08 + index % 3 * .018)), 10, 8),
        material.clone(),
      )
      const angle = index / 12 * Math.PI * 2
      const distance = radius * (.22 + index % 4 * .16)
      puff.position.set(Math.cos(angle) * distance, radius * (.10 + index % 3 * .055), Math.sin(angle) * distance)
      puff.userData.role = "cloud-puff"
      puff.userData.phase = angle
      group.add(puff)
    }
    return group
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * .7, radius, 40), material)
  ring.rotation.x = -Math.PI / 2
  ring.userData.role = "skill-ring"
  ring.userData.opacityMultiplier = .72
  group.add(ring)
  for (let index = 0; index < 8; index++) {
    const mote = new THREE.Mesh(
      kind === "lumi_roots"
        ? new THREE.ConeGeometry(Math.max(.035, radius * .055), radius * .28, 7)
        : new THREE.OctahedronGeometry(Math.max(.025, radius * .07), 0),
      material.clone(),
    )
    const angle = index / 8 * Math.PI * 2
    mote.position.set(Math.cos(angle) * radius * .82, radius * .25, Math.sin(angle) * radius * .82)
    mote.userData.role = kind === "lumi_roots" ? "root-tendril" : "skill-mote"
    mote.userData.phase = angle
    group.add(mote)
  }
  if (kind === "lumi_roots") {
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(Math.max(.08, radius * .14), 12, 8), material.clone())
    bloom.position.y = radius * .20
    bloom.scale.y = .56
    bloom.userData.role = "lumi-root-bloom"
    bloom.userData.opacityMultiplier = .92
    group.add(bloom)
    for (let index = 0; index < 6; index++) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(Math.max(.05, radius * .09), 10, 6), material.clone())
      const angle = index / 6 * Math.PI * 2
      petal.position.set(Math.cos(angle) * radius * .17, radius * .16, Math.sin(angle) * radius * .17)
      petal.scale.set(.78, .34, 1.18)
      petal.rotation.y = angle
      petal.userData.role = "lumi-root-bloom"
      petal.userData.phase = angle
      petal.userData.opacityMultiplier = .78
      group.add(petal)
    }
  }
  return group
}

const createPaintSprayEffect = (radius, arc, material) => {
  const group = new THREE.Group()
  group.userData.kind = "katty_paint_spray"
  const cone = new THREE.Mesh(new THREE.RingGeometry(radius * .12, radius, 28, 1, -arc, arc * 2), material)
  cone.rotation.x = -Math.PI / 2
  cone.userData.role = "spray-cone"
  group.add(cone)
  for (let index = 0; index < 8; index++) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(Math.max(.035, radius * (.025 + index % 3 * .008)), 8, 6), material.clone())
    const progress = (index + 1) / 9
    const angle = -arc + progress * arc * 2
    drop.position.set(Math.cos(angle) * radius * progress * .9, radius * (.06 + index % 2 * .07), Math.sin(angle) * radius * progress * .9)
    drop.userData.role = "spray-drop"
    group.add(drop)
  }
  return group
}

const createTelegraphEffect = (radius, material, kind) => {
  const group = new THREE.Group()
  group.userData.kind = kind
  if (kind === "zeus_strike_warning") {
    const halo = new THREE.Mesh(new THREE.RingGeometry(radius * .68, radius * .78, 40), material.clone())
    halo.rotation.x = -Math.PI / 2
    halo.userData.role = "warning-halo"
    group.add(halo)
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * .76, radius, 36), material.clone())
    ring.rotation.x = -Math.PI / 2
    ring.userData.role = "telegraph-ring"
    group.add(ring)
    for (let index = 0; index < 4; index++) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(radius * .28, radius * .05, radius * .07), material.clone())
      const angle = index * Math.PI / 2
      tick.position.set(Math.cos(angle) * radius * .82, .03, Math.sin(angle) * radius * .82)
      tick.rotation.y = -angle
      tick.userData.role = "telegraph-tick"
      group.add(tick)
    }
    for (let index = 0; index < 3; index++) {
      const bolt = new THREE.Mesh(new THREE.ConeGeometry(radius * .05, radius * .38, 5), material.clone())
      const angle = index / 3 * Math.PI * 2 + .3
      bolt.position.set(Math.cos(angle) * radius * .46, radius * .12, Math.sin(angle) * radius * .46)
      bolt.rotation.z = -.24 + index * .2
      bolt.rotation.y = angle
      bolt.userData.role = "warning-bolt"
      bolt.userData.phase = angle
      group.add(bolt)
    }
    return group
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * .76, radius, 36), material)
  ring.rotation.x = -Math.PI / 2
  ring.userData.role = "telegraph-ring"
  group.add(ring)
  for (let index = 0; index < 4; index++) {
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(radius * .36, radius * .06, radius * .08),
      material.clone(),
    )
    const angle = index * Math.PI / 2
    tick.position.set(Math.cos(angle) * radius * .82, .03, Math.sin(angle) * radius * .82)
    tick.rotation.y = -angle
    tick.userData.role = "telegraph-tick"
    group.add(tick)
  }
  return group
}

const createImpactBurst = (radius, material, kind) => {
  const group = new THREE.Group()
  group.userData.kind = kind
  const signature = {
    mina_mark_burst: "star-mark-burst",
    mina_mark_break: "star-mark-burst",
    lumi_seedburst: "seed-petal",
    lumi_root_impact: "root-impact-spike",
    katty_paint_impact: "paint-splash",
    katty_paint_stick: "paint-mark",
    mico_armor_burst: "armor-burst",
  }[kind]
  if (signature) {
    for (let index = 0; index < 8; index++) {
      const angle = index / 8 * Math.PI * 2
      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(radius * .54, radius * .075, radius * .075),
        material.clone(),
      )
      shard.position.set(Math.cos(angle) * radius * .62, radius * .10, Math.sin(angle) * radius * .62)
      shard.rotation.y = -angle
      shard.userData.role = "impact-shard"
      shard.userData.phase = angle
      shard.userData.opacityMultiplier = .52
      group.add(shard)
    }
    const core = new THREE.Mesh(new THREE.CircleGeometry(radius * .24, 12), material.clone())
    core.rotation.x = -Math.PI / 2
    core.userData.role = `${signature}-core`
    core.userData.opacityMultiplier = .9
    group.add(core)
    const count = kind.startsWith("lumi") ? 8 : kind.startsWith("katty") ? 10 : 6
    for (let index = 0; index < count; index++) {
      const angle = index / count * Math.PI * 2
      const distance = radius * (kind.startsWith("katty") ? .60 : .50)
      const shard = kind.startsWith("katty")
        ? new THREE.Mesh(new THREE.CircleGeometry(radius * (.09 + index % 3 * .018), 7), material.clone())
        : new THREE.Mesh(new THREE.ConeGeometry(radius * .055, radius * .30, kind.startsWith("lumi") ? 6 : 4), material.clone())
      shard.position.set(Math.cos(angle) * distance, radius * .12, Math.sin(angle) * distance)
      shard.rotation.x = kind.startsWith("katty") ? -Math.PI / 2 : 0
      shard.rotation.y = -angle
      shard.userData.role = signature
      shard.userData.phase = angle
      shard.userData.opacityMultiplier = .82
      group.add(shard)
    }
    return group
  }
  for (let index = 0; index < 8; index++) {
    const shard = new THREE.Mesh(
      new THREE.BoxGeometry(radius * .54, radius * .09, radius * .09),
      material.clone(),
    )
    const angle = index / 8 * Math.PI * 2
    shard.position.set(Math.cos(angle) * radius * .62, radius * .16, Math.sin(angle) * radius * .62)
    shard.rotation.y = -angle
    shard.userData.role = "impact-shard"
    group.add(shard)
  }
  return group
}

const createWallBreak = (radius, material) => {
  const group = new THREE.Group()
  group.userData.kind = "wall_break"
  for (let index = 0; index < 7; index++) {
    const shard = new THREE.Mesh(
      new THREE.BoxGeometry(radius * (.18 + (index % 3) * .06), radius * .22, radius * (.16 + (index % 2) * .07)),
      material,
    )
    const angle = index / 7 * Math.PI * 2
    shard.position.set(Math.cos(angle) * radius * .42, radius * (.25 + (index % 2) * .15), Math.sin(angle) * radius * .42)
    shard.rotation.set(index * .7, -angle, index * .35)
    shard.userData.role = "wall-break-shard"
    group.add(shard)
  }
  return group
}

const createDamageContactEffect = (radius, material) => {
  const group = new THREE.Group()
  group.userData.kind = "damage"
  const core = new THREE.Mesh(new THREE.CircleGeometry(Math.max(.06, radius * .24), 12), material.clone())
  core.rotation.x = -Math.PI / 2
  core.userData.role = "damage-core"
  core.userData.opacityMultiplier = .82
  group.add(core)
  for (let index = 0; index < 4; index++) {
    const angle = index / 4 * Math.PI * 2 + Math.PI / 4
    const shard = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(.08, radius * .28), Math.max(.025, radius * .055), Math.max(.025, radius * .055)),
      material.clone(),
    )
    shard.position.set(Math.cos(angle) * radius * .34, radius * .08, Math.sin(angle) * radius * .34)
    shard.rotation.y = -angle
    shard.userData.role = "damage-shard"
    shard.userData.phase = angle
    shard.userData.opacityMultiplier = .72
    group.add(shard)
  }
  return group
}

const createPaintPuddleEffect = (radius, material, kind = "katty_paint_puddle") => {
  const group = new THREE.Group()
  group.userData.kind = kind
  const pool = new THREE.Mesh(new THREE.CircleGeometry(radius * .82, 40), material.clone())
  pool.rotation.x = -Math.PI / 2
  pool.material.opacity = .24
  pool.userData.role = "paint-pool"
  pool.userData.opacityMultiplier = .24
  group.add(pool)
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * .72, radius, 44), material.clone())
  ring.rotation.x = -Math.PI / 2
  ring.userData.role = "paint-ring"
  ring.userData.opacityMultiplier = .82
  group.add(ring)
  for (let index = 0; index < 12; index++) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(Math.max(.04, radius * (.055 + index % 3 * .02)), 10, 8), material.clone())
    const angle = index / 12 * Math.PI * 2
    drop.position.set(Math.cos(angle) * radius * (.35 + index % 4 * .12), radius * (.10 + index % 3 * .06), Math.sin(angle) * radius * (.35 + index % 4 * .12))
    drop.userData.role = "paint-drop"
    drop.userData.phase = angle
    group.add(drop)
  }
  for (let index = 0; index < 5; index++) {
    const splat = new THREE.Mesh(new THREE.CircleGeometry(radius * (.09 + index % 2 * .035), 7), material.clone())
    const angle = index / 5 * Math.PI * 2 + .24
    splat.rotation.x = -Math.PI / 2
    splat.position.set(Math.cos(angle) * radius * (.22 + index * .09), .09, Math.sin(angle) * radius * (.22 + index * .09))
    splat.scale.y = .52
    splat.userData.role = "paint-splat"
    splat.userData.phase = angle
    splat.userData.opacityMultiplier = .88
    group.add(splat)
  }
  return group
}

const createWaveEffect = (radius, material, kind) => {
  const group = new THREE.Group()
  group.userData.kind = kind
  for (let index = 0; index < 3; index++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * (.18 + index * .22), radius * (.27 + index * .22), 36),
      material.clone(),
    )
    ring.rotation.x = -Math.PI / 2
    ring.userData.role = "wave-ring"
    ring.userData.phase = index * .9
    ring.userData.opacityMultiplier = .7 - index * .12
    group.add(ring)
  }
  const core = new THREE.Mesh(new THREE.CircleGeometry(radius * .18, 24), material.clone())
  core.rotation.x = -Math.PI / 2
  core.userData.role = "wave-core"
  core.userData.opacityMultiplier = .85
  group.add(core)
  return group
}

const createMandyWaveEffect = (length, width, material) => {
  const group = new THREE.Group()
  group.userData.kind = "mandy_super_wave"
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(length, width), material.clone())
  lane.rotation.x = -Math.PI / 2
  lane.material.opacity = .17
  lane.userData.role = "wave-lane"
  lane.userData.opacityMultiplier = .72
  group.add(lane)

  for (const edge of [-1, 1]) {
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(length, Math.max(.035, width * .045), Math.max(.035, width * .028)),
      material.clone(),
    )
    rim.position.z = edge * width * .46
    rim.position.y = .035
    rim.userData.role = "wave-edge"
    rim.userData.opacityMultiplier = .86
    group.add(rim)
  }
  for (let index = 0; index < 5; index++) {
    const chevron = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(.05, width * .105), Math.max(.12, width * .26), 3),
      material.clone(),
    )
    chevron.rotation.z = -Math.PI / 2
    chevron.position.set(-length * .32 + index * length * .16, width * .08, 0)
    chevron.userData.role = "wave-chevron"
    chevron.userData.phase = index * .8
    chevron.userData.opacityMultiplier = .9
    group.add(chevron)
  }
  const front = new THREE.Mesh(new THREE.TorusGeometry(width * .34, Math.max(.035, width * .045), 8, 28), material.clone())
  front.rotation.x = Math.PI / 2
  front.position.x = length * .48
  front.position.y = .08
  front.userData.role = "wave-front"
  front.userData.opacityMultiplier = .9
  group.add(front)
  return group
}

const createMandyChargeEffect = (radius, material) => {
  const group = new THREE.Group()
  group.userData.kind = "mandy_super_charge"
  for (let index = 0; index < 3; index++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * (.42 + index * .16), radius * (.46 + index * .16), 32),
      material.clone(),
    )
    ring.rotation.x = -Math.PI / 2
    ring.userData.role = "focus-seal"
    ring.userData.phase = index * .8
    ring.userData.opacityMultiplier = .76 - index * .12
    group.add(ring)
  }
  const core = new THREE.Mesh(new THREE.CylinderGeometry(radius * .12, radius * .18, radius * .12, 8), material.clone())
  core.position.y = radius * .12
  core.userData.role = "focus-core"
  group.add(core)
  for (let index = 0; index < 6; index++) {
    const angle = index / 6 * Math.PI * 2
    const mote = new THREE.Mesh(new THREE.OctahedronGeometry(Math.max(.035, radius * .045), 0), material.clone())
    mote.position.set(Math.cos(angle) * radius * .62, radius * .16, Math.sin(angle) * radius * .62)
    mote.userData.role = "focus-mote"
    mote.userData.phase = angle
    group.add(mote)
  }
  return group
}

const createHeroSwingEffect = (radius, arc, material, kind) => {
  const group = createProjectedSwingArc(radius, arc, material)
  group.userData.kind = kind
  const core = new THREE.Mesh(new THREE.TorusGeometry(radius * .62, Math.max(.025, radius * .035), 8, 28, arc * 1.3), material.clone())
  core.rotation.x = -Math.PI / 2
  core.position.y = .07
  core.userData.role = kind === "mico_staff_swing" ? "staff-impact-ring" : "staff-focus-ring"
  core.userData.opacityMultiplier = .78
  group.add(core)
  for (let index = 0; index < 3; index++) {
    const mote = new THREE.Mesh(new THREE.OctahedronGeometry(Math.max(.035, radius * .045), 0), material.clone())
    const angle = -arc + (index + 1) / 4 * arc * 2
    mote.position.set(Math.cos(angle) * radius * .76, radius * (.08 + index * .05), Math.sin(angle) * radius * .76)
    mote.userData.role = kind === "mico_staff_swing" ? "staff-ember" : "staff-focus-mote"
    mote.userData.phase = index * .7
    group.add(mote)
  }
  return group
}

const createStrikeTargetEffect = (radius, material) => {
  const group = new THREE.Group()
  group.userData.kind = "zeus_storm_target"
  const accentMaterial = material.clone()
  accentMaterial.color.multiplyScalar(.56)
  const hotMaterial = material.clone()
  hotMaterial.color.set(0xf6fbff)
  hotMaterial.opacity = .82
  const outer = new THREE.Mesh(new THREE.RingGeometry(radius * .78, radius, 48), accentMaterial)
  outer.rotation.x = -Math.PI / 2
  outer.userData.role = "strike-reticle"
  outer.userData.opacityMultiplier = .9
  group.add(outer)
  for (let index = 0; index < 3; index++) {
    const bolt = new THREE.Mesh(new THREE.ConeGeometry(radius * .055, radius * .34, 5), accentMaterial.clone())
    const angle = index / 3 * Math.PI * 2 + .22
    bolt.position.set(Math.cos(angle) * radius * .42, radius * (.10 + index * .035), Math.sin(angle) * radius * .42)
    bolt.rotation.z = -.24 + index * .16
    bolt.rotation.y = angle
    bolt.userData.role = "strike-bolt"
    bolt.userData.phase = angle
    bolt.userData.opacityMultiplier = .86
    group.add(bolt)
  }
  const inner = new THREE.Mesh(new THREE.RingGeometry(radius * .27, radius * .34, 32), hotMaterial)
  inner.rotation.x = -Math.PI / 2
  inner.userData.role = "strike-core"
  group.add(inner)
  for (let index = 0; index < 4; index++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(radius * .22, .05, radius * .045), accentMaterial.clone())
    const angle = index * Math.PI / 2
    tick.position.set(Math.cos(angle) * radius * .56, .06, Math.sin(angle) * radius * .56)
    tick.rotation.y = -angle
    tick.userData.role = "strike-tick"
    group.add(tick)
  }
  const spike = new THREE.Mesh(new THREE.ConeGeometry(radius * .09, radius * .72, 6), hotMaterial.clone())
  spike.position.y = radius * .36
  spike.userData.role = "strike-spike"
  group.add(spike)
  return group
}

const createDashRibbonEffect = (material, kind) => {
  const group = new THREE.Group()
  group.userData.kind = kind
  const ribbon = new THREE.Mesh(taperedRibbonGeometry(), material.clone())
  ribbon.rotation.x = -Math.PI / 2
  ribbon.material.opacity = .18
  ribbon.userData.role = "dash-ribbon"
  group.add(ribbon)
  for (let index = 0; index < 4; index++) {
    const ghost = new THREE.Mesh(new THREE.OctahedronGeometry(.12, 0), material.clone())
    ghost.position.set(-.36 + index * .24, .08 + index * .035, 0)
    ghost.scale.set(.85 - index * .12, .55 - index * .06, .85 - index * .12)
    ghost.userData.role = "dash-afterimage"
    ghost.userData.phase = index * .7
    ghost.userData.opacityMultiplier = .82 - index * .12
    ghost.userData.baseScale = ghost.scale.clone()
    group.add(ghost)
  }
  return group
}

const createTrailLaneEffect = (material, kind) => {
  const group = new THREE.Group()
  group.userData.kind = kind
  const ribbon = new THREE.Mesh(taperedRibbonGeometry(), material.clone())
  ribbon.rotation.x = -Math.PI / 2
  ribbon.material.opacity = .16
  ribbon.userData.role = "trail-ribbon"
  group.add(ribbon)
  for (const edge of [-1, 1]) {
    const edgeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, .045, .035), material.clone())
    edgeMesh.position.z = edge * .31
    edgeMesh.position.y = .035
    edgeMesh.userData.role = "trail-edge"
    edgeMesh.userData.opacityMultiplier = .84
    group.add(edgeMesh)
  }
  for (let index = 0; index < 4; index++) {
    const mote = new THREE.Mesh(new THREE.OctahedronGeometry(.08, 0), material.clone())
    mote.position.set(-.35 + index * .23, .08 + index % 2 * .04, 0)
    mote.userData.role = "trail-mote"
    mote.userData.phase = index * .8
    group.add(mote)
  }
  return group
}

const createFireTrailLaneEffect = (material, kind) => {
  const group = new THREE.Group()
  group.userData.kind = kind
  group.userData.directed = true

  const ribbon = new THREE.Mesh(taperedRibbonGeometry(), material.clone())
  ribbon.rotation.x = -Math.PI / 2
  ribbon.material.opacity = .18
  ribbon.userData.role = "fire-trail-ribbon"
  group.add(ribbon)

  for (const edge of [-1, 1]) {
    const edgeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, .055, .045), material.clone())
    edgeMesh.position.z = edge * .30
    edgeMesh.position.y = .04
    edgeMesh.userData.role = "fire-trail-edge"
    edgeMesh.userData.opacityMultiplier = .72
    group.add(edgeMesh)
  }

  for (let index = 0; index < 5; index++) {
    const ember = new THREE.Mesh(new THREE.SphereGeometry(.07 + index % 2 * .025, 8, 6), material.clone())
    ember.position.set(-.40 + index * .20, .10 + index % 2 * .035, (index % 3 - 1) * .11)
    ember.userData.role = "fire-trail-ember"
    ember.userData.phase = index * .9
    ember.userData.opacityMultiplier = .86 - index * .08
    group.add(ember)
  }
  return group
}

const createVortexEffect = (radius, material, kind = "vortex") => {
  const group = new THREE.Group()
  group.userData.kind = kind
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(radius * .56, 40),
    material.clone(),
  )
  core.rotation.x = -Math.PI / 2
  core.material.opacity = .22
  core.userData.role = "vortex-core"
  core.userData.opacityMultiplier = .28
  group.add(core)
  for (let index = 0; index < 2; index++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * (.54 + index * .16), radius * (.59 + index * .16), 44),
      material.clone(),
    )
    ring.rotation.x = -Math.PI / 2
    ring.userData.role = "vortex-ring"
    ring.userData.phase = index * 1.8
    ring.userData.opacityMultiplier = .82
    group.add(ring)
  }
  const ribbon = new THREE.Mesh(
    new THREE.TorusGeometry(radius * .66, Math.max(.035, radius * .035), 8, 40),
    material.clone(),
  )
  ribbon.rotation.x = Math.PI / 2
  ribbon.rotation.z = .35
  ribbon.userData.role = "vortex-ribbon"
  ribbon.userData.phase = .8
  ribbon.userData.opacityMultiplier = .86
  group.add(ribbon)
  for (let index = 0; index < 3; index++) {
    const points = []
    for (let step = 0; step < 25; step++) {
      const turn = step / 24 * Math.PI * 2.15 + index * .45
      const distance = radius * (.56 - step / 24 * .45)
      points.push(new THREE.Vector3(Math.cos(turn) * distance, radius * .12 + index * .025, Math.sin(turn) * distance))
    }
    const swirl = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 28, Math.max(.025, radius * .018), 5, false),
      material.clone(),
    )
    swirl.userData.role = "vortex-swirl"
    swirl.userData.phase = index * 1.1
    swirl.userData.opacityMultiplier = .64
    group.add(swirl)
  }
  for (let index = 0; index < 10; index++) {
    const mote = new THREE.Mesh(new THREE.OctahedronGeometry(Math.max(.04, radius * .055), 0), material.clone())
    const angle = index / 10 * Math.PI * 2
    mote.position.set(Math.cos(angle) * radius * .78, radius * .14, Math.sin(angle) * radius * .78)
    mote.userData.role = "vortex-mote"
    mote.userData.phase = angle
    group.add(mote)
  }
  return group
}

const createGroundFieldEffect = (radius, material) => {
  const group = new THREE.Group()
  group.userData.kind = "zeus_fire_ground"
  group.userData.directed = false
  const pool = new THREE.Mesh(new THREE.CircleGeometry(radius * .82, 32), material.clone())
  pool.rotation.x = -Math.PI / 2
  pool.material.opacity = .20
  pool.userData.role = "fire-pool"
  pool.userData.opacityMultiplier = .24
  group.add(pool)
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * .72, radius, 36), material.clone())
  ring.rotation.x = -Math.PI / 2
  ring.userData.role = "fire-ring"
  ring.userData.opacityMultiplier = .82
  group.add(ring)
  for (let index = 0; index < 9; index++) {
    const ember = new THREE.Mesh(new THREE.SphereGeometry(Math.max(.04, radius * (.045 + index % 3 * .012)), 8, 6), material.clone())
    const angle = index / 9 * Math.PI * 2
    ember.position.set(Math.cos(angle) * radius * (.25 + index % 4 * .14), radius * (.10 + index % 3 * .08), Math.sin(angle) * radius * (.25 + index % 4 * .14))
    ember.userData.role = "fire-ember"
    ember.userData.phase = angle
    group.add(ember)
  }
  return group
}

const createLightningImpact = (radius, material, kind) => {
  const group = createImpactBurst(radius, material, kind)
  group.userData.kind = kind
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(.035, radius * .05), Math.max(.08, radius * .12), radius * 1.6, 6), material.clone())
  bolt.position.y = radius * .55
  bolt.rotation.z = -.12
  bolt.userData.role = "lightning-bolt"
  group.add(bolt)
  const halo = new THREE.Mesh(new THREE.RingGeometry(radius * .32, radius * .46, 28), material.clone())
  halo.rotation.x = -Math.PI / 2
  halo.userData.role = "lightning-halo"
  group.add(halo)
  return group
}

const createLightningBeam = (radius, material) => {
  const group = new THREE.Group()
  group.userData.kind = "lightning"
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material.clone())
  glow.name = "lightning-glow"
  glow.userData.role = "lightning-glow"
  glow.material.opacity = .24
  group.add(glow)
  const core = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material.clone())
  core.name = "lightning-core"
  core.userData.role = "lightning-core"
  core.material.opacity = .78
  group.add(core)
  const end = new THREE.Mesh(new THREE.RingGeometry(Math.max(.08, radius * .6), Math.max(.12, radius), 24), material.clone())
  end.name = "lightning-end"
  end.rotation.x = -Math.PI / 2
  end.userData.role = "lightning-end"
  group.add(end)
  return group
}

const createNeedleFieldEffect = (radius, material, kind) => {
  const group = new THREE.Group()
  group.userData.kind = kind
  const sporeField = kind === "needle_spore_cloud" || kind === "needle_spores"
  const core = new THREE.Mesh(new THREE.CircleGeometry(radius * (sporeField ? .72 : .62), 40), material.clone())
  core.rotation.x = -Math.PI / 2
  core.material.opacity = kind === "needle_root_telegraph" ? .08 : .16
  core.userData.role = "needle-field-core"
  core.userData.opacityMultiplier = .28
  group.add(core)
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * .78, radius, 44), material.clone())
  ring.rotation.x = -Math.PI / 2
  ring.userData.role = "needle-field-ring"
  ring.userData.opacityMultiplier = .72
  group.add(ring)
  if (!sporeField) {
    const crown = new THREE.Mesh(new THREE.TorusGeometry(radius * .18, Math.max(.035, radius * .042), 7, 28), material.clone())
    crown.rotation.x = -Math.PI / 2
    crown.position.y = .08
    crown.userData.role = "needle-root-crown"
    crown.userData.opacityMultiplier = .9
    group.add(crown)
  }
  const count = sporeField ? 14 : 10
  for (let index = 0; index < count; index++) {
    const angle = index / count * Math.PI * 2
    const distance = radius * (sporeField ? .32 + index % 4 * .12 : .46 + index % 3 * .11)
    const mote = sporeField
      ? new THREE.Mesh(new THREE.SphereGeometry(Math.max(.035, radius * (.055 + index % 3 * .014)), 10, 8), material.clone())
      : new THREE.Mesh(new THREE.ConeGeometry(Math.max(.035, radius * .055), radius * (.26 + index % 3 * .06), 6), material.clone())
    mote.position.set(Math.cos(angle) * distance, sporeField ? radius * (.16 + index % 3 * .05) : radius * .17, Math.sin(angle) * distance)
    if (!sporeField) mote.rotation.z = Math.PI * .5
    mote.userData.role = sporeField ? "needle-spore-mote" : "needle-root-tooth"
    mote.userData.phase = angle
    group.add(mote)
  }
  return group
}

const createTowerBeam = (radius, material) => {
  const group = new THREE.Group()
  group.userData.kind = "tower_beam"

  const tracer = new THREE.Mesh(
    new THREE.CylinderGeometry(Math.max(.045, radius * .055), Math.max(.075, radius * .095), 1, 8),
    material.clone(),
  )
  tracer.name = "tower-shot-tracer"
  tracer.userData.role = "tower-shot-tracer"
  group.add(tracer)

  const impact = new THREE.Group()
  impact.name = "tower-shot-impact"
  impact.userData.role = "tower-shot-impact"
  const core = new THREE.Mesh(new THREE.SphereGeometry(Math.max(.12, radius * .25), 12, 8), material.clone())
  const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(.18, radius * .34), Math.max(.025, radius * .045), 8, 24), material.clone())
  ring.rotation.x = Math.PI / 2
  impact.add(core, ring)
  group.add(impact)
  return group
}

const createTowerTelegraph = (radius, material, kind) => {
  const group = new THREE.Group()
  group.userData.kind = kind
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(1, Math.max(.035, radius * .035), Math.max(.035, radius * .035)),
    material.clone(),
  )
  line.name = "tower-telegraph-line"
  line.userData.role = "tower-telegraph-line"
  group.add(line)
  const reticle = new THREE.Mesh(
    new THREE.TorusGeometry(Math.max(.18, radius * .56), Math.max(.025, radius * .055), 8, 24),
    material.clone(),
  )
  reticle.name = "tower-telegraph-reticle"
  reticle.userData.role = "tower-telegraph-reticle"
  reticle.rotation.x = Math.PI / 2
  group.add(reticle)
  return group
}

export class EffectRenderer {
  constructor(root) {
    this.root = root
    this.meshes = new Map()
  }

  sync(effects) {
    const perfToken = startBattlePerformance("effects.sync")
    const active = new Set()
    effects.forEach((effect, index) => {
      const id = String(effect.id || `${effect.kind}:${index}`)
      const phase = getCombatEffectPhase(effect)
      active.add(id)
      let mesh = this.meshes.get(id)
      if (!mesh) {
        const radius = Math.max(12, effect.radius || (MELEE_SWING_KINDS.has(effect.kind) ? effect.range : effect.range * 0.18) || 30) * WORLD_SCALE
        const visualColor = new THREE.Color(effect.color || 0xffffff)
        if (String(effect.kind || "").startsWith("zeus_") || effect.kind === "lightning") {
          visualColor.offsetHSL(0, .14, -.18)
        }
        const style = resolveVfxStyle(effect.kind, visualColor)
        const material = flatMaterial(style.primary, {
          transparent: true,
          opacity: 0.42,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          depthWrite: false,
          depthTest: false,
        })
        if (effect.kind === "heal" || effect.kind === "health_boost") {
          mesh = createHealEffect(radius, effect.color || 0x65ff9c)
        } else if (effect.kind === "mandy_super_charge") {
          mesh = createMandyChargeEffect(radius, material)
        } else if (effect.kind === "mandy_super_wave") {
          const range = Math.max(1, effect.range || Math.hypot((effect.toX || effect.x) - effect.x, (effect.toY || effect.y) - effect.y))
          mesh = createMandyWaveEffect(range * WORLD_SCALE, Math.max(100, (effect.radius || 50) * 2) * WORLD_SCALE, material)
        } else if (TRAIL_KINDS.has(effect.kind)) {
          mesh = ["kaze_dash", "mico_leap", "needle_spore_dash"].includes(effect.kind)
            ? createDashRibbonEffect(material, effect.kind)
            : createTrailLaneEffect(material, effect.kind)
          mesh.userData.kind = effect.kind
        } else if (effect.kind === "mina_healing_aura") {
          mesh = createHealEffect(radius, effect.color || 0xff9bea)
        } else if (effect.kind === "katty_paint_puddle") {
          mesh = createPaintPuddleEffect(radius, material)
        } else if (effect.kind === "katty_paint_trail") {
          mesh = createPaintPuddleEffect(radius, material, effect.kind)
        } else if (effect.kind === "zeus_storm_target") {
          mesh = createStrikeTargetEffect(radius, material)
        } else if (PAINT_SPRAY_KINDS.has(effect.kind)) {
          mesh = createPaintSprayEffect(radius, effect.arc || .20, material)
        } else if (WAVE_KINDS.has(effect.kind)) {
          mesh = createWaveEffect(radius, material, effect.kind)
        } else if (BEAM_KINDS.has(effect.kind)) {
          mesh = createLightningBeam(radius, material)
        } else if (NEEDLE_FIELD_KINDS.has(effect.kind)) {
          mesh = createNeedleFieldEffect(radius, material, effect.kind)
        } else if (effect.kind === "vortex" || effect.kind === "mico_staff_spin") {
          mesh = createVortexEffect(radius, material, effect.kind)
        } else if (effect.kind === "zeus_fire_ground") {
          mesh = hasDirectedPath(effect)
            ? createFireTrailLaneEffect(material, effect.kind)
            : createGroundFieldEffect(radius, material)
        } else if (["zeus_lightning_strike", "zeus_lightning_blast", "mico_skyfall"].includes(effect.kind)) {
          mesh = createLightningImpact(radius, material, effect.kind)
        } else if (ORBITAL_KINDS.has(effect.kind)) {
          mesh = createOrbitalEffect(radius, material, effect.kind)
        } else if (TELEGRAPH_KINDS.has(effect.kind)) {
          mesh = createTelegraphEffect(radius, material, effect.kind)
        } else if (effect.kind === "wall_break") {
          mesh = createWallBreak(radius, material)
        } else if (TOWER_TELEGRAPH_KINDS.has(effect.kind)) {
          mesh = createTowerTelegraph(radius, material, effect.kind)
        } else if (TOWER_BEAM_KINDS.has(effect.kind)) {
          mesh = createTowerBeam(radius, material)
        } else if (effect.kind === "damage") {
          mesh = createDamageContactEffect(radius, material)
        } else if (IMPACT_KINDS.has(effect.kind) || CONTACT_KINDS.has(effect.kind)) {
          mesh = createImpactBurst(radius, material, effect.kind)
        } else if (MELEE_SWING_KINDS.has(effect.kind)) {
          mesh = ["mandy_staff_swing", "mico_staff_swing"].includes(effect.kind)
            ? createHeroSwingEffect(radius, effect.arc || Math.PI * .35, material, effect.kind)
            : createProjectedSwingArc(radius, effect.arc || Math.PI * .35, material)
          mesh.userData.kind = effect.kind
        } else if (effect.kind === "kaze_cross_slash") {
          mesh = new THREE.Group()
          mesh.userData.kind = effect.kind
          const arc = effect.arc || .9
          const first = createSwingArc(radius, arc, material, .70)
          const second = createSwingArc(radius, arc, material.clone(), .70)
          first.rotation.x = -Math.PI / 2
          second.rotation.x = -Math.PI / 2
          first.rotation.z = -.18
          second.rotation.z = .18
          mesh.add(first, second)
        } else {
          mesh = new THREE.Mesh(new THREE.RingGeometry(radius * 0.78, radius, 32), material)
          mesh.userData.kind = effect.kind
        }
        if (SHARED_VFX_KINDS.has(effect.kind)) {
          mesh = addSharedVfxTreatment(mesh, radius, style, phase, effect.kind)
        }
        if (!["heal", "kaze_cross_slash", "mandy_super_wave", ...WAVE_KINDS, ...BEAM_KINDS].includes(effect.kind) &&
            !ORBITAL_KINDS.has(effect.kind) && !PAINT_SPRAY_KINDS.has(effect.kind) && !TRAIL_KINDS.has(effect.kind) &&
            !TELEGRAPH_KINDS.has(effect.kind) && !TOWER_TELEGRAPH_KINDS.has(effect.kind) && !IMPACT_KINDS.has(effect.kind) && !TOWER_BEAM_KINDS.has(effect.kind) && !NEEDLE_FIELD_KINDS.has(effect.kind)) {
          mesh.rotation.x = -Math.PI / 2
        }
        mesh.userData.phase = phase
        mesh.renderOrder = 18
        this.meshes.set(id, mesh)
        this.root.add(mesh)
      }
      mesh.userData.phase = phase
      if (mesh.userData.kind === "mandy_super_wave") {
        const range = Math.max(1, effect.range || Math.hypot((effect.toX || effect.x) - effect.x, (effect.toY || effect.y) - effect.y))
        mesh.position.copy(worldToScene(
          effect.x + Math.cos(effect.angle || 0) * range / 2,
          effect.y + Math.sin(effect.angle || 0) * range / 2,
          2,
        ))
        mesh.rotation.y = -(effect.angle || 0)
        const progress = 1 - clamp(effect.life / (effect.maxLife || .7))
        mesh.scale.setScalar(.84 + Math.sin(progress * Math.PI) * .16)
        mesh.children.forEach(child => {
          if (child.userData.role === "wave-chevron") {
            child.position.y = .08 + Math.sin(progress * Math.PI * 5 + child.userData.phase) * .035
            child.rotation.y += .08
          }
          if (child.userData.role === "wave-front") {
            child.scale.setScalar(.88 + Math.sin(progress * Math.PI * 4) * .16)
          }
        })
      } else if (TOWER_TELEGRAPH_KINDS.has(mesh.userData.kind)) {
        const endX = Number.isFinite(Number(effect.toX)) ? Number(effect.toX) : effect.x
        const endY = Number.isFinite(Number(effect.toY)) ? Number(effect.toY) : effect.y
        const start = worldToScene(effect.x, effect.y, 22)
        const end = worldToScene(endX, endY, 22)
        const delta = end.clone().sub(start)
        const length = Math.max(.001, delta.length())
        mesh.position.copy(start.clone().add(end).multiplyScalar(.5))
        const line = mesh.getObjectByName("tower-telegraph-line")
        line?.scale.set(length, 1, 1)
        line?.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), delta.clone().normalize())
        const reticle = mesh.getObjectByName("tower-telegraph-reticle")
        reticle?.position.copy(delta.multiplyScalar(.5))
        const progress = 1 - clamp(effect.life / (effect.maxLife || .32))
        reticle?.scale.setScalar(.88 + Math.sin(progress * Math.PI * 5) * .14)
      } else if (TOWER_BEAM_KINDS.has(mesh.userData.kind)) {
        const endX = Number.isFinite(Number(effect.toX)) ? Number(effect.toX) : effect.x
        const endY = Number.isFinite(Number(effect.toY)) ? Number(effect.toY) : effect.y
        const start = worldToScene(effect.x, effect.y, 30)
        const end = worldToScene(endX, endY, 30)
        const delta = end.clone().sub(start)
        const length = Math.max(.001, delta.length())
        mesh.position.copy(start.clone().add(end).multiplyScalar(.5))
        const tracer = mesh.getObjectByName("tower-shot-tracer")
        tracer?.scale.set(1, length, 1)
        tracer?.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize())
        const impact = mesh.getObjectByName("tower-shot-impact")
        impact?.position.copy(delta.multiplyScalar(.5))
        impact?.scale.setScalar(.92 + Math.sin((1 - clamp(effect.life / (effect.maxLife || .35))) * Math.PI) * .22)
      } else if (BEAM_KINDS.has(mesh.userData.kind)) {
        const dx = (effect.toX || effect.x) - effect.x
        const dy = (effect.toY || effect.y) - effect.y
        const length = Math.max(24, Math.hypot(dx, dy))
        mesh.position.copy(worldToScene(effect.x + dx / 2, effect.y + dy / 2, 22))
        mesh.rotation.z = -Math.atan2(dy, dx)
        mesh.scale.set(length * WORLD_SCALE, Math.max(12, effect.radius * 2) * WORLD_SCALE, 1)
        const end = mesh.getObjectByName("lightning-end")
        end?.position.set(length * WORLD_SCALE / 2, 0, 0)
        end?.scale.setScalar(.8 + Math.sin((1 - clamp(effect.life / (effect.maxLife || .26))) * Math.PI) * .35)
      } else if (mesh.userData.kind === "zeus_fire_ground" && mesh.userData.directed) {
        const dx = (effect.toX || effect.x) - effect.x
        const dy = (effect.toY || effect.y) - effect.y
        const length = Math.max(24, Math.hypot(dx, dy))
        mesh.position.copy(worldToScene(effect.x + dx / 2, effect.y + dy / 2, 2))
        mesh.rotation.z = -Math.atan2(dy, dx)
        mesh.scale.set(length * WORLD_SCALE, Math.max(18, effect.radius * 1.2) * WORLD_SCALE, 1)
        const progress = 1 - clamp(effect.life / (effect.maxLife || 3))
        mesh.children?.forEach(child => {
          if (child.userData.role === "fire-trail-ember") {
            child.position.y = .10 + Math.sin(progress * Math.PI * 8 + child.userData.phase) * .055
            child.rotation.x += .07
            child.rotation.z += .05
            child.scale.setScalar(.82 + Math.sin(progress * Math.PI * 7 + child.userData.phase) * .22)
          }
        })
      } else if (TRAIL_KINDS.has(mesh.userData.kind)) {
        const dx = (effect.toX || effect.x) - effect.x
        const dy = (effect.toY || effect.y) - effect.y
        const length = Math.max(24, Math.hypot(dx, dy))
        mesh.position.copy(worldToScene(effect.x + dx / 2, effect.y + dy / 2, 2))
        mesh.rotation.z = -Math.atan2(dy, dx)
        mesh.scale.set(length * WORLD_SCALE, Math.max(18, effect.radius * 1.2) * WORLD_SCALE, 1)
        const progress = 1 - clamp(effect.life / (effect.maxLife || .36))
        mesh.children?.forEach(child => {
          if (child.userData.role === "dash-afterimage") {
            child.rotation.y += .08
            child.scale.copy(child.userData.baseScale).multiplyScalar(.985 + Math.sin(progress * Math.PI * 3 + child.userData.phase) * .01)
          }
          if (child.userData.role === "trail-mote") {
            child.position.y = .08 + Math.sin(progress * Math.PI * 6 + child.userData.phase) * .045
            child.rotation.x += .06
            child.rotation.z += .05
          }
        })
      } else {
        const height = mesh.userData.kind === "heal"
          ? 8 + (1 - clamp(effect.life / (effect.maxLife || .52))) * 20
          : .8
        const progress = 1 - clamp(effect.life / (effect.maxLife || .52))
        mesh.position.copy(worldToScene(effect.x, effect.y, height))
        if (MELEE_SWING_KINDS.has(mesh.userData.kind)) {
          setGroundYaw(mesh, effect.angle || 0)
        } else if (mesh.userData.kind === "kaze_cross_slash") {
          mesh.rotation.y = -(effect.angle || 0)
        }
        if (PAINT_SPRAY_KINDS.has(mesh.userData.kind)) {
          mesh.rotation.y = -(effect.angle || 0)
        }
        if (ORBITAL_KINDS.has(mesh.userData.kind) && !mesh.userData.directed) {
          const progress = 1 - clamp(effect.life / (effect.maxLife || .52))
          const pulse = 1 + Math.sin(progress * Math.PI * 6) * .08
          mesh.rotation.y = progress * Math.PI * 2
          mesh.scale.setScalar(pulse)
          mesh.children.forEach(child => {
            if (child.userData.role === "skill-mote") {
              child.position.y = .08 + Math.sin(progress * Math.PI * 8 + child.userData.phase) * .12
              child.rotation.x += .08
              child.rotation.y += .12
            }
            if (child.userData.role === "root-tendril") {
              child.position.y = .12 + Math.sin(progress * Math.PI * 7 + child.userData.phase) * .08
              child.rotation.y += .045
              child.scale.y = .86 + Math.sin(progress * Math.PI * 5 + child.userData.phase) * .14
            }
            if (child.userData.role === "cloud-puff") {
              child.position.y = .08 + Math.sin(progress * Math.PI * 7 + child.userData.phase) * .06
              child.rotation.y += .04
            }
            if (child.userData.role === "vortex-ring") {
              child.rotation.z += .035 * (child.userData.phase % 2 ? -1 : 1)
              child.scale.setScalar(.92 + Math.sin(progress * Math.PI * 5 + child.userData.phase) * .07)
            }
            if (child.userData.role === "vortex-ribbon") {
              child.rotation.z += .055
              child.scale.setScalar(.92 + Math.sin(progress * Math.PI * 6 + child.userData.phase) * .10)
            }
            if (child.userData.role === "vortex-swirl") {
              child.rotation.z += .075
              child.rotation.x += .018
              child.scale.setScalar(.90 + Math.sin(progress * Math.PI * 5 + child.userData.phase) * .12)
            }
            if (child.userData.role === "vortex-mote") {
              child.position.y = .08 + Math.sin(progress * Math.PI * 8 + child.userData.phase) * .12
              child.rotation.x += .08
              child.rotation.z += .06
            }
            if (child.userData.role === "fire-ember") {
              child.position.y = .10 + Math.sin(progress * Math.PI * 9 + child.userData.phase) * .10
              child.scale.setScalar(.82 + Math.sin(progress * Math.PI * 7 + child.userData.phase) * .24)
            }
            if (child.userData.role === "paint-drop") {
              child.position.y = .10 + Math.sin(progress * Math.PI * 6 + child.userData.phase) * .07
              child.scale.setScalar(.86 + Math.sin(progress * Math.PI * 5 + child.userData.phase) * .18)
            }
            if (child.userData.role === "paint-splat") {
              child.rotation.y += .035
              child.scale.setScalar(.88 + Math.sin(progress * Math.PI * 5 + child.userData.phase) * .12)
            }
            if (child.userData.role === "needle-root-crown") {
              child.rotation.z += .06
              child.scale.setScalar(.92 + Math.sin(progress * Math.PI * 7) * .10)
            }
            if (child.userData.role === "lumi-root-bloom") {
              child.rotation.y += .035
              child.scale.y = .32 + Math.sin(progress * Math.PI * 6 + (child.userData.phase || 0)) * .08
            }
            if (child.userData.role === "strike-tick") {
              child.scale.setScalar(.9 + Math.sin(progress * Math.PI * 8 + child.userData.phase) * .14)
            }
            if (child.userData.role === "strike-bolt") {
              child.rotation.y += .08
              child.scale.setScalar(.84 + Math.sin(progress * Math.PI * 7 + child.userData.phase) * .18)
            }
            if (child.userData.role === "strike-spike") {
              child.scale.y = .72 + Math.sin(progress * Math.PI * 6) * .24
              child.rotation.y += .08
            }
          })
        }
        if (WAVE_KINDS.has(mesh.userData.kind)) {
          const progress = 1 - clamp(effect.life / (effect.maxLife || .45))
          mesh.scale.setScalar(.82 + progress * .55)
          mesh.children.forEach(child => {
            if (child.userData.role === "wave-ring") {
              child.scale.setScalar(.88 + Math.sin(progress * Math.PI * 7 + child.userData.phase) * .08)
            }
          })
        }
        if (mesh.userData.kind === "vortex" || (mesh.userData.kind === "zeus_fire_ground" && !mesh.userData.directed)) {
          mesh.rotation.y = progress * Math.PI * 1.6
        }
        if (NEEDLE_FIELD_KINDS.has(mesh.userData.kind)) {
          const progress = 1 - clamp(effect.life / (effect.maxLife || .52))
          const pulse = mesh.userData.kind === "needle_root_telegraph"
            ? .92 + Math.sin(progress * Math.PI * 10) * .06
            : 1 + Math.sin(progress * Math.PI * 5) * .07
          mesh.scale.setScalar(pulse)
          mesh.rotation.y = progress * Math.PI * (mesh.userData.kind === "needle_spore_cloud" ? -1.4 : .8)
          mesh.children.forEach(child => {
            if (child.userData.role === "needle-root-tooth") {
              child.rotation.y += .045
              child.scale.y = .86 + Math.sin(progress * Math.PI * 6 + child.userData.phase) * .14
            }
            if (child.userData.role === "needle-spore-mote") {
              child.position.y += Math.sin(progress * Math.PI * 7 + child.userData.phase) * .025
            }
          })
        }
        if (mesh.userData.kind === "heal") {
          const progress = 1 - clamp(effect.life / (effect.maxLife || .52))
          const rise = progress * mesh.userData.effectRadius * .30
          mesh.scale.setScalar(.78 + progress * .34)
          mesh.children.forEach(child => {
            if (child.userData.role === "healing-cross") {
              child.position.y = child.userData.basePosition.y + rise
              child.rotation.y = Math.sin(progress * Math.PI * 2) * .035
            }
            if (child.userData.role === "heal-pulse-ring") {
              const pulse = .9 + Math.sin(progress * Math.PI * 5 + child.userData.phase) * .12
              child.scale.setScalar(pulse)
              child.rotation.z += .035
            }
            if (child.userData.role === "healing-mote") {
              const basePosition = child.userData.basePosition
              child.position.copy(basePosition)
              child.position.y += progress * mesh.userData.effectRadius * .55
              child.position.x += Math.cos(progress * Math.PI * 2 + child.userData.phase) * .07
              child.position.z += Math.sin(progress * Math.PI * 2 + child.userData.phase) * .07
            }
          })
        }
        if (TELEGRAPH_KINDS.has(mesh.userData.kind)) {
          const progress = 1 - clamp(effect.life / (effect.maxLife || .52))
          const pulse = .92 + progress * .12 + Math.sin(progress * Math.PI * 8) * .04
          mesh.scale.setScalar(pulse)
        }
        if (IMPACT_KINDS.has(mesh.userData.kind) || CONTACT_KINDS.has(mesh.userData.kind)) {
          const progress = 1 - clamp(effect.life / (effect.maxLife || .42))
          mesh.scale.setScalar(.7 + progress * .7)
          mesh.rotation.y = mesh.userData.kind === "last_contact" ? -(effect.angle || 0) : progress * Math.PI * .45
          if (mesh.userData.kind === "wall_break") {
            mesh.traverse(child => {
              if (child.userData?.role !== "wall-break-shard") return
              child.position.y -= progress * effect.radius * .9
              child.rotation.x += .08
              child.rotation.z += .05
            })
          }
        }
      }
      if (SHARED_VFX_KINDS.has(mesh.userData.kind)) {
        animateSharedVfx(mesh, 1 - clamp(effect.life / (effect.maxLife || .5)))
      }
      const opacity = clamp(effect.life / (effect.maxLife || 0.5))
      const baseOpacity = IMPACT_KINDS.has(mesh.userData.kind)
        ? .72
        : WAVE_KINDS.has(mesh.userData.kind) || BEAM_KINDS.has(mesh.userData.kind)
          ? .62
          : .56
      mesh.traverse(child => {
        if (child.material) {
          const visibleOpacity = mesh.userData.kind === "heal" ? .95 : baseOpacity
          child.material.opacity = visibleOpacity * (child.userData.opacityMultiplier || 1) * opacity
        }
      })
    })
    this.meshes.forEach((mesh, id) => {
      if (active.has(id)) return
      this.root.remove(mesh)
      disposeObjectTree(mesh)
      this.meshes.delete(id)
    })
    endBattlePerformance(perfToken)
  }
}
