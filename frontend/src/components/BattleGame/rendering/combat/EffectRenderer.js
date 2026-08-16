import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {flatMaterial} from "../shared/materials.js"
import {endBattlePerformance, startBattlePerformance} from "../shared/performance.js"

const clamp = value => Math.max(0, Math.min(1, value))
const MELEE_SWING_KINDS = new Set(["mandy_staff_swing", "mico_staff_swing", "lumi_scythe_swing"])
const ORBITAL_KINDS = new Set([
  "mina_healing_aura", "zeus_storm_target", "kaze_veil_step",
  "mico_staff_spin", "mico_ruyi_bind",
  "lumi_roots", "lumi_seedburst", "zeus_thunderbrand",
  "needle_root_cast", "needle_moisture_reserve", "mico_suppressed_rage", "mandy_stance",
  "kaze_followup_ready", "katty_paint_puddle", "katty_paint_cloud", "lumi_flower",
])
const PAINT_SPRAY_KINDS = new Set(["katty_paint_spray"])
const TRAIL_KINDS = new Set(["kaze_dash", "mico_leap", "zeus_beam_hole"])
const TELEGRAPH_KINDS = new Set(["zeus_strike_warning"])
const IMPACT_KINDS = new Set(["mina_mark_burst", "mina_mark_break", "needle_root_burst", "wall_break"])
const CONTACT_KINDS = new Set(["last_contact"])

const createSwingArc = (radius, arc, material, innerRadius = .62) => {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius * innerRadius, radius, 36, 1, -arc, arc * 2),
    material,
  )
  mesh.userData.role = "melee-reach"
  return mesh
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
        if (effect.kind === "heal") {
          mesh = new THREE.Group()
          mesh.userData.kind = "heal"
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(radius * .68, radius, 28),
            material,
          )
          ring.rotation.x = -Math.PI / 2
          const crossMaterial = flatMaterial(effect.color || 0x65ff9c, {
            transparent: true,
            opacity: .95,
            depthWrite: false,
          })
          const horizontal = new THREE.Mesh(
            new THREE.BoxGeometry(radius * 1.15, radius * .32, radius * .18),
            crossMaterial,
          )
          const vertical = new THREE.Mesh(
            new THREE.BoxGeometry(radius * .32, radius * 1.15, radius * .2),
            crossMaterial.clone(),
          )
          horizontal.userData.role = "healing-cross"
          vertical.userData.role = "healing-cross"
          horizontal.position.y = radius * 1.15
          vertical.position.y = radius * 1.15
          mesh.add(ring, horizontal, vertical)
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
            !TELEGRAPH_KINDS.has(effect.kind) && !IMPACT_KINDS.has(effect.kind)) {
          mesh.rotation.x = -Math.PI / 2
        }
        this.meshes.set(id, mesh)
        this.root.add(mesh)
      }
      if (mesh.userData.kind === "mandy_super_wave") {
        const range = Math.max(1, effect.range || Math.hypot((effect.toX || effect.x) - effect.x, (effect.toY || effect.y) - effect.y))
        mesh.position.copy(worldToScene(
          effect.x + Math.cos(effect.angle || 0) * range / 2,
          effect.y + Math.sin(effect.angle || 0) * range / 2,
          2,
        ))
        mesh.rotation.y = -(effect.angle || 0)
        mesh.scale.set(range * WORLD_SCALE, Math.max(100, (effect.radius || 50) * 2) * WORLD_SCALE, 1)
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
        if (child.material) child.material.opacity = (mesh.userData.kind === "heal" ? .95 : .42) * opacity
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
