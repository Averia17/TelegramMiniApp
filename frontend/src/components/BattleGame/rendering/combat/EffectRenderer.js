import * as THREE from "three"
import {WORLD_SCALE, worldToScene} from "../shared/coordinates.js"
import {disposeObjectTree} from "../shared/disposal.js"
import {flatMaterial} from "../shared/materials.js"
import {endBattlePerformance, startBattlePerformance} from "../shared/performance.js"

const clamp = value => Math.max(0, Math.min(1, value))
const MELEE_SWING_KINDS = new Set(["mandy_staff_swing", "mico_staff_swing"])
const ORBITAL_KINDS = new Set([
  "mina_healing_aura", "zeus_storm_target", "kaze_veil_step",
  "mico_staff_spin", "mico_ruyi_bind",
  "lumi_roots", "lumi_seedburst", "zeus_thunderbrand",
  "needle_root_cast", "needle_spore_cloud", "zeus_burning_ground", "mico_suppressed_rage",
  "kaze_doom_mark", "katty_paint_puddle", "katty_paint_spot", "lumi_slow_trail",
])
const TRAIL_KINDS = new Set(["kaze_dash", "zeus_beam_hole"])
const TELEGRAPH_KINDS = new Set(["zeus_strike_warning"])
const IMPACT_KINDS = new Set(["mina_mark_burst", "mina_mark_break", "needle_root_burst"])

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
        } else if (ORBITAL_KINDS.has(effect.kind)) {
          mesh = createOrbitalEffect(radius, material, effect.kind)
        } else if (TELEGRAPH_KINDS.has(effect.kind)) {
          mesh = createTelegraphEffect(radius, material, effect.kind)
        } else if (IMPACT_KINDS.has(effect.kind)) {
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
            !ORBITAL_KINDS.has(effect.kind) && !TRAIL_KINDS.has(effect.kind) &&
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
          })
        }
        if (TELEGRAPH_KINDS.has(mesh.userData.kind)) {
          const progress = 1 - clamp(effect.life / (effect.maxLife || .52))
          const pulse = .92 + progress * .12 + Math.sin(progress * Math.PI * 8) * .04
          mesh.scale.setScalar(pulse)
        }
        if (IMPACT_KINDS.has(mesh.userData.kind)) {
          const progress = 1 - clamp(effect.life / (effect.maxLife || .42))
          mesh.scale.setScalar(.7 + progress * .7)
          mesh.rotation.y = progress * Math.PI * .45
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
