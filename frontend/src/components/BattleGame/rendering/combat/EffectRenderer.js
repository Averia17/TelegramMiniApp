import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {flatMaterial} from "../shared/materials.js"
import {endBattlePerformance, startBattlePerformance} from "../shared/performance.js"
import {getCombatEffectPhase} from "./combatEffectPhase.js"

const clamp = value => Math.max(0, Math.min(1, value))
const MELEE_SWING_KINDS = new Set(["mandy_staff_swing", "mico_staff_swing", "lumi_scythe_swing"])
const ORBITAL_KINDS = new Set([
  "mina_healing_aura", "zeus_storm_target", "kaze_veil_step",
  "mico_staff_spin", "mico_ruyi_bind",
  "lumi_roots", "zeus_thunderbrand",
  "needle_root_cast", "needle_moisture_reserve", "mico_suppressed_rage", "mandy_stance",
  "kaze_followup_ready", "katty_paint_puddle", "katty_paint_cloud", "lumi_flower",
])
const PAINT_SPRAY_KINDS = new Set(["katty_paint_spray"])
const TRAIL_KINDS = new Set(["kaze_dash", "mico_leap", "zeus_beam_hole"])
const TELEGRAPH_KINDS = new Set(["zeus_strike_warning"])
const TOWER_TELEGRAPH_KINDS = new Set(["tower_telegraph"])
const TOWER_BEAM_KINDS = new Set(["tower_beam"])
const IMPACT_KINDS = new Set(["mina_mark_burst", "mina_mark_break", "needle_root_burst", "katty_paint_impact", "katty_paint_stick", "lumi_seedburst", "wall_break", "objective_hit", "tower_shot_blocked"])
const CONTACT_KINDS = new Set(["last_contact"])

const createSwingArc = (radius, arc, material, innerRadius = .62) => {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius * innerRadius, radius, 36, 1, -arc, arc * 2),
    material,
  )
  mesh.userData.role = "melee-reach"
  return mesh
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

export const createHealEffect = (radius, color = 0x65ff9c) => {
  const group = new THREE.Group()
  group.userData.kind = "heal"
  group.userData.effectRadius = radius

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * .62, 32),
    flatMaterial(0x59ff7a, {
      transparent: true,
      opacity: .45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }),
  )
  glow.rotation.x = -Math.PI / 2
  glow.scale.y = .62
  glow.userData.role = "heal-glow"
  glow.userData.opacityMultiplier = .44
  group.add(glow)

  const barLength = radius * .72
  const barWidth = radius * .20
  const outlineMaterial = flatMaterial(0xf4fff6, {
    transparent: true,
    depthWrite: false,
    depthTest: false,
  })
  const greenMaterial = flatMaterial(new THREE.Color(color).lerp(new THREE.Color(0x36e36a), .55), {
    transparent: true,
    depthWrite: false,
    depthTest: false,
  })
  const crossY = radius * .78
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
    bar.userData.opacityMultiplier = barMaterial.color.getHex() === 0xf4fff6 ? .98 : .94
    group.add(bar)
  })

  for (let index = 0; index < 6; index++) {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(radius * (.035 + index % 2 * .012), 8, 6),
      flatMaterial(0x8bffad, {
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
  group.add(ring)
  for (let index = 0; index < 8; index++) {
    const mote = new THREE.Mesh(
      new THREE.OctahedronGeometry(Math.max(.025, radius * .07), 0),
      material.clone(),
    )
    const angle = index / 8 * Math.PI * 2
    mote.position.set(Math.cos(angle) * radius * .82, radius * .25, Math.sin(angle) * radius * .82)
    mote.userData.role = "skill-mote"
    mote.userData.phase = angle
    group.add(mote)
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
        const radius = Math.max(12, effect.radius || effect.range * 0.18 || 30) * WORLD_SCALE
        const material = flatMaterial(effect.color || 0xffffff, {
          transparent: true,
          opacity: 0.42,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
        if (effect.kind === "heal" || effect.kind === "health_boost") {
          mesh = createHealEffect(radius, effect.color || 0x65ff9c)
        } else if (effect.kind === "mandy_super_wave") {
          mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 24, 1), material)
          mesh.userData.kind = effect.kind
        } else if (TRAIL_KINDS.has(effect.kind)) {
          mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
          mesh.rotation.x = -Math.PI / 2
          mesh.userData.kind = effect.kind
        } else if (PAINT_SPRAY_KINDS.has(effect.kind)) {
          mesh = createPaintSprayEffect(radius, effect.arc || .20, material)
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
        } else if (IMPACT_KINDS.has(effect.kind) || CONTACT_KINDS.has(effect.kind)) {
          mesh = createImpactBurst(radius, material, effect.kind)
        } else if (MELEE_SWING_KINDS.has(effect.kind)) {
          mesh = createSwingArc(radius, effect.arc || Math.PI * .35, material)
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
        if (!["heal", "kaze_cross_slash"].includes(effect.kind) &&
            !ORBITAL_KINDS.has(effect.kind) && !PAINT_SPRAY_KINDS.has(effect.kind) && !TRAIL_KINDS.has(effect.kind) &&
            !TELEGRAPH_KINDS.has(effect.kind) && !TOWER_TELEGRAPH_KINDS.has(effect.kind) && !IMPACT_KINDS.has(effect.kind) && !TOWER_BEAM_KINDS.has(effect.kind)) {
          mesh.rotation.x = -Math.PI / 2
        }
        mesh.userData.phase = phase
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
        mesh.scale.set(range * WORLD_SCALE, Math.max(100, (effect.radius || 50) * 2) * WORLD_SCALE, 1)
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
      } else if (TRAIL_KINDS.has(mesh.userData.kind)) {
        const dx = (effect.toX || effect.x) - effect.x
        const dy = (effect.toY || effect.y) - effect.y
        const length = Math.max(24, Math.hypot(dx, dy))
        mesh.position.copy(worldToScene(effect.x + dx / 2, effect.y + dy / 2, 2))
        mesh.rotation.z = -Math.atan2(dy, dx)
        mesh.scale.set(length * WORLD_SCALE, Math.max(18, effect.radius * 1.2) * WORLD_SCALE, 1)
      } else {
        const height = mesh.userData.kind === "heal"
          ? 8 + (1 - clamp(effect.life / (effect.maxLife || .52))) * 20
          : .8
        mesh.position.copy(worldToScene(effect.x, effect.y, height))
        if (MELEE_SWING_KINDS.has(mesh.userData.kind) || mesh.userData.kind === "kaze_cross_slash") {
          mesh.rotation.y = -(effect.angle || 0)
        }
        if (PAINT_SPRAY_KINDS.has(mesh.userData.kind)) {
          mesh.rotation.y = -(effect.angle || 0)
        }
        if (ORBITAL_KINDS.has(mesh.userData.kind)) {
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
            if (child.userData.role === "cloud-puff") {
              child.position.y = .08 + Math.sin(progress * Math.PI * 7 + child.userData.phase) * .06
              child.rotation.y += .04
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
      const opacity = clamp(effect.life / (effect.maxLife || 0.5))
      mesh.traverse(child => {
        if (child.material) {
          const baseOpacity = mesh.userData.kind === "heal" ? .95 : .42
          child.material.opacity = baseOpacity * (child.userData.opacityMultiplier || 1) * opacity
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
