import test from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import {EffectRenderer, HERO_EFFECT_VISUAL_KINDS} from "../src/components/BattleGame/rendering/combat/EffectRenderer.js"
import {createProjectileVisual} from "../src/components/BattleGame/rendering/combat/ProjectileRenderer.js"
import {getCombatEffectPhase} from "../src/components/BattleGame/rendering/combat/combatEffectPhase.js"

test("hero combat effects use authored visual families instead of the generic ring fallback", () => {
  for (const kind of [
    "slash", "scythe", "slam", "vortex", "vine", "spin", "mina_air_wave",
    "lightning", "zeus_lightning_strike", "zeus_lightning_blast", "zeus_fire_ground",
    "mico_skyfall", "mico_armor_burst", "needle_spores", "thruster", "spore-jump", "katty_paint_trail",
    "kaze_dash_telegraph", "mico_vortex_telegraph",
  ]) {
    assert.equal(HERO_EFFECT_VISUAL_KINDS.has(kind), true, `${kind} is missing a visual family`)
  }
})

test("hero impact families expose layered geometry for readable hit feedback", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([
    {id: "wave", kind: "mina_air_wave", x: 0, y: 0, radius: 135, life: .22, maxLife: .45},
    {id: "vortex", kind: "vortex", x: 0, y: 0, radius: 140, life: .9, maxLife: 1},
    {id: "bolt", kind: "zeus_lightning_strike", x: 0, y: 0, radius: 62, life: .2, maxLife: .45},
    {id: "ground", kind: "zeus_fire_ground", x: 0, y: 0, radius: 62, life: .8, maxLife: 2.1},
    {id: "armor", kind: "mico_armor_burst", x: 0, y: 0, radius: 140, life: .8, maxLife: .8},
  ])

  assert.equal(root.children.length, 5)
  assert.ok(root.children[0].children.filter(child => child.userData.role === "wave-ring").length >= 3)
  assert.ok(root.children[1].children.filter(child => child.userData.role === "vortex-ring").length >= 2)
  assert.ok(root.children[2].children.some(child => child.userData.role === "lightning-bolt"))
  assert.ok(root.children[3].children.some(child => child.userData.role === "fire-ember"))
  assert.ok(root.children[4].children.some(child => child.userData.role === "armor-burst-core"))
})

test("melee swings keep the authored sector instead of adding a circular overlay", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([
    {id: "mandy-swing", kind: "mandy_staff_swing", x: 0, y: 0, radius: 110, arc: Math.PI / 3, life: .16, maxLife: .36},
  ])

  const roles = []
  root.children[0].traverse(node => { if (node.userData?.role) roles.push(node.userData.role) })
  assert.ok(roles.includes("melee-reach"))
  assert.ok(roles.includes("staff-focus-ring"))
  assert.equal(roles.includes("vfx-outline"), false)
  assert.equal(roles.includes("vfx-glow"), false)
  assert.equal(roles.includes("vfx-core"), false)
  assert.equal(roles.includes("vfx-particle"), false)
})

test("routine damage feedback is a small contact flash, not a radial skill burst", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([
    {id: "damage", kind: "damage", x: 0, y: 0, radius: 0, damage: 85, life: .12, maxLife: .26},
  ])

  const roles = []
  root.children[0].traverse(node => { if (node.userData?.role) roles.push(node.userData.role) })
  assert.ok(roles.includes("damage-core"))
  assert.ok(roles.includes("damage-shard"))
  assert.equal(roles.includes("vfx-outline"), false)
  assert.equal(roles.includes("vfx-glow"), false)
})

test("Brock fire ground preserves a directed trail when the backend sends a segment", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([
    {id: "fire-trail", kind: "zeus_fire_ground", x: 0, y: 0, toX: 800, toY: 0, range: 800, radius: 44, angle: 0, life: 1.4, maxLife: 3},
  ])

  const mesh = root.children[0]
  const roles = []
  mesh.traverse(node => { if (node.userData?.role) roles.push(node.userData.role) })
  assert.equal(mesh.userData.directed, true)
  assert.ok(roles.includes("fire-trail-ribbon"))
  assert.ok(roles.includes("fire-trail-ember"))
  assert.equal(roles.includes("fire-pool"), false)
  assert.equal(roles.includes("vfx-outline"), false)
  assert.ok(mesh.scale.x > mesh.scale.y * 4)
})

test("Brock fire ground keeps a radial pool for impact-only effects", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([
    {id: "fire-pool", kind: "zeus_fire_ground", x: 120, y: 40, toX: 0, toY: 0, radius: 62, life: .8, maxLife: 2.1},
  ])

  const mesh = root.children[0]
  const roles = []
  mesh.traverse(node => { if (node.userData?.role) roles.push(node.userData.role) })
  assert.equal(mesh.userData.directed, false)
  assert.ok(roles.includes("fire-pool"))
  assert.equal(roles.includes("fire-trail-ribbon"), false)
})

test("Kaze dash telegraph exposes a directed dodge lane before impact", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([
    {id: "kaze-telegraph", kind: "kaze_dash_telegraph", x: 0, y: 0, toX: 320, toY: 0, range: 320, radius: 25, life: .18, maxLife: .25},
  ])

  const mesh = root.children[0]
  const roles = []
  mesh.traverse(node => { if (node.userData?.role) roles.push(node.userData.role) })
  assert.equal(mesh.userData.directed, true)
  assert.ok(roles.includes("kaze-telegraph-lane"))
  assert.ok(roles.includes("kaze-telegraph-edge"))
  assert.ok(roles.includes("kaze-telegraph-chevron"))
  assert.ok(mesh.scale.x > mesh.scale.y * 4)
})

test("Mico vortex telegraph exposes a directed lane and landing reticle", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([
    {id: "mico-telegraph", kind: "mico_vortex_telegraph", x: 0, y: 0, toX: 140, toY: 0, range: 140, radius: 136, life: .18, maxLife: .25},
  ])

  const mesh = root.children[0]
  const roles = []
  mesh.traverse(node => { if (node.userData?.role) roles.push(node.userData.role) })
  assert.equal(mesh.userData.directed, true)
  assert.ok(roles.includes("mico-telegraph-lane"))
  assert.ok(roles.includes("mico-telegraph-target"))
  assert.ok(mesh.scale.x > 0)
})

test("signature effects do not stack a second universal composition", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([
    {id: "stance", kind: "mandy_stance", x: 0, y: 0, radius: 52, life: .8, maxLife: 1.8},
    {id: "burst", kind: "mico_armor_burst", x: 180, y: 0, radius: 140, life: .4, maxLife: .65},
  ])

  for (const mesh of root.children) {
    const roles = []
    mesh.traverse(node => { if (node.userData?.role) roles.push(node.userData.role) })
    assert.equal(roles.includes("vfx-outline"), false)
    assert.equal(roles.includes("vfx-glow"), false)
    assert.equal(roles.includes("vfx-core"), false)
    assert.equal(roles.includes("vfx-spark"), false)
  }
})

test("new hero zones expose intentional runtime phases", () => {
  assert.equal(getCombatEffectPhase({kind: "vortex"}), "active")
  assert.equal(getCombatEffectPhase({kind: "mina_air_wave"}), "impact")
  assert.equal(getCombatEffectPhase({kind: "zeus_lightning_strike"}), "impact")
  assert.equal(getCombatEffectPhase({kind: "needle_spores"}), "active")
  assert.equal(getCombatEffectPhase({kind: "mandy_super_charge"}), "telegraph")
  assert.equal(getCombatEffectPhase({kind: "kaze_dash_telegraph"}), "telegraph")
  assert.equal(getCombatEffectPhase({kind: "mico_vortex_telegraph"}), "telegraph")
  assert.equal(getCombatEffectPhase({kind: "mandy_super_wave"}), "active")
  assert.equal(getCombatEffectPhase({kind: "kaze_cross_slash"}), "impact")
})

test("hero signatures have a readable silhouette instead of one flat ring", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([
    {id: "mandy", kind: "mandy_super_wave", x: 0, y: 0, toX: 420, toY: 0, range: 420, radius: 72, angle: 0, life: .55, maxLife: .7},
    {id: "zeus", kind: "zeus_storm_target", x: 0, y: 0, radius: 130, life: 1, maxLife: 2},
    {id: "kaze", kind: "kaze_dash", x: 0, y: 0, toX: 180, toY: 0, radius: 34, life: .2, maxLife: .36},
    {id: "trail", kind: "zeus_beam_hole", x: 0, y: 0, toX: 180, toY: 0, radius: 34, life: .2, maxLife: .36},
    {id: "mico", kind: "mico_staff_spin", x: 0, y: 0, radius: 140, life: 1, maxLife: 2},
    {id: "mina", kind: "mina_healing_aura", x: 0, y: 0, radius: 180, life: 1, maxLife: 2},
    {id: "needle-root", kind: "needle_root_active", x: 0, y: 0, radius: 180, life: 1, maxLife: 2},
    {id: "lumi-root", kind: "lumi_roots", x: 0, y: 0, radius: 180, life: 1, maxLife: 2},
    {id: "katty", kind: "katty_paint_puddle", x: 0, y: 0, radius: 220, life: 1, maxLife: 2},
    {id: "paint-trail", kind: "katty_paint_trail", x: 0, y: 0, radius: 46, life: 1, maxLife: 2},
  ])

  const roles = root.children.flatMap(mesh => {
    const found = []
    mesh.traverse(node => { if (node.userData?.role) found.push(node.userData.role) })
    return found
  })
  for (const role of [
    "wave-lane", "wave-chevron", "strike-reticle", "dash-afterimage",
    "strike-bolt", "vortex-ribbon", "vortex-swirl", "heal-pulse-ring",
    "needle-root-crown", "lumi-root-bloom", "paint-splat",
    "trail-ribbon",
  ]) assert.ok(roles.includes(role), `${role} is missing from the hero signature pass`)
})

test("every hero effect receives the shared glow, core, and spark treatment", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  renderer.sync([
    {id: "mandy", kind: "mandy_super_wave", x: 0, y: 0, toX: 420, toY: 0, range: 420, radius: 72, angle: 0, life: .55, maxLife: .7, color: "#ffd84d"},
    {id: "mina", kind: "mina_air_wave", x: 0, y: 0, radius: 135, life: .22, maxLife: .45, color: "#ff9bea"},
    {id: "brock", kind: "zeus_storm_target", x: 0, y: 0, radius: 130, life: 1, maxLife: 2, color: "#75d8ff"},
    {id: "kaze", kind: "kaze_dash", x: 0, y: 0, toX: 180, toY: 0, radius: 34, life: .2, maxLife: .36, color: "#a982ff"},
    {id: "mico", kind: "mico_staff_spin", x: 0, y: 0, radius: 140, life: 1, maxLife: 2, color: "#ffb33e"},
    {id: "lumi", kind: "lumi_roots", x: 0, y: 0, radius: 180, life: 1, maxLife: 2, color: "#d8a7ff"},
    {id: "needle", kind: "needle_root_active", x: 0, y: 0, radius: 180, life: 1, maxLife: 2, color: "#75d947"},
    {id: "katty", kind: "katty_paint_puddle", x: 0, y: 0, radius: 220, life: 1, maxLife: 2, color: "#ff5c9a"},
  ])

  const nodes = root.children.flatMap(mesh => {
    const found = []
    mesh.traverse(node => {
      if (["vfx-glow", "vfx-core", "vfx-spark"].includes(node.userData?.role)) found.push(node)
    })
    return found
  })
  assert.equal(nodes.length, 21)
  assert.equal(nodes.filter(node => node.userData.role === "vfx-glow").length, 7)
  assert.equal(nodes.filter(node => node.userData.role === "vfx-core").length, 7)
  assert.equal(nodes.filter(node => node.userData.role === "vfx-spark").length, 7)
  assert.ok(nodes.every(node => node.material.blending === THREE.AdditiveBlending))
})

test("every hero skill feedback has a signature composition instead of a generic ring", () => {
  const root = new THREE.Group()
  const renderer = new EffectRenderer(root)
  const effects = [
    ["mandy-charge", "mandy_super_charge", "focus-seal"],
    ["mandy-stance", "mandy_stance", "stance-shield"],
    ["mina-mark", "mina_mark_burst", "star-mark-burst"],
    ["zeus-warning", "zeus_strike_warning", "warning-bolt"],
    ["kaze-veil", "kaze_veil_step", "veil-shroud"],
    ["kaze-ready", "kaze_followup_ready", "combo-diamond"],
    ["mico-bind", "mico_ruyi_bind", "bind-loop"],
    ["mico-rage", "mico_suppressed_rage", "rage-seal"],
    ["lumi-flower", "lumi_flower", "flower-bloom"],
    ["lumi-burst", "lumi_seedburst", "seed-petal"],
    ["lumi-impact", "lumi_root_impact", "root-impact-spike"],
    ["katty-impact", "katty_paint_impact", "paint-splash"],
    ["katty-stick", "katty_paint_stick", "paint-mark"],
    ["needle-cast", "needle_root_cast", "root-cast-seal"],
    ["needle-moisture", "needle_moisture_reserve", "moisture-drop"],
  ]
  renderer.sync(effects.map(([id, kind]) => ({
    id, kind, x: 0, y: 0, radius: 90, range: 180, angle: .2,
    life: .4, maxLife: 1, color: "#d8a7ff",
  })))

  for (const [, , role] of effects) {
    const found = root.children.some(mesh => {
      let hasRole = false
      mesh.traverse(node => { if (node.userData?.role === role) hasRole = true })
      return hasRole
    })
    assert.equal(found, true, `${role} is missing from the full hero skill pass`)
  }
})

test("hero projectiles use a shared readable core, halo, and motes", () => {
  for (const projectile of [
    {kind: "mina_star", color: "#ff9bea"},
    {kind: "zeus_lightning", color: "#75d8ff"},
    {kind: "lumi_orb", color: "#d8a7ff"},
    {kind: "katty_paint_spray", color: "#ff5c9a"},
  ]) {
    const mesh = createProjectileVisual(projectile)
    const roles = []
    mesh.traverse(node => { if (node.userData?.role) roles.push(node.userData.role) })
    assert.ok(roles.includes("projectile-halo"), `${projectile.kind} is missing a halo`)
    assert.ok(roles.includes("projectile-core"), `${projectile.kind} is missing a core`)
    assert.ok(roles.includes("projectile-mote"), `${projectile.kind} is missing motes`)
  }
})
